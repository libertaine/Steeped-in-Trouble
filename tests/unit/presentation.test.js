import { describe, expect, it } from 'vitest';
import { createLoop, frameDelta } from '../../src/core/timing.js';
import { createEffects } from '../../src/rendering/effects.js';
import { hudText } from '../../src/ui/hud.js';
import { createGame } from '../../src/core/game.js';
import { completeRound, playingGame } from './helpers.js';

describe('frame timing', () => {
  it('converts frame intervals to seconds', () => {
    expect(frameDelta(1016, 1000)).toBeCloseTo(0.016);
  });

  it('caps long gaps so a background tab cannot cause a simulation jump', () => {
    expect(frameDelta(60_000, 0)).toBe(0.04);
  });

  it('ignores negative or invalid intervals', () => {
    expect(frameDelta(900, 1000)).toBe(0);
    expect(frameDelta(Number.NaN, 0)).toBe(0);
  });
});

describe('animation loop', () => {
  function fakeFrames() {
    const queue = new Map();
    let id = 0;
    return {
      requestFrame: (cb) => (queue.set(++id, cb), id),
      cancelFrame: (handle) => queue.delete(handle),
      now: () => 0,
      get pending() {
        return queue.size;
      },
      tick(time) {
        const callbacks = [...queue.values()];
        queue.clear();
        for (const cb of callbacks) cb(time);
      },
    };
  }

  it('never runs two loops when started twice', () => {
    const frames = fakeFrames();
    const steps = [];
    const loop = createLoop((dt) => steps.push(dt), frames);
    loop.start();
    loop.start();
    expect(frames.pending).toBe(1);
    frames.tick(16);
    frames.tick(32);
    expect(steps).toHaveLength(2);
  });

  it('stops cleanly and can restart', () => {
    const frames = fakeFrames();
    const loop = createLoop(() => {}, frames);
    loop.start();
    loop.stop();
    expect(loop.running).toBe(false);
    expect(frames.pending).toBe(0);
    loop.start();
    expect(frames.pending).toBe(1);
  });
});

describe('HUD text', () => {
  it('shows the ready state', () => {
    const text = hudText(createGame({ seed: 1 }).state);
    expect(text).toMatchObject({
      hudStatus: 'READY TO BREW',
      hudScore: 'SCORE 0000',
      hudLives: 'CUPS ♥ ♥ ♥ ',
      roundNum: '01',
      killCount: '0 / 16',
      mainBtn: 'Brew the first cup →',
      fortuneName: 'Not yet written',
    });
  });

  it('shows lost lives and the fortune being read', () => {
    const game = playingGame();
    game.state.lives = 2;
    completeRound(game);
    const text = hudText(game.state);
    expect(text.hudLives).toBe('CUPS ♥ ♥ ♡ ');
    expect(text.hudStatus).toBe('READING THE LEAVES');
    expect(text.fortuneLabel).toBe('Fortune for the next cup');
    expect(text.fortuneName).toMatch(/^The /);
  });
});

describe('effects', () => {
  it('creates particles for kills and a flash for spills without touching game state', () => {
    const effects = createEffects({ random: () => 0.5 });
    const event = Object.freeze({ type: 'kill', radius: 100, angle: 0, sugar: false });
    effects.handle(event);
    expect(effects.fx.particles).toHaveLength(9);
    effects.handle({ type: 'escape', angle: 0 });
    expect(effects.fx.flash).toBe(0.5);
    effects.update(1);
    expect(effects.fx.particles).toHaveLength(0);
    expect(effects.fx.flash).toBe(0);
  });

  it('clears particles when a round starts', () => {
    const effects = createEffects();
    effects.handle({ type: 'milk', angle: 0 });
    effects.handle({ type: 'roundStart' });
    expect(effects.fx.particles).toHaveLength(0);
  });
});
