// Chapter 3's difficulty step (issue #13): a quicker baseline, inside the
// existing safety limits, and Rush Hour's bunched arrivals.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { LANES, laneOf, wrapLane } from '../../src/gameplay/arena.js';
import { MAX_HEAT, withHeat } from '../../src/gameplay/days.js';
import { updateSpawning } from '../../src/gameplay/enemies.js';
import { roundModifiers, TEAS } from '../../src/gameplay/teas.js';
import { modifiersFor } from '../../src/gameplay/fortunes.js';
import { completeRound } from './helpers.js';

const R = CONFIG.rushHour;
const [, TWO, THREE] = CONFIG.chapters;
const DT = 1 / 60;

/** Spawning alone, for `seconds`, with whatever arrives cleared at once. */
function arrivals({ chapter, seconds = 600, seed = 3, tea = 'house', kills = 10 }) {
  const state = createGame({ seed }).state;
  Object.assign(state, {
    progress: chapter === 3 ? { chapter: 3, starts: [1, 6, 11] } : { chapter: 2, starts: [1, 6] },
    modifiers: { ...modifiersFor(null), ...roundModifiers(null, tea, 9), spawnIntervalMultiplier: 1 },
    kills, enemies: [], spawnTimer: 0, rush: null,
  });
  const rng = createRandom(seed);
  const events = [];
  let t = 0;
  const sim = { state, rng, emit: (type, data) => events.push({ type, ...data, t }) };
  const spawns = [];
  for (; t < seconds; t += DT) {
    updateSpawning(sim, DT);
    for (const e of state.enemies) spawns.push({ t, lane: laneOf(e.angle) });
    state.enemies = [];
  }
  return { spawns, events, rng };
}

describe('Chapter 3’s pace', () => {
  it('is quicker than Chapter 2, as approved for experiment', () => {
    expect(THREE).toMatchObject({ enemySpeed: 1.25, spawnInterval: 0.95, rushHour: true });
    expect(THREE.enemySpeed).toBeGreaterThan(TWO.enemySpeed);
  });

  it('never breaks the existing safety limits, whatever the tea, fortune and Heat', () => {
    for (const tea of Object.keys(TEAS)) {
      for (const fortune of [null, 'tempest']) {
        const m = withHeat(roundModifiers(fortune, tea, 9), MAX_HEAT, THREE);
        expect(THREE.enemySpeed * m.enemySpeedMultiplier).toBeLessThanOrEqual(CONFIG.days.maxOverallSpeed + 1e-9);
      }
    }
    const { spawns } = arrivals({ chapter: 3 });
    for (let i = 1; i < spawns.length; i++) expect(spawns[i].t - spawns[i - 1].t).toBeGreaterThanOrEqual(CONFIG.days.minSpawnInterval - DT);
  });
});

describe('Rush Hour', () => {
  it('bunches three arrivals in time, spread round the cup, a third of the way apart', () => {
    const { spawns, events } = arrivals({ chapter: 3 });
    const rushes = events.filter((e) => e.type === 'rush');
    expect(rushes.length).toBeGreaterThan(5);
    for (const rush of rushes) {
      const i = spawns.findIndex((s) => s.t === rush.t);
      expect(spawns[i].lane).toBe(rush.lane);
      const group = spawns.slice(i, i + R.leaves);
      const gaps = group.slice(1).map((s, k) => s.t - group[k].t);
      for (const gap of gaps) expect(gap).toBeCloseTo(Math.max(CONFIG.days.minSpawnInterval, R.gap), 1);
      const apart = group.slice(1).map((s) => Math.min(wrapLane(s.lane - rush.lane), wrapLane(rush.lane - s.lane)));
      for (const d of apart) expect(R.apart).toContain(d);
      expect(new Set(group.map((s) => s.lane)).size).toBe(R.leaves);
    }
  });

  it('keeps the average arrival rate: the quiet after a rush makes up its time', () => {
    const { spawns, events } = arrivals({ chapter: 3, seconds: 1200 });
    expect(events.some((e) => e.type === 'rush')).toBe(true);
    const mean = THREE.spawnInterval * (CONFIG.spawning.jitterMin + CONFIG.spawning.jitterMax) / 2;
    const rate = spawns.length / 1200;
    expect(rate * mean).toBeGreaterThan(0.95);
    expect(rate * mean).toBeLessThan(1.05);
  });

  it('never comes in Chapters 1 and 2, nor in Mushroom Tea or Chai, nor in a cup’s first few leaves', () => {
    expect(arrivals({ chapter: 2 }).events).toEqual([]);
    expect(arrivals({ chapter: 3, tea: 'mushroom' }).events).toEqual([]);
    expect(arrivals({ chapter: 3, tea: 'chai' }).events).toEqual([]);
    expect(arrivals({ chapter: 3, kills: R.afterKills - 1 }).events).toEqual([]);
  });

  it('rolls for a rush only where one could start, so other cups draw exactly as before', () => {
    // (Chapters 1 and 2 also replay the 0.16.0 and 0.18.0 recordings cursor for cursor: see mushroomCheckpoint.test.js.)
    /** Random draws made by one ordinary arrival, the first of a cup with `kills` leaves gone. */
    function draws(chapter, tea, seed) {
      const state = createGame({ seed: 3 }).state;
      Object.assign(state, {
        progress: chapter === 3 ? { chapter: 3, starts: [1, 6, 11] } : { chapter: 2, starts: [1, 6] },
        modifiers: { ...modifiersFor(null), ...roundModifiers(null, tea, 9), spawnIntervalMultiplier: 1 },
        kills: 10, enemies: [], spawnTimer: 0, rush: null,
      });
      const rng = createRandom(seed);
      let count = 0;
      const next = rng.next.bind(rng);
      rng.next = () => { count++; return next(); };
      updateSpawning({ state, rng, emit: () => {} }, DT);
      return { count, rush: !!state.rush };
    }
    // A seed whose roll does not start a rush, so only the roll itself is extra.
    const seed = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !draws(3, 'house', s).rush);
    const base = draws(2, 'house', seed).count;
    expect(draws(3, 'house', seed).count).toBe(base + 1); // the rush roll
    expect(draws(3, 'mushroom', seed).count).toBe(base + 1); // the puffball roll, and no rush roll
    expect(draws(3, 'chai', seed).count).toBe(base); // Chai: none
  });

  it('is the same for the same seed, and never shapes itself the same way every time', () => {
    const one = arrivals({ chapter: 3, seed: 8 });
    const two = arrivals({ chapter: 3, seed: 8 });
    expect(one.spawns.map((s) => [s.t, s.lane])).toEqual(two.spawns.map((s) => [s.t, s.lane]));
    const shapes = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { spawns, events } = arrivals({ chapter: 3, seed });
      for (const rush of events.filter((e) => e.type === 'rush')) {
        const i = spawns.findIndex((s) => s.t === rush.t);
        shapes.add(wrapLane(spawns[i + 1].lane - rush.lane));
      }
    }
    expect(shapes.size).toBeGreaterThan(2); // both ways round, and both spacings
  });

  it('is never saved: a reading clears it', () => {
    const game = createGame({ seed: 5 });
    game.primaryAction();
    game.state.rush = { left: 2, center: 3, step: 5, gap: 0.45, quiet: 1.4 };
    game.state.spawnTimer = 1e6;
    completeRound(game);
    expect(game.state.rush).toBeNull();
    expect(game.exportCheckpoint()).not.toBeNull();
    expect(LANES).toBe(16);
  });
});
