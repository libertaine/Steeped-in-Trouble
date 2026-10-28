import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { laneAngle, normalizeAngle } from '../../src/gameplay/arena.js';
import { autoSteamWanted, autoSteamWantedInGrind } from '../../src/gameplay/autoSteam.js';
import { createHavoc, spawnMarshmallow } from '../../src/gameplay/chocolate.js';
import { findSecrets } from '../../src/gameplay/secrets.js';
import { IDLE, placeEnemy, playTo, playingGame, step } from './helpers.js';

const STEAM = CONFIG.steam;

/** A round in progress with Auto Steam on and the spoon over lane 0. */
function autoGame(seed = 1) {
  const game = playingGame({ seed });
  game.setAutoSteam(true);
  game.state.angle = laneAngle(0);
  return game;
}

describe('Auto Steam', () => {
  it('is off unless switched on, and fires nothing by itself then', () => {
    const game = playingGame();
    expect(game.state.autoSteam).toBe(false);
    game.state.angle = laneAngle(0);
    placeEnemy(game.state, { lane: 0, radius: 120 });
    step(game, 1);
    expect(game.state.roundStats.volleys).toBe(0);
  });

  it('fires down the spoon’s lane when a leaf is lined up there, and kills it', () => {
    const game = autoGame();
    placeEnemy(game.state, { lane: 0, radius: 120 });
    step(game, 1);
    expect(game.state.roundStats.volleys).toBe(1);
    expect(game.state.kills).toBe(1);
    expect(game.state.roundStats.steamKills).toBe(1);
    expect(game.state.roundStats.wastedVolleys).toBe(0);
  });

  it('never aims: leaves in other lanes are left to the player, and the spoon stays where it is put', () => {
    const game = autoGame();
    for (const lane of [1, 4, 8, 15]) placeEnemy(game.state, { lane, radius: 120 });
    const angle = normalizeAngle(game.state.angle);
    step(game, 2);
    expect(game.state.roundStats.volleys).toBe(0);
    expect(game.state.angle).toBeCloseTo(angle, 9);
    expect(game.state.enemies).toHaveLength(4);
  });

  it('follows the player’s steering: turning onto a leaf’s lane is what makes it fire', () => {
    const game = autoGame();
    placeEnemy(game.state, { lane: 2, radius: 100 });
    step(game, 0.3);
    expect(game.state.roundStats.volleys).toBe(0);
    step(game, 0.5, { ...IDLE, right: true }); // the player turns clockwise, past lane 2
    expect(game.state.roundStats.volleys).toBeGreaterThanOrEqual(1);
  });

  it('fires one shot per leaf, not a stream at one', () => {
    const game = autoGame();
    placeEnemy(game.state, { lane: 0, radius: 60 });
    game.update(1 / 60);
    expect(game.state.shots).toHaveLength(1);
    step(game, 3 * STEAM.cooldown);
    expect(game.state.roundStats.volleys).toBe(1); // the first dart is still on its way
    placeEnemy(game.state, { lane: 0, radius: 80 });
    step(game, STEAM.cooldown + 0.02);
    expect(game.state.roundStats.volleys).toBe(2);
  });

  it('keeps to the steam cooldown', () => {
    const game = autoGame();
    for (let i = 0; i < 8; i++) placeEnemy(game.state, { lane: 0, radius: 40 + i * 4 });
    step(game, 0.5);
    const allowed = Math.floor(0.5 / STEAM.cooldown) + 1;
    expect(game.state.roundStats.volleys).toBeLessThanOrEqual(allowed);
    expect(game.state.roundStats.volleys).toBeGreaterThanOrEqual(allowed - 1);
  });

  it('fires twice as often under the Golden Spoon, as held steam would', () => {
    const plain = autoGame();
    const golden = autoGame();
    golden.state.goldenSpoon = 5;
    for (const game of [plain, golden]) {
      for (let i = 0; i < 12; i++) placeEnemy(game.state, { lane: 0, radius: 30 + i * 3 });
      step(game, 0.6);
    }
    expect(golden.state.roundStats.volleys).toBeGreaterThan(plain.state.roundStats.volleys);
  });

  it('counts a Double Trouble pair as one shot, just as the fire button does', () => {
    const game = autoGame();
    game.state.modifiers = { ...game.state.modifiers, twinSteam: true };
    placeEnemy(game.state, { lane: 0, radius: 100 });
    game.update(1 / 60);
    expect(game.state.shots).toHaveLength(2);
    expect(game.state.roundStats.volleys).toBe(1);
    step(game, 0.2);
    expect(game.state.roundStats.volleys).toBe(1);
  });

  it('goes for the golden and prismatic cubes too, but never pours milk or fires sugar', () => {
    const game = autoGame();
    game.state.golden = { angle: laneAngle(0), radius: 150, time: 5, life: 5 };
    const { milkLeft, sugarLeft } = game.state;
    expect(autoSteamWanted(game.state)).toBe(true);
    step(game, 1);
    expect(game.state.golden).toBe(null);
    expect(game.state.milkLeft).toBe(milkLeft);
    expect(game.state.sugarLeft).toBeGreaterThanOrEqual(sugarLeft); // only a golden reward could add any
    expect(game.state.roundStats.milkUses + game.state.roundStats.sugarUses).toBe(0);
  });

  it('does not count a target already covered by sugar in flight', () => {
    const game = autoGame();
    placeEnemy(game.state, { lane: 0, radius: 100 });
    game.state.autoSteam = false;
    game.sugarBurst();
    game.state.autoSteam = true;
    game.update(1 / 60);
    expect(game.state.roundStats.volleys).toBe(0);
  });

  it('leaves the secrets as reachable as ever: a clean round of automatic shots is still Not a Drop Wasted', () => {
    const game = autoGame();
    game.state.target = 99;
    for (let i = 0; i < 14; i++) {
      placeEnemy(game.state, { lane: 0, radius: 150 });
      step(game, 0.5);
    }
    const stats = game.state.roundStats;
    expect(stats.volleys).toBe(14);
    expect(stats.wastedVolleys).toBe(0);
    expect(findSecrets(stats)).toContain('notADropWasted');
  });
});

describe('Auto Steam in The Daily Grind', () => {
  function fight(seed = 1) {
    const game = playingGame({ seed });
    game.setAutoSteam(true);
    playTo(game, 5);
    game.state.kills = game.state.target - 1;
    game.state.current = null;
    placeEnemy(game.state, { lane: 0, radius: 200 });
    game.state.angle = laneAngle(0);
    game.state.shotCooldown = 0;
    step(game, 0.4);
    game.state.offer = null;
    game.primaryAction(); // the machine rises
    game.primaryAction(); // into the fight
    const g = game.state.grind;
    g.attack = null;
    g.attackTimer = Infinity;
    g.beans = [];
    return game;
  }

  it('steams the safety valve while it faces the spoon, and only then', () => {
    const game = fight();
    const g = game.state.grind;
    const lane = 3;
    game.state.angle = laneAngle(lane);
    Object.assign(g.valve, { lane: 9, stage: 'open', time: 0, length: Infinity });
    step(game, 1);
    expect(game.state.roundStats.volleys).toBe(0);
    Object.assign(g.valve, { lane, stage: 'open', time: 0, length: Infinity });
    const health = g.health;
    step(game, 1);
    expect(game.state.roundStats.volleys).toBeGreaterThan(2);
    expect(g.health).toBeLessThan(health);
  });

  it('holds fire when the valve will have shut before the steam arrives', () => {
    const game = fight();
    const g = game.state.grind;
    game.state.angle = laneAngle(4);
    Object.assign(g.valve, { lane: 4, stage: 'open', time: 1.95, length: 2 });
    expect(autoSteamWantedInGrind(game.state)).toBe(false);
  });

  it('cracks beans coming down the spoon’s lane, but doesn’t move the spoon out of trouble', () => {
    const game = fight();
    const g = game.state.grind;
    game.state.angle = laneAngle(6);
    Object.assign(g.valve, { lane: 12, stage: 'turning', time: 0, length: Infinity });
    g.beans.push({ id: 99, angle: laneAngle(6), radius: 100, home: 100, speed: 0, backwash: 0, alpha: 1, shifted: true, spin: 0 });
    const angle = normalizeAngle(game.state.angle);
    step(game, 1);
    expect(g.beans).toHaveLength(0);
    expect(g.tally.beans).toBe(1);
    expect(game.state.angle).toBeCloseTo(angle, 9);
  });
});

describe('Auto Steam in Hot Chocolate Havoc', () => {
  it('stays out of it: toasting is the player’s own', () => {
    const game = playingGame({ seed: 2 });
    game.setAutoSteam(true);
    game.state.phase = 'chocolate';
    game.state.chocolate = { stage: 'play', time: 0, left: 10, marshmallows: [], flames: [] };
    expect(game.touchGestures()).toBe('flame');
    game.state.phase = 'playing';
    game.state.chocolate = null;
    expect(game.touchGestures()).toBe('cup');
  });

  it('fires no flames by itself', () => {
    const game = playingGame({ seed: 2 });
    game.setAutoSteam(true);
    game.state.phase = 'chocolate';
    game.state.chocolate = { ...createHavoc(createRandom(1)), stage: 'play' };
    game.state.angle = laneAngle(0);
    spawnMarshmallow({ state: game.state, rng: createRandom(2), emit: () => {} }, { radius: 120 });
    game.state.chocolate.marshmallows.forEach((m) => { m.angle = laneAngle(0); });
    step(game, 2);
    expect(game.state.chocolate.flames).toHaveLength(0);
  });
});
