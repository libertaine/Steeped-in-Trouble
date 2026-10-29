import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { OFFER_AT } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { laneAngle, normalizeAngle } from '../../src/gameplay/arena.js';
import { fortuneWeights } from '../../src/gameplay/fortunes.js';
import { awardGolden } from '../../src/gameplay/golden.js';
import {
  UPGRADES, applyUpgrade, availableUpgrades, createSpoon, drawOffer, offerDue,
} from '../../src/gameplay/upgrades.js';
import { sugarCapacity } from '../../src/gameplay/weapons.js';
import { brewNext, completeRound, killOne, placeEnemy, playingGame, step } from './helpers.js';

const RIM = CONFIG.arena.rimRadius;
const types = (game) => game.drainEvents().map((e) => e.type);

/** A leaf about to reach the rim in a given lane. */
const atRim = (game, lane = 3) => placeEnemy(game.state, { lane, radius: RIM - 5, speed: 40 });

/** Finish round 1 and wait until the upgrade offer can be taken. */
function readingWithOffer(seed = 1) {
  const game = playingGame({ seed });
  completeRound(game);
  game.state.readingTime = OFFER_AT;
  return game;
}

/** A game in play whose spoon has these upgrade levels. */
function upgradedGame(levels) {
  const game = playingGame();
  Object.assign(game.state.spoon, levels);
  return game;
}

describe('the tea strainer', () => {
  it('catches the first escaping leaf of a round instead of spending a cup', () => {
    const game = playingGame();
    expect(game.state.strainerLeft).toBe(1);
    atRim(game);
    step(game, 0.2);
    expect(game.state.lives).toBe(CONFIG.lives);
    expect(game.state.strainerLeft).toBe(0);
    expect(game.state.enemies).toHaveLength(0);
    const events = game.drainEvents();
    expect(events.map((e) => e.type)).toContain('strain');
    expect(events.find((e) => e.type === 'strain')).toMatchObject({ left: 0, capacity: 1 });
    expect(events.map((e) => e.type)).not.toContain('escape');
  });

  it('is exhausted after its catches, so the next leaf spills', () => {
    const game = playingGame();
    atRim(game);
    step(game, 0.2);
    atRim(game, 8);
    step(game, 0.2);
    expect(game.state.lives).toBe(CONFIG.lives - 1);
    expect(types(game)).toEqual(['strain', 'escape']);
  });

  it('replenishes at the start of the next round', () => {
    const game = playingGame();
    atRim(game);
    step(game, 0.2);
    expect(game.state.strainerLeft).toBe(0);
    completeRound(game);
    brewNext(game);
    expect(game.state.strainerLeft).toBe(1);
  });

  it('holds one more catch per Strainer Attachment, up to three', () => {
    const game = upgradedGame({ strainer: 2 });
    completeRound(game);
    game.state.nextFortune = null; // a plain cup: under Karma the rim, not the strainer, would answer
    brewNext(game);
    expect(game.state.strainerLeft).toBe(3);
    for (const lane of [1, 5, 9]) {
      atRim(game, lane);
      step(game, 0.2);
    }
    expect(game.state.lives).toBe(CONFIG.lives);
    expect(game.state.strainerLeft).toBe(0);
    expect(applyUpgrade(game.state.spoon, 'strainer')).toBe(false); // already at the limit
  });

  it('counts its catches as near misses for the reading', () => {
    const game = playingGame();
    atRim(game);
    step(game, 0.2);
    expect(game.state.roundStats).toMatchObject({ nearMisses: 1, escapes: 0 });
  });
});

describe('the grace period after a spill', () => {
  function afterSpill() {
    const game = playingGame();
    game.state.strainerLeft = 0;
    atRim(game);
    step(game, 0.2);
    game.drainEvents();
    return game;
  }

  it('starts when a cup is lost', () => {
    const game = afterSpill();
    expect(game.state.lives).toBe(CONFIG.lives - 1);
    expect(game.state.graceTime).toBeGreaterThan(0);
    expect(game.state.graceTime).toBeLessThanOrEqual(CONFIG.grace.duration);
  });

  it('sloshes further escaping leaves back into the cup without spending a cup', () => {
    const game = afterSpill();
    const leaf = atRim(game, 9);
    step(game, 0.1);
    expect(game.state.lives).toBe(CONFIG.lives - 1);
    expect(types(game)).toEqual(['recoil']);
    expect(game.state.enemies).toContain(leaf);
    step(game, 0.6);
    // Well away from the rim, so it cannot spill the moment the grace ends.
    expect(leaf.radius).toBeLessThan(RIM - CONFIG.grace.recoil * 0.8);
    expect(game.state.roundStats.nearMisses).toBe(1);
  });

  it('ends after about a second, after which spills cost cups again', () => {
    const game = afterSpill();
    step(game, CONFIG.grace.duration);
    expect(game.state.graceTime).toBe(0);
    atRim(game, 9);
    step(game, 0.2);
    expect(game.state.lives).toBe(CONFIG.lives - 2);
  });

  it('can still lose several cups in one round', () => {
    const game = afterSpill();
    for (let i = 0; i < CONFIG.lives - 1; i++) {
      step(game, CONFIG.grace.duration);
      atRim(game, 9);
      step(game, 0.2);
    }
    expect(game.state.phase).toBe('gameover');
  });

  it('does not carry over into the next round', () => {
    const game = afterSpill();
    completeRound(game);
    brewNext(game);
    expect(game.state.graceTime).toBe(0);
  });
});

describe('milk backwash', () => {
  it('pushes leaves in the milk wedge back towards the centre, and the rest of the cup a little', () => {
    const game = playingGame(); // spoon over lane 0
    const near = placeEnemy(game.state, { lane: 1, radius: 250, speed: 0 });
    const far = placeEnemy(game.state, { lane: 4, radius: 250, speed: 0 });
    game.pourMilk();
    step(game, 1);
    expect(near.radius).toBeCloseTo(250 - CONFIG.milk.backwash, 0);
    expect(far.radius).toBeCloseTo(250 - CONFIG.milk.pulse.backwash, 0);
    expect(game.drainEvents().find((e) => e.type === 'milk').pushed).toBe(1);
  });

  it('plays the push out over a moment rather than all at once', () => {
    const game = playingGame();
    const leaf = placeEnemy(game.state, { lane: 0, radius: 250, speed: 0 });
    game.pourMilk();
    step(game, 1 / 60);
    expect(leaf.radius).toBeLessThan(250);
    expect(leaf.radius).toBeGreaterThan(250 - CONFIG.milk.backwash * 0.5);
  });

  it('never pushes a leaf further in than where it started', () => {
    const game = playingGame();
    const leaf = placeEnemy(game.state, { lane: 0, radius: 90, speed: 0 });
    leaf.home = 40;
    const stray = placeEnemy(game.state, { lane: 0, radius: 60, speed: 0 }); // no recorded start
    game.pourMilk();
    step(game, 1.5);
    expect(leaf.radius).toBe(40);
    expect(stray.radius).toBe(CONFIG.enemies.spawnRadiusMin);
    expect(leaf.backwash).toBe(0);
  });

  it('records where spawned leaves started', () => {
    const game = playingGame({ spawning: true });
    step(game, 1.5);
    const [leaf] = game.state.enemies;
    expect(leaf.home).toBeGreaterThanOrEqual(CONFIG.enemies.spawnRadiusMin);
    expect(leaf.home).toBeLessThan(CONFIG.enemies.spawnRadiusMax);
  });

  it('still slows the leaves it pushed', () => {
    const game = playingGame();
    const leaf = placeEnemy(game.state, { lane: 0, radius: 200, speed: 40 });
    game.pourMilk();
    step(game, 2);
    const at = leaf.radius;
    step(game, 1);
    expect(leaf.radius - at).toBeCloseTo(40 * CONFIG.milk.slowFactor, 0);
  });

  it('counts leaves rescued from the rim as near misses', () => {
    const game = playingGame();
    placeEnemy(game.state, { lane: 0, radius: RIM - 10 });
    placeEnemy(game.state, { lane: 0, radius: 100 });
    game.pourMilk();
    expect(game.state.roundStats.nearMisses).toBe(1);
  });
});

describe('milk’s recovery pulse', () => {
  const P = CONFIG.milk.pulse;

  it('pushes every leaf in the cup back and slows it briefly, from any lane', () => {
    const game = playingGame(); // spoon over lane 0
    const leaves = [4, 6, 8, 10, 12].map((lane) => placeEnemy(game.state, { lane, radius: 200, speed: 0 }));
    game.pourMilk();
    expect(game.state.pulse).toBe(P.duration);
    expect(types(game)).toEqual(['milk', 'milkPulse']);
    step(game, 1);
    for (const leaf of leaves) expect(leaf.radius).toBeCloseTo(200 - P.backwash, 0);
    // Slowed while it lasts, then back to full speed.
    const runner = placeEnemy(game.state, { lane: 8, radius: 100, speed: 40 });
    step(game, 0.25);
    expect(runner.radius - 100).toBeCloseTo(40 * 0.25 * P.slowFactor, 3);
    step(game, P.duration);
    expect(game.state.pulse).toBe(0);
    const at = runner.radius;
    step(game, 0.5);
    expect(runner.radius - at).toBeCloseTo(20, 3);
  });

  it('gives a leaf under the cloud the cloud’s push and slowdown, never both on top of each other', () => {
    const game = playingGame();
    const under = placeEnemy(game.state, { lane: 0, radius: 250, speed: 0 });
    game.pourMilk();
    step(game, 1.2);
    expect(under.radius).toBeCloseTo(250 - CONFIG.milk.backwash, 0); // 120, not 160
    const runner = placeEnemy(game.state, { lane: 0, radius: 100, speed: 40 });
    step(game, 0.2); // the pulse is still running: the cloud's 31% wins, not 31% × 65%
    expect(game.state.pulse).toBeGreaterThan(0);
    expect(runner.radius - 100).toBeCloseTo(40 * 0.2 * CONFIG.milk.slowFactor, 3);
  });

  it('starts again with a second pour rather than stacking, and the round still has only two pours', () => {
    const game = playingGame();
    const leaf = placeEnemy(game.state, { lane: 8, radius: 200, speed: 0 });
    game.pourMilk();
    step(game, 1);
    expect(game.state.pulse).toBeCloseTo(P.duration - 1, 5);
    game.pourMilk();
    expect(game.state.pulse).toBe(P.duration);
    step(game, 1);
    // Two pours, two separate pushes (each settles within half a unit of its full distance).
    expect(leaf.radius).toBeLessThanOrEqual(200 - 2 * P.backwash + 1);
    expect(leaf.radius).toBeGreaterThanOrEqual(200 - 2 * P.backwash);
    const runner = placeEnemy(game.state, { lane: 8, radius: 100, speed: 40 });
    step(game, 0.25);
    expect(runner.radius - 100).toBeCloseTo(40 * 0.25 * P.slowFactor, 3); // no deeper than one pulse
    expect(game.pourMilk()).toBe(false);
    expect(game.state.pulse).toBeGreaterThan(0);
  });

  it('pushes a leaf already being washed back no further than the stronger of the two pushes', () => {
    const game = playingGame();
    const leaf = placeEnemy(game.state, { lane: 8, radius: 200, speed: 0 });
    leaf.backwash = 100;
    game.pourMilk();
    expect(leaf.backwash).toBe(100);
    leaf.backwash = 10;
    game.pourMilk();
    expect(leaf.backwash).toBe(P.backwash);
  });

  it('awards nothing of its own: no near misses, kills, milk kills, or score', () => {
    const game = playingGame();
    for (const lane of [4, 6, 8, 10]) placeEnemy(game.state, { lane, radius: RIM - 10 }); // all well away from the cloud
    game.pourMilk();
    step(game, 0.5);
    const stats = game.state.roundStats;
    expect(stats.nearMisses).toBe(0);
    expect(stats.milkKills).toBe(0);
    expect(stats.milkUses).toBe(1);
    expect(game.state.kills).toBe(0);
    expect(game.state.score).toBe(0);
    expect(game.state.enemies).toHaveLength(4);
    // A kill outside the cloud while the pulse runs is no milk kill either.
    killOne(game, 8);
    expect(stats.milkKills).toBe(0);
    expect(game.state.kills).toBe(1);
  });

  it('pauses with the game, and is gone by the reading and the next cup', () => {
    const game = playingGame();
    game.pourMilk();
    game.pause();
    step(game, 3);
    expect(game.state.pulse).toBe(P.duration);
    game.resume();
    completeRound(game);
    expect(game.state.pulse).toBe(0);
    brewNext(game);
    expect(game.state.pulse).toBe(0);
  });

  it('never comes with milk against The Daily Grind', () => {
    const game = playingGame();
    completeRound(game);
    game.state.offer = null;
    game.state.grindDue = true;
    game.primaryAction();
    game.primaryAction(); // into the fight
    game.drainEvents();
    expect(game.pourMilk()).toBe(true);
    expect(game.state.pulse).toBe(0);
    expect(types(game)).not.toContain('milkPulse');
  });

  it('cannot be poured in Hot Chocolate Havoc', () => {
    const game = playingGame();
    completeRound(game);
    game.state.offer = null;
    game.state.havocDue = true;
    game.primaryAction();
    game.primaryAction();
    expect(game.state.phase).toBe('chocolate');
    expect(game.pourMilk()).toBe(false);
    expect(game.state.pulse).toBe(0);
  });
});

describe('spoon upgrades', () => {
  it('are offered after round 1, then every other round', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9].map(offerDue)).toEqual([true, false, true, false, true, false, true, true]);
  });

  it('offer two different upgrades, never one already at its limit', () => {
    const rng = createRandom(3);
    const spoon = { ...createSpoon(), polished: UPGRADES.polished.max };
    for (let i = 0; i < 200; i++) {
      const offer = drawOffer(spoon, rng);
      expect(offer).toHaveLength(2);
      expect(new Set(offer).size).toBe(2);
      expect(offer).not.toContain('polished');
    }
  });

  it('offer what is left, then nothing once the spoon is complete', () => {
    const rng = createRandom(3);
    const spoon = Object.fromEntries(Object.values(UPGRADES).map((u) => [u.id, u.max]));
    expect(drawOffer(spoon, rng)).toBeNull();
    spoon.quickStir--;
    expect(drawOffer(spoon, rng)).toEqual(['quickStir']);
  });

  it('stack within their limits', () => {
    const spoon = createSpoon();
    for (const upgrade of Object.values(UPGRADES)) {
      for (let level = 1; level <= upgrade.max; level++) expect(applyUpgrade(spoon, upgrade.id)).toBe(true);
      expect(applyUpgrade(spoon, upgrade.id)).toBe(false);
      expect(spoon[upgrade.id]).toBe(upgrade.max);
    }
    expect(availableUpgrades(spoon)).toEqual([]);
    expect(UPGRADES.strainer.max + CONFIG.strainer.perRound).toBe(3);
  });

  it('appear during the first reading and wait for a choice', () => {
    const game = playingGame();
    completeRound(game);
    expect(game.state.offer).toHaveLength(2);
    expect(game.offerOpen()).toBe(false); // not until the fortune has been revealed
    expect(game.chooseUpgrade(0)).toBe(false);
    step(game, OFFER_AT);
    expect(game.offerOpen()).toBe(true);
    expect(game.confirm()).toBe(false); // Enter does not skip the offer
    game.primaryAction();
    expect(game.state.phase).toBe('reading');
  });

  it('apply the chosen upgrade and brew the next cup', () => {
    const game = readingWithOffer();
    const [, second] = game.state.offer;
    game.drainEvents();
    expect(game.chooseUpgrade(1)).toBe(true);
    expect(game.state.spoon[second]).toBe(1);
    expect(game.state.phase).toBe('playing');
    expect(game.state.round).toBe(2);
    expect(game.state.offer).toBeNull();
    expect(types(game)).toEqual(['roundStart', 'upgrade']);
    expect(game.chooseUpgrade(0)).toBe(false);
  });

  it('are not offered after round 2', () => {
    const game = readingWithOffer();
    game.chooseUpgrade(0);
    completeRound(game);
    expect(game.state.offer).toBeNull();
    expect(game.confirm()).toBe(true);
    expect(game.state.round).toBe(3);
  });

  it('Polished Spoon: steam travels 20% faster per level', () => {
    const plain = playingGame();
    const polished = upgradedGame({ polished: 2 });
    plain.fireSteam();
    polished.fireSteam();
    expect(polished.state.shots[0].speed).toBeCloseTo(plain.state.shots[0].speed * 1.4);
  });

  it('Quick Stir: the spoon turns 15% faster per level', () => {
    const game = upgradedGame({ quickStir: 1 });
    const start = game.state.angle;
    step(game, 0.5, { left: false, right: true, fire: false });
    expect(normalizeAngle(game.state.angle - start)).toBeCloseTo(CONFIG.player.turnSpeed * 1.15 * 0.5, 5);
  });

  it('Sugar Scoop: one more burst every cup, which Sugar Rush respects', () => {
    const game = upgradedGame({ sugarScoop: 1 });
    completeRound(game);
    game.state.nextFortune = 'sugarRush';
    brewNext(game);
    game.state.spawnTimer = Infinity;
    expect(sugarCapacity(game.state)).toBe(CONFIG.sugar.perRound + 1);
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + 1);
    game.sugarBurst();
    game.sugarBurst();
    step(game, CONFIG.fortunes.sugarRushInterval * 5);
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + 1); // regrown up to the scoop, no further
  });

  it('Sugar Scoop stacks with The Crown', () => {
    const game = upgradedGame({ sugarScoop: 2 });
    completeRound(game);
    game.state.nextFortune = 'crown';
    brewNext(game);
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + 2 + CONFIG.fortunes.crownBonusSugar);
  });

  it('are kept between rounds and separate from fortunes', () => {
    const game = upgradedGame({ polished: 1 });
    completeRound(game);
    game.state.nextFortune = 'star';
    brewNext(game);
    expect(game.state.spoon.polished).toBe(1);
    expect(game.state.modifiers.steamSpeedMultiplier).toBe(CONFIG.fortunes.starSteamMultiplier);
    game.fireSteam();
    expect(game.state.shots[0].speed).toBeCloseTo(CONFIG.steam.speed * CONFIG.fortunes.starSteamMultiplier * 1.2);
  });
});

describe('the Golden Spoon', () => {
  const GS = CONFIG.goldenSpoon;
  const gilded = (levels = {}) => {
    const game = upgradedGame(levels);
    game.state.goldenSpoon = GS.duration;
    return game;
  };

  it('can be won from the golden sugar cube', () => {
    const game = playingGame();
    const roll = CONFIG.golden.jackpotChance + CONFIG.golden.goldenSpoonChance / 2;
    expect(awardGolden({ state: game.state, rng: { next: () => roll } }).reward).toBe('goldenSpoon');
    expect(game.state.goldenSpoon).toBe(GS.duration);
  });

  it('comes with every jackpot', () => {
    const game = playingGame();
    expect(awardGolden({ state: game.state, rng: { next: () => 0 } }).reward).toBe('jackpot');
    expect(game.state.goldenSpoon).toBe(GS.duration);
  });

  it('fires faster, gilded darts', () => {
    const game = gilded();
    game.fireSteam();
    expect(game.state.shotCooldown).toBeCloseTo(CONFIG.steam.cooldown * GS.cooldownFactor);
    expect(game.state.shots[0]).toMatchObject({ golden: true });
    expect(game.state.shots[0].speed).toBeCloseTo(CONFIG.steam.speed * GS.speedFactor);
  });

  it('enhances the upgraded spoon instead of replacing it', () => {
    const game = gilded({ polished: 3 });
    game.fireSteam();
    expect(game.state.shots[0].speed).toBeCloseTo(CONFIG.steam.speed * 1.6 * GS.speedFactor);
  });

  it('gilds both of Double Trouble’s darts', () => {
    const game = gilded();
    completeRound(game);
    game.state.nextFortune = 'doubleTrouble';
    brewNext(game);
    game.fireSteam();
    expect(game.state.shots).toHaveLength(2);
    expect(game.state.shots.every((s) => s.golden)).toBe(true);
  });

  it('wears off after its time, back to the upgraded spoon', () => {
    const game = gilded({ polished: 1 });
    step(game, GS.duration - 0.5);
    expect(game.state.goldenSpoon).toBeGreaterThan(0);
    game.drainEvents();
    step(game, 1);
    expect(game.state.goldenSpoon).toBe(0);
    expect(types(game)).toContain('goldenSpoonEnd');
    game.state.shotCooldown = 0;
    game.fireSteam();
    expect(game.state.shotCooldown).toBe(CONFIG.steam.cooldown);
    expect(game.state.shots.at(-1)).toMatchObject({ golden: false, speed: CONFIG.steam.speed * 1.2 });
  });

  it('only shines during play', () => {
    const game = gilded();
    game.pause();
    step(game, GS.duration * 2);
    expect(game.state.goldenSpoon).toBe(GS.duration);
  });
});

describe('Tempestuous Tea and near misses', () => {
  it('grows a little more likely after narrow escapes, but never certain', () => {
    const base = { milkKills: 0, escapes: 0, leafLanes: [] };
    const calm = fortuneWeights({ ...base, nearMisses: 0 }).tempest;
    const close = fortuneWeights({ ...base, nearMisses: 2 }).tempest;
    const frantic = fortuneWeights({ ...base, nearMisses: 50 });
    expect(close).toBeGreaterThan(calm);
    expect(frantic.tempest).toBe(calm + CONFIG.strainer.nearMissWeight * CONFIG.strainer.maxNearMisses);
    const total = Object.values(frantic).reduce((sum, w) => sum + w, 0);
    expect(frantic.tempest / total).toBeLessThan(0.5);
  });

  it('reads the near misses from the finished round', () => {
    const game = playingGame();
    atRim(game);
    step(game, 0.2);
    completeRound(game);
    expect(game.state.roundStats.nearMisses).toBe(1);
  });
});

describe('a fresh pot', () => {
  it('resets upgrades, the Golden Spoon, the strainer, the grace period, and any offer', () => {
    const game = readingWithOffer();
    game.state.nextFortune = null; // a plain cup that can actually spill
    game.chooseUpgrade(0);
    Object.assign(game.state.spoon, { polished: 2, strainer: 2 });
    game.state.goldenSpoon = 4;
    game.state.strainerLeft = 0;
    game.state.lives = 1;
    atRim(game);
    step(game, 0.2);
    expect(game.state.phase).toBe('gameover');
    expect(game.restart()).toBe(true);
    const s = game.state;
    expect(s.spoon).toEqual(createSpoon());
    expect([s.goldenSpoon, s.strainerLeft, s.graceTime, s.offer]).toEqual([0, 1, 0, null]);
    game.fireSteam();
    expect(s.shots[0]).toMatchObject({ golden: false, speed: CONFIG.steam.speed });
  });

  it('starts the turn speed over too', () => {
    const game = upgradedGame({ quickStir: 3 });
    game.state.lives = 1;
    game.state.strainerLeft = 0;
    atRim(game);
    step(game, 0.2);
    game.restart();
    game.state.angle = laneAngle(0);
    step(game, 0.5, { left: false, right: true, fire: false });
    expect(normalizeAngle(game.state.angle - laneAngle(0))).toBeCloseTo(CONFIG.player.turnSpeed * 0.5, 5);
  });
});
