import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { laneAngle } from '../../src/gameplay/arena.js';
import { brewNext, completeRound, placeEnemy, playingGame, step } from './helpers.js';

describe('milk', () => {
  it('starts each round with two pours and spends one per use', () => {
    const game = playingGame();
    expect(game.state.milkLeft).toBe(2);
    expect(game.pourMilk()).toBe(true);
    expect(game.state.milkLeft).toBe(1);
    expect(game.pourMilk()).toBe(true);
    expect(game.state.milkLeft).toBe(0);
    expect(game.pourMilk()).toBe(false);
    expect(game.state.milkLeft).toBe(0);
    expect(game.state.clouds).toHaveLength(2);
  });

  it('places the cloud over the spoon lane for 5.2 seconds', () => {
    const game = playingGame();
    game.state.angle = laneAngle(6);
    game.pourMilk();
    const [cloud] = game.state.clouds;
    expect(cloud.angle).toBeCloseTo(laneAngle(6));
    expect(cloud.duration).toBe(CONFIG.milk.duration);
    step(game, 5.1);
    expect(game.state.clouds).toHaveLength(1);
    step(game, 0.2);
    expect(game.state.clouds).toHaveLength(0);
  });

  it('slows leaves in the cloud and its neighbouring lanes to 31% speed, and the rest only for the brief pulse', () => {
    const game = playingGame();
    game.pourMilk(); // over lane 0
    const inside = placeEnemy(game.state, { lane: 1, radius: 100, speed: 40 });
    const outside = placeEnemy(game.state, { lane: 3, radius: 100, speed: 40 });
    step(game, 1);
    expect(inside.radius - 100).toBeCloseTo(40 * CONFIG.milk.slowFactor, 3);
    expect(outside.radius - 100).toBeCloseTo(40 * CONFIG.milk.pulse.slowFactor, 3);
    step(game, 1); // the pulse is over; the cloud is not
    expect(inside.radius - 100).toBeCloseTo(40 * CONFIG.milk.slowFactor * 2, 3);
    expect(outside.radius - 100).toBeCloseTo(40 * (CONFIG.milk.pulse.slowFactor * 1.5 + 0.5), 3);
  });

  it('cannot be poured outside a round', () => {
    const game = playingGame();
    game.pause();
    expect(game.pourMilk()).toBe(false);
    expect(game.state.milkLeft).toBe(2);
  });
});

describe('sugar', () => {
  it('starts each round with two bursts and spends one per use', () => {
    const game = playingGame();
    expect(game.state.sugarLeft).toBe(2);
    game.sugarBurst();
    game.sugarBurst();
    expect(game.state.sugarLeft).toBe(0);
    expect(game.sugarBurst()).toBe(false);
    expect(game.state.shots).toHaveLength(6);
  });

  it('fires three darts across the spoon lane and both neighbours, wrapping lane 0', () => {
    const game = playingGame(); // spoon at lane 0
    game.sugarBurst();
    const angles = game.state.shots.map((s) => s.angle);
    expect(angles[0]).toBeCloseTo(laneAngle(15));
    expect(angles[1]).toBeCloseTo(laneAngle(0));
    expect(angles[2]).toBeCloseTo(laneAngle(1));
    expect(game.state.shots.every((s) => s.sugar && s.speed === CONFIG.sugar.speed)).toBe(true);
  });

  it('ignores the steam cooldown', () => {
    const game = playingGame();
    game.fireSteam();
    expect(game.sugarBurst()).toBe(true);
  });

  it('refills milk and sugar at the start of the next round', () => {
    const game = playingGame();
    game.pourMilk();
    game.sugarBurst();
    completeRound(game);
    expect(game.state.phase).toBe('reading');
    brewNext(game);
    expect(game.state.milkLeft).toBe(2);
    expect(game.state.sugarLeft).toBeGreaterThanOrEqual(2);
  });
});
