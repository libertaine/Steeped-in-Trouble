import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { LANE_STEP, laneAngle } from '../../src/gameplay/arena.js';
import { advanceEnemy, spawnEnemy } from '../../src/gameplay/enemies.js';
import { FORTUNES } from '../../src/gameplay/fortunes.js';
import { inSpores } from '../../src/gameplay/mushroom.js';
import { TEAS, roundModifiers, teaModifiers } from '../../src/gameplay/teas.js';
import { IDLE, placeEnemy, playingGame, step } from './helpers.js';

const P = CONFIG.puffballs;
const SP = CONFIG.spores;
const OTHERS = Object.keys(TEAS).filter((id) => id !== 'mushroom');

/** A Mushroom Tea cup in progress, with spawning off. */
const mushroomGame = (seed = 1) => playingGame({ seed, tea: 'mushroom' });

/** A puffball put straight into the cup, waiting to ripen at `at`. */
function placePuffball(state, { lane = 0, radius = 100, speed = 0, at = 140, warn = 1 } = {}) {
  const enemy = {
    kind: 'puffball', angle: laneAngle(lane), radius, home: 40, speed, wiggle: 0, shifted: true, size: P.size,
    alpha: 1, backwash: 0, glide: null, puff: { stage: 'waiting', at, time: 0, warn },
  };
  state.enemies.push(enemy);
  return enemy;
}

/** Steam straight down a lane, and let the dart travel. */
function steamLane(game, lane, seconds = 0.4) {
  game.state.angle = laneAngle(lane);
  game.state.shotCooldown = 0;
  expect(game.fireSteam()).toBeTruthy();
  step(game, seconds);
}

const types = (events) => events.map((e) => e.type);

describe('Mushroom Tea', () => {
  it('is Chapter 3’s tea, never brewed before it unless pinned', () => {
    const shelves = CONFIG.chapters.map((chapter) => Object.keys(chapter.teas));
    expect(shelves.slice(0, 2).flat()).not.toContain('mushroom');
    expect(CONFIG.chapters[2].teas.mushroom).toBe(0);
    for (let seed = 1; seed <= 20; seed++) {
      const game = createGame({ seed });
      game.primaryAction();
      expect(game.state.tea).not.toBe('mushroom');
    }
    const pinned = mushroomGame();
    expect(pinned.state.tea).toBe('mushroom');
  });

  it('brews more puffballs as it ages', () => {
    expect([1, 5, 9, 40].map((age) => teaModifiers('mushroom', age).puffballChance)).toEqual([...P.chance, P.chance[2]]);
    expect(mushroomGame().state.modifiers.puffballChance).toBe(P.chance[0]);
  });

  it('leaves every other tea, under every fortune, without puffballs', () => {
    for (const tea of OTHERS) for (const fortune of [null, ...Object.keys(FORTUNES)]) {
      for (const age of [1, 5, 9]) expect(roundModifiers(fortune, tea, age).puffballChance).toBe(0);
    }
  });

  it('spawns puffballs at about its chance: larger, slower, each with its own ripening radius', () => {
    const game = mushroomGame(3);
    const sim = { state: game.state, rng: createRandom(99), emit: () => {} };
    const leaves = Array.from({ length: 4000 }, () => spawnEnemy(sim));
    const puffballs = leaves.filter((e) => e.kind === 'puffball');
    expect(puffballs.length / leaves.length).toBeGreaterThan(P.chance[0] - 0.02);
    expect(puffballs.length / leaves.length).toBeLessThan(P.chance[0] + 0.02);
    expect(leaves.every((e) => e.kind === 'leaf' || e.kind === 'puffball')).toBe(true);
    const top = CONFIG.enemies.speedMax * game.state.modifiers.enemySpeedMultiplier;
    for (const e of puffballs) {
      expect(e.size).toBe(P.size);
      expect(e.speed).toBeLessThanOrEqual(top * P.speed + 1e-9);
      expect(e.puff).toMatchObject({ stage: 'waiting', time: 0, warn: P.warnTime[0] });
      expect(e.puff.at).toBeGreaterThanOrEqual(P.ripeMin);
      expect(e.puff.at).toBeLessThan(P.ripeMax);
    }
  });

  it('draws no extra random numbers for teas without puffballs', () => {
    for (const tea of OTHERS) {
      const a = playingGame({ seed: 5, tea });
      const b = playingGame({ seed: 5, tea });
      b.state.modifiers.puffballChance = 0; // already zero: nothing changes
      const sa = { state: a.state, rng: createRandom(7), emit: () => {} };
      const sb = { state: b.state, rng: createRandom(7), emit: () => {} };
      for (let i = 0; i < 50; i++) spawnEnemy(sa);
      for (let i = 0; i < 50; i++) spawnEnemy(sb);
      expect(sa.rng.exportState()).toEqual(sb.rng.exportState());
      expect(a.state.enemies.some((e) => e.kind === 'puffball')).toBe(false);
    }
  });

  it('plays a seeded pinned pot the same way every time', () => {
    const run = () => {
      const game = createGame({ seed: 314, tea: 'mushroom' });
      game.primaryAction();
      game.setAutoSteam(true);
      const kinds = [];
      for (let i = 0; i < 60 * 40 && game.state.phase === 'playing'; i++) {
        game.update(1 / 60, { left: i % 300 < 150, right: i % 300 >= 150, fire: true });
        for (const e of game.drainEvents()) if (['spores', 'sprout', 'puffWarn'].includes(e.type)) kinds.push(e.type);
      }
      return { kinds, score: game.state.score, kills: game.state.kills, random: game.exportRandom() };
    };
    const first = run();
    expect(first.kinds.length).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  });
});

describe('puffballs ripen, then split', () => {
  it('warns, swells and slows once past its ripening radius', () => {
    const game = mushroomGame();
    const puff = placePuffball(game.state, { radius: 139, speed: 60, at: 140, warn: 1 });
    step(game, 0.1);
    expect(puff.puff.stage).toBe('swelling');
    expect(types(game.drainEvents())).toContain('puffWarn');
    const before = puff.radius;
    step(game, 0.5);
    expect(puff.radius - before).toBeCloseTo(60 * P.warnPace * 0.5, 0);
  });

  it('splits into two sprouts that slide out into the lanes either side', () => {
    const game = mushroomGame();
    const puff = placePuffball(game.state, { lane: 4, radius: 140, speed: 30, at: 140, warn: 0.5 });
    step(game, 0.5 + 1 / 60);
    const sprouted = game.drainEvents().find((e) => e.type === 'sprout');
    expect(sprouted).toMatchObject({ count: 2 });
    expect(game.state.enemies).not.toContain(puff);
    const sprouts = game.state.enemies.filter((e) => e.kind === 'sprout');
    expect(sprouts).toHaveLength(2);
    step(game, P.sproutGlide + 0.05);
    const lanes = sprouts.map((e) => (e.angle - laneAngle(4)) / LANE_STEP).sort();
    expect(lanes[0]).toBeCloseTo(-1, 6);
    expect(lanes[1]).toBeCloseTo(1, 6);
    for (const s of sprouts) {
      expect(s.size).toBe(P.sproutSize);
      expect(s.alpha).toBe(1);
      expect(s.speed).toBeCloseTo(30 * P.sproutSpeed, 9);
      expect(s.radius).toBeGreaterThan(puff.radius);
    }
    expect(game.state.kills).toBe(0); // splitting is not a kill
  });

  it('never fills the cup beyond its leaf limit', () => {
    for (const others of [15, 16, 17]) {
      const game = mushroomGame();
      for (let i = 0; i < others; i++) placeEnemy(game.state, { lane: 8 + (i % 6), radius: 60 });
      placePuffball(game.state, { lane: 0, radius: 140, speed: 0, at: 100, warn: 0.2 });
      step(game, 0.3);
      expect(game.state.enemies.length).toBeLessThanOrEqual(CONFIG.enemies.maxActive);
      expect(game.state.enemies.filter((e) => e.kind === 'sprout')).toHaveLength(Math.min(2, CONFIG.enemies.maxActive - others));
    }
  });

  it('always splits well inside the rim, however fast the cup runs', () => {
    const fastest = CONFIG.enemies.speedMax * P.speed * CONFIG.days.maxOverallSpeed;
    const split = P.ripeMax + fastest * P.warnPace * Math.max(...P.warnTime);
    expect(split).toBeLessThan(CONFIG.arena.rimRadius - 60);
  });

  it('ripens later when milk holds it back', () => {
    const run = (milk) => {
      const game = mushroomGame();
      const puff = placePuffball(game.state, { lane: 0, radius: 100, speed: 40, at: 130, warn: 0.5 });
      game.state.angle = laneAngle(0);
      if (milk) expect(game.pourMilk()).toBe(true);
      let t = 0;
      while (puff.puff.stage === 'waiting' && t < 10) { step(game, 1 / 60); t += 1 / 60; }
      return t;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 1);
  });
});

describe('popping a puffball', () => {
  it('counts as a kill and leaves a spore cloud where it popped', () => {
    const game = mushroomGame();
    const puff = placePuffball(game.state, { lane: 2, radius: 120 });
    steamLane(game, 2);
    expect(game.state.enemies).not.toContain(puff);
    expect(game.state.kills).toBe(1);
    const [cloud] = game.state.spores;
    expect(cloud.angle).toBeCloseTo(laneAngle(2), 9);
    expect(cloud.radius).toBe(120);
    const events = game.drainEvents();
    expect(events.find((e) => e.type === 'kill')).toMatchObject({ kind: 'puffball', giggling: false });
    expect(types(events)).toContain('spores');
  });

  it('pops to sugar and to the Silver Tornado as well (a Steam Nova is ordinary steam)', () => {
    const sugar = mushroomGame();
    placePuffball(sugar.state, { lane: 3, radius: 120 });
    sugar.state.angle = laneAngle(3);
    expect(sugar.sugarBurst()).toBe(true);
    step(sugar, 0.4);
    expect(sugar.state.spores).toHaveLength(1);

    const tornado = mushroomGame();
    Object.assign(tornado.state.spoon, { polished: 1, quickStir: 1 });
    placePuffball(tornado.state, { lane: 0, radius: CONFIG.arena.rimRadius - 10, at: 999 });
    tornado.state.angle = laneAngle(10); // turning clockwise, the wake forms before lane 0
    step(tornado, 1.2, { ...IDLE, right: true });
    expect(tornado.drainEvents().find((e) => e.type === 'kill')).toMatchObject({ by: 'wake', kind: 'puffball' });
    expect(tornado.state.spores).toHaveLength(1);
  });

  it('holds leaves in the cloud, giggling, and pays more for them', () => {
    const game = mushroomGame();
    placePuffball(game.state, { lane: 0, radius: 120 });
    steamLane(game, 0);
    const near = placeEnemy(game.state, { lane: 0, radius: 130, speed: 50 });
    const far = placeEnemy(game.state, { lane: 8, radius: 130, speed: 50 });
    step(game, 0.5);
    expect(near.giggle).toBeGreaterThan(0);
    expect(near.radius - 130).toBeCloseTo(50 * SP.hold * 0.5, 0);
    expect(far.giggle).toBeUndefined();
    expect(far.radius - 130).toBeCloseTo(50 * 0.5, 0);
    const before = game.state.score;
    near.speed = 0;
    game.drainEvents();
    steamLane(game, 0);
    expect(game.state.score - before).toBe(Math.round(CONFIG.scoring.steamKill * SP.scoreBonus));
    expect(game.drainEvents().find((e) => e.type === 'kill')).toMatchObject({ giggling: true });
  });

  it('never stacks its hold with milk: the stronger slowdown wins', () => {
    const game = mushroomGame();
    placePuffball(game.state, { lane: 0, radius: 120 });
    steamLane(game, 0);
    game.state.spawnTimer = Infinity;
    const leaf = placeEnemy(game.state, { lane: 0, radius: 125, speed: 50 });
    game.state.angle = laneAngle(0);
    expect(game.pourMilk()).toBe(true);
    leaf.backwash = 0; // measure the slowdown alone
    const before = leaf.radius;
    game.update(0.02);
    leaf.backwash = 0;
    expect(leaf.radius - before).toBeCloseTo(50 * Math.min(SP.hold, CONFIG.milk.slowFactor) * 0.02, 6);
  });

  it('clears after its time; leaves giggle a moment longer, then rise again', () => {
    const game = mushroomGame();
    placePuffball(game.state, { lane: 0, radius: 120 });
    steamLane(game, 0, 0.3);
    const leaf = placeEnemy(game.state, { lane: 0, radius: 120, speed: 40 });
    step(game, SP.duration);
    expect(game.state.spores).toEqual([]);
    expect(leaf.giggle).toBeGreaterThan(0);
    step(game, SP.linger + 0.05);
    expect(leaf.giggle).toBe(0);
    const before = leaf.radius;
    step(game, 0.5);
    expect(leaf.radius - before).toBeCloseTo(40 * 0.5, 0);
  });

  it('keeps no more than a few clouds, clearing the oldest first', () => {
    const game = mushroomGame();
    for (let lane = 0; lane < SP.max + 2; lane++) {
      placePuffball(game.state, { lane: lane * 2, radius: 120 });
      steamLane(game, lane * 2, 0.3);
    }
    expect(game.state.spores).toHaveLength(SP.max);
    expect(game.state.spores[0].angle).toBeCloseTo(laneAngle(4), 9);
  });

  it('sweeps the clouds away at the reading, so nothing carries into the next cup', () => {
    const game = mushroomGame();
    game.state.spawnTimer = 5; // a real cup's clock (the helper's Infinity is no state to save)
    game.state.kills = game.state.target - 1;
    placePuffball(game.state, { lane: 0, radius: 120 });
    steamLane(game, 0);
    expect(game.state.phase).toBe('reading');
    expect(game.state.spores).toEqual([]);
    expect(game.exportCheckpoint()).not.toBeNull();
  });

  it('measures the cloud by distance in the cup', () => {
    const cloud = { angle: 0, radius: 150 };
    expect(inSpores([cloud], { angle: 0, radius: 150 + SP.radius - 1 })).toBe(true);
    expect(inSpores([cloud], { angle: 0, radius: 150 + SP.radius + 1 })).toBe(false);
    expect(inSpores([cloud], { angle: LANE_STEP * 2, radius: 150 })).toBe(false);
  });

  it('never touches the coffee boss: beans ignore spores and gain no giggles', () => {
    const state = { modifiers: { enemySpeedMultiplier: 1, laneDrift: false }, clouds: [], pulse: 0, spores: [] };
    const bean = { angle: 0, radius: 100, home: 90, speed: 100, backwash: 0, alpha: 1, shifted: true };
    advanceEnemy(bean, { state, rng: createRandom(1), emit: () => {} }, 0.1);
    expect(bean.radius).toBeCloseTo(110, 9);
    expect(bean).not.toHaveProperty('giggle');
  });
});
