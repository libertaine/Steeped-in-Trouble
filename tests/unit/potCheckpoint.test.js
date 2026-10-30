import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { validateCheckpoint, RANDOM_STREAMS } from '../../src/core/checkpoint.js';
import { checkpointAfter, finishNormal, leaveReading } from '../support/checkpoints.js';

describe('Mulberry32 cursor continuity', () => {
  it.each([0, 42, 0xffffffff])('retains the original sequence and restores at the exact cursor: %s', (seed) => {
    const a = createRandom(seed);
    // Independent reference to the existing algorithm.
    let s = seed >>> 0;
    for (let i = 0; i < 300; i++) {
      s = (s + 0x6d2b79f5) >>> 0; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      expect(a.next()).toBe(((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
    const saved = a.exportState(); expect(a.exportState()).toEqual(saved);
    const b = createRandom(saved.seed, saved.state);
    expect(b.exportState()).toEqual(saved);
    for (let i = 0; i < 500; i++) expect(b.next()).toBe(a.next());
  });
  it.each([-1, 2 ** 32, 0.1, NaN, Infinity])('rejects invalid cursors %s', (cursor) => {
    expect(() => createRandom(1, cursor)).toThrow();
  });
});

describe('genuine normal-round checkpoints', () => {
  it.each([1, 8, 9, 10, 12, 19, 27, 31])('restores the complete logical reading after round %s', (round) => {
    const { game, checkpoint } = checkpointAfter(round, { day: round > 20 ? 'fresh' : 'keep' });
    const before = game.exportRandom();
    expect(Object.keys(checkpoint.random)).toEqual(RANDOM_STREAMS);
    const restored = createGame({ checkpoint: JSON.parse(JSON.stringify(checkpoint)) });
    // export happens at the current reading instant, so even reveal timing agrees.
    expect(restored.state).toEqual(game.state); expect(restored.exportRandom()).toEqual(before);
    expect(restored.drainEvents()).toEqual([]); expect(game.exportRandom()).toEqual(before);
    expect(checkpoint.state.nextFortune).toBeTruthy();
    if (round === 1) expect(checkpoint.state.offer).not.toBeNull();
    if (round === 9) expect(checkpoint.state.shortageDue).toBe(true);
    if (round === 10) expect(checkpoint.state.dayPending).toBe(true);
    if (round === 19) expect(checkpoint.state.arcadeDue).toBe('biscuitBreakout');
    if (round >= 8) expect(Object.values(checkpoint.state.spoon).some((n) => n > 0)).toBe(true);
  });
  it.each([[1, 'fresh'], [1, 'keep'], [31, 'fresh'], [31, 'keep']])('matches uninterrupted choices and encounters from checkpoint %s through round 40: %s', (start, day) => {
    const { game: a, checkpoint } = checkpointAfter(start);
    const b = createGame({ checkpoint });
    // Match the live game to the exact saved point, independent of event queues.
    a.drainEvents(); b.drainEvents();
    for (let round = start; round <= 40; round++) {
      leaveReading(a, day); leaveReading(b, day);
      expect(b.state).toEqual(a.state); expect(b.exportRandom()).toEqual(a.exportRandom());
      // Sample real spawning and combat before each subsequent finishing dart.
      for (const game of [a, b]) { game.state.spawnTimer = 0; for (let i = 0; i < 30; i++) game.update(1 / 60, { left: false, right: true, fire: true }); }
      expect(b.state).toEqual(a.state);
      finishNormal(a); finishNormal(b);
      expect(b.state).toEqual(a.state); expect(b.exportRandom()).toEqual(a.exportRandom());
    }
  });
  it('captures only after all secret rewards and before future input mutates state', () => {
    const game = createGame({ seed: 42 }); game.primaryAction();
    game.state.roundStats.volleys = 20;
    finishNormal(game);
    const snapshot = game.drainEvents().find((e) => e.type === 'checkpoint').checkpoint;
    expect(snapshot.state.extraSugar).toBeGreaterThan(0);
    const score = snapshot.state.score; game.state.score++;
    expect(snapshot.state.score).toBe(score);
  });
  it('does not capture ready, combat, transient or practice states', () => {
    const game = createGame({ seed: 42 }); expect(game.exportCheckpoint()).toBeNull();
    game.primaryAction(); expect(game.exportCheckpoint()).toBeNull();
    const practice = createGame({ seed: 42, practice: 'teaRun' }); expect(practice.exportCheckpoint()).toBeNull();
  });
  it.each(['dailyPour', 'biscuitBreakout', 'crossingStreet'])('resumes a reading with %s genuinely pending', (id) => {
    const round = { dailyPour: 12, biscuitBreakout: 19, crossingStreet: 27 }[id];
    const game = checkpointAfter(round - 1).game;
    leaveReading(game);
    const s = game.state;
    s.grindAfter = null; s.lastGrind = round; s.havocAfter = round + 100;
    s.shortageAfter = round + 100;
    for (const other of Object.keys(s.arcade.after)) s.arcade.after[other] = other === id ? round : round + 100;
    finishNormal(game);
    const checkpoint = game.exportCheckpoint();
    expect(checkpoint.state.arcadeDue).toBe(id);
    const restored = createGame({ checkpoint });
    for (const g of [game, restored]) {
      g.update(5);
      if (g.state.offer) g.chooseUpgrade(0); else g.primaryAction();
      expect(g.state.phase).toBe('arcadeOffer'); g.chooseInterlude(true);
    }
    expect(restored.state).toEqual(game.state); expect(restored.exportRandom()).toEqual(game.exportRandom());
  });
  it('retains pinned-tea semantics as well as the random cursor', () => {
    const game = createGame({ seed: 42, tea: 'chai' }); game.primaryAction(); finishNormal(game);
    const restored = createGame({ checkpoint: game.exportCheckpoint() });
    leaveReading(game); leaveReading(restored); expect(restored.state).toEqual(game.state);
  });
  it.each([
    (c) => { c.schemaVersion = 0; }, (c) => { c.state.phase = 'playing'; },
    (c) => { delete c.state.score; }, (c) => { c.state.lives = 0; },
    (c) => { c.state.score = NaN; }, (c) => { c.state.heat = -1; },
    (c) => { c.state.round = 1.5; }, (c) => { c.state.nextFortune = 'golf'; },
    (c) => { c.state.tea = 'coffee'; }, (c) => { c.state.arcadeDue = 'golf'; },
    (c) => { c.state.spoon.polished = 99; }, (c) => { c.state.offer = ['missing']; },
    (c) => { c.state.progress.starts = []; }, (c) => { c.state.dayPending = true; },
    (c) => { c.state.run = {}; }, (c) => { c.random.normal.state = -1; },
    (c) => { delete c.random.teaRun; }, (c) => { c.state.modifiers = {}; },
    (c) => { c.state.discovered = ['bogus']; }, (c) => { c.state.extra = true; },
  ])('fails closed on malformed or inconsistent saved data', (corrupt) => {
    const c = checkpointAfter(1).checkpoint; corrupt(c);
    expect(validateCheckpoint(c)).toBe(false); expect(() => createGame({ checkpoint: c })).toThrow();
  });
});
