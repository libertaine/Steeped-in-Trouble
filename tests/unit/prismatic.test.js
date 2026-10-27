import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { modifiersFor } from '../../src/gameplay/fortunes.js';
import { rollPrismatic, spawnPrismatic } from '../../src/gameplay/prismatic.js';
import { steamSpeed } from '../../src/gameplay/weapons.js';
import { brewNext, completeRound, placeEnemy, playingGame, step } from './helpers.js';

const P = CONFIG.prismatic;
const LANES = CONFIG.arena.lanes;
const types = (game) => game.drainEvents().map((e) => e.type);

/** A game in play with the prismatic cube on the field. */
function withCube(seed = 1) {
  const game = playingGame({ seed });
  spawnPrismatic({ state: game.state, rng: createRandom(seed), emit: () => {} });
  return game;
}

/** Steam the cube. */
function strike(game) {
  game.state.angle = game.state.prismatic.angle;
  game.state.shotCooldown = 0;
  game.fireSteam();
  for (let t = 0; t < 0.5 && game.state.prismatic; t += 1 / 60) step(game, 1 / 60);
}

describe('the Prismatic Sugar Cube', () => {
  it('never appears in the first cup, and only sometimes after', () => {
    expect(rollPrismatic(1, { next: () => 0, range: () => 1 })).toBeNull();
    expect(rollPrismatic(P.firstRound, { next: () => P.chance + 0.01, range: () => 1 })).toBeNull();
    const lucky = { next: () => 0, range: (min, max) => (min + max) / 2 };
    expect(rollPrismatic(P.firstRound, lucky)).toBe((P.delayMin + P.delayMax) / 2);
  });

  it('turns up in roughly the expected share of later rounds, under any fortune', () => {
    const rng = createRandom(3);
    let shown = 0;
    for (let i = 0; i < 2000; i++) if (rollPrismatic(5, rng) !== null) shown++;
    expect(shown / 2000).toBeGreaterThan(P.chance - 0.04);
    expect(shown / 2000).toBeLessThan(P.chance + 0.04);
  });

  it('appears when its timer runs out, then fades quickly', () => {
    const game = playingGame();
    game.state.prismaticTimer = 0.5;
    step(game, 0.55);
    expect(game.state.prismatic).not.toBeNull();
    expect(types(game)).toContain('prismaticAppear');
    step(game, P.life + 0.1);
    expect(game.state.prismatic).toBeNull();
    expect(types(game)).toContain('prismaticGone');
  });

  it('sets off a Steam Nova down every lane when steamed', () => {
    const game = withCube();
    strike(game);
    expect(game.state.prismatic).toBeNull();
    const events = game.drainEvents();
    expect(events.map((e) => e.type)).toContain('prismaticCatch');
    expect(events.find((e) => e.type === 'nova')).toMatchObject({ count: LANES, twin: false, golden: false });
    const nova = game.state.shots.filter((s) => s.nova);
    expect(new Set(nova.map((s) => Math.round(s.angle * 1000))).size).toBe(LANES);
    expect(nova.every((s) => !s.sugar && s.speed === steamSpeed(game.state))).toBe(true);
  });

  it('clears leaves in many lanes at once', () => {
    const game = withCube();
    for (let lane = 0; lane < LANES; lane += 2) placeEnemy(game.state, { lane, radius: 90 });
    strike(game);
    const before = game.state.kills;
    step(game, 0.6);
    expect(game.state.kills - before).toBe(LANES / 2);
  });

  it('carries Double Trouble and the Golden Spoon into every lane', () => {
    const game = withCube();
    game.state.modifiers = modifiersFor('doubleTrouble');
    game.state.goldenSpoon = CONFIG.goldenSpoon.duration;
    strike(game);
    const nova = game.drainEvents().find((e) => e.type === 'nova');
    expect(nova).toMatchObject({ count: LANES * 2, twin: true, golden: true });
    expect(game.state.shots.filter((s) => s.nova).every((s) => s.golden)).toBe(true);
  });

  it('vanishes when the round ends', () => {
    const game = withCube();
    game.state.prismaticTimer = 3;
    completeRound(game);
    expect(game.state.prismatic).toBeNull();
    expect(game.state.prismaticTimer).toBeNull();
    game.state.nextFortune = 'star';
    brewNext(game);
    expect(game.state.prismatic).toBeNull();
  });
});
