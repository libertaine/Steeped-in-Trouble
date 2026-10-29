import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { consumeInterlude, eligibleInterlude } from '../../src/gameplay/arcadeInterludes.js';
import { hudText, pageMode } from '../../src/ui/hud.js';
import { completeRound, playingGame, step } from './helpers.js';

function atReading(round = 12, chapter = 2) {
  const g = playingGame({ seed: 11 });
  Object.assign(g.state, { round, progress: { chapter, starts: chapter === 2 ? [1, 6] : [1] },
    grindAfter: null, lastGrind: round, havocAfter: null, lastHavoc: round, shortageAfter: 1000 });
  completeRound(g);
  return g;
}
function offered() { const g = atReading(); g.state.offer = null; g.primaryAction(); return g; }

describe('optional Arcade Interludes', () => {
  it('first offers after round 12 and only after Chapter 2 opens', () => {
    expect(atReading(11).state.arcadeDue).toBeNull();
    expect(atReading(12, 1).state.arcadeDue).toBeNull();
    expect(atReading().state.arcadeDue).toBe('dailyPour');
    expect(offered().state.phase).toBe('arcadeOffer');
  });

  it('lets the fortune finish and an upgrade be chosen before the offer', () => {
    const g = atReading(13);
    expect(g.state.offer).not.toBeNull();
    g.primaryAction(); expect(g.state.phase).toBe('reading');
    expect(g.chooseUpgrade(0)).toBe(false);
    step(g, 5);
    const id = g.state.offer[0];
    expect(g.chooseUpgrade(0)).toBe(true);
    expect(g.state.spoon[id]).toBe(1); expect(g.state.phase).toBe('arcadeOffer');
  });

  it.each(['shortageDue', 'grindDue', 'havocDue'])('postpones for %s without accumulating a backlog', (flag) => {
    const g = atReading(80);
    g.state[flag] = true;
    expect(eligibleInterlude(g.state)).toBeNull();
    g.state[flag] = false;
    expect(eligibleInterlude(g.state)).toBe('dailyPour');
    consumeInterlude(g.state, 'dailyPour');
    expect(g.state.arcade.after.dailyPour).toBe(94);
    expect(eligibleInterlude(g.state)).toBeNull();
  });

  it('preserves the actual shortage priority and offers at a later reading', () => {
    const g = atReading(16);
    // Re-enter a real finishing cup with its scheduled shortage due.
    g.state.phase = 'playing'; g.state.shortageAfter = 16;
    completeRound(g); g.state.offer = null; g.primaryAction();
    expect(g.state.phase).toBe('shortage'); expect(g.state.arcadeDue).toBeNull();
    step(g, 2); g.chooseErrand('skip'); expect(g.state.round).toBe(17);
    g.state.spawnTimer = Infinity; g.state.current = null;
    g.state.modifiers = { ...g.state.modifiers, laneDrift: false };
    completeRound(g); g.state.offer = null; g.primaryAction();
    expect(g.state.phase).toBe('arcadeOffer');
    expect(g.state.shortageAfter).toBe(23);
  });

  it('skips for free, rejects duplicate choices, and repeats after 14 normal rounds', () => {
    const g = offered();
    const { score, teaCash, lives, spoon, progress, nextFortune, target } = structuredClone(g.state);
    expect(g.chooseInterlude(false)).toBe(true);
    expect(g.state).toMatchObject({ score, teaCash, lives, spoon, progress, fortune: nextFortune, round: 13 });
    expect(g.state.target).toBeGreaterThanOrEqual(target);
    expect(g.state.dailyPour).toBeNull(); expect(g.chooseInterlude(true)).toBe(false);
    g.state.arcade.after.biscuitBreakout = 1000; // only the paper route's own schedule here
    g.state.round = 25; expect(eligibleInterlude(g.state)).toBeNull();
    g.state.round = 26; expect(eligibleInterlude(g.state)).toBe('dailyPour');
    consumeInterlude(g.state, 'dailyPour'); expect(eligibleInterlude(g.state)).toBeNull();
  });

  it('freezes every mission field on pause, ignores gameplay inputs, then resumes safely', () => {
    const g = offered(); g.chooseInterlude(true);
    expect(g.state.dailyPour.stage).toBe('intro');
    g.confirm(); expect(g.state.dailyPour.stage).toBe('play');
    step(g, 4); g.throwPaper(); g.togglePause();
    const snapshot = structuredClone(g.state.dailyPour);
    expect(g.aimPaper('far')).toBe(false); expect(g.throwPaper()).toBe(false);
    expect(g.fireSteam()).toBe(false); expect(g.pourMilk()).toBe(false); expect(g.sugarBurst()).toBe(false);
    expect(g.jump()).toBe(false); expect(g.slide()).toBe(false);
    step(g, 100); expect(g.state.dailyPour).toEqual(snapshot);
    expect(pageMode(g.state)).toBe('pour'); expect(hudText(g.state).hudStatus).toContain('PAUSED');
    g.resume(); step(g, 1); expect(g.state.dailyPour.delivered).toBe(1);
  });

  it('returns once with fortune, cups, upgrades, chapter, deferred encounter and shortage dates intact', () => {
    const g = offered(); g.chooseInterlude(true); g.confirm();
    const before = structuredClone(g.state);
    step(g, 31);
    expect(g.state).toMatchObject({ round: before.round, target: before.target, lives: before.lives,
      spoon: before.spoon, progress: before.progress, nextFortune: before.nextFortune,
      shortageAfter: before.shortageAfter, score: before.score, teaCash: before.teaCash, extraSugar: before.extraSugar });
    g.primaryAction(); expect(g.state.phase).toBe('dailyPour'); // minimum outro guard
    step(g, 2);
    g.state.havocDue = true; // Any deferred encounter still has priority on return.
    g.primaryAction(); expect(g.state.phase).toBe('chocolate');
    expect(g.chooseInterlude(true)).toBe(false);
    expect(g.state.nextFortune).toBe(before.nextFortune);
  });

  it('restarts the schedule and clears the route for a fresh pot', () => {
    const g = offered(); g.chooseInterlude(true);
    g.state.phase = 'gameover'; g.restart();
    expect(g.state.dailyPour).toBeNull(); expect(g.state.interlude).toBeNull();
    expect(g.state.arcade.after.dailyPour).toBe(CONFIG.arcade.dailyPour.firstAfter);
    expect(g.state.arcade.offeredAt).toBeNull();
  });

  it.each(['intro', 'outro'])('P pauses the %s instead of starting or dismissing it', (stage) => {
    const g = offered(); g.chooseInterlude(true);
    if (stage === 'outro') { g.confirm(); step(g, 33); }
    expect(g.state.dailyPour.stage).toBe(stage);
    expect(g.togglePause()).toBe(true); expect(g.state.phase).toBe('paused');
    const before = structuredClone(g.state.dailyPour);
    step(g, 10); expect(g.state.dailyPour).toEqual(before);
    g.togglePause(); expect(g.state.phase).toBe('dailyPour');
    expect(g.state.dailyPour.stage).toBe(stage);
  });

  it('keeps future tea, fortunes, enemies and Tea Run randomness identical to skipping', () => {
    const a = offered(), b = offered();
    a.chooseInterlude(true); a.confirm(); step(a, 33); a.primaryAction();
    b.chooseInterlude(false);
    for (const g of [a, b]) { g.state.spawnTimer = 0; step(g, 1); }
    expect(a.state.tea).toBe(b.state.tea); expect(a.state.enemies).toEqual(b.state.enemies);
    for (const g of [a, b]) {
      g.state.enemies = []; g.state.spawnTimer = Infinity; g.state.current = null;
      g.state.modifiers = { ...g.state.modifiers, laneDrift: false }; completeRound(g);
    }
    expect(a.state.nextFortune).toBe(b.state.nextFortune); expect(a.state.offer).toEqual(b.state.offer);
    // Start a real Tea Run from both games; their private errand streams still agree.
    for (const g of [a, b]) {
      g.state.phase = 'shortage'; g.state.shortage = { time: 5 }; g.chooseErrand('run');
    }
    expect(a.state.run).toEqual(b.state.run);
    expect(a.state.run.obstacles.length).toBeGreaterThan(0);
  });
});
