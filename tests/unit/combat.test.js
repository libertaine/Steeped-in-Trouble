import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { LANE_STEP, laneAngle } from '../../src/gameplay/arena.js';
import { findStrikingShot, killScore } from '../../src/gameplay/weapons.js';
import { modifiersFor } from '../../src/gameplay/fortunes.js';
import { killOne, placeEnemy, playingGame, step } from './helpers.js';

const shot = (lane, radius, sugar = false) => ({ angle: laneAngle(lane), radius, speed: 450, sugar });

describe('collisions', () => {
  it('hits a leaf in the same lane within the radial tolerance', () => {
    const enemy = { angle: laneAngle(2), radius: 100 };
    expect(findStrikingShot([shot(2, 116)], enemy)).toBe(0);
    expect(findStrikingShot([shot(2, 117)], enemy)).toBe(-1);
  });

  it('only hits within half a lane sideways', () => {
    const enemy = { angle: laneAngle(2), radius: 100 };
    const near = { ...shot(2, 100), angle: laneAngle(2) + LANE_STEP * 0.47 };
    const far = { ...shot(2, 100), angle: laneAngle(2) + LANE_STEP * 0.49 };
    expect(findStrikingShot([near], enemy)).toBe(0);
    expect(findStrikingShot([far], enemy)).toBe(-1);
    expect(findStrikingShot([shot(3, 100)], enemy)).toBe(-1);
  });

  it('prefers the most recently fired dart', () => {
    const enemy = { angle: laneAngle(0), radius: 100 };
    expect(findStrikingShot([shot(0, 100), shot(0, 105)], enemy)).toBe(1);
  });

  it('removes both the dart and the leaf on a hit', () => {
    const game = playingGame();
    killOne(game);
    expect(game.state.enemies).toHaveLength(0);
    expect(game.state.shots).toHaveLength(0);
    expect(game.state.kills).toBe(1);
  });

  it('lets darts pass leaves in other lanes', () => {
    const game = playingGame();
    placeEnemy(game.state, { lane: 4, radius: 200 });
    game.fireSteam();
    step(game, 0.25);
    expect(game.state.enemies).toHaveLength(1);
    expect(game.state.kills).toBe(0);
  });

  it('removes darts that reach the centre of the cup', () => {
    const game = playingGame();
    game.fireSteam();
    step(game, 1);
    expect(game.state.shots).toHaveLength(0);
  });

  it('limits steam to one dart per cooldown', () => {
    const game = playingGame();
    step(game, 0.5, { left: false, right: false, fire: true });
    // Fired at t=0 then every 0.19 s: 0, ~0.2, ~0.4.
    expect(game.state.shots.length + game.state.kills).toBe(3);
  });
});

describe('scoring', () => {
  it('scores 10 for steam and 15 for sugar kills', () => {
    expect(killScore(shot(0, 0), modifiersFor(null))).toBe(10);
    expect(killScore(shot(0, 0, true), modifiersFor(null))).toBe(15);
  });

  it('adds 25% per kill under The Spiral, rounded', () => {
    expect(killScore(shot(0, 0), modifiersFor('spiral'))).toBe(13);
    expect(killScore(shot(0, 0, true), modifiersFor('spiral'))).toBe(19);
  });

  it('accumulates score as leaves are cleared', () => {
    const game = playingGame();
    killOne(game);
    killOne(game);
    expect(game.state.score).toBe(20);
  });

  it('awards sugar points for sugar-dart kills', () => {
    const game = playingGame();
    placeEnemy(game.state, { lane: 0, radius: 200 });
    game.sugarBurst();
    step(game, 0.25);
    expect(game.state.score).toBe(CONFIG.scoring.sugarKill);
  });
});

describe('lives and game over', () => {
  it('loses a life when a leaf reaches the rim', () => {
    const game = playingGame();
    placeEnemy(game.state, { lane: 3, radius: CONFIG.arena.rimRadius - 5, speed: 40 });
    step(game, 0.2);
    expect(game.state.lives).toBe(CONFIG.lives - 1);
    expect(game.state.enemies).toHaveLength(0);
    expect(game.drainEvents().map((e) => e.type)).toContain('escape');
  });

  it('ends the game when the last life is lost', () => {
    const game = playingGame();
    game.state.lives = 1;
    placeEnemy(game.state, { lane: 3, radius: CONFIG.arena.rimRadius - 5, speed: 40 });
    placeEnemy(game.state, { lane: 9, radius: 150, speed: 0 });
    step(game, 0.2);
    expect(game.state.phase).toBe('gameover');
    expect(game.state.lives).toBe(0);
    expect(game.state.enemies).toHaveLength(0);
    expect(game.drainEvents().map((e) => e.type)).toEqual(['escape', 'gameover']);
  });

  it('ignores gameplay commands after game over', () => {
    const game = playingGame();
    game.state.lives = 1;
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    expect(game.fireSteam()).toBe(false);
    expect(game.pourMilk()).toBe(false);
    expect(game.togglePause()).toBe(false);
  });
});
