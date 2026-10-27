import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { createEffects } from '../../src/rendering/effects.js';

/**
 * Play a scripted match for a number of fixed steps: sweep the spoon back and
 * forth while firing, pour milk and sugar on a schedule, take upgrades, and
 * keep brewing new cups after readings and game overs.
 */
function scriptedRun(seed, steps = 60 * 60) {
  const game = createGame({ seed });
  const log = [];
  game.primaryAction();
  for (let i = 0; i < steps; i++) {
    const sweepRight = Math.floor(i / 90) % 2 === 0;
    const input = { left: !sweepRight, right: sweepRight, fire: true };
    if (i % 400 === 100) game.pourMilk();
    if (i % 500 === 250) game.sugarBurst();
    game.update(1 / 60, input);
    if (game.offerOpen()) game.chooseUpgrade(i % 2);
    else if (game.state.phase === 'reading' && game.state.readingTime > 1) game.primaryAction();
    if (game.state.phase === 'gameover') game.primaryAction();
    for (const event of game.drainEvents()) log.push(`${i}:${event.type}`);
  }
  return { state: JSON.stringify(game.state), log };
}

describe('seeded random numbers', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different sequences for different seeds', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    expect([a.next(), a.next()]).not.toEqual([b.next(), b.next()]);
  });

  it('stays within the requested ranges', () => {
    const rng = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(5);
      const n = rng.int(16);
      expect(Number.isInteger(n) && n >= 0 && n < 16).toBe(true);
    }
  });
});

describe('deterministic gameplay', () => {
  it('replays an identical match from the same seed', () => {
    const first = scriptedRun(1234);
    const second = scriptedRun(1234);
    expect(second.log).toEqual(first.log);
    expect(second.state).toBe(first.state);
    expect(first.log.some((entry) => entry.endsWith(':kill'))).toBe(true);
  });

  it('plays differently with a different seed', () => {
    expect(scriptedRun(1).state).not.toBe(scriptedRun(2).state);
  });

  it('exposes the seed so a match can be reproduced', () => {
    expect(createGame({ seed: 99 }).seed).toBe(99);
  });

  it('is unaffected by cosmetic effects consuming randomness', () => {
    const plain = createGame({ seed: 5 });
    const decorated = createGame({ seed: 5 });
    const effects = createEffects();
    plain.primaryAction();
    decorated.primaryAction();
    const input = { left: false, right: true, fire: true };
    for (let i = 0; i < 1200; i++) {
      plain.update(1 / 60, input);
      decorated.update(1 / 60, input);
      for (const event of decorated.drainEvents()) effects.handle(event);
      effects.update(1 / 60);
    }
    expect(JSON.stringify(decorated.state)).toBe(JSON.stringify(plain.state));
  });
});
