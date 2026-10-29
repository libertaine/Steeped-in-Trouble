import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { consumeInterlude, createArcadeSchedule, eligibleInterlude } from '../../src/gameplay/arcadeInterludes.js';
import { CROSSING_SALT, createCrossing, planCrossing } from '../../src/gameplay/crossingStreet.js';
import { dayOf } from '../../src/gameplay/days.js';
import { createControls } from '../../src/input/controls.js';
import { hudText, pageMode } from '../../src/ui/hud.js';
import { musicMood } from '../../src/audio/music.js';
import { crossForMe, prepareCrossingPractice } from '../../src/dev/crossing.js';
import { completeRound, killOne, playingGame, step } from './helpers.js';
import { finishNormal } from '../support/daySimulation.js';

const C = CONFIG.crossingStreet;
const TICK = 1 / 120;
const FIRE = Object.freeze({ left: false, right: false, fire: true });

/** A finished cup at `round` in Chapter 2, the other adventures and encounters out of the way. */
function atReading(round = 27, { seed = 11, heat } = {}) {
  const g = playingGame({ seed });
  Object.assign(g.state, { round, progress: { chapter: 2, starts: [1, 6] },
    grindAfter: null, lastGrind: round, havocAfter: null, lastHavoc: round, shortageAfter: 1000 });
  if (heat !== undefined) g.state.heat = heat;
  Object.assign(g.state.arcade.after, { dailyPour: round + 3, biscuitBreakout: round + 6 });
  g.state.modifiers = { ...g.state.modifiers, laneDrift: false };
  completeRound(g);
  return g;
}
/** On to the offer, taking any upgrade on the way. */
function toOffer(g) {
  step(g, 5);
  if (g.state.offer) g.chooseUpgrade(0);
  else g.primaryAction();
  return g;
}
function offered(round, options) {
  const g = toOffer(atReading(round, options));
  expect(g.state.phase).toBe('arcadeOffer');
  expect(g.state.interlude).toEqual({ id: 'crossingStreet' });
  return g;
}
function accepted(round, options) {
  const g = offered(round, options);
  g.drainEvents();
  expect(g.chooseInterlude(true)).toBe(true);
  return g;
}

/** Play the crossing out with genuine hops: a cautious route through the real traffic. */
function crossSafely(g) {
  const m = g.state.crossingStreet;
  if (m.stage === 'intro') g.confirm();
  const moves = planCrossing(m.lanes, (m.ticks + 1) * TICK, { col: m.spoon.col, row: m.spoon.row });
  expect(moves).not.toBeNull();
  for (const move of moves) {
    if (move !== 'wait') g.hop(move);
    for (let i = 0; i < Math.round(C.repeat / TICK); i++) g.update(TICK);
  }
  expect(m.summary).toMatchObject({ success: true, perfect: true });
  return m;
}
/** Run the clock out without moving. */
function waitItOut(g) {
  if (g.state.crossingStreet.stage === 'intro') g.confirm();
  step(g, C.duration + 0.2);
  expect(g.state.crossingStreet.summary).toMatchObject({ success: false, reason: 'time' });
}
function leave(g) {
  step(g, C.outroMin + 0.1);
  g.primaryAction();
}

describe('Crossing the Street scheduling', () => {
  it('first offers after round 27, only in Chapter 2, alongside the existing two', () => {
    expect(CONFIG.arcade.crossingStreet).toEqual({ firstAfter: 27, repeatEvery: 14, minChapter: 2 });
    expect(createArcadeSchedule().after).toEqual({ dailyPour: 12, biscuitBreakout: 19, crossingStreet: 27 });
    expect(atReading(26).state.arcadeDue).toBeNull();
    expect(atReading(27).state.arcadeDue).toBe('crossingStreet');
    const chapterOne = atReading(27);
    chapterOne.state.progress.chapter = 1;
    expect(eligibleInterlude(chapterOne.state)).toBeNull();
  });

  it('follows a real pot from round 12: all three, at their own dates, one per reading', () => {
    const g = playingGame({ seed: 4 });
    Object.assign(g.state, { round: 12, progress: { chapter: 2, starts: [1, 6] },
      grindAfter: null, lastGrind: 12, havocAfter: null, lastHavoc: 12, shortageAfter: 1000 });
    const offers = [];
    for (let round = 12; round <= 70; round++) {
      expect(g.state.round).toBe(round);
      g.state.modifiers = { ...g.state.modifiers, laneDrift: false };
      g.state.current = null; g.state.spawnTimer = Infinity; g.state.enemies = [];
      completeRound(g);
      g.state.offer = null; g.state.shortageDue = false; g.state.grindDue = false; g.state.havocDue = false;
      g.state.arcadeDue = eligibleInterlude(g.state);
      g.primaryAction();
      if (g.state.phase === 'arcadeOffer') {
        offers.push([round, g.state.interlude.id]);
        g.chooseInterlude(false);
      }
      g.chooseDay('keep');
      g.state.shortageAfter = 1000;
    }
    expect(offers).toEqual([[12, 'dailyPour'], [19, 'biscuitBreakout'], [26, 'dailyPour'], [27, 'crossingStreet'],
      [33, 'biscuitBreakout'], [40, 'dailyPour'], [41, 'crossingStreet'], [47, 'biscuitBreakout'],
      [54, 'dailyPour'], [55, 'crossingStreet'], [61, 'biscuitBreakout'], [68, 'dailyPour'], [69, 'crossingStreet']]);
  });

  it('favours whichever has waited longest when all three are due, and shares fairly over time', () => {
    const g = atReading(50);
    Object.assign(g.state.arcade.after, { dailyPour: 45, biscuitBreakout: 47, crossingStreet: 41 });
    expect(eligibleInterlude(g.state)).toBe('crossingStreet');
    consumeInterlude(g.state, 'crossingStreet');
    expect(eligibleInterlude(g.state)).toBeNull(); // one per reading, no backlog
    g.state.round = 51;
    expect(eligibleInterlude(g.state)).toBe('dailyPour');
    const counts = { dailyPour: 0, biscuitBreakout: 0, crossingStreet: 0 };
    for (let round = 100; round < 400; round++) {
      g.state.round = round;
      for (const id of Object.keys(counts)) g.state.arcade.after[id] = Math.min(g.state.arcade.after[id], round);
      const id = eligibleInterlude(g.state);
      counts[id]++;
      consumeInterlude(g.state, id);
    }
    expect(counts).toEqual({ dailyPour: 100, biscuitBreakout: 100, crossingStreet: 100 });
  });

  it.each(['shortageDue', 'grindDue', 'havocDue'])('waits behind %s, stays overdue, and builds no backlog', (flag) => {
    const g = atReading(60);
    Object.assign(g.state.arcade.after, { dailyPour: 1000, biscuitBreakout: 1000, crossingStreet: 30 });
    g.state[flag] = true;
    expect(eligibleInterlude(g.state)).toBeNull();
    g.state[flag] = false;
    expect(eligibleInterlude(g.state)).toBe('crossingStreet');
    consumeInterlude(g.state, 'crossingStreet');
    expect(g.state.arcade.after.crossingStreet).toBe(74);
    expect(eligibleInterlude(g.state)).toBeNull();
  });

  it('keeps the shortage first: it comes at a later reading instead', () => {
    const g = atReading(27);
    g.state.phase = 'playing'; g.state.shortageAfter = 27;
    finishNormal(g); g.state.offer = null; g.primaryAction();
    expect(g.state.phase).toBe('shortage');
    expect(g.state.arcadeDue).toBeNull();
    step(g, 2); g.chooseErrand('skip');
    expect(g.state.round).toBe(28);
    finishNormal(g); g.state.offer = null; g.primaryAction();
    expect(g.state).toMatchObject({ phase: 'arcadeOffer', interlude: { id: 'crossingStreet' } });
  });
});

describe('the Crossing the Street offer', () => {
  it('uses the shared offer card with the introduction’s own words', () => {
    const g = offered();
    expect(hudText(g.state)).toMatchObject({
      arcadeTitle: 'WHY DID THE SPOON CROSS THE ROAD?',
      arcadePitch: '“Nobody knows. But apparently, it’s our problem now.”',
      arcadeAccept: 'CROSS THE ROAD', arcadeSkip: 'STAY RIGHT HERE',
      hudStatus: 'WHY DID THE SPOON CROSS THE ROAD?',
    });
    expect(pageMode(g.state)).toBe('arcadeOffer');
  });

  it('skips for free, carrying on with everything, once', () => {
    const g = offered();
    const before = structuredClone(g.state);
    expect(g.chooseInterlude(false)).toBe(true);
    expect(g.state).toMatchObject({ score: before.score, teaCash: before.teaCash, lives: before.lives, spoon: before.spoon,
      progress: before.progress, fortune: before.nextFortune, round: 28, phase: 'playing', heat: before.heat + 1 });
    expect(g.state.crossingStreet).toBeNull();
    expect(g.state.arcade.after.crossingStreet).toBe(41);
    expect(g.chooseInterlude(true)).toBe(false);
  });
});

describe('playing Crossing the Street from the offer', () => {
  it('opens on the introduction, which Enter skips; Enter never interrupts the crossing', () => {
    const g = accepted();
    expect(g.state.phase).toBe('crossingStreet');
    expect(pageMode(g.state)).toBe('crossing');
    expect(g.state.crossingStreet.stage).toBe('intro');
    expect(g.hop('up')).toBe(false);
    expect(g.confirm()).toBe(true);
    expect(g.state.crossingStreet.stage).toBe('play');
    expect(g.confirm()).toBe(false);
    expect(g.hop('up')).toBe(true);
    const h = accepted();
    step(h, C.introTime + 0.05);
    expect(h.state.crossingStreet.stage).toBe('play');
  });

  it('answers no teacup or other-adventure command, and gives the arrows to the street', () => {
    const g = accepted(); g.confirm();
    const { milkLeft, sugarLeft, angle } = g.state;
    const { volleys } = g.state.roundStats;
    step(g, 1, { left: true, right: false, fire: true });
    expect(g.fireSteam()).toBe(false); expect(g.pourMilk()).toBe(false); expect(g.sugarBurst()).toBe(false);
    expect(g.jump()).toBe(false); expect(g.slide()).toBe(false);
    expect(g.launchCube()).toBe(false); expect(g.throwPaper()).toBe(false); expect(g.aimPaper('far')).toBe(false);
    expect(g.state).toMatchObject({ milkLeft, sugarLeft, angle, shots: [] });
    expect(g.state.roundStats.volleys).toBe(volleys);
    expect(g.touchGestures()).toBeNull();
    expect(g.crossingControls()).toBe(true);
    expect(g.breakoutControls()).toBe(false); expect(g.paperControls()).toBe(false);
  });

  it('moves the spoon through the game in all four directions with held repeats', () => {
    const g = accepted(); g.confirm();
    const s = g.state.crossingStreet;
    for (const lane of s.lanes) lane.vehicles = [];
    const walk = { up: false, down: false, left: false, right: false };
    g.hop('left'); step(g, 0.3); expect(s.spoon.col).toBe(C.startCol - 1);
    g.hop('right'); step(g, 0.3); expect(s.spoon.col).toBe(C.startCol);
    g.hop('up'); step(g, 0.3); expect(s.spoon.row).toBe(1);
    g.hop('down'); step(g, 0.3); expect(s.spoon.row).toBe(0);
    g.hop('up');
    for (let i = 0; i < 40; i++) g.update(TICK, undefined, { ...walk, up: true });
    expect(s.spoon.row).toBe(3);
  });

  it('freezes traffic, spoon, timers and the clock while paused; resuming never hops by itself', () => {
    const g = accepted(); g.confirm();
    step(g, 0.5);
    g.hop('up'); g.update(TICK); // mid-hop
    g.hop('left'); // waiting for the landing
    expect(g.togglePause()).toBe(true);
    expect(g.state.phase).toBe('paused');
    const frozen = structuredClone(g.state.crossingStreet);
    expect(frozen.pressed).toBeNull();
    expect(g.hop('right')).toBe(false);
    for (let i = 0; i < 1200; i++) g.update(1 / 60, FIRE, { up: true, down: false, left: true, right: false });
    expect(g.state.crossingStreet).toEqual(frozen);
    expect(hudText(g.state).hudStatus).toBe('TRAFFIC PAUSED');
    expect(pageMode(g.state)).toBe('crossing');
    expect(g.crossingControls()).toBe(true);
    g.togglePause();
    expect(g.state.phase).toBe('crossingStreet');
    step(g, 1);
    expect(g.state.crossingStreet.hops).toBe(frozen.hops); // the landing, and no other hop
    expect(g.state.crossingStreet.spoon.col).toBe(C.startCol);
  });

  it.each(['intro', 'outro'])('P pauses the %s instead of starting or dismissing it', (stage) => {
    const g = accepted();
    if (stage === 'outro') waitItOut(g);
    expect(g.togglePause()).toBe(true);
    const before = structuredClone(g.state.crossingStreet);
    step(g, 10);
    expect(g.state.crossingStreet).toEqual(before);
    g.togglePause();
    expect(g.state.crossingStreet.stage).toBe(stage);
  });

  it('pays a perfect crossing once and returns with the round, fortune, cups, spoon, chapter, Heat and teas intact', () => {
    const g = accepted();
    const before = structuredClone(g.state);
    const m = crossSafely(g);
    const best = 5 * C.lanePoints + C.shopBonus + C.perfectBonus;
    expect(m.summary).toMatchObject({ points: best, cash: C.successCash, title: 'NOT A SCRATCH ON THE SILVER!' });
    expect(hudText(g.state).roundTitle).toBe('NOT A SCRATCH ON THE SILVER!');
    const kept = { round: before.round, heat: before.heat, lives: before.lives, spoon: before.spoon, progress: before.progress,
      nextFortune: before.nextFortune, shortageAfter: before.shortageAfter, extraSugar: before.extraSugar, tea: before.tea,
      teaAge: before.teaAge, teaServed: before.teaServed, dayPending: before.dayPending, havocAfter: before.havocAfter,
      grindAfter: before.grindAfter, arcade: before.arcade, discovered: before.discovered };
    expect(g.state).toMatchObject({ ...kept, score: before.score + best, teaCash: before.teaCash + C.successCash });
    g.primaryAction(); expect(g.state.phase).toBe('crossingStreet'); // the result is not dismissed by accident
    step(g, 2);
    g.primaryAction();
    expect(g.state).toMatchObject({ phase: 'playing', round: before.round + 1, fortune: before.nextFortune,
      score: before.score + best, teaCash: before.teaCash + C.successCash, crossingStreet: null, shots: [] });
    const events = g.drainEvents();
    expect(events.filter((e) => e.type === 'crossingFinish')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'crossingEnd')).toHaveLength(1);
  });

  it('a failed crossing costs no cup, pays only its lanes, and returns the same way', () => {
    const g = accepted();
    const before = structuredClone(g.state);
    waitItOut(g);
    expect(g.state.crossingStreet.summary).toMatchObject({ title: 'THE TRAFFIC HAS SPOKEN.', cash: 0, points: 0 });
    expect(g.state).toMatchObject({ lives: before.lives, score: before.score, teaCash: before.teaCash });
    leave(g);
    expect(g.state).toMatchObject({ phase: 'playing', round: before.round + 1, lives: before.lives });
  });

  it('hands over to an encounter still waiting, and never restocks tea or answers a shortage', () => {
    const g = accepted();
    crossSafely(g);
    g.state.shortageDue = true;
    leave(g);
    expect(g.state.phase).toBe('shortage'); // still the shop's problem: crossing the road bought no tea
    expect(g.state.extraSugar).toBe(0);
    const h = accepted(); waitItOut(h);
    h.state.havocDue = true;
    leave(h);
    expect(h.state.phase).toBe('chocolate');
  });

  it('is cleared, with its schedule, by a fresh pot after game over', () => {
    const g = accepted(); g.confirm();
    g.state.phase = 'gameover'; g.restart();
    expect(g.state.crossingStreet).toBeNull();
    expect(g.state.arcade.after.crossingStreet).toBe(27);
    expect(g.state.phase).toBe('playing');
    expect(g.state.round).toBe(1);
  });

  it('plays a jaunty soundtrack that hurries at the end, and rests between stages', () => {
    const g = accepted();
    expect(musicMood(g.state).section).toBe('reading');
    g.confirm();
    expect(musicMood(g.state)).toMatchObject({ section: 'havoc', tempo: 128 });
    for (const lane of g.state.crossingStreet.lanes) lane.vehicles = [];
    step(g, C.duration - 2);
    expect(musicMood(g.state).tempo).toBeGreaterThan(128);
  });
});

describe('the Day boundary', () => {
  /** A Day-ending cup with the crossing due after it. */
  function dayEnd(round) {
    const g = playingGame({ seed: 3 });
    Object.assign(g.state, { round, heat: Math.min(28, round - 1), progress: { chapter: 2, starts: [1, 6] },
      grindAfter: null, lastGrind: round, havocAfter: null, lastHavoc: round, shortageAfter: 1000 });
    Object.assign(g.state.arcade.after, { dailyPour: round + 3, biscuitBreakout: round + 6, crossingStreet: round });
    finishNormal(g);
    expect(g.state.dayPending).toBe(true);
    toOffer(g);
    expect(g.state).toMatchObject({ phase: 'arcadeOffer', interlude: { id: 'crossingStreet' }, dayPending: true });
    return g;
  }

  it.each([
    [30, 'complete', 'fresh'], [30, 'skip', 'keep'], [40, 'fail', 'keep'], [40, 'complete', 'fresh'],
  ])('after round %i, a %s crossing still leads to one Day choice (%s)', (round, how, choice) => {
    const g = dayEnd(round);
    const before = structuredClone(g.state);
    if (how === 'skip') g.chooseInterlude(false);
    else {
      g.chooseInterlude(true);
      if (how === 'complete') crossSafely(g); else waitItOut(g);
      expect(g.state).toMatchObject({ round, heat: before.heat, dayPending: true });
      leave(g);
    }
    expect(g.state).toMatchObject({ phase: 'day', round, dayPending: true, nextFortune: before.nextFortune });
    expect(hudText(g.state).dayCompleted).toBe(`Day ${dayOf(round)} complete. Choose how tomorrow brews.`);
    expect(g.chooseInterlude(true)).toBe(false);
    expect(g.hop('up')).toBe(false);
    expect(g.chooseDay(choice)).toBe(true);
    expect(g.chooseDay(choice)).toBe(false); // exactly once
    expect(g.state).toMatchObject({ phase: 'playing', round: round + 1, dayPending: false, fortune: before.nextFortune,
      heat: choice === 'fresh' ? 0 : Math.min(28, before.heat + 1), spoon: before.spoon, progress: before.progress });
  });
});

describe('the next game is untouched', () => {
  it('keeps future teas, leaves, fortunes, the Tea Run, the paper route and the biscuit wall identical to skipping', () => {
    const a = offered(); const b = offered();
    a.chooseInterlude(true); crossSafely(a); leave(a);
    b.chooseInterlude(false);
    for (const g of [a, b]) { g.state.spawnTimer = 0; step(g, 1); }
    expect(a.state.tea).toBe(b.state.tea); expect(a.state.enemies).toEqual(b.state.enemies);
    for (const g of [a, b]) {
      g.state.enemies = []; g.state.spawnTimer = Infinity; g.state.current = null;
      g.state.modifiers = { ...g.state.modifiers, laneDrift: false }; completeRound(g);
    }
    expect(a.state.nextFortune).toBe(b.state.nextFortune); expect(a.state.offer).toEqual(b.state.offer);
    for (const g of [a, b]) { g.state.phase = 'shortage'; g.state.shortage = { time: 5 }; g.chooseErrand('run'); }
    expect(a.state.run).toEqual(b.state.run);
    const route = (g) => {
      Object.assign(g.state, { phase: 'arcadeOffer', interlude: { id: 'dailyPour' } });
      g.chooseInterlude(true);
      return g.state.dailyPour.houses;
    };
    expect(route(a)).toEqual(route(b));
    const wall = (g) => {
      Object.assign(g.state, { phase: 'arcadeOffer', interlude: { id: 'biscuitBreakout' } });
      g.chooseInterlude(true);
      return g.state.biscuitBreakout.biscuits;
    };
    expect(wall(a)).toEqual(wall(b));
  });

  it('builds the road from its own salted stream: the same seed, the same road', () => {
    const a = accepted(27, { seed: 5 }); const b = accepted(27, { seed: 5 });
    expect(a.state.crossingStreet.lanes).toEqual(b.state.crossingStreet.lanes);
    const c = accepted(27, { seed: 6 });
    expect(c.state.crossingStreet.lanes).not.toEqual(a.state.crossingStreet.lanes);
    expect(createCrossing(createRandom(a.seed ^ CROSSING_SALT)).lanes).toEqual(a.state.crossingStreet.lanes);
  });

  it('holding steam still fires continuously after the crossing, exactly as in a pot that never crossed', () => {
    const a = offered(); const b = offered();
    a.chooseInterlude(true); crossSafely(a); leave(a);
    b.chooseInterlude(false);
    for (const g of [a, b]) { g.state.spawnTimer = Infinity; step(g, 2, FIRE); }
    expect(a.state.roundStats.volleys).toBe(b.state.roundStats.volleys);
    expect(a.state.roundStats.volleys).toBeGreaterThanOrEqual(Math.floor(2 / CONFIG.steam.cooldown) - 1);
  });

  it('still awards “Not a drop wasted.” for a perfect cup after the crossing', () => {
    const g = accepted();
    crossSafely(g); leave(g);
    expect(g.state.phase).toBe('playing');
    g.state.modifiers = { ...g.state.modifiers, laneDrift: false };
    g.state.current = null;
    const n = g.state.target;
    for (let i = 0; i < n; i++) killOne(g);
    expect(g.state.phase).toBe('reading');
    expect(g.state.roundStats.volleys).toBeGreaterThanOrEqual(CONFIG.secrets.perfectMinVolleys);
    expect(g.state.secrets).toContain('notADropWasted');
  });
});

describe('Crossing the Street keys', () => {
  function keys(crossing = () => true) {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), {
      defaultView: win, visibilityState: 'visible', querySelectorAll: () => [], querySelector: () => null,
    });
    const commands = Object.fromEntries(['fire', 'milk', 'sugar', 'jump', 'slide', 'launchCube', 'throwPaper', 'aimPaper',
      'hop', 'pause', 'togglePause', 'confirm', 'restart', 'choose'].map((key) => [key, vi.fn()]));
    commands.crossingControls = crossing;
    const controls = createControls({ doc, commands });
    const key = (type, code, repeat = false) => win.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
    return { controls, commands, key };
  }

  it('hops once per fresh press of an arrow or WASD, holds it for repeats, and leaves every teacup action alone', () => {
    const { controls, commands, key } = keys();
    for (const [code, dir] of [['ArrowUp', 'up'], ['KeyW', 'up'], ['ArrowDown', 'down'], ['KeyS', 'down'],
      ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right']]) {
      key('keydown', code);
      for (let i = 0; i < 5; i++) key('keydown', code, true);
      expect(commands.hop).toHaveBeenLastCalledWith(dir);
      expect(controls.walk[dir]).toBe(true);
      key('keyup', code);
      expect(controls.walk[dir]).toBe(false);
    }
    expect(commands.hop).toHaveBeenCalledTimes(8);
    key('keydown', 'Space'); key('keydown', 'KeyQ'); key('keydown', 'KeyE'); key('keydown', 'KeyM'); key('keydown', 'Digit1');
    for (const action of ['fire', 'milk', 'sugar', 'jump', 'slide', 'launchCube', 'throwPaper', 'aimPaper', 'choose']) {
      expect(commands[action]).not.toHaveBeenCalled();
    }
    expect(controls.held).toEqual({ left: false, right: false, fire: false });
    key('keydown', 'KeyP'); key('keydown', 'Enter');
    expect(commands.togglePause).toHaveBeenCalledTimes(1);
    expect(commands.confirm).toHaveBeenCalledTimes(1);
    controls.reset();
    expect(controls.walk).toEqual({ up: false, down: false, left: false, right: false });
    controls.dispose();
  });

  it('lets no Space or arrow still held from the street fire, turn, or hop in the next cup', () => {
    let inStreet = true;
    const { controls, commands, key } = keys(() => inStreet);
    key('keydown', 'ArrowLeft'); key('keydown', 'Space');
    expect(commands.hop).toHaveBeenCalledTimes(1);
    // The crossing ends (crossingEnd) with both still held.
    inStreet = false;
    controls.settle(true);
    for (let i = 0; i < 5; i++) { key('keydown', 'ArrowLeft', true); key('keydown', 'Space', true); }
    expect(commands.fire).not.toHaveBeenCalled();
    expect(controls.held).toEqual({ left: false, right: false, fire: false });
    // Released and pressed afresh, they belong to the cup again: continuous fire is untouched.
    key('keyup', 'Space'); key('keyup', 'ArrowLeft');
    key('keydown', 'Space');
    for (let i = 0; i < 5; i++) key('keydown', 'Space', true);
    expect(controls.held.fire).toBe(true);
    expect(commands.fire).toHaveBeenCalledTimes(6);
    key('keydown', 'ArrowLeft');
    expect(controls.held.left).toBe(true);
    controls.dispose();
  });

  it('drives the arrow pad by pointer: a hop on landing, a hold while down, released on cancel', () => {
    const pads = ['up', 'left', 'down', 'right'].map((dir) => Object.assign(new EventTarget(), {
      dataset: { walk: dir }, setPointerCapture: () => {},
    }));
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), {
      defaultView: win, visibilityState: 'visible', querySelector: () => null,
      querySelectorAll: (selector) => (selector === '[data-walk]' ? pads : []),
    });
    const commands = Object.fromEntries(['fire', 'milk', 'sugar', 'hop', 'pause', 'togglePause', 'confirm', 'restart', 'choose']
      .map((key) => [key, vi.fn()]));
    const controls = createControls({ doc, commands });
    const pointer = (target, type) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: 1 }));
    pointer(pads[0], 'pointerdown');
    expect(commands.hop).toHaveBeenCalledWith('up');
    expect(controls.walk.up).toBe(true);
    pointer(pads[0], 'pointercancel');
    expect(controls.walk.up).toBe(false);
    pointer(pads[3], 'pointerdown');
    pointer(pads[3], 'pointerup');
    expect(commands.hop).toHaveBeenLastCalledWith('right');
    expect(controls.walk.right).toBe(false);
    expect(commands.fire).not.toHaveBeenCalled();
    expect(controls.held).toEqual({ left: false, right: false, fire: false });
    controls.dispose();
  });
});

describe('development practice', () => {
  it('launches a replayable road, a late clock, or a last attempt, and crosses by itself', () => {
    const g = createGame({ seed: 1 });
    expect(prepareCrossingPractice(g, 42)).toBe(true);
    const road = structuredClone(g.state.crossingStreet.lanes);
    expect(g.state).toMatchObject({ phase: 'crossingStreet', round: 27 });
    expect(g.state.crossingStreet.stage).toBe('intro');
    expect(prepareCrossingPractice(g, 42)).toBe(true);
    expect(g.state.crossingStreet.lanes).toEqual(road);
    expect(prepareCrossingPractice(g, 42, 'late')).toBe(true);
    expect(g.state.crossingStreet).toMatchObject({ stage: 'play', clock: C.duration - 5 });
    step(g, 5.1);
    expect(g.state.crossingStreet.summary.reason).toBe('time');
    expect(prepareCrossingPractice(g, 42, 'last')).toBe(true);
    expect(g.state.crossingStreet.attempts).toBe(1);
    expect(prepareCrossingPractice(g, 42, 'bogus')).toBe(false);
    expect(crossForMe(g)).toBe(false); // not under way yet
  });
});
