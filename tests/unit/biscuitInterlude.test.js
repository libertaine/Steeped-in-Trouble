import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { consumeInterlude, createArcadeSchedule, eligibleInterlude } from '../../src/gameplay/arcadeInterludes.js';
import { createControls } from '../../src/input/controls.js';
import { hudText, pageMode } from '../../src/ui/hud.js';
import { musicMood } from '../../src/audio/music.js';
import { completeRound, playingGame, step } from './helpers.js';

const B = CONFIG.biscuitBreakout;

/** A finished cup at `round` in Chapter 2, with every other encounter out of the way. */
function atReading(round = 19, { pourAfter = 26, seed = 11 } = {}) {
  const g = playingGame({ seed });
  Object.assign(g.state, { round, progress: { chapter: 2, starts: [1, 6] },
    grindAfter: null, lastGrind: round, havocAfter: null, lastHavoc: round, shortageAfter: 1000 });
  g.state.arcade.after.dailyPour = pourAfter;
  g.state.modifiers = { ...g.state.modifiers, laneDrift: false };
  completeRound(g);
  return g;
}
function offered(round, options) {
  const g = atReading(round, options);
  g.state.offer = null;
  g.primaryAction();
  return g;
}

describe('Biscuit Breakout scheduling', () => {
  it('first offers after round 19, only in Chapter 2, with the existing paper-route schedule untouched', () => {
    expect(createArcadeSchedule().after).toEqual({ dailyPour: 12, biscuitBreakout: 19 });
    expect(CONFIG.arcade.biscuitBreakout).toEqual({ firstAfter: 19, repeatEvery: 14, minChapter: 2 });
    expect(atReading(18).state.arcadeDue).toBeNull();
    const chapterOne = atReading(19);
    chapterOne.state.progress.chapter = 1;
    expect(eligibleInterlude(chapterOne.state)).toBeNull();
    expect(atReading(19).state.arcadeDue).toBe('biscuitBreakout');
    expect(atReading(12, { pourAfter: 12 }).state.arcadeDue).toBe('dailyPour');
  });

  it('follows a real pot: paper route at 12, biscuits at 19, then each every 14 rounds', () => {
    const g = atReading(12, { pourAfter: 12 });
    const offers = [];
    for (let round = 12; round <= 50; round++) {
      if (g.state.round !== round) throw new Error(`expected round ${round}`);
      g.state.offer = null; g.state.shortageDue = false; g.state.grindDue = false; g.state.havocDue = false;
      g.state.arcadeDue = eligibleInterlude(g.state);
      g.primaryAction();
      if (g.state.phase === 'arcadeOffer') {
        offers.push([round, g.state.interlude.id]);
        g.chooseInterlude(false);
      }
      g.chooseDay('keep');
      expect(g.state.phase).toBe('playing');
      g.state.shortageAfter = 1000;
      nextReadingOnly(g);
    }
    expect(offers).toEqual([[12, 'dailyPour'], [19, 'biscuitBreakout'], [26, 'dailyPour'], [33, 'biscuitBreakout'],
      [40, 'dailyPour'], [47, 'biscuitBreakout']]);
  });

  it('when both are due, offers the one waiting longest, never both after one reading, and never starves either', () => {
    const g = atReading(40);
    Object.assign(g.state.arcade.after, { dailyPour: 33, biscuitBreakout: 30 });
    expect(eligibleInterlude(g.state)).toBe('biscuitBreakout');
    consumeInterlude(g.state, 'biscuitBreakout');
    expect(eligibleInterlude(g.state)).toBeNull(); // one per reading
    g.state.round = 41;
    expect(eligibleInterlude(g.state)).toBe('dailyPour');
    // A tie goes to registry order, and the other is first in line next time.
    Object.assign(g.state.arcade.after, { dailyPour: 41, biscuitBreakout: 41 });
    expect(eligibleInterlude(g.state)).toBe('dailyPour');
    consumeInterlude(g.state, 'dailyPour');
    g.state.round = 42;
    expect(eligibleInterlude(g.state)).toBe('biscuitBreakout');
    // Over a long stretch where both are always due, they alternate fairly.
    const counts = { dailyPour: 0, biscuitBreakout: 0 };
    for (let round = 100; round < 300; round++) {
      g.state.round = round;
      for (const id of Object.keys(counts)) g.state.arcade.after[id] = Math.min(g.state.arcade.after[id], round);
      const id = eligibleInterlude(g.state);
      counts[id]++;
      consumeInterlude(g.state, id);
    }
    expect(counts).toEqual({ dailyPour: 100, biscuitBreakout: 100 });
  });

  it.each(['shortageDue', 'grindDue', 'havocDue'])('waits behind %s without building a backlog', (flag) => {
    const g = atReading(60);
    g.state.arcade.after.dailyPour = 1000;
    g.state[flag] = true;
    expect(eligibleInterlude(g.state)).toBeNull();
    g.state[flag] = false;
    expect(eligibleInterlude(g.state)).toBe('biscuitBreakout');
    consumeInterlude(g.state, 'biscuitBreakout');
    expect(g.state.arcade.after.biscuitBreakout).toBe(74);
  });

  it('still lets the fortune finish and an upgrade be chosen before the offer', () => {
    const g = atReading(19);
    expect(g.state.offer).not.toBeNull();
    g.primaryAction(); expect(g.state.phase).toBe('reading');
    step(g, 5);
    expect(g.chooseUpgrade(0)).toBe(true);
    expect(g.state.phase).toBe('arcadeOffer');
    expect(g.state.interlude).toEqual({ id: 'biscuitBreakout' });
  });
});

describe('the Biscuit Breakout offer', () => {
  it('reuses the offer card in its own words', () => {
    const g = offered();
    const hud = hudText(g.state);
    expect(hud).toMatchObject({
      arcadeTitle: 'THE BISCUITS ARE REVOLTING!', arcadePitch: '“Their demands are unclear. Their formation is not.”',
      arcadeAccept: 'BREAK THE BISCUITS', arcadeSkip: 'LEAVE THEM ALONE', hudStatus: 'THE BISCUITS ARE REVOLTING!',
    });
    expect(pageMode(g.state)).toBe('arcadeOffer');
    const pour = offered(12, { pourAfter: 12 });
    expect(hudText(pour.state)).toMatchObject({ arcadeTitle: 'EXTRA! EXTRA!', arcadeAccept: 'DELIVER PAPERS', arcadeSkip: 'NO THANKS' });
  });

  it('skips for free: cups, score, cash, spoon, chapter, tea and fortune all carry on', () => {
    const g = offered();
    const before = structuredClone(g.state);
    expect(g.chooseInterlude(false)).toBe(true);
    expect(g.state).toMatchObject({ score: before.score, teaCash: before.teaCash, lives: before.lives, spoon: before.spoon,
      progress: before.progress, fortune: before.nextFortune, round: 20, phase: 'playing' });
    expect(g.state.biscuitBreakout).toBeNull();
    expect(g.state.arcade.after).toEqual({ dailyPour: 26, biscuitBreakout: 33 });
    expect(g.chooseInterlude(true)).toBe(false);
  });
});

describe('playing Biscuit Breakout from the offer', () => {
  function accepted() {
    const g = offered();
    g.drainEvents();
    expect(g.chooseInterlude(true)).toBe(true);
    expect(g.state.phase).toBe('biscuitBreakout');
    expect(pageMode(g.state)).toBe('breakout');
    return g;
  }

  it('starts with LAUNCH or Enter in the introduction, then launches with LAUNCH', () => {
    const g = accepted();
    expect(g.state.biscuitBreakout.stage).toBe('intro');
    expect(g.launchCube()).toBe(true);
    expect(g.state.biscuitBreakout.stage).toBe('play');
    expect(g.state.biscuitBreakout.cube.held).toBe(true);
    expect(g.launchCube()).toBe(true);
    expect(g.state.biscuitBreakout.cube.held).toBe(false);
    expect(g.launchCube()).toBe(false);
    const h = accepted();
    expect(h.confirm()).toBe(true);
    expect(h.state.biscuitBreakout.stage).toBe('play');
    expect(h.confirm()).toBe(false); // Enter never interrupts play
  });

  it('steers the spoon with the held turning controls and ignores every teacup command', () => {
    const g = accepted(); g.confirm();
    const x = g.state.biscuitBreakout.paddle.x;
    step(g, 0.5, { left: false, right: true, fire: true });
    expect(g.state.biscuitBreakout.paddle.x).toBeGreaterThan(x);
    const { milkLeft, sugarLeft } = g.state;
    expect(g.fireSteam()).toBe(false); expect(g.pourMilk()).toBe(false); expect(g.sugarBurst()).toBe(false);
    expect(g.jump()).toBe(false); expect(g.throwPaper()).toBe(false);
    expect(g.state).toMatchObject({ milkLeft, sugarLeft, shots: [] });
    expect(g.touchGestures()).toBeNull();
  });

  it('freezes everything while paused, and resuming never launches', () => {
    const g = accepted(); g.confirm();
    g.launchCube(); step(g, 0.4);
    expect(g.togglePause()).toBe(true);
    expect(g.state.phase).toBe('paused');
    const frozen = structuredClone(g.state.biscuitBreakout);
    expect(g.launchCube()).toBe(false);
    step(g, 20, { left: true, right: false, fire: true });
    expect(g.state.biscuitBreakout).toEqual(frozen);
    expect(hudText(g.state).hudStatus).toBe('BREAKOUT PAUSED');
    expect(pageMode(g.state)).toBe('breakout');
    g.togglePause();
    expect(g.state.phase).toBe('biscuitBreakout');
    expect(g.state.biscuitBreakout.cube).toEqual(frozen.cube);
  });

  it('can be paused in its introduction and result, which do not advance', () => {
    const g = accepted();
    g.togglePause();
    step(g, 10);
    g.togglePause();
    expect(g.state.biscuitBreakout.stage).toBe('intro');
  });

  it('pays once and returns to the next cup with fortune, cups, spoon, chapter and dates intact', () => {
    const g = accepted();
    const before = structuredClone(g.state);
    g.confirm();
    step(g, B.duration + 0.1);
    const m = g.state.biscuitBreakout;
    expect(m.stage).toBe('outro');
    expect(hudText(g.state).roundTitle).toBe(m.summary.title);
    expect(g.state).toMatchObject({ round: before.round, lives: before.lives, spoon: before.spoon, progress: before.progress,
      nextFortune: before.nextFortune, shortageAfter: before.shortageAfter, extraSugar: before.extraSugar,
      score: before.score + m.summary.points, teaCash: before.teaCash + m.summary.cash });
    g.primaryAction(); expect(g.state.phase).toBe('biscuitBreakout'); // the result is not dismissed by accident
    step(g, 2);
    expect(g.launchCube()).toBe(false); // Space does nothing on the result
    const { score, teaCash } = g.state;
    g.primaryAction();
    expect(g.state).toMatchObject({ phase: 'playing', round: before.round + 1, fortune: before.nextFortune, score, teaCash,
      biscuitBreakout: null, shots: [] });
    expect(g.drainEvents().filter((e) => e.type === 'breakoutFinish')).toHaveLength(1);
  });

  it('hands over to any encounter still waiting, and resets with a fresh pot', () => {
    const g = accepted(); g.confirm(); step(g, B.duration + 2);
    g.state.havocDue = true;
    g.primaryAction();
    expect(g.state.phase).toBe('chocolate');
    const h = accepted();
    h.state.phase = 'gameover'; h.restart();
    expect(h.state.biscuitBreakout).toBeNull();
    expect(h.state.arcade.after).toEqual({ dailyPour: 12, biscuitBreakout: 19 });
  });

  it('keeps future teas, leaves, fortunes and the Tea Run identical to skipping', () => {
    const a = offered(); const b = offered();
    a.chooseInterlude(true); a.confirm(); a.launchCube(); step(a, B.duration + 2, { left: true, right: false, fire: false });
    a.primaryAction();
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
  });

  it('builds the same wall from the same seed, and its own stream never touches the paper route', () => {
    const a = offered(19, { seed: 5 }); const b = offered(19, { seed: 5 });
    a.chooseInterlude(true); b.chooseInterlude(true);
    expect(a.state.biscuitBreakout.biscuits).toEqual(b.state.biscuitBreakout.biscuits);
    const c = offered(19, { seed: 6 }); c.chooseInterlude(true);
    expect(c.state.biscuitBreakout.biscuits).not.toEqual(a.state.biscuitBreakout.biscuits);
    // Breaking a wall first does not change the paper route the same pot is offered later.
    const routeAfter = (accept) => {
      const g = offered(19, { seed: 5 });
      g.chooseInterlude(accept);
      if (accept) { g.confirm(); g.launchCube(); step(g, B.duration + 2); g.primaryAction(); }
      Object.assign(g.state, { phase: 'arcadeOffer', interlude: { id: 'dailyPour' } });
      g.chooseInterlude(true);
      return g.state.dailyPour.houses;
    };
    expect(routeAfter(true)).toEqual(routeAfter(false));
  });

  it('plays a bouncy soundtrack that hurries at the end', () => {
    const g = accepted(); g.confirm();
    expect(musicMood(g.state)).toMatchObject({ section: 'havoc', tempo: 120 });
    step(g, B.duration - 2);
    expect(musicMood(g.state).tempo).toBeGreaterThan(120);
  });
});

describe('Biscuit Breakout keys', () => {
  function keys(breakout = () => true) {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), {
      defaultView: win, visibilityState: 'visible', querySelectorAll: () => [], querySelector: () => null,
    });
    const commands = Object.fromEntries(['fire', 'milk', 'sugar', 'jump', 'slide', 'launchCube', 'pause', 'togglePause',
      'confirm', 'restart', 'choose'].map((key) => [key, vi.fn()]));
    commands.breakoutControls = breakout;
    const controls = createControls({ doc, commands });
    const key = (type, code, repeat = false) => win.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
    return { controls, commands, key };
  }

  it('gives Space to the cube alone, once per press, and keeps the turning keys for the spoon', () => {
    const { controls, commands, key } = keys();
    key('keydown', 'Space');
    for (let i = 0; i < 6; i++) key('keydown', 'Space', true);
    key('keydown', 'ArrowUp'); key('keydown', 'ArrowDown');
    key('keydown', 'ArrowLeft');
    expect(commands.launchCube).toHaveBeenCalledTimes(1);
    for (const action of ['fire', 'milk', 'sugar', 'jump', 'slide']) expect(commands[action]).not.toHaveBeenCalled();
    expect(controls.held).toEqual({ left: true, right: false, fire: false });
    key('keyup', 'ArrowLeft');
    key('keydown', 'KeyD');
    expect(controls.held.right).toBe(true);
    key('keydown', 'KeyP');
    expect(commands.togglePause).toHaveBeenCalledTimes(1);
    controls.dispose();
  });

  it('never turns a Space still held after an adventure into steam in the next cup', () => {
    let inBreakout = true;
    const { controls, commands, key } = keys(() => inBreakout);
    key('keydown', 'Space');
    expect(commands.launchCube).toHaveBeenCalledTimes(1);
    // The adventure ends (breakoutEnd) while Space is still held down.
    inBreakout = false;
    controls.settle();
    for (let i = 0; i < 5; i++) key('keydown', 'Space', true);
    expect(commands.fire).not.toHaveBeenCalled();
    expect(controls.held.fire).toBe(false);
    // Released and pressed afresh, Space is steam again.
    key('keyup', 'Space');
    key('keydown', 'Space');
    expect(commands.fire).toHaveBeenCalledTimes(1);
    expect(controls.held.fire).toBe(true);
    controls.dispose();
  });
});

/** Like nextReading, but stops at the reading so the schedule test decides what follows. */
function nextReadingOnly(g) {
  g.state.enemies = []; g.state.spawnTimer = Infinity; g.state.current = null;
  g.state.modifiers = { ...g.state.modifiers, laneDrift: false };
  completeRound(g);
}
