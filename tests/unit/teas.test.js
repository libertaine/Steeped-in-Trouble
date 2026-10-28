import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { LANE_STEP, angleDifference, laneAngle, laneOf } from '../../src/gameplay/arena.js';
import { nextSpawnDelay, spawnEnemy } from '../../src/gameplay/enemies.js';
import { BASE_MODIFIERS, FORTUNES, drawFortune, fortuneWeights, modifiersFor } from '../../src/gameplay/fortunes.js';
import { COMBINE, TEAS, TEA_ROTATION, chooseTea, roundModifiers, teaFortuneNudges } from '../../src/gameplay/teas.js';
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
    for (const tea of Object.values(TEAS)) {
      for (const key of Object.keys(tea.modifiers)) {
        expect(COMBINE[key]).toBeDefined();
        expect(BASE_MODIFIERS).toHaveProperty(key);
      }
    }
    expect(roundModifiers(null, 'house')).toEqual(BASE_MODIFIERS);
    expect(roundModifiers('star', 'house')).toEqual(modifiersFor('star'));
  });

  it('multiplies multipliers, adds bonuses, and takes the stronger chance', () => {
    expect(roundModifiers('tempest', 'green').enemySpeedMultiplier).toBeCloseTo(1.1 * CONFIG.fortunes.tempestEnemySpeed);
    expect(roundModifiers('spiral', 'black').scoreMultiplier).toBeCloseTo(1.25 * 1.25);
    expect(roundModifiers('veil', 'herbal').milkDurationBonus).toBeCloseTo(CONFIG.fortunes.veilMilkBonus + CONFIG.teas.herbal.milkBonus);
    expect(roundModifiers('spiral', 'earlGrey')).toMatchObject({ laneDrift: true, wanderChance: CONFIG.teas.earlGrey.wanderChance });
    expect(roundModifiers('tempest', 'chai')).toMatchObject({ stormyMilk: true, spiceCurrents: true });
  });

  it('never lets leaf speed stack beyond the cap', () => {
    for (const fortune of [null, ...Object.keys(FORTUNES)]) {
      for (const tea of Object.keys(TEAS)) {
        expect(roundModifiers(fortune, tea).enemySpeedMultiplier).toBeLessThanOrEqual(CONFIG.teas.maxEnemySpeedMultiplier);
      }
    }
  });

  it('applies the tea for one round only', () => {
    const game = playingGame({ tea: 'green' });
    expect(game.state.modifiers.dartChance).toBe(CONFIG.teas.green.dartChance);
    const plain = playingGame({ tea: 'house' });
    completeRound(plain);
    brewNext(plain);
    expect(plain.state.modifiers.dartChance).toBe(0);
    // An unpinned pot: each round's modifiers are exactly that round's tea and fortune.
    const pot = createGame({ seed: 12 });
    pot.primaryAction();
    for (let i = 0; i < 8; i++) {
      completeRound(pot);
      brewNext(pot);
      expect(pot.state.modifiers).toEqual(roundModifiers(pot.state.fortune, pot.state.tea));
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

  it('makes roughly the configured share of new leaves darters', () => {
    const game = playingGame({ tea: 'green' });
    for (let i = 0; i < 2000; i++) spawnEnemy({ state: game.state, rng: createRandom(i) });
    const share = game.state.enemies.filter((e) => e.kind === 'darter').length / 2000;
    expect(share).toBeGreaterThan(CONFIG.teas.green.dartChance - 0.05);
    expect(share).toBeLessThan(CONFIG.teas.green.dartChance + 0.05);
  });

  it('warns before a dart: a slow crouch, then a short sprint, then normal speed', () => {
    const game = playingGame({ tea: 'green' });
    const leaf = placeEnemy(game.state, { radius: 60, speed: 50 });
    Object.assign(leaf, { kind: 'darter', dart: { stage: 'waiting', at: 80, time: 0 } });
    const speed = 50 * CONFIG.teas.green.enemySpeed;
    const events = [];
    const run = (seconds) => {
      step(game, seconds);
      events.push(...game.drainEvents().map((e) => e.type));
    };
    while (leaf.dart.stage === 'waiting') run(1 / 60);
    expect(events).toEqual(['dartWarn']);
    let before = leaf.radius;
    run(D.warnTime - 0.1);
    expect(leaf.dart.stage).toBe('warning');
    expect(leaf.radius - before).toBeCloseTo(speed * D.warnPace * (D.warnTime - 0.1), 0);
    run(0.15);
    expect(events).toContain('dart');
    before = leaf.radius;
    run(0.2);
    expect(leaf.dart.stage).toBe('darting');
    expect(leaf.radius - before).toBeCloseTo(speed * D.dashPace * 0.2, 0);
    run(D.dashTime);
    expect(leaf.dart.stage).toBe('done');
    before = leaf.radius;
    run(0.5);
    expect(leaf.radius - before).toBeCloseTo(speed * 0.5, 0);
  });

  it('keeps every dart well inside the cup', () => {
    // The fastest leaf, darting from the furthest point, ends its sprint before the rim.
    const fastest = (CONFIG.enemies.speedMax + CONFIG.enemies.maxRoundSpeedBonus) * CONFIG.teas.maxEnemySpeedMultiplier;
    const end = D.atMax + fastest * (D.warnPace * D.warnTime + D.dashPace * D.dashTime);
    expect(end).toBeLessThan(CONFIG.arena.rimRadius - 20);
  });
});

describe('Earl Grey', () => {
  it('leans first, then glides exactly one lane, smoothly', () => {
    const game = playingGame({ tea: 'earlGrey' });
    const leaf = placeEnemy(game.state, { lane: 3, radius: 60, speed: 50 });
    Object.assign(leaf, { kind: 'wanderer', wander: { stage: 'waiting', at: 80, dir: 1, time: 0 } });
    while (leaf.wander.stage === 'waiting') step(game, 1 / 60);
    expect(game.drainEvents().map((e) => e.type)).toEqual(['wanderWarn']);
    step(game, W.warnTime - 0.05);
    expect(leaf.angle).toBeCloseTo(laneAngle(3)); // no surprise moves during the warning
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
  });

  it('wanders in the middle of the cup, never near the rim', () => {
    const fastest = (CONFIG.enemies.speedMax + CONFIG.enemies.maxRoundSpeedBonus) * CONFIG.teas.maxEnemySpeedMultiplier;
    expect(W.atMax + fastest * (W.warnTime + W.glideTime)).toBeLessThan(CONFIG.arena.rimRadius * 0.85);
  });

  it('composes with The Spiral: every move stays on a lane once it settles', () => {
    const game = playingGame({ tea: 'earlGrey' });
    game.state.modifiers = roundModifiers('spiral', 'earlGrey');
    const leaf = placeEnemy(game.state, { lane: 6, radius: 60, speed: 90 });
    Object.assign(leaf, { kind: 'wanderer', wander: { stage: 'waiting', at: 125, dir: -1, time: 0 } });
    while (leaf.radius < 240) step(game, 1 / 60);
    expect(leaf.shifted).toBe(true);
    expect(leaf.wander.stage).toBe('done');
    expect(leaf.glide).toBeNull();
    expect(onLane(leaf.angle)).toBe(true);
    const events = game.drainEvents().map((e) => e.type);
    expect(events.indexOf('wanderWarn')).toBeLessThan(events.indexOf('wander'));
    expect(events).toContain('drift');
  });
});

describe('Chai', () => {
  /** A Chai round with a few leaves held still in the middle of the cup. */
  function chaiGame(lanes = [0, 5, 9]) {
    const game = playingGame({ tea: 'chai' });
    const leaves = lanes.map((lane) => placeEnemy(game.state, { lane, radius: 120, speed: 0 }));
    return { game, leaves };
  }

  it('warns, then carries every leaf exactly one lane, on a fixed clock', () => {
    const { game, leaves } = chaiGame();
    const dir = game.state.current.dir;
    const log = [];
    let settled = null; // where the leaves are once the first current has passed
    for (let t = 0; t < C.firstAt + C.warnTime + C.flowTime + C.calmTime + C.warnTime + 0.5; t += 1 / 60) {
      step(game, 1 / 60);
      for (const e of game.drainEvents()) {
        log.push({ type: e.type, t, dir: e.dir });
        if (e.type === 'currentEnd' && !settled) settled = leaves.map((leaf) => leaf.angle);
      }
    }
    const times = (type) => log.filter((e) => e.type === type).map((e) => e.t);
    expect(times('currentWarn')[0]).toBeCloseTo(C.firstAt, 1);
    expect(times('currentFlow')[0]).toBeCloseTo(C.firstAt + C.warnTime, 1);
    expect(times('currentEnd')[0]).toBeCloseTo(C.firstAt + C.warnTime + C.flowTime, 1);
    expect(times('currentWarn')[1]).toBeCloseTo(C.firstAt + C.warnTime + C.flowTime + C.calmTime, 1);
    // The next current runs the other way.
    const warns = log.filter((e) => e.type === 'currentWarn');
    expect(warns[0].dir).toBe(dir);
    expect(warns[1].dir).toBe(-dir);
    for (const [i, lane] of [0, 5, 9].entries()) {
      expect(angleDifference(settled[i], laneAngle(lane + dir))).toBeCloseTo(0);
    }
    // The second current is carrying them back the other way.
    expect(angleDifference(leaves[0].angle, laneAngle(0 + dir)) * dir).toBeLessThan(0);
  });

  it('moves nothing during the warning', () => {
    const { game, leaves } = chaiGame([2]);
    step(game, C.firstAt + C.warnTime - 0.05);
    expect(game.state.current.stage).toBe('warning');
    expect(leaves[0].angle).toBeCloseTo(laneAngle(2));
  });

  it('runs the same way for the same seed, and stops while paused', () => {
    const a = chaiGame([1]);
    const b = chaiGame([1]);
    step(a.game, C.firstAt + 1);
    step(b.game, C.firstAt + 1);
    expect(a.game.state.current).toEqual(b.game.state.current);
    a.game.pause();
    const frozen = JSON.stringify(a.game.state.current);
    step(a.game, 5);
    expect(JSON.stringify(a.game.state.current)).toBe(frozen);
    a.game.resume();
    step(a.game, 1);
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
  it('keeps kill, volley, escape, and strainer accounting as before', () => {
    for (const tea of Object.keys(TEAS)) {
      const game = playingGame({ tea });
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
