import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { createRun, obstacleBox, press, spoonBox, spoonHeight, updateRun } from '../../src/gameplay/teaRun.js';
import { atShortage, completeRound, finishBonus, step } from './helpers.js';

const R = CONFIG.teaRun;
function flight(seed = 1) {
  const rng = createRandom(seed);
  const run = createRun(rng);
  Object.assign(run, { stage: 'run', obstacles: [], pickups: [], opportunity: null });
  const state = { run, score: 37, teaCash: 42, extraSugar: 0, aerialDiscoveries: [] };
  const emit = vi.fn();
  const sim = { state, rng, emit };
  return { sim, run, state, emit, advance: (dt) => updateRun(sim, dt) };
}

describe('the spoon discovers flight', () => {
  it('bounds the coffee body to its drawn height; the rope is never solid', () => {
    const cup = CONFIG.teaRun.obstacles.coffeeCup;
    const box = obstacleBox({ kind: 'coffeeCup', x0: 100, roll: 0 }, 0);
    expect(box.bottom).toBe(cup.clearance);
    expect(box.top).toBe(cup.clearance + cup.height);
    expect(Number.isFinite(box.top)).toBe(true);
  });

  it.each([1, 2, 3])('lets a chain of %i jumps meet the finite coffee body honestly', (jumps) => {
    const { sim, run, advance } = flight();
    const cup = R.obstacles.coffeeCup;
    run.obstacles = [{ id: 0, kind: 'coffeeCup', x0: R.speed + R.spoon.halfWidth - cup.inset, roll: 0, hitAt: null }];
    sim.rng.next = () => 0; // successful aerial attempts, without changing their production probability
    advance(0.55); press(sim, 'jump');
    for (let i = 1; i < jumps; i++) { advance(0.2); expect(press(sim, 'jump')).toBe(true); }
    if (jumps > 1) {
      advance(1 - run.clock);
      expect(spoonBox(run).bottom).toBeGreaterThan(obstacleBox(run.obstacles[0], run.clock).top);
    }
    advance(1.5);
    expect(run.hits).toBe(jumps === 1 ? 1 : 0);
  });

  it('keeps sliding reliable and a failed aerial impulse locked through a coffee collision', () => {
    for (const slide of [true, false]) {
      const { sim, run, advance } = flight();
      const cup = R.obstacles.coffeeCup;
      run.obstacles = [{ id: 0, kind: 'coffeeCup', x0: R.speed + R.spoon.halfWidth - cup.inset, roll: 0, hitAt: null }];
      if (slide) { advance(0.85); press(sim, 'slide'); }
      else {
        advance(0.55); press(sim, 'jump'); advance(0.2);
        sim.rng.next = () => 0.7;
        expect(press(sim, 'jump')).toBe(false);
        expect(run.spoon.locked).toBe(true); expect(run.spoon.queued).toBeNull();
      }
      advance(1.5); expect(run.hits).toBe(slide ? 0 : 1);
    }
  });
  it('never rolls for a first jump and preserves its original apex and duration', () => {
    const { sim, run, advance } = flight();
    sim.rng.next = vi.fn(() => 1);
    expect(press(sim, 'jump')).toBe(true);
    advance(R.jumpTime / 2);
    expect(spoonHeight(run.spoon)).toBeCloseTo(R.jumpHeight, 8);
    advance(R.jumpTime / 2);
    expect(run.spoon.action).toBe('run');
    expect(sim.rng.next).not.toHaveBeenCalled();
  });

  it('rolls independently at the 70% boundary and launches from the actual altitude', () => {
    const { sim, run, advance } = flight();
    sim.rng.next = vi.fn().mockReturnValueOnce(0.699999).mockReturnValueOnce(0).mockReturnValueOnce(0.7);
    press(sim, 'jump'); advance(0.15);
    const first = spoonHeight(run.spoon);
    expect(press(sim, 'jump')).toBe(true);
    expect(spoonHeight(run.spoon)).toBe(first);
    advance(0.15);
    expect(spoonBox(run).bottom).toBeGreaterThan(R.jumpHeight);
    expect(press(sim, 'jump')).toBe(true); advance(0.15);
    expect(run.spoon.chain).toBe(3);
    expect(press(sim, 'jump')).toBe(false);
    for (let i = 0; i < 20; i++) expect(press(sim, 'jump')).toBe(false);
    expect(sim.rng.next).toHaveBeenCalledTimes(3);
    expect(run.spoon.queued).toBe(null);
    advance(2);
    expect(run.spoon).toMatchObject({ action: 'run', chain: 0, locked: false });
    press(sim, 'jump'); advance(0.15);
    sim.rng.next = () => 0;
    expect(press(sim, 'jump')).toBe(true);
  });

  it('keeps the distribution deterministic over 10,000 independent seeded attempts', () => {
    let successes = 0;
    const { sim, run } = flight();
    sim.rng = createRandom(29);
    for (let i = 0; i < 10000; i++) {
      Object.assign(run.spoon, { action: 'jump', time: 0.15, launchHeight: 0, locked: false });
      if (press(sim, 'jump')) successes++;
    }
    expect(successes).toBeGreaterThan(6800);
    expect(successes).toBeLessThan(7200);
  });

  it('keeps the same physics, collisions, random outcomes and discoveries across frame rates', () => {
    const play = (dt) => {
      const { sim, run, advance } = flight(88);
      run.opportunity = 'bird';
      sim.rng.next = () => 0;
      for (let i = 0; i < 20; i++) {
        press(sim, 'jump');
        for (let j = 0; j < Math.round(0.5 / dt); j++) advance(dt);
      }
      const data = { ...run };
      delete data.accumulator;
      return data;
    };
    expect(play(1 / 30)).toEqual(play(1 / 60));
    expect(play(1 / 60)).toEqual(play(1 / 144));
  });

  it('retains jump buffering during slide recovery but never slides in midair', () => {
    const { sim, run, advance } = flight();
    press(sim, 'slide'); advance(0.55); press(sim, 'jump'); advance(0.15);
    expect(run.spoon.action).toBe('jump');
    press(sim, 'slide'); advance(0.1);
    expect(run.spoon.action).toBe('jump');
    advance(1);
    expect(run.spoon.action).toBe('run');
  });

  it('clears ground obstacles at its true altitude and never hits a passed obstacle on landing', () => {
    const { sim, run, advance } = flight();
    sim.rng.next = () => 0;
    run.obstacles = [{ kind: 'sugarCube', x0: 160, roll: 0, hitAt: null },
      { kind: 'puddle', x0: 220, roll: 0, hitAt: null }];
    press(sim, 'jump'); advance(0.15); press(sim, 'jump'); advance(0.15);
    press(sim, 'jump'); advance(0.3);
    expect(run.hits).toBe(0);
    expect(spoonHeight(run.spoon)).toBeGreaterThan(100);
    advance(1);
    expect(run.spoon.action).toBe('run');
    expect(run.hits).toBe(0);
    // Several overlapping hazards at ground level still yield just one stumble.
    run.obstacles = Array.from({ length: 3 }, () => ({ kind: 'puddle', x0: run.distance - 40, roll: 0, hitAt: null }));
    advance(0.1);
    expect(run.hits).toBe(1);
  });
});

describe('aerial encounters', () => {
  it.each(['bird', 'power', 'orbit'])('%s requires its altitude, freezes the errand, and returns safely once', (kind) => {
    const { sim, run, state, emit, advance } = flight();
    sim.rng.next = () => 0;
    run.opportunity = kind;
    press(sim, 'jump');
    advance(0.1);
    expect(run.encounter).toBe(null);
    for (let i = 0; i < 30 && !run.encounter; i++) { press(sim, 'jump'); advance(0.15); }
    expect(run.encounter?.kind).toBe(kind);
    expect(run.encounter.height).toBeGreaterThanOrEqual(R.aerial[kind].altitude);
    const kept = () => JSON.stringify({ clock: run.clock, left: run.left, distance: run.distance,
      hits: run.hits, coins: run.coins, packets: run.packets, score: state.score, teaCash: state.teaCash, extraSugar: state.extraSugar });
    // A hazard immediately under the landing and an uncollected nearby coin.
    run.obstacles.push({ kind: 'puddle', x0: run.distance - 40, roll: 0, hitAt: null });
    run.pickups.push({ kind: 'coin', x: run.distance, height: 20, takenAt: null });
    const before = kept();
    expect(press(sim, 'jump')).toBe(false);
    advance(0.5);
    expect(kept()).toBe(before);
    const remaining = R.aerial[kind].duration - run.encounter.time;
    advance(remaining);
    expect(run.encounter).toBe(null);
    expect(kept()).toBe(before);
    expect(run.obstacles[0].bypassed).toBe(true);
    expect(run.pickups[0].takenAt).toBe(null);
    expect(run.result).toBe(null);
    expect(run.spoon.action).toBe('run');
    expect(state.aerialDiscoveries).toEqual([kind]);
    advance(0.1);
    expect(run.hits).toBe(0);
    expect(run.clock).toBeGreaterThan(JSON.parse(before).clock);
    for (let i = 0; i < 20; i++) { press(sim, 'jump'); advance(0.15); }
    expect(emit.mock.calls.filter(([type]) => type === 'runDiscovery')).toHaveLength(1);
  });

  it('can pause every kind of encounter and retains main-game state through the return', () => {
    for (const kind of ['bird', 'power', 'orbit']) {
      const game = atShortage(5);
      game.chooseErrand('run'); game.primaryAction();
      const { run } = game.state;
      run.opportunity = kind;
      Object.assign(run.spoon, { action: 'jump', launchHeight: R.aerial[kind].altitude, time: 0 });
      game.update(1 / 120);
      expect(run.encounter?.kind).toBe(kind);
      const snapshot = structuredClone(game.state);
      game.pause();
      const paused = JSON.stringify(run);
      step(game, 30);
      expect(JSON.stringify(run)).toBe(paused);
      game.togglePause();
      expect(game.state).toEqual({ ...snapshot, pausedFrom: 'teaRun' });
      const kept = ({ score, teaCash, lives, spoon, nextFortune, round, havocDue, grindDue }) =>
        JSON.stringify({ score, teaCash, lives, spoon, nextFortune, round, havocDue, grindDue });
      const before = kept(game.state);
      step(game, R.aerial[kind].duration + 0.05);
      expect(kept(game.state)).toBe(before);
      expect(run.encounter).toBe(null);
    }
  });

  it('never discovers anything through ordinary first jumps alone', () => {
    const { sim, run, advance } = flight();
    run.opportunity = 'bird';
    for (let i = 0; i < 30; i++) { press(sim, 'jump'); advance(0.8); }
    expect(run.encountered).toBe(null);
  });

  it('does not draw aerial randomness from the cup stream or change pending bonus encounters', () => {
    const play = (experiment) => {
      const game = atShortage(5);
      game.chooseErrand('run'); game.primaryAction();
      if (experiment) for (let i = 0; i < 12; i++) { game.jump(); game.update(0.15); }
      // Settle both errands by the same ordinary timeout, preserving queued bonuses.
      game.state.run.clock = R.timeLimit;
      step(game, 2); game.primaryAction();
      finishBonus(game, { win: true });
      completeRound(game);
      return { fortune: game.state.nextFortune, offer: game.state.offer,
        havocDue: game.state.havocDue, grindDue: game.state.grindDue, tea: game.state.tea };
    };
    expect(play(true)).toEqual(play(false));
  });

  it('retains found ids only in this pot and clears them on restart', () => {
    const game = atShortage(5);
    game.state.aerialDiscoveries = ['bird', 'power'];
    game.chooseErrand('skip'); finishBonus(game);
    expect(game.state.aerialDiscoveries).toEqual(['bird', 'power']);
    game.state.phase = 'gameover'; game.restart();
    expect(game.state.aerialDiscoveries).toEqual([]);
  });
});
