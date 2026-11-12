import { describe, expect, it } from 'vitest';
import { createTraining, TRAINING_LANE } from '../../src/core/training.js';
import { createSessions } from '../../src/core/sessions.js';
import { createGame } from '../../src/core/game.js';
import { CONFIG } from '../../src/config.js';
import { angleDifference, laneAngle } from '../../src/gameplay/arena.js';
import { createAnalytics } from '../../src/analytics/analytics.js';
import { createLocalProgress, POT_KEY } from '../../src/storage/localProgress.js';
import { checkpointAfter } from '../support/checkpoints.js';
import { trainingInstruction } from '../../src/ui/training.js';

const idle = { left: false, right: false, fire: false };
function tick(g, seconds = .05, held = {}) {
  for (let i = 0; i < Math.ceil(seconds * 100); i++) g.update(.01, { ...idle, ...held });
}
function aim(g, angle) {
  for (let i = 0; i < 250; i++) {
    const d = angleDifference(angle, g.state.angle);
    if (Math.abs(d) < .04) return;
    tick(g, .01, { left: d < 0, right: d > 0 });
  }
  throw Error('aim failed');
}
function move(g) { tick(g, .1, { left: true }); tick(g, .1, { right: true }); tick(g); }
function steam(g) { tick(g, .5, { fire: true }); tick(g); }
function milk(g) { expect(g.pourMilk()).toBe(true); tick(g, .9); }
function sugar(g) { expect(g.sugarBurst()).toBe(true); tick(g, .4); }
function practice(g) {
  for (let i = 0; i < 5; i++) { aim(g, g.state.enemies[0].angle); steam(g); }
}
function stage(g) { return g.training.view.stage; }

describe('the isolated Training Cup', () => {
  it('requires real travel in both directions and release before advancing', () => {
    let released = false;
    const g = createTraining({ released: () => released });
    g.update(0, { ...idle, left: true }); g.update(0, { ...idle, right: true });
    expect(stage(g)).toBe(0);
    tick(g, 1, { left: true }); expect(stage(g)).toBe(0);
    tick(g, .1, { right: true }); tick(g);
    expect(g.training.view.success).toBe(true); expect(stage(g)).toBe(0);
    released = true; tick(g); expect(stage(g)).toBe(1);
    expect(g.state.enemies).toHaveLength(1);
  });
  it('freezes the target indefinitely, requires a genuine steam collision and rejects other weapons', () => {
    const g = createTraining(); move(g);
    const radius = g.state.enemies[0].radius;
    tick(g, 30); expect(g.state.enemies[0].radius).toBe(radius);
    expect(g.sugarBurst()).toBe(false); expect(g.pourMilk()).toBe(false);
    aim(g, laneAngle(TRAINING_LANE + 4)); steam(g);
    expect(stage(g)).toBe(1); expect(g.state.kills).toBe(0);
    aim(g, laneAngle(TRAINING_LANE)); steam(g);
    expect(stage(g)).toBe(2);
  });
  it('Auto Steam waits for engagement and still completes through a real projectile hit', () => {
    const g = createTraining(); g.setAutoSteam(true); move(g);
    tick(g, 10); expect(stage(g)).toBe(1); expect(g.state.shots).toHaveLength(0);
    tick(g, .01, { right: true }); tick(g, 1);
    expect(stage(g)).toBe(2);
  });
  it('requires milk activation with visible pushback and slowdown, not a charge spent elsewhere', () => {
    const g = createTraining(); move(g); steam(g);
    aim(g, laneAngle(TRAINING_LANE + 5)); g.pourMilk(); tick(g, .3);
    expect(stage(g)).toBe(2); expect(g.training.view.success).toBe(false);
    g.training.retry();
    const radius = g.state.enemies[0].radius;
    expect(g.pourMilk()).toBe(true); tick(g, .3);
    expect(g.state.clouds).toHaveLength(1); expect(g.state.pulse).toBeGreaterThan(0);
    expect(g.state.enemies[0].radius).toBeLessThan(radius); expect(stage(g)).toBe(2);
    tick(g, .6); expect(stage(g)).toBe(3);
  });
  it('requires sugar spread and a real collision; missed bursts restore the exercise without penalties', () => {
    const g = createTraining(); move(g); steam(g); milk(g);
    expect(stage(g)).toBe(3); expect(g.state.enemies).toHaveLength(3);
    expect(g.fireSteam()).toBe(false);
    aim(g, laneAngle(TRAINING_LANE + 5)); g.sugarBurst();
    expect(g.state.shots.filter((s) => s.sugar)).toHaveLength(3);
    tick(g, .6); expect(stage(g)).toBe(3);
    g.sugarBurst(); tick(g, .7);
    expect(g.training.view.failures).toBe(1); expect(g.state.sugarLeft).toBe(CONFIG.sugar.perRound);
    sugar(g); expect(stage(g)).toBe(4);
  });
  it('escapes replace targets without lives, progression or time limits; retry is deterministic', () => {
    const g = createTraining(); move(g);
    const initial = structuredClone(g.state.enemies);
    aim(g, laneAngle(TRAINING_LANE + 6)); tick(g, 20);
    expect(g.state.lives).toBe(CONFIG.lives); expect(g.state.round).toBe(1);
    expect(g.training.view.failures).toBeGreaterThan(1); expect(stage(g)).toBe(1);
    g.training.retry(); expect(g.state.enemies).toEqual(initial);
  });
  it('clears a real five-leaf practice sequence, stops at completion and replays from fresh state', () => {
    const g = createTraining(); move(g); steam(g); milk(g); sugar(g);
    practice(g); expect(stage(g)).toBe(5); expect(g.training.view.complete).toBe(true);
    tick(g, 50, { fire: true }); expect(stage(g)).toBe(5); expect(g.state.enemies).toHaveLength(0);
    expect(g.drainEvents().filter((e) => ['matchStart', 'roundStart', 'reading', 'checkpoint', 'gameover'].includes(e.type))).toEqual([]);
    const replay = createTraining(); expect(stage(replay)).toBe(0); move(replay); steam(replay); milk(replay); sugar(replay);
    practice(replay); expect(stage(replay)).toBe(5);
  });
  it('pause freezes every exercise clock, and resume retains its target', () => {
    const g = createTraining(); move(g); tick(g, .01, { right: true });
    g.pause(); const state = structuredClone(g.state);
    tick(g, 20, { fire: true, left: true }); expect(g.state).toEqual(state);
    g.resume(); tick(g); expect(g.state.phase).toBe('playing');
    expect(g.state.enemies[0].radius).toBeGreaterThan(state.enemies[0].radius);
  });
  it('actions attempted while paused do not arm an exercise that was waiting for engagement', () => {
    const g = createTraining(); move(g);
    const radius = g.state.enemies[0].radius;
    g.pause();
    expect(g.fireSteam()).toBe(false); expect(g.pourMilk()).toBe(false); expect(g.sugarBurst()).toBe(false);
    tick(g, 1); g.resume(); tick(g, 1);
    expect(g.training.view.engaged).toBe(false);
    expect(g.state.enemies[0].radius).toBe(radius);
    expect(g.state.shots).toHaveLength(0);
  });
  it('preserves the pot, every RNG stream, storage and records; excludes all normal analytics', () => {
    const entries = new Map();
    const storage = { getItem: (k) => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v), removeItem: (k) => entries.delete(k) };
    const progress = createLocalProgress(storage), main = checkpointAfter(1).game;
    progress.saveCheckpoint(main.exportCheckpoint());
    const saved = storage.getItem(POT_KEY), before = structuredClone(main.state), random = main.exportRandom();
    const sessions = createSessions(main, progress, { nextSeed: () => { throw Error('Main seed consumed'); } });
    let time = 1000;
    const sent = [], analytics = createAnalytics({ send: (...e) => sent.push(e), now: () => time, foreground: () => true });
    analytics.gameStarted(); sent.length = 0;
    sessions.train(); const g = sessions.game;
    move(g); steam(g); milk(g); sugar(g); practice(g);
    expect(g.exportCheckpoint()).toBeNull(); expect(g.practice).toBeNull();
    for (const e of g.drainEvents()) { sessions.handle(e); analytics.handle(e, sessions.ordinary); }
    for (const e of [{ type: 'matchStart' }, { type: 'checkpoint', checkpoint: {} }, { type: 'gameover' }, { type: 'roundStart', round: 10 }]) {
      sessions.handle(e); analytics.handle(e, sessions.ordinary);
    }
    for (let i = 0; i < 3600; i++) {
      time += 100; analytics.noteInput(); analytics.frame('playing', sessions.ordinary);
    }
    expect(analytics.engagedMs).toBe(0);
    expect(sent).toEqual([]); expect(sessions.settle()).toBeNull();
    expect(storage.getItem(POT_KEY)).toBe(saved); expect(entries.size).toBe(1);
    sessions.back(); expect(g.state).toBe(main.state); expect(main.state).toEqual(before); expect(main.exportRandom()).toEqual(random);
    sessions.train(); expect(stage(g)).toBe(0); sessions.open(); expect(sessions.training).toBeNull();
  });
  it('cannot attach training to a saved pot or borrowed RNG', () => {
    expect(() => createGame({ training: {}, random: {} })).toThrow('isolated');
  });
  it('repeated actions and drained or delayed events cannot skip the next exercise', () => {
    let released = false;
    const g = createTraining({ released: () => released });
    move(g); tick(g); expect(stage(g)).toBe(0);
    released = true; tick(g); expect(stage(g)).toBe(1);
    released = false;
    for (let i = 0; i < 10; i++) { g.fireSteam(); tick(g, .1); g.drainEvents(); }
    expect(stage(g)).toBe(1); expect(g.training.view.success).toBe(true);
    released = true; tick(g); expect(stage(g)).toBe(2);
    for (let i = 0; i < 20; i++) g.fireSteam();
    tick(g, 2); expect(stage(g)).toBe(2); expect(g.state.roundStats.milkUses).toBe(0);
  });
  it.each([
    [0, { touch: 'classic', autoSteam: false, visible: false }, 'A and D'],
    [1, { touch: 'easy', autoSteam: true, visible: true }, 'automatically'],
    [1, { touch: 'classic', autoSteam: false, visible: true }, 'STEAM'],
    [2, { touch: 'easy', visible: false }, 'Double-tap'],
    [2, { touch: 'classic', visible: true }, 'MILK'],
    [3, { touch: 'easy', visible: true }, 'Hold the cup'],
    [3, { touch: 'classic', visible: false }, 'Press E'],
  ])('describes stage %i for the active controls', (n, settings, text) => {
    expect(trainingInstruction(n, settings)).toContain(text);
  });
});
