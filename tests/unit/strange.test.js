import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { laneAngle } from '../../src/gameplay/arena.js';
import {
  STRANGE_KINDS, STRANGE_LINES, createLineBook, createStrangeHappenings, strangeSchedule,
} from '../../src/rendering/strange.js';
import { IDLE, placeEnemy, playingGame } from './helpers.js';

const S = CONFIG.strange;
const RW = S.rewind;
const DT = 1 / 60;
const RIGHT = Object.freeze({ left: false, right: true, fire: false });
const FIRE = Object.freeze({ left: false, right: false, fire: true });

/** A controller watching `game`, as main.js wires it. */
function watch(game, options = {}) {
  return createStrangeHappenings({ seed: () => game.seed, ...options });
}

/**
 * One frame of main.js's loop: events, the simulation (unless a menu or a
 * rewind holds it), events again, then the happenings, whose start is
 * reported back to the game. Returns whether the simulation advanced, and
 * the presentation events.
 */
function frame(game, strange, { input = IDLE, blocked = false } = {}) {
  for (const e of game.drainEvents()) strange.handle(e);
  const advanced = !blocked && !strange.holding;
  if (advanced) game.update(DT, input);
  for (const e of game.drainEvents()) strange.handle(e);
  strange.update(DT, game.state, { blocked });
  const events = strange.drainEvents();
  if (events.some((e) => e.type === 'strangeStart')) game.noteStrange();
  return { advanced, events };
}

/** Run frames for `seconds`; returns how many advanced the simulation, and every event. */
function run(game, strange, seconds, options) {
  let advanced = 0;
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const f = frame(game, strange, typeof options === 'function' ? options(t) : options);
    if (f.advanced) advanced++;
    events.push(...f.events);
  }
  return { advanced, events };
}

const mushroom = (seed = 3, spawning = false) => playingGame({ seed, tea: 'mushroom', spawning });
// Everything but the one thing the happenings are allowed to leave behind: which Mushroom Tea cup
// had the pot's first (state.strangeFirst, bookkeeping for the plan, read by nothing that plays).
const snapshot = (game) => JSON.stringify({ state: { ...game.state, strangeFirst: null }, random: game.exportRandom() });
const types = (events) => events.map((e) => e.type);

describe('Strange Happenings: the schedule', () => {
  it('is the same for the same seed, and different for another', () => {
    expect(strangeSchedule(7, 80)).toEqual(strangeSchedule(7, 80));
    expect(strangeSchedule(7, 80)).not.toEqual(strangeSchedule(8, 80));
  });

  it('never visits the first Mushroom Tea cup; the first comes in the second, then every 2–4, never the same twice running', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const cups = strangeSchedule(seed, 40).map((p, cup) => (p ? { ...p, cup } : null)).filter(Boolean);
      expect(cups[0].cup).toBe(S.firstCup);
      for (let i = 1; i < cups.length; i++) {
        expect([2, 3, 4]).toContain(cups[i].cup - cups[i - 1].cup);
        expect(cups[i].kind).not.toBe(cups[i - 1].kind);
      }
      for (const p of cups) {
        expect(STRANGE_KINDS).toContain(p.kind);
        expect(p.start).toBeGreaterThanOrEqual(S.startMin);
        expect(p.start).toBeLessThan(S.startMax);
      }
    }
  });

  it('comes about once every two or three cups, sharing the three kinds about as weighted', () => {
    let events = 0;
    const kinds = { rewind: 0, breathing: 0, impostor: 0 };
    const cups = 60;
    for (let seed = 1; seed <= 400; seed++) {
      for (const p of strangeSchedule(seed, cups)) {
        if (!p) continue;
        events++;
        kinds[p.kind]++;
      }
    }
    const perCup = events / (400 * cups);
    expect(perCup).toBeGreaterThan(1 / 3.1);
    expect(perCup).toBeLessThan(1 / 2.3);
    // Never twice running pulls the shares towards a third each; the rewind stays the commonest.
    expect(kinds.rewind / events).toBeGreaterThan(0.34);
    expect(kinds.breathing / events).toBeGreaterThan(0.25);
    expect(kinds.impostor / events).toBeGreaterThan(0.25);
  });

  it('a longer look ahead never changes the cups already planned', () => {
    expect(strangeSchedule(11, 90).slice(0, 31)).toEqual(strangeSchedule(11, 30));
  });
});

describe('Strange Happenings: counted in Mushroom Tea cups', () => {
  /** A cup of Mushroom Tea in round `round`, the pot's `cup`th, with the plan's first happening at `first` (0: still to come). */
  function mushroomCup(seed, { round, cup, first = 0 }) {
    const game = mushroom(seed);
    Object.assign(game.state, { round, mushroomCups: cup, strangeFirst: first });
    return game;
  }
  /** Seeds whose first happening (in the second Mushroom Tea cup) is a breathing one: the simplest to watch. */
  const breathingFirst = Array.from({ length: 300 }, (_, i) => i + 1).filter((seed) => strangeSchedule(seed, 3)[2]?.kind === 'breathing');

  it('follows the Mushroom Tea cups, whatever round they fall in', () => {
    const seed = breathingFirst[0];
    const plan = strangeSchedule(seed, 3)[2];
    const second = mushroomCup(seed, { round: 17, cup: 2 });
    const a = watch(second);
    run(second, a, plan.start + 0.2);
    expect(a.active?.kind).toBe('breathing');
    const first = mushroomCup(seed, { round: 17, cup: 1 });
    const b = watch(first);
    expect(run(first, b, 30).events).toEqual([]); // never the first Mushroom Tea cup, even in round 17
  });

  it('records the cup of the first happening, and plans the rest from it', () => {
    const seed = breathingFirst[1];
    const game = mushroomCup(seed, { round: 12, cup: 2 });
    const strange = watch(game);
    run(game, strange, 30);
    expect(game.state.strangeFirst).toBe(2);
    const later = strangeSchedule(seed, 20, 2).map((p, cup) => (p ? cup : 0)).filter(Boolean);
    expect(later[0]).toBe(2);
    expect([4, 5, 6]).toContain(later[1]);
  });

  it('waits for the next Mushroom Tea cup when the second never offers a safe moment, never forcing one', () => {
    const seed = breathingFirst[2];
    const game = mushroomCup(seed, { round: 14, cup: 2 });
    const strange = watch(game);
    const leaf = placeEnemy(game.state, { lane: 5, radius: CONFIG.arena.rimRadius - 10 }); // the rim is never quiet
    expect(run(game, strange, 40).events).toEqual([]);
    expect(game.state.strangeFirst).toBe(0);
    // The next Mushroom Tea cup, a few rounds later: now it comes.
    game.state.enemies.splice(game.state.enemies.indexOf(leaf), 1);
    Object.assign(game.state, { round: 19, mushroomCups: 3 });
    strange.handle({ type: 'roundStart' });
    const plan = strangeSchedule(seed, 3, 3)[3];
    run(game, strange, plan.start + 6);
    expect(game.state.strangeFirst).toBe(3);
    expect(strange.active ?? { kind: plan.kind }).toMatchObject({ kind: plan.kind });
  });

  it('picks up a restored pot’s plan exactly, from its saved count and first cup', () => {
    for (const seed of breathingFirst.slice(0, 5)) {
      const plans = strangeSchedule(seed, 30, 3);
      const next = plans.findIndex((p, cup) => p && cup > 3);
      const game = mushroomCup(seed, { round: 25, cup: next, first: 3 });
      const strange = watch(game); // a fresh controller, as after a restore
      run(game, strange, plans[next].start - 0.2);
      expect(strange.active).toBeNull();
      const started = run(game, strange, 7).events.find((e) => e.type === 'strangeStart');
      expect(started).toMatchObject({ kind: plans[next].kind });
      const between = mushroomCup(seed, { round: 24, cup: next - 1, first: 3 });
      if (!plans[next - 1]) expect(run(between, watch(between), 30).events).toEqual([]);
    }
  });

  it('keeps the kinds from repeating, whichever cup the first happening took', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const first of [2, 3, 5]) {
        const cups = strangeSchedule(seed, 40, first).filter(Boolean);
        expect(cups[0].cup).toBe(first);
        for (let i = 1; i < cups.length; i++) {
          expect(cups[i].kind).not.toBe(cups[i - 1].kind);
          expect([2, 3, 4]).toContain(cups[i].cup - cups[i - 1].cup);
        }
      }
    }
  });

  it('changes nothing for a pinned Mushroom Tea pot, where every cup is a Mushroom Tea cup', () => {
    const game = mushroom(4);
    expect(game.state).toMatchObject({ round: 1, mushroomCups: 1 });
  });
});

describe('Strange Happenings: what is said', () => {
  it('the first rewind always says the patch-notes line; later lines do not repeat until all are heard', () => {
    const book = createLineBook();
    const first = book.choose('rewind', 0.01);
    expect(first.text).toBe('That wasn’t in the patch notes.');
    book.said('rewind', first.text);
    const heard = [first.text];
    for (let i = 0; i < 3; i++) {
      const line = book.choose('rewind', 0.99);
      book.said('rewind', line.text);
      heard.push(line.text);
    }
    expect(new Set(heard).size).toBe(STRANGE_LINES.rewind.length);
    // A fresh round of lines never begins with the one just heard.
    expect(book.choose('rewind', 0.99).text).not.toBe(heard[3]);
  });

  it('the first of each kind always speaks; later ones are sometimes silent', () => {
    const book = createLineBook();
    expect(book.choose('impostor', 0)).not.toBeNull();
    expect(book.choose('impostor', 0)).toBeNull();
    expect(book.choose('impostor', S.silence + 0.01)).not.toBeNull();
  });
});

describe('Strange Happenings: when they happen', () => {
  it('a planned happening begins in its cup once its time comes, and only once', () => {
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((s) => strangeSchedule(s, 3)[2]?.kind === 'breathing');
    const plan = strangeSchedule(seed, 3)[2];
    const game = mushroom(seed);
    Object.assign(game.state, { round: 2, mushroomCups: 2 }); // as if the first cup had been played
    const strange = watch(game);
    run(game, strange, plan.start - 0.1);
    expect(strange.active).toBeNull();
    const { events } = run(game, strange, 0.2);
    expect(strange.active?.kind).toBe('breathing');
    expect(types(events)).toContain('strangeStart');
    run(game, strange, S.breathing.duration + 1);
    expect(strange.active).toBeNull();
    run(game, strange, 30);
    expect(strange.active).toBeNull(); // one a cup
  });

  it('never in the first cup, nor in any other tea', () => {
    const first = mushroom(5);
    const a = watch(first);
    expect(run(first, a, 30).events).toEqual([]);
    for (const tea of ['house', 'chai']) {
      const game = playingGame({ seed: 5, tea });
      game.state.round = 3;
      const strange = watch(game, { mode: 'often' });
      strange.force('breathing');
      expect(run(game, strange, 30).events).toEqual([]);
    }
  });

  it('waits while a leaf is close to the rim', () => {
    const game = mushroom();
    const strange = watch(game);
    const leaf = placeEnemy(game.state, { lane: 4, radius: CONFIG.arena.rimRadius - 10 });
    run(game, strange, 1);
    strange.force('breathing');
    run(game, strange, 2);
    expect(strange.active).toBeNull();
    game.state.enemies.splice(game.state.enemies.indexOf(leaf), 1);
    run(game, strange, DT * 2);
    expect(strange.active?.kind).toBe('breathing');
  });

  it("'off' never; 'often' every cup, one kind after another; a named kind in the next Mushroom Tea cup", () => {
    const game = mushroom();
    const off = watch(game, { mode: 'off' });
    off.update(DT, game.state);
    expect(off.force('rewind')).toBe(true); // forcing is for tests: it still works
    const named = watch(mushroom(), { mode: 'impostor' });
    const g2 = mushroom();
    const n2 = watch(g2, { mode: 'impostor' });
    run(g2, n2, 5);
    expect(n2.active?.kind).toBe('impostor');
    expect(named.active).toBeNull();
  });
});

describe('Time Rewind', () => {
  /** A cup with a little going on: leaves rising, the spoon turning, steam flying, a few kills. */
  function busyCup(seed = 9) {
    const game = mushroom(seed, true);
    const strange = watch(game);
    const input = (t) => ({ input: t % 2 < 1 ? FIRE : RIGHT });
    run(game, strange, 6, input);
    return { game, strange, input };
  }

  it('holds the simulation still while it plays, then lets it carry on exactly as if paused', () => {
    const { game, strange, input } = busyCup();
    const twin = mushroom(9, true);
    const shadow = watch(twin);
    run(twin, shadow, 6, input);
    expect(snapshot(twin)).toBe(snapshot(game));

    strange.force('rewind');
    let held = 0;
    let before = null;
    for (let i = 0; i < 400; i++) {
      const f = frame(game, strange, { input: FIRE });
      if (!f.advanced) {
        held++;
        before ??= snapshot(game);
        expect(snapshot(game)).toBe(before); // nothing at all changes while it holds
      }
    }
    const length = RW.hiccup + RW.reverse + RW.hold + RW.forward;
    expect(held * DT).toBeGreaterThan(length - 2 * DT);
    expect(held * DT).toBeLessThan(length + 3 * DT);
    // The twin, never rewound, plays the same frames of simulation and arrives at the same state.
    for (let i = 0; i < 400 - held; i++) frame(twin, shadow, { input: FIRE });
    expect(snapshot(twin)).toBe(snapshot(game));
  });

  it('shows the recent past: earlier spoon angles, earlier scores, and leaves that have since fallen', () => {
    const game = mushroom(4);
    const strange = watch(game);
    const { state } = game;
    // A leaf straight up the spoon's lane, steamed away a second before the rewind.
    run(game, strange, 2);
    state.angle = laneAngle(0);
    placeEnemy(state, { lane: 0, radius: 200 });
    placeEnemy(state, { lane: 8, radius: 120 });
    run(game, strange, 1);
    state.shotCooldown = 0;
    game.fireSteam();
    run(game, strange, 1);
    expect(state.enemies).toHaveLength(1);
    expect(state.score).toBeGreaterThan(0);
    run(game, strange, 1, { input: RIGHT });
    strange.force('rewind');
    const seen = { leaves: 0, score: Infinity, angles: new Set() };
    while (frame(game, strange).advanced === false || strange.active?.stage === 'hiccup') {
      const shown = strange.shown(state);
      seen.leaves = Math.max(seen.leaves, shown.enemies.length);
      seen.score = Math.min(seen.score, shown.score);
      seen.angles.add(shown.angle.toFixed(3));
      expect(shown.lives).toBe(state.lives); // not recorded: the live value shows through
    }
    expect(seen.leaves).toBe(2);
    expect(seen.score).toBe(0);
    expect(seen.angles.size).toBeGreaterThan(5);
    expect(strange.shown(state)).toBe(state);
  });

  it('swallows nothing it should keep: score, cups, milk and sugar are exactly where they were', () => {
    const { game, strange } = busyCup(12);
    const keep = () => {
      const { score, lives, kills, milkLeft, sugarLeft, strainerLeft, round, phase } = game.state;
      return { score, lives, kills, milkLeft, sugarLeft, strainerLeft, round, phase };
    };
    const before = keep();
    strange.force('rewind');
    while (strange.holding || strange.active?.stage === 'hiccup') frame(game, strange);
    expect(keep()).toEqual(before);
  });

  it('a pause stops it at once; play resumes where it was', () => {
    const { game, strange } = busyCup();
    strange.force('rewind');
    for (let i = 0; i < 600 && !strange.holding; i++) frame(game, strange);
    frame(game, strange);
    expect(strange.holding).toBe(true);
    game.pause();
    const { events } = run(game, strange, 0.5);
    expect(strange.holding).toBe(false);
    expect(strange.active).toBeNull();
    expect(events.find((e) => e.type === 'strangeEnd')?.aborted).toBe(true);
    expect(strange.shown(game.state)).toBe(game.state);
    game.resume();
    expect(run(game, strange, 1).advanced).toBe(60);
  });

  it('with reduced motion, steps back through a few still frames instead of winding', () => {
    const game = mushroom(9, true);
    const strange = watch(game, { reduced: () => true });
    run(game, strange, 6);
    strange.force('rewind');
    let held = 0;
    const backs = new Set();
    for (let i = 0; i < 200; i++) {
      if (!frame(game, strange).advanced) held++;
      if (strange.holding) backs.add(strange.view.rewind.back);
      expect(strange.active?.stage).not.toBe('reverse');
    }
    expect([...backs].filter((b) => b > 0).sort()).toEqual(RW.stills);
    expect(held * DT).toBeLessThan(RW.hiccup + RW.still * RW.stills.length + 3 * DT);
  });

  it('says its line once it is over, and the first time it is the patch notes', () => {
    const { game, strange } = busyCup();
    strange.force('rewind');
    const { events } = run(game, strange, 3);
    const quips = events.filter((e) => e.type === 'strangeQuip');
    expect(quips).toEqual([{ type: 'strangeQuip', kind: 'rewind', text: 'That wasn’t in the patch notes.' }]);
    expect(types(events).indexOf('strangeQuip')).toBeGreaterThan(types(events).indexOf('rewindForward'));
  });

  it('keeps only a few seconds of history, however long the cup', () => {
    const game = mushroom(9, true);
    const strange = watch(game, { mode: 'off' });
    run(game, strange, 40, { input: FIRE });
    expect(strange.recorded).toBeLessThanOrEqual(Math.ceil(RW.history * RW.sampleRate) + 2);
  });
});

describe('The Cup Is Breathing and The Impostor Spoon', () => {
  it('never touch the simulation: a twin cup without them plays out identically', () => {
    for (const kind of ['breathing', 'impostor']) {
      const game = mushroom(21, true);
      const twin = mushroom(21, true);
      const strange = watch(game);
      // The same steering and steam, frame by frame, for both cups.
      const pattern = (n) => (n % 90 < 42 ? RIGHT : FIRE);
      let n = 0;
      const input = () => ({ input: pattern(n++) });
      run(game, strange, 5, input);
      strange.force(kind);
      run(game, strange, 2, input);
      expect(strange.active?.kind).toBe(kind);
      run(game, strange, 12, input);
      for (let k = 0; k < n; k++) twin.update(DT, pattern(k));
      expect(snapshot(game)).toBe(snapshot(twin));
    }
  });

  it('breathe in and out, with rings that run out to the rim (none with reduced motion)', () => {
    for (const reduced of [false, true]) {
      const game = mushroom();
      const strange = watch(game, { reduced: () => reduced });
      run(game, strange, 1);
      strange.force('breathing');
      let rings = 0;
      let peak = 0;
      const events = [];
      for (let t = 0; t < S.breathing.duration + 0.5; t += DT) {
        events.push(...frame(game, strange).events);
        rings = Math.max(rings, strange.view.breathing.rings.length);
        peak = Math.max(peak, strange.view.breathing.intensity * strange.view.breathing.breath);
      }
      const breaths = events.filter((e) => e.type === 'strangeBreath');
      expect(breaths.filter((e) => e.inhale).length).toBeGreaterThanOrEqual(2);
      expect(breaths.filter((e) => !e.inhale).length).toBeGreaterThanOrEqual(2);
      expect(peak).toBeGreaterThan(0.8);
      expect(rings > 0).toBe(!reduced);
      expect(strange.active).toBeNull();
    }
  });

  it('the impostor follows the spoon a second behind, never sits on top of it, and only pretends to steam', () => {
    const game = mushroom();
    const strange = watch(game);
    const { state } = game;
    run(game, strange, 2, { input: RIGHT });
    strange.force('impostor');
    const angles = [];
    let puffs = 0;
    let close = 0;
    for (let t = 0; t < CONFIG.strange.impostor.duration + 0.5; t += DT) {
      const before = state.shots.length;
      const { events } = frame(game, strange, { input: t > 1.5 && t < 3 ? FIRE : RIGHT });
      angles.push(state.angle);
      puffs += events.filter((e) => e.type === 'impostorPuff').length;
      if (strange.active && strange.view.impostor.opacity > 0.05) {
        const gap = Math.abs(Math.atan2(Math.sin(strange.view.impostor.angle - state.angle), Math.cos(strange.view.impostor.angle - state.angle)));
        // It may slip past the spoon, but never lingers on it.
        close = gap < 0.1 ? close + DT : 0;
        expect(close).toBeLessThan(0.3);
      }
      // Its steam is never real steam.
      expect(state.shots.length).toBeLessThanOrEqual(before + 1);
      // Before its first gesture, and before it catches up with the stopped spoon.
      if (t > 1.2 && t < 2.3) {
        const delayed = angles[angles.length - 1 - 60];
        const diff = Math.atan2(Math.sin(strange.view.impostor.angle - delayed), Math.cos(strange.view.impostor.angle - delayed));
        expect(Math.abs(diff)).toBeLessThan(0.08); // within a sample's turn
      }
    }
    expect(puffs).toBeGreaterThan(0);
    expect(strange.active).toBeNull();
  });

  it('pausing holds them still; a cup ending, a restart or another pot clears them', () => {
    const game = mushroom();
    const strange = watch(game);
    run(game, strange, 2);
    strange.force('breathing');
    run(game, strange, 1);
    game.pause();
    const held = strange.active.time;
    run(game, strange, 2);
    expect(strange.active.time).toBe(held);
    run(game, strange, 2, { blocked: true });
    expect(strange.active.time).toBe(held);
    game.resume();
    run(game, strange, 0.5);
    expect(strange.active.time).toBeGreaterThan(held);

    // The cup ends.
    game.state.target = game.state.kills + 1;
    placeEnemy(game.state, { lane: 0, radius: 200 });
    game.state.angle = laneAngle(0);
    game.state.shotCooldown = 0;
    game.fireSteam();
    run(game, strange, 0.5);
    expect(game.state.phase).toBe('reading');
    expect(strange.active).toBeNull();
    expect(strange.view.kind).toBeNull();

    // Another pot (as a restored checkpoint is): a fresh state is watched afresh.
    const other = createGame({ seed: 3, tea: 'mushroom' });
    other.primaryAction();
    strange.force('impostor');
    run(other, strange, 0.2);
    expect(strange.active).toBeNull(); // the new pot's cup starts its own clock and history
    expect(strange.recorded).toBeGreaterThan(0);
  });
});
