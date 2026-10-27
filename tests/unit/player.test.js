import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { TAU, laneAngle, normalizeAngle } from '../../src/gameplay/arena.js';
import { playingGame, step } from './helpers.js';

describe('spoon movement', () => {
  it('starts each round at the top of the cup', () => {
    const game = playingGame();
    expect(game.state.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('turns at the configured speed in each direction', () => {
    const game = playingGame();
    const start = normalizeAngle(game.state.angle);
    step(game, 0.5, { left: false, right: true, fire: false });
    expect(normalizeAngle(game.state.angle - start)).toBeCloseTo(CONFIG.player.turnSpeed * 0.5, 5);

    const before = game.state.angle;
    step(game, 0.25, { left: true, right: false, fire: false });
    expect(normalizeAngle(before - game.state.angle)).toBeCloseTo(CONFIG.player.turnSpeed * 0.25, 5);
  });

  it('stays still when both directions are held', () => {
    const game = playingGame();
    const before = game.state.angle;
    step(game, 1, { left: true, right: true, fire: false });
    expect(game.state.angle).toBeCloseTo(normalizeAngle(before));
  });

  it('keeps its angle within one turn of the cup', () => {
    const game = playingGame();
    step(game, 10, { left: true, right: false, fire: false });
    expect(game.state.angle).toBeGreaterThanOrEqual(0);
    expect(game.state.angle).toBeLessThan(TAU);
  });

  it('does not move unless a round is in play', () => {
    const game = playingGame();
    game.pause();
    const before = game.state.angle;
    step(game, 1, { left: true, right: false, fire: false });
    expect(game.state.angle).toBe(before);
  });

  it('fires down the lane nearest to the spoon', () => {
    const game = playingGame();
    game.state.angle = laneAngle(5) + 0.1;
    game.fireSteam();
    expect(game.state.shots[0].angle).toBeCloseTo(laneAngle(5));
  });
});
