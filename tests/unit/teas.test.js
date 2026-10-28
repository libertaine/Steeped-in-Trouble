import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { LANE_STEP, angleDifference, laneAngle, laneOf } from '../../src/gameplay/arena.js';
import { nextSpawnDelay, spawnEnemy } from '../../src/gameplay/enemies.js';
import { BASE_MODIFIERS, FORTUNES, drawFortune, fortuneWeights, modifiersFor } from '../../src/gameplay/fortunes.js';
import { byStage, teaStage } from '../../src/gameplay/strength.js';
import {
  COMBINE, TEAS, TEA_ROTATION, chooseTea, createCurrent, roundModifiers, teaFortuneNudges, teaModifiers,
} from '../../src/gameplay/teas.js';
import { killScore } from '../../src/gameplay/weapons.js';
import { IDLE, brewNext, completeRound, killOne, placeEnemy, playingGame, step } from './helpers.js';

const D = CONFIG.darting;
const W = CONFIG.wandering;
const C = CONFIG.currents;

/** The teas a seed brews for its first `rounds` normal rounds, played as quickly as possible. */
function teaSequence(seed, rounds, { bonuses = true } = {}) {
  const game = createGame({ seed });
  game.primaryAction();
  const teas = [game.state.tea];
  while (teas.length < rounds) {
    // A spice current or The Spiral could carry the finishing leaf out of the shot's way.
    game.state.current = null;
    game.state.modifiers = { ...game.state.modifiers, laneDrift: false };
    completeRound(game);
    expect(game.state.phase).toBe('reading');
    if (!bonuses) {
      game.state.havocDue = false;
      game.state.grindDue = false;
    }
    brewNext(game);
    teas.push(game.state.tea);
  }
  return teas;
}

/** Is an angle on a lane's centre line? */
const onLane = (angle) => Math.abs(angleDifference(angle, laneAngle(laneOf(angle)))) < 1e-9;

/**
 * A game brewing one tea in the given round, with no fortune and automatic
 * spawning off, reached by playing through the cups before it.
 */
function brewedRound(tea, round, fortune = null) {
  const game = playingGame({ tea });
  if (round > 1) {
    game.state.round = round - 1;
    completeRound(game);
    brewNext(game);
  }
  expect(game.state.round).toBe(round);
  game.state.modifiers = roundModifiers(fortune, tea, round);
  game.state.spawnTimer = Infinity;
  game.drainEvents();
  return game;
}

/** The fastest a leaf can rise in a round: top base speed and round bonus, at the leaf speed cap. */
function fastestIn(round) {
  const E = CONFIG.enemies;
  return (E.speedMax + Math.min(E.maxRoundSpeedBonus, round * E.speedPerRound)) * CONFIG.teas.maxEnemySpeedMultiplier;
}

/** The last round of each stage (the final stage stands in for any later round). */
const lastRounds = () => CONFIG.teas.stages.map((stage, i, all) => (all[i + 1] ? all[i + 1].from - 1 : 99));

/** A darter about to start its crouch, as spawned in `round`. */
function darterAt(state, round, { radius = 80, speed = 50, lane = 0 } = {}) {
  const leaf = placeEnemy(state, { lane, radius, speed });
  Object.assign(leaf, {
    kind: 'darter', home: 40, backwash: 0, glide: null,
    dart: { stage: 'waiting', at: radius, time: 0, warn: byStage(D.warnTime, round), distance: byStage(D.dashDistance, round) },
  });
  return leaf;
}

/** Follow a darter in the real simulation, stepping by `dt`, until it reaches `untilRadius` or `seconds` pass. */
function followDart(game, leaf, { dt = 1 / 60, seconds = 10, untilRadius = Infinity } = {}) {
  const track = { dashEnd: null, time: 0 };
  while (track.time < seconds - 1e-9 && leaf.radius < untilRadius) {
    const stage = leaf.dart.stage;
    game.update(dt);
    track.time += dt;
    if (stage !== 'done' && leaf.dart.stage === 'done') track.dashEnd = leaf.radius;
  }
  return track;
}

describe('choosing the tea', () => {
  it('always brews the House Blend for the first cup', () => {
    for (let seed = 1; seed <= 50; seed++) expect(teaSequence(seed, 1)).toEqual(['house']);
  });

  it('brews the same varieties in the same order for the same seed', () => {
    expect(teaSequence(321, 20)).toEqual(teaSequence(321, 20));
    expect(teaSequence(1, 20)).not.toEqual(teaSequence(2, 20));
  });

  it('never repeats a variety in consecutive rounds, and never brews the House Blend again', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const teas = teaSequence(seed, 25);
      for (let i = 1; i < teas.length; i++) {
        expect(teas[i]).not.toBe(teas[i - 1]);
        expect(TEA_ROTATION).toContain(teas[i]);
      }
    }
  });

  it('serves all five varieties early, and none goes missing for long', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const teas = teaSequence(seed, 30);
      expect(new Set(teas.slice(1, 1 + CONFIG.teas.maxAbsence + 2)).size).toBe(5);
      for (const id of TEA_ROTATION) {
        const served = teas.flatMap((t, i) => (t === id ? [i + 1] : []));
        for (let k = 1; k < served.length; k++) {
          expect(served[k] - served[k - 1]).toBeLessThanOrEqual(CONFIG.teas.maxAbsence + 1);
        }
      }
    }
  });

  it('is not a fixed cycle', () => {
    const openings = new Set();
    for (let seed = 1; seed <= 40; seed++) openings.add(teaSequence(seed, 6).slice(1).join(','));
    expect(openings.size).toBeGreaterThan(20);
  });

  it('is unaffected by how the cups are played, or by bonus rounds between them', () => {
    // With bonuses suppressed the pot skips every Hot Chocolate Havoc and Daily Grind.
    for (const seed of [3, 17, 99]) {
      expect(teaSequence(seed, 16, { bonuses: false })).toEqual(teaSequence(seed, 16));
    }
  });

  it('weights varieties by how long since they were served', () => {
    const state = { round: 6, tea: 'green', teaServed: { green: 5, earlGrey: 4, chai: 3, black: 2 } };
    const counts = {};
    const rng = createRandom(8);
    for (let i = 0; i < 4000; i++) {
      const id = chooseTea(state, rng);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts.green).toBeUndefined();
    expect(counts.earlGrey).toBeLessThan(counts.chai);
    expect(counts.chai).toBeLessThan(counts.black);
    expect(counts.black).toBeLessThanOrEqual(counts.herbal * 1.15); // both at the weight cap
  });

  it('serves a variety missing for too long next', () => {
    const state = { round: 12, tea: 'green', teaServed: { green: 11, earlGrey: 10, chai: 9, black: 8, herbal: 3 } };
    expect(chooseTea(state, createRandom(1))).toBe('herbal');
  });

  it('can be pinned to one variety, and ignores ids that are not teas', () => {
    const chai = createGame({ seed: 4, tea: 'chai' });
    chai.primaryAction();
    expect(chai.state.tea).toBe('chai');
    for (const tea of ['toString', 'coffee', '']) {
      const game = createGame({ seed: 4, tea });
      game.primaryAction();
      expect(game.state.tea).toBe('house');
    }
  });
});

describe('combining the tea with the fortune', () => {
  it('has a rule for every modifier a tea sets, and leaves the rest alone', () => {
    for (const id of Object.keys(TEAS)) {
      for (const round of [1, 5, 9, 30]) {
        for (const key of Object.keys(teaModifiers(id, round))) {
          expect(COMBINE[key]).toBeDefined();
          expect(BASE_MODIFIERS).toHaveProperty(key);
        }
      }
    }
    expect(roundModifiers(null, 'house')).toEqual(BASE_MODIFIERS);
    expect(roundModifiers('star', 'house')).toEqual(modifiersFor('star'));
  });

  it('multiplies multipliers, adds bonuses, and takes the stronger chance', () => {
    expect(roundModifiers('tempest', 'green').enemySpeedMultiplier).toBeCloseTo(1.1 * CONFIG.fortunes.tempestEnemySpeed);
    expect(roundModifiers('spiral', 'black').scoreMultiplier).toBeCloseTo(1.25 * 1.25);
    expect(roundModifiers('veil', 'herbal').milkDurationBonus).toBeCloseTo(CONFIG.fortunes.veilMilkBonus + CONFIG.teas.herbal.milkBonus);
    expect(roundModifiers('spiral', 'earlGrey', 9)).toMatchObject({ laneDrift: true, wanderChance: 0.4 });
    expect(roundModifiers('spiral', 'earlGrey', 2)).toMatchObject({ laneDrift: true, wanderChance: 0.15 });
    expect(roundModifiers('tempest', 'chai')).toMatchObject({ stormyMilk: true, spiceCurrents: true });
  });

  it('never lets leaf speed stack beyond the cap', () => {
    for (const fortune of [null, ...Object.keys(FORTUNES)]) {
      for (const tea of Object.keys(TEAS)) {
        for (const round of [1, 5, 9]) {
          expect(roundModifiers(fortune, tea, round).enemySpeedMultiplier).toBeLessThanOrEqual(CONFIG.teas.maxEnemySpeedMultiplier);
        }
      }
    }
  });

  it('applies the tea for one round only', () => {
    const game = playingGame({ tea: 'green' });
    expect(game.state.modifiers.dartChance).toBe(byStage(D.chance, 1));
    const plain = playingGame({ tea: 'house' });
    completeRound(plain);
    brewNext(plain);
    expect(plain.state.modifiers.dartChance).toBe(0);
    // An unpinned pot: each round's modifiers are exactly that round's tea and fortune.
    const pot = createGame({ seed: 12 });
    pot.primaryAction();
    for (let i = 0; i < 12; i++) {
      completeRound(pot);
      brewNext(pot);
      expect(pot.state.modifiers).toEqual(roundModifiers(pot.state.fortune, pot.state.tea, pot.state.round));
    }
  });
});

describe('the learning curve', () => {
  /** Leaves spawned in a game's current round, each from its own seed. */
  const spawned = (game, count) => Array.from({ length: count }, (_, i) => spawnEnemy({ state: game.state, rng: createRandom(i) }));

  it('runs learn for rounds 1-4, adapt for 5-8, and full strength from round 9', () => {
    expect(CONFIG.teas.stages.map((stage) => [stage.name, stage.from])).toEqual([['learn', 1], ['adapt', 5], ['full', 9]]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 40].map(teaStage)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
    expect(byStage(['a', 'b', 'c'], 4)).toBe('a');
    expect(byStage(['a', 'b', 'c'], 5)).toBe('b');
    expect(byStage(['a', 'b', 'c'], 9)).toBe('c');
  });

  it('lists one value per stage for everything that grows with it', () => {
    for (const values of [D.chance, D.warnTime, D.dashDistance, W.chance, W.warnTime, C.firstAt, C.calmTime, C.warnTime]) {
      expect(values).toHaveLength(CONFIG.teas.stages.length);
    }
  });

  it('brews each behaviour at its tuned strength either side of every boundary', () => {
    // [round, dart chance, dash distance, dart warning, wander chance, wander warning, first current, current warning, calm]
    const table = [
      [2, 0.1, 12, 0.75, 0.15, 0.8, 6.5, 2.2, 10],
      [4, 0.1, 12, 0.75, 0.15, 0.8, 6.5, 2.2, 10],
      [5, 0.2, 22, 0.65, 0.25, 0.65, 5.5, 1.9, 8.5],
      [8, 0.2, 22, 0.65, 0.25, 0.65, 5.5, 1.9, 8.5],
      [9, 0.3, 35, 0.55, 0.4, 0.55, 5, 1.6, 7.5],
    ];
    for (const [round, dartChance, distance, dartWarn, wanderChance, wanderWarn, firstAt, warn, calm] of table) {
      const green = brewedRound('green', round);
      expect(green.state.modifiers.dartChance).toBe(dartChance);
      expect(spawned(green, 200).find((e) => e.kind === 'darter').dart).toMatchObject({ warn: dartWarn, distance });

      const earlGrey = brewedRound('earlGrey', round);
      expect(earlGrey.state.modifiers.wanderChance).toBe(wanderChance);
      expect(spawned(earlGrey, 200).find((e) => e.kind === 'wanderer').wander.warn).toBe(wanderWarn);

      expect(brewedRound('chai', round).state.current).toMatchObject({ stage: 'calm', wait: firstAt, warn, calm });
    }
  });

  it('only ever grows stronger, a step at a time, from one stage to the next', () => {
    for (let i = 1; i < CONFIG.teas.stages.length; i++) {
      expect(D.chance[i]).toBeGreaterThan(D.chance[i - 1]);
      expect(D.chance[i] - D.chance[i - 1]).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(D.dashDistance[i]).toBeGreaterThan(D.dashDistance[i - 1]);
      expect(D.dashDistance[i] - D.dashDistance[i - 1]).toBeLessThanOrEqual(15);
      expect(W.chance[i]).toBeGreaterThan(W.chance[i - 1]);
      expect(W.chance[i] - W.chance[i - 1]).toBeLessThanOrEqual(0.15 + 1e-9);
      for (const warn of [D.warnTime, W.warnTime]) {
        expect(warn[i]).toBeLessThan(warn[i - 1]);
        expect(warn[i - 1] - warn[i]).toBeLessThanOrEqual(0.15 + 1e-9);
      }
      for (const time of [C.firstAt, C.warnTime, C.calmTime]) {
        expect(time[i]).toBeLessThan(time[i - 1]);
        expect(time[i - 1] - time[i]).toBeLessThanOrEqual(0.2 * time[i - 1]);
      }
    }
  });

  it('depends on the round alone: a pinned tea brews like the same tea in an ordinary pot', () => {
    // Find ordinary pots that brew Green Tea in a learn, an adapt, and a full-strength round.
    const found = {};
    for (let seed = 1; Object.keys(found).length < 3 && seed < 200; seed++) {
      const pot = createGame({ seed });
      pot.primaryAction();
      for (let i = 0; i < 12; i++) {
        pot.state.current = null;
        pot.state.modifiers = { ...pot.state.modifiers, laneDrift: false };
        completeRound(pot);
        brewNext(pot);
        const { round, tea, fortune, modifiers } = pot.state;
        if (tea === 'green' && !found[teaStage(round)]) found[teaStage(round)] = { round, fortune, modifiers: { ...modifiers } };
      }
    }
    expect(Object.keys(found)).toHaveLength(3);
    for (const { round, fortune, modifiers } of Object.values(found)) {
      // The practice pot has brewed Green Tea every cup; the ordinary one only now and then.
      const pinned = brewedRound('green', round, fortune);
      expect(pinned.state.modifiers).toEqual(modifiers);
      const darter = spawned(pinned, 200).find((e) => e.kind === 'darter');
      expect(darter.dart).toMatchObject({ warn: byStage(D.warnTime, round), distance: byStage(D.dashDistance, round) });
    }
  });
});

describe('Green Tea', () => {
  it('hurries every leaf along by 10%', () => {
    const house = playingGame();
    const green = playingGame({ tea: 'green' });
    const a = placeEnemy(house.state, { radius: 50, speed: 40 });
    const b = placeEnemy(green.state, { radius: 50, speed: 40 });
    step(house, 1);
    step(green, 1);
    expect(b.radius - 50).toBeCloseTo((a.radius - 50) * CONFIG.teas.green.enemySpeed, 3);
  });

  it('makes roughly the share of new leaves darters that the round calls for', () => {
    for (const round of [2, 5, 9]) {
      const game = brewedRound('green', round);
      for (let i = 0; i < 3000; i++) spawnEnemy({ state: game.state, rng: createRandom(i) });
      const share = game.state.enemies.filter((e) => e.kind === 'darter').length / 3000;
      expect(share).toBeGreaterThan(byStage(D.chance, round) - 0.03);
      expect(share).toBeLessThan(byStage(D.chance, round) + 0.03);
    }
  });

  it('warns before a dart: a slow crouch, then a dash a fixed distance further, then normal speed', () => {
    for (const round of [2, 5, 9]) {
      const game = brewedRound('green', round);
      const leaf = darterAt(game.state, round, { radius: 80, speed: 50 });
      const speed = 50 * CONFIG.teas.green.enemySpeed;
      const warn = byStage(D.warnTime, round);
      const distance = byStage(D.dashDistance, round);
      const events = [];
      const run = (seconds) => {
        step(game, seconds);
        events.push(...game.drainEvents().map((e) => e.type));
      };
      run(1 / 60); // the crouch starts on the first frame
      expect(events).toEqual(['dartWarn']);
      run(warn - 0.1 - 1 / 60);
      expect(leaf.dart.stage).toBe('warning');
      expect(leaf.radius - 80).toBeCloseTo(speed * D.warnPace * (warn - 0.1), 6);
      run(0.15);
      expect(events).toContain('dart');
      expect(leaf.dart.stage).toBe('darting');
      run(D.dashTime - 0.05 + 1 / 60); // just past the end of the dash
      expect(leaf.dart.stage).toBe('done');
      const elapsed = warn + D.dashTime + 1 / 60;
      expect(leaf.radius - 80).toBeCloseTo(speed * (D.warnPace * warn + (elapsed - warn)) + distance, 6);
      const after = leaf.radius;
      run(0.5);
      expect(leaf.radius - after).toBeCloseTo(speed * 0.5, 6);
    }
  });

  it('accelerates into the dash and settles out of it, without a jump', () => {
    for (const round of [2, 9]) {
      const game = brewedRound('green', round);
      const leaf = darterAt(game.state, round, { radius: 80, speed: 0 }); // a still leaf: only the dash moves it
      while (leaf.dart.stage !== 'darting') step(game, 1 / 60);
      const steps = [];
      let last = leaf.radius;
      while (leaf.dart.stage === 'darting') {
        step(game, 1 / 60);
        steps.push(leaf.radius - last);
        last = leaf.radius;
      }
      const peak = Math.max(...steps);
      expect(steps.indexOf(peak)).toBeGreaterThan(steps.length * 0.3);
      expect(steps.indexOf(peak)).toBeLessThan(steps.length * 0.7);
      expect(steps[0]).toBeLessThan(peak * 0.25);
      expect(steps.at(-1)).toBeLessThan(peak * 0.25);
      // Still a burst you notice: at its height it adds at least half again to a typical leaf's speed.
      const E = CONFIG.enemies;
      const typical = ((E.speedMin + E.speedMax) / 2 + Math.min(E.maxRoundSpeedBonus, round * E.speedPerRound)) * CONFIG.teas.green.enemySpeed;
      expect(peak * 60).toBeGreaterThan(typical * 0.5);
    }
  });

  it('dashes the same extra distance however fast the leaf already rises', () => {
    for (const round of [2, 5, 9, 14]) {
      for (const [speed, fortune] of [[35, null], [70, null], [102, null], [102, 'tempest']]) {
        // A darter beside an ordinary leaf of the same speed, both still well inside the cup when compared.
        const game = brewedRound('green', round, fortune);
        const leaf = darterAt(game.state, round, { radius: 60, speed });
        const twin = placeEnemy(game.state, { lane: 8, radius: 60, speed });
        step(game, 1.3);
        expect(leaf.dart.stage).toBe('done');
        const pace = speed * game.state.modifiers.enemySpeedMultiplier;
        const crouchLoss = pace * (1 - D.warnPace) * leaf.dart.warn;
        expect(leaf.radius - twin.radius + crouchLoss).toBeCloseTo(byStage(D.dashDistance, round), 6);
      }
    }
  });

  it('covers the same ground at any frame rate, deterministically', () => {
    const ends = [];
    for (const dt of [1 / 30, 1 / 60, 1 / 120, CONFIG.timing.maxFrameSeconds, 0.025]) {
      const game = brewedRound('green', 6);
      const leaf = darterAt(game.state, 6, { radius: 80, speed: 64 });
      followDart(game, leaf, { dt, seconds: 1.2 });
      expect(leaf.dart.stage).toBe('done');
      ends.push(leaf.radius);
    }
    for (const end of ends) expect(end).toBeCloseTo(ends[0], 6);
    // And twice with one seed, the same cup to the last decimal.
    const run = () => {
      const game = createGame({ seed: 77, tea: 'green' });
      game.primaryAction();
      game.state.round = 6;
      game.state.modifiers = roundModifiers(null, 'green', 6);
      step(game, 20, { left: false, right: true, fire: true });
      return JSON.stringify(game.state.enemies);
    };
    expect(run()).toBe(run());
  });

  it('is held back by milk, and never dashes while being washed back', () => {
    const plain = brewedRound('green', 9);
    const free = darterAt(plain.state, 9, { radius: 80, speed: 0 });
    followDart(plain, free, { seconds: 2 });
    expect(free.radius - 80).toBeCloseTo(byStage(D.dashDistance, 9), 3);

    const milky = brewedRound('green', 9);
    milky.state.clouds.push({ angle: laneAngle(0), time: 60, duration: 60, spread: 1, drift: 0 });
    const slowed = darterAt(milky.state, 9, { radius: 80, speed: 0 });
    followDart(milky, slowed, { seconds: 2 });
    expect(slowed.radius - 80).toBeCloseTo(byStage(D.dashDistance, 9) * CONFIG.milk.slowFactor, 3);

    const washed = brewedRound('green', 9);
    const leaf = darterAt(washed.state, 9, { radius: 120, speed: 0 });
    while (leaf.dart.stage !== 'darting') step(washed, 1 / 60);
    leaf.backwash = CONFIG.milk.backwash;
    const before = leaf.radius;
    step(washed, D.dashTime + 1 / 60);
    expect(leaf.dart.stage).toBe('done');
    expect(leaf.radius).toBeLessThan(before);
  });

  it('keeps every dart well inside the cup, with time to react', () => {
    for (const round of lastRounds()) {
      // The fastest leaf this stage can bring, starting its crouch at the furthest point (plus a slow frame).
      const fastest = fastestIn(round);
      const game = brewedRound('green', round);
      game.state.modifiers = { ...game.state.modifiers, enemySpeedMultiplier: CONFIG.teas.maxEnemySpeedMultiplier };
      const at = D.atMax + fastest * CONFIG.timing.maxFrameSeconds;
      const leaf = darterAt(game.state, round, { radius: at, speed: fastest / CONFIG.teas.maxEnemySpeedMultiplier });
      const track = followDart(game, leaf, { untilRadius: CONFIG.arena.rimRadius - CONFIG.enemies.escapeInset });
      expect(track.dashEnd).toBeLessThan(CONFIG.arena.rimRadius - 30);
      // From the first flicker to the rim takes longer than it ever did with the ×2 sprint (about 1.1 s).
      expect(track.time).toBeGreaterThan(1.2);
    }
  });

  it('never reaches the rim sooner than an ordinary leaf from the same point, give or take a frame', () => {
    // The crouch gives back about what the dash takes, so a dart surprises without stealing reaction time.
    const rim = CONFIG.arena.rimRadius - CONFIG.enemies.escapeInset;
    const E = CONFIG.enemies;
    for (const round of [2, 4, 5, 8, 9, 12]) {
      const bonus = Math.min(E.maxRoundSpeedBonus, round * E.speedPerRound);
      for (const base of [E.speedMin, (E.speedMin + E.speedMax) / 2, E.speedMax]) {
        for (const at of [D.atMin, D.atMax]) {
          const game = brewedRound('green', round);
          const leaf = darterAt(game.state, round, { radius: at, speed: base + bonus });
          const track = followDart(game, leaf, { untilRadius: rim });
          const ordinary = (rim - at) / ((base + bonus) * CONFIG.teas.green.enemySpeed);
          expect(track.time).toBeGreaterThan(ordinary - 0.05);
        }
      }
    }
  });

  it('never starts a dart near the rim', () => {
    const game = brewedRound('green', 9);
    const leaf = darterAt(game.state, 9, { radius: D.latestAt + 5, speed: 60 });
    leaf.dart.at = D.atMax; // its turn came and went
    step(game, 1);
    expect(leaf.dart.stage).toBe('done');
    expect(game.drainEvents().map((e) => e.type)).not.toContain('dartWarn');
  });
});

describe('Earl Grey', () => {
  /** A wanderer about to lean, as spawned in `round`. */
  function wandererAt(state, round, { lane = 3, radius = 80, speed = 50, dir = 1 } = {}) {
    const leaf = placeEnemy(state, { lane, radius, speed });
    Object.assign(leaf, {
      kind: 'wanderer', home: 40, backwash: 0, glide: null,
      wander: { stage: 'waiting', at: radius, dir, time: 0, warn: byStage(W.warnTime, round) },
    });
    return leaf;
  }

  it('makes roughly the share of new leaves wanderers that the round calls for', () => {
    for (const round of [2, 5, 9]) {
      const game = brewedRound('earlGrey', round);
      for (let i = 0; i < 3000; i++) spawnEnemy({ state: game.state, rng: createRandom(i) });
      const share = game.state.enemies.filter((e) => e.kind === 'wanderer').length / 3000;
      expect(share).toBeGreaterThan(byStage(W.chance, round) - 0.03);
      expect(share).toBeLessThan(byStage(W.chance, round) + 0.03);
    }
  });

  it('leans for as long as the round allows, then glides exactly one lane, smoothly', () => {
    for (const round of [2, 5, 9]) {
      const game = brewedRound('earlGrey', round);
      const warn = byStage(W.warnTime, round);
      const leaf = wandererAt(game.state, round, { lane: 3, radius: 60 });
      leaf.wander.at = 80;
      while (leaf.wander.stage === 'waiting') step(game, 1 / 60);
      expect(game.drainEvents().map((e) => e.type)).toEqual(['wanderWarn']);
      step(game, warn - 0.05);
      expect(leaf.angle).toBeCloseTo(laneAngle(3)); // no surprise moves during the warning
      expect(leaf.wander.stage).toBe('warning');
      step(game, 0.1);
      expect(game.drainEvents().map((e) => e.type)).toContain('wander');
      const midway = [];
      for (let t = 0; t < W.glideTime; t += 1 / 60) {
        step(game, 1 / 60);
        midway.push(leaf.angle);
      }
      for (let i = 1; i < midway.length; i++) {
        expect(midway[i] - midway[i - 1]).toBeLessThan(LANE_STEP * 0.15); // no jumps
      }
      step(game, 0.1);
      expect(leaf.angle).toBeCloseTo(laneAngle(4));
      expect(leaf.glide).toBeNull();
      expect(leaf.wander.stage).toBe('done');
    }
  });

  it('wanders in the middle of the cup, never near the rim', () => {
    for (const round of lastRounds()) {
      // The fastest leaf this stage can bring, starting to lean from the furthest point.
      const reach = W.atMax + fastestIn(round) * (byStage(W.warnTime, round) + W.glideTime);
      expect(reach).toBeLessThan(CONFIG.arena.rimRadius * 0.85);
    }
  });

  it('never starts to wander near the rim', () => {
    const game = brewedRound('earlGrey', 9);
    const leaf = wandererAt(game.state, 9, { radius: W.latestAt + 5 });
    leaf.wander.at = W.atMax; // its turn came and went
    step(game, 2);
    expect(leaf.wander.stage).toBe('done');
    expect(leaf.angle).toBeCloseTo(laneAngle(3));
    expect(game.drainEvents().map((e) => e.type)).not.toContain('wanderWarn');
  });

  it('ends in the same lane at any frame rate', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144, CONFIG.timing.maxFrameSeconds]) {
      const game = brewedRound('earlGrey', 5);
      const leaf = wandererAt(game.state, 5, { lane: 7, dir: -1 });
      for (let t = 0; t < 1.5; t += dt) game.update(dt);
      expect(leaf.angle).toBeCloseTo(laneAngle(6));
      expect(leaf.glide).toBeNull();
    }
  });

  it('composes with The Spiral: every move stays on a lane once it settles, well inside the rim', () => {
    for (const round of [2, 5, 9]) {
      const game = brewedRound('earlGrey', round, 'spiral');
      const leaf = wandererAt(game.state, round, { lane: 6, radius: 60, speed: 90, dir: -1 });
      leaf.wander.at = 100;
      let lastMove = 0; // the furthest out the leaf was still changing lanes
      let angle = leaf.angle;
      while (leaf.radius < 240) {
        step(game, 1 / 60);
        if (leaf.angle !== angle) lastMove = leaf.radius;
        angle = leaf.angle;
      }
      expect(leaf.shifted).toBe(true);
      expect(leaf.wander.stage).toBe('done');
      expect(leaf.glide).toBeNull();
      expect(onLane(leaf.angle)).toBe(true);
      expect(lastMove).toBeLessThan(CONFIG.arena.rimRadius * 0.85);
      const events = game.drainEvents().map((e) => e.type);
      expect(events.indexOf('wanderWarn')).toBeLessThan(events.indexOf('wander'));
      expect(events).toContain('drift');
    }
  });
});

describe('Chai', () => {
  /** A Chai round with a few leaves held still in the middle of the cup. */
  function chaiGame(lanes = [0, 5, 9], round = 1) {
    const game = brewedRound('chai', round);
    const leaves = lanes.map((lane) => placeEnemy(game.state, { lane, radius: 120, speed: 0 }));
    return { game, leaves };
  }

  /** Each current event in the next `seconds` of a Chai round, stepping by `dt`, with when it happened. */
  function currentLog(game, seconds, dt = 1 / 60, onEvent = () => {}) {
    const log = [];
    const frames = Math.round(seconds / dt);
    for (let i = 1; i <= frames; i++) {
      game.update(dt);
      for (const e of game.drainEvents()) {
        log.push({ type: e.type, t: i * dt, dir: e.dir });
        onEvent(e);
      }
    }
    return log;
  }

  it('warns, then carries every leaf exactly one lane, on a fixed clock', () => {
    for (const round of [2, 5, 9]) {
      const { game, leaves } = chaiGame([0, 5, 9], round);
      const { dir, wait: firstAt, warn, calm } = game.state.current;
      let settled = null; // where the leaves are once the first current has passed
      const log = currentLog(game, firstAt + warn + C.flowTime + calm + warn + 0.5, 1 / 60, (e) => {
        if (e.type === 'currentEnd' && !settled) settled = leaves.map((leaf) => leaf.angle);
      });
      const times = (type) => log.filter((e) => e.type === type).map((e) => e.t);
      expect(times('currentWarn')[0]).toBeCloseTo(firstAt, 1);
      expect(times('currentFlow')[0]).toBeCloseTo(firstAt + warn, 1);
      expect(times('currentEnd')[0]).toBeCloseTo(firstAt + warn + C.flowTime, 1);
      expect(times('currentWarn')[1]).toBeCloseTo(firstAt + warn + C.flowTime + calm, 1);
      // The next current runs the other way.
      const warns = log.filter((e) => e.type === 'currentWarn');
      expect(warns[0].dir).toBe(dir);
      expect(warns[1].dir).toBe(-dir);
      for (const [i, lane] of [0, 5, 9].entries()) {
        expect(angleDifference(settled[i], laneAngle(lane + dir))).toBeCloseTo(0);
      }
      // The second current is carrying them back the other way.
      expect(angleDifference(leaves[0].angle, laneAngle(0 + dir)) * dir).toBeLessThan(0);
    }
  });

  it('gives more warning and more calm in the first cups, down to full strength by round 9', () => {
    expect(createCurrent(1, 2)).toMatchObject({ wait: 6.5, warn: 2.2, calm: 10 });
    expect(createCurrent(1, 4)).toMatchObject({ wait: 6.5, warn: 2.2, calm: 10 });
    expect(createCurrent(1, 5)).toMatchObject({ wait: 5.5, warn: 1.9, calm: 8.5 });
    expect(createCurrent(1, 8)).toMatchObject({ wait: 5.5, warn: 1.9, calm: 8.5 });
    expect(createCurrent(1, 9)).toMatchObject({ wait: 5, warn: 1.6, calm: 7.5 });
    expect(createCurrent(1, 25)).toEqual(createCurrent(1, 9));
  });

  it('moves nothing during the warning', () => {
    for (const round of [2, 5, 9]) {
      const { game, leaves } = chaiGame([2], round);
      const { wait, warn } = game.state.current;
      step(game, wait + warn - 0.05);
      expect(game.state.current.stage).toBe('warning');
      expect(leaves[0].angle).toBeCloseTo(laneAngle(2));
    }
  });

  it('keeps time at any frame rate', () => {
    const reference = currentLog(chaiGame([], 6).game, 40);
    expect(reference.filter((e) => e.type === 'currentWarn').length).toBeGreaterThanOrEqual(3);
    for (const dt of [1 / 30, 1 / 144, CONFIG.timing.maxFrameSeconds]) {
      const log = currentLog(chaiGame([], 6).game, 40, dt);
      expect(log.map((e) => e.type)).toEqual(reference.map((e) => e.type));
      for (const [i, { t }] of log.entries()) expect(Math.abs(t - reference[i].t)).toBeLessThanOrEqual(dt + 1 / 60);
    }
  });

  it('runs the same way for the same seed, and stops while paused', () => {
    const a = chaiGame([1]);
    const b = chaiGame([1]);
    const firstAt = a.game.state.current.wait;
    step(a.game, firstAt + 1);
    step(b.game, firstAt + 1);
    expect(a.game.state.current).toEqual(b.game.state.current);
    expect(a.game.state.current.stage).toBe('warning');
    a.game.pause();
    const frozen = JSON.stringify(a.game.state.current);
    step(a.game, 5);
    expect(JSON.stringify(a.game.state.current)).toBe(frozen);
    a.game.resume();
    step(a.game, a.game.state.current.warn);
    expect(a.game.state.current.stage).not.toBe('warning');
  });

  it('can stack with Tempestuous Tea without anything going unannounced', () => {
    const game = playingGame({ tea: 'chai', spawning: true });
    game.state.modifiers = roundModifiers('tempest', 'chai');
    let warned = false;
    for (let t = 0; t < 20; t += 1 / 60) {
      game.update(1 / 60, IDLE);
      for (const e of game.drainEvents()) {
        if (e.type === 'currentWarn') warned = true;
        if (e.type === 'currentFlow') expect(warned).toBe(true);
      }
      if (game.state.phase !== 'playing') break;
    }
    expect(game.state.modifiers.enemySpeedMultiplier).toBeCloseTo(CONFIG.fortunes.tempestEnemySpeed);
  });

  it('only flows in Chai', () => {
    for (const tea of ['house', 'green', 'earlGrey', 'black', 'herbal']) expect(playingGame({ tea }).state.current).toBeNull();
  });
});

describe('Black Tea', () => {
  it('scores 25% more for every leaf, combined once with the fortune', () => {
    const black = roundModifiers(null, 'black');
    expect(killScore({ sugar: false }, black)).toBe(Math.round(CONFIG.scoring.steamKill * 1.25));
    expect(killScore({ sugar: true }, black)).toBe(Math.round(CONFIG.scoring.sugarKill * 1.25));
    expect(killScore({ sugar: false }, roundModifiers('spiral', 'black'))).toBe(Math.round(10 * 1.25 * 1.25));
    const game = playingGame({ tea: 'black' });
    killOne(game);
    expect(game.state.score).toBe(13);
    expect(game.state.kills).toBe(1);
  });

  it('brings leaves more often, without raising the limit on leaves in the cup', () => {
    for (const round of [1, 5, 15]) {
      const plain = nextSpawnDelay(round, createRandom(3));
      expect(nextSpawnDelay(round, createRandom(3), CONFIG.teas.black.spawnInterval)).toBeCloseTo(plain * CONFIG.teas.black.spawnInterval);
      expect(CONFIG.teas.black.spawnInterval).toBeLessThan(1);
    }
    const game = playingGame({ tea: 'black', spawning: true });
    for (let t = 0; t < 60 && game.state.phase === 'playing'; t += 1 / 60) {
      game.update(1 / 60, IDLE);
      expect(game.state.enemies.length).toBeLessThanOrEqual(CONFIG.enemies.maxActive);
    }
  });
});

describe('Herbal Tea', () => {
  it('slows the leaves and their arrival, and lets milk linger', () => {
    const house = playingGame();
    const herbal = playingGame({ tea: 'herbal' });
    const a = placeEnemy(house.state, { radius: 50, speed: 40 });
    const b = placeEnemy(herbal.state, { radius: 50, speed: 40 });
    step(house, 1);
    step(herbal, 1);
    expect(b.radius - 50).toBeCloseTo((a.radius - 50) * CONFIG.teas.herbal.enemySpeed, 3);
    expect(herbal.state.modifiers.spawnIntervalMultiplier).toBe(CONFIG.teas.herbal.spawnInterval);
    herbal.pourMilk();
    expect(herbal.state.clouds[0].duration).toBeCloseTo(CONFIG.milk.duration + CONFIG.teas.herbal.milkBonus);
  });

  it('makes The Leaves Lie likelier afterwards, without guaranteeing it', () => {
    expect(teaFortuneNudges('herbal')).toEqual({ lie: CONFIG.teas.herbal.lieWeight });
    expect(teaFortuneNudges('green')).toEqual({});
    const record = { milkKills: 0, milkUses: 0, sugarUses: 0, escapes: 0, nearMisses: 0, leafLanes: [1, 2, 3, 9, 12] };
    const plain = fortuneWeights(record);
    const nudged = fortuneWeights({ ...record, nudges: teaFortuneNudges('herbal') });
    expect(nudged.lie - plain.lie).toBeCloseTo(CONFIG.teas.herbal.lieWeight);
    const share = (rec) => {
      const rng = createRandom(77);
      let lies = 0;
      for (let i = 0; i < 6000; i++) if (drawFortune(rec, rng) === 'lie') lies++;
      return lies / 6000;
    };
    const before = share(record);
    const after = share({ ...record, nudges: teaFortuneNudges('herbal') });
    expect(after).toBeGreaterThan(before * 1.8);
    expect(after).toBeLessThan(0.2);
  });
});

describe('the rest of the game, under every tea', () => {
  it('keeps kill, volley, escape, and strainer accounting as before, early and at full strength', () => {
    for (const [tea, round] of Object.keys(TEAS).flatMap((id) => [[id, 1], [id, 9]])) {
      const game = round === 1 ? playingGame({ tea }) : brewedRound(tea, round);
      killOne(game, 2);
      expect(game.state.kills).toBe(1);
      expect(game.state.roundStats.volleys).toBe(1);
      expect(game.state.roundStats.steamKills).toBe(1);
      expect(game.state.roundStats.wastedVolleys).toBe(0);
      expect(game.state.residue).toHaveLength(1);
      placeEnemy(game.state, { lane: 8, radius: CONFIG.arena.rimRadius, speed: 1 });
      step(game, 0.05);
      expect(game.state.strainerLeft).toBe(0);
      expect(game.state.lives).toBe(CONFIG.lives);
    }
  });

  it('still offers upgrades and awards secrets', () => {
    const game = playingGame({ tea: 'black' });
    completeRound(game);
    expect(game.state.offer).toHaveLength(2);
    game.state.readingTime = 10;
    expect(game.chooseUpgrade(0)).toBe(true);
    expect(game.state.phase).toBe('playing');
  });

  it('clears everything about the tea on a fresh pot', () => {
    const game = createGame({ seed: 41 });
    game.primaryAction();
    for (let i = 0; i < 4; i++) {
      completeRound(game);
      brewNext(game);
    }
    expect(Object.keys(game.state.teaServed).length).toBeGreaterThan(1);
    game.state.lives = 1;
    game.state.strainerLeft = 0;
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    expect(game.state.phase).toBe('gameover');
    game.restart();
    expect(game.state.tea).toBe('house');
    expect(game.state.teaServed).toEqual({ house: 1 });
    expect(game.state.current).toBeNull();
    expect(game.state.modifiers).toEqual(BASE_MODIFIERS);
  });
});

describe('bonus encounters ignore the tea', () => {
  /** A game sent straight into a bonus after one round of the given tea. */
  function bonusAfter(tea, kind) {
    const game = playingGame({ seed: 5, tea });
    completeRound(game);
    game.state.offer = null;
    game.state.havocDue = kind === 'havoc';
    game.state.grindDue = kind === 'grind';
    game.primaryAction();
    game.primaryAction(); // skip the intro
    return game;
  }

  it('plays Hot Chocolate Havoc identically whatever the tea', () => {
    const runs = ['house', 'green', 'chai', 'herbal'].map((tea) => {
      const game = bonusAfter(tea, 'havoc');
      expect(game.state.phase).toBe('chocolate');
      expect(game.state.current).toBeNull();
      step(game, 6, { left: false, right: true, fire: true });
      return JSON.stringify(game.state.chocolate);
    });
    for (const run of runs) expect(run).toBe(runs[0]);
  });

  it('fights The Daily Grind with neutral modifiers whatever the tea', () => {
    for (const tea of ['black', 'herbal', 'chai']) {
      const game = bonusAfter(tea, 'grind');
      expect(game.state.phase).toBe('grind');
      expect(game.state.modifiers).toEqual(BASE_MODIFIERS);
      expect(game.state.current).toBeNull();
      expect(game.state.grind.health).toBe(CONFIG.grind.health);
      game.pourMilk();
      expect(game.state.clouds[0].duration).toBe(CONFIG.milk.duration);
    }
  });

  it('brews the next cup with its own tea and fortune afterwards', () => {
    const game = createGame({ seed: 23 });
    game.primaryAction();
    completeRound(game);
    game.state.offer = null;
    game.state.havocDue = true;
    const fortune = game.state.nextFortune;
    brewNext(game);
    expect(game.state.round).toBe(2);
    expect(game.state.fortune).toBe(fortune);
    expect(TEA_ROTATION).toContain(game.state.tea);
    expect(game.state.modifiers).toEqual(roundModifiers(fortune, game.state.tea));
  });
});
