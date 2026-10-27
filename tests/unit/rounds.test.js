import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { nextSpawnDelay } from '../../src/gameplay/enemies.js';
import { createRandom } from '../../src/core/random.js';
import { completeRound, killOne, placeEnemy, playingGame, step } from './helpers.js';

describe('phases', () => {
  it('starts ready and begins round 1 on the main action', () => {
    const game = createGame({ seed: 3 });
    expect(game.state.phase).toBe('ready');
    game.primaryAction();
    expect(game.state.phase).toBe('playing');
    expect(game.state.round).toBe(1);
    expect(game.drainEvents().map((e) => e.type)).toEqual(['matchStart', 'roundStart']);
  });

  it('pauses and resumes without advancing the simulation', () => {
    const game = playingGame();
    const enemy = placeEnemy(game.state, { radius: 100, speed: 40 });
    game.togglePause();
    expect(game.state.phase).toBe('paused');
    step(game, 1);
    expect(enemy.radius).toBe(100);
    game.togglePause();
    expect(game.state.phase).toBe('playing');
    step(game, 0.5);
    expect(enemy.radius).toBeGreaterThan(100);
  });

  it('only accepts Enter in ready, reading, and game-over phases', () => {
    const game = createGame({ seed: 1 });
    expect(game.confirm()).toBe(true); // ready → playing
    expect(game.confirm()).toBe(false); // playing: Enter does nothing
    expect(game.state.phase).toBe('playing');
  });

  it('only accepts P during a round', () => {
    const game = createGame({ seed: 1 });
    expect(game.togglePause()).toBe(false);
    expect(game.state.phase).toBe('ready');
  });

  it('pause() is a no-op outside play', () => {
    const game = createGame({ seed: 1 });
    game.pause();
    expect(game.state.phase).toBe('ready');
  });
});

describe('round progression', () => {
  it('requires 16 kills in round 1 and four more each round', () => {
    const game = playingGame();
    expect(game.state.target).toBe(16);
    completeRound(game);
    expect(game.state.phase).toBe('reading');
    game.primaryAction();
    expect(game.state.round).toBe(2);
    expect(game.state.target).toBe(20);
    completeRound(game);
    game.primaryAction();
    expect(game.state.round).toBe(3);
    expect(game.state.target).toBe(24);
  });

  it('clears the field and starts the reading when the target is reached', () => {
    const game = playingGame();
    placeEnemy(game.state, { lane: 8, radius: 100 });
    game.pourMilk();
    completeRound(game);
    expect(game.state.phase).toBe('reading');
    expect(game.state.enemies).toHaveLength(0);
    expect(game.state.shots).toHaveLength(0);
    expect(game.state.clouds).toHaveLength(0);
    expect(game.state.nextFortune).toBeTruthy();
  });

  it('advances the reading animation clock only during the reading', () => {
    const game = playingGame();
    completeRound(game);
    const before = game.state.readingTime;
    step(game, 1);
    expect(game.state.readingTime - before).toBeCloseTo(1, 5);
  });

  it('resets kills and the spoon position at each round start', () => {
    const game = playingGame();
    completeRound(game);
    game.state.angle = 1;
    game.primaryAction();
    expect(game.state.kills).toBe(0);
    expect(game.state.angle).toBeCloseTo(CONFIG.player.startAngle);
  });

  it('makes leaves faster in later rounds, capped at +55', () => {
    const r1 = playingGame({ seed: 9, spawning: true });
    step(r1, 1);
    const fast = playingGame({ seed: 9, spawning: true });
    fast.state.round = 20;
    step(fast, 1);
    const bonus = fast.state.enemies[0].speed - r1.state.enemies[0].speed;
    expect(bonus).toBeCloseTo(CONFIG.enemies.maxRoundSpeedBonus - CONFIG.enemies.speedPerRound, 5);
  });

  it('spawns faster in later rounds within the configured bounds', () => {
    const delays = (round) => {
      const rng = createRandom(5);
      return nextSpawnDelay(round, rng);
    };
    expect(delays(1)).toBeCloseTo(1.095 * createRandom(5).range(0.72, 1.36), 10);
    expect(delays(20)).toBeCloseTo(0.57 * createRandom(5).range(0.72, 1.36), 10);
    expect(delays(1)).toBeGreaterThan(delays(10));
  });

  it('never has more than 18 leaves in the cup', () => {
    const game = playingGame({ spawning: true });
    for (let i = 0; i < 18; i++) placeEnemy(game.state, { lane: i % 16, radius: 50 });
    step(game, 3);
    expect(game.state.enemies.length).toBe(18);
  });
});

describe('tea-leaf residue', () => {
  it('leaves one leaf in the cup per kill, recording the lane', () => {
    const game = playingGame();
    killOne(game, 0);
    killOne(game, 3);
    expect(game.state.residue.map((leaf) => leaf.lane)).toEqual([0, 3]);
  });

  it('scatters leaves within the configured radius', () => {
    const game = playingGame();
    for (let i = 0; i < 10; i++) killOne(game);
    for (const leaf of game.state.residue) {
      expect(leaf.radius).toBeGreaterThanOrEqual(CONFIG.residue.radiusMin);
      expect(leaf.radius).toBeLessThan(CONFIG.residue.radiusMax);
    }
  });

  it('keeps at most 90 leaves, discarding the oldest', () => {
    const game = playingGame();
    game.state.target = 1000;
    for (let i = 0; i < 95; i++) killOne(game);
    expect(game.state.residue).toHaveLength(CONFIG.residue.maxLeaves);
  });

  it('empties the cup when the next round starts', () => {
    const game = playingGame();
    completeRound(game);
    expect(game.state.residue.length).toBeGreaterThan(0);
    game.primaryAction();
    expect(game.state.residue).toHaveLength(0);
  });

  it('counts kills made beside a milk cloud for the reading', () => {
    const game = playingGame();
    game.pourMilk();
    killOne(game);
    killOne(game);
    expect(game.state.roundStats.milkKills).toBe(2);
  });
});

describe('resetting a match', () => {
  it('restores round, score, lives, fortune, and resources', () => {
    const game = playingGame();
    killOne(game);
    completeRound(game);
    game.primaryAction(); // round 2 with a fortune
    game.state.lives = 1;
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    expect(game.state.phase).toBe('gameover');

    game.primaryAction();
    const s = game.state;
    expect(s.phase).toBe('playing');
    expect([s.round, s.score, s.lives, s.kills, s.target]).toEqual([1, 0, 3, 0, 16]);
    expect(s.fortune).toBeNull();
    expect(s.nextFortune).toBeNull();
    expect(s.modifiers.bonusSugar).toBe(0);
    expect([s.milkLeft, s.sugarLeft]).toEqual([2, 2]);
    expect(s.residue).toHaveLength(0);
  });

  it('restarts with R only from game over', () => {
    const game = playingGame();
    expect(game.restart()).toBe(false);
    game.state.lives = 1;
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    expect(game.restart()).toBe(true);
    expect(game.state.phase).toBe('playing');
  });
});
