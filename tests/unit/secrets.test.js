import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { laneAngle } from '../../src/gameplay/arena.js';
import { modifiersFor } from '../../src/gameplay/fortunes.js';
import { spawnPrismatic } from '../../src/gameplay/prismatic.js';
import { findSecrets } from '../../src/gameplay/secrets.js';
import { sugarCapacity } from '../../src/gameplay/weapons.js';
import { brewNext, completeRound, killOne, placeEnemy, playingGame, step } from './helpers.js';

const S = CONFIG.secrets;

/** Fire one shot down lane 0. */
function fire(game) {
  game.state.angle = laneAngle(0);
  game.state.shotCooldown = 0;
  game.fireSteam();
}

/** A game whose gameplay generator can be told to roll low (so the cream always carries). */
function creamyGame() {
  const rng = createRandom(1);
  const game = createGame({ random: rng });
  game.primaryAction();
  game.state.spawnTimer = Infinity;
  rng.next = () => 0;
  return game;
}

describe('steam shots', () => {
  it('count as wasted only once every dart has fizzled out', () => {
    const game = playingGame();
    fire(game);
    expect(game.state.roundStats.volleys).toBe(1);
    step(game, 1);
    expect(game.state.shots).toHaveLength(0);
    expect(game.state.roundStats.wastedVolleys).toBe(1);
    expect(game.state.volleys).toEqual({});
  });

  it('count a Double Trouble pair as one shot that hits if either dart does', () => {
    const game = playingGame();
    game.state.modifiers = modifiersFor('doubleTrouble');
    placeEnemy(game.state, { lane: 0, radius: 245 }); // close to the rim, before the darts part
    fire(game);
    step(game, 1);
    expect(game.state.roundStats).toMatchObject({ volleys: 1, wastedVolleys: 0, steamKills: 1 });
  });

  it('hit when they strike a sugar cube', () => {
    const game = playingGame();
    spawnPrismatic({ state: game.state, rng: createRandom(2), emit: () => {} });
    game.state.angle = game.state.prismatic.angle;
    game.fireSteam();
    step(game, 1.2);
    expect(game.state.roundStats).toMatchObject({ volleys: 1, wastedVolleys: 0, steamKills: 0 });
  });

  it('leave sugar and the Steam Nova out of the count', () => {
    const game = playingGame();
    game.sugarBurst();
    placeEnemy(game.state, { lane: 4, radius: 200 });
    spawnPrismatic({ state: game.state, rng: createRandom(2), emit: () => {} });
    game.state.angle = game.state.prismatic.angle;
    game.fireSteam();
    step(game, 1.2);
    expect(game.state.roundStats).toMatchObject({ volleys: 1, wastedVolleys: 0, steamKills: 0 });
    expect(game.state.kills).toBe(1);
  });
});

describe('the cream', () => {
  it('sometimes carries a steam dart through a leaf in a milk cloud and on to the next', () => {
    const game = creamyGame();
    game.state.angle = laneAngle(0);
    game.pourMilk();
    placeEnemy(game.state, { lane: 0, radius: 200 });
    placeEnemy(game.state, { lane: 0, radius: 110 });
    game.state.shotCooldown = 0;
    game.fireSteam();
    step(game, 0.15);
    expect(game.state.shots[0]).toMatchObject({ cream: true });
    step(game, 0.5);
    expect(game.state.kills).toBe(2);
    expect(game.state.roundStats).toMatchObject({ volleys: 1, steamKills: 2 });
  });

  it('carries a dart only once, and never outside the milk', () => {
    const game = creamyGame();
    game.state.angle = laneAngle(0);
    game.pourMilk();
    for (const radius of [220, 160, 100]) placeEnemy(game.state, { lane: 0, radius });
    fire(game);
    step(game, 1);
    expect(game.state.kills).toBe(2);

    const dry = creamyGame();
    for (const radius of [200, 110]) placeEnemy(dry.state, { lane: 0, radius });
    fire(dry);
    step(dry, 1);
    expect(dry.state.kills).toBe(1);
  });
});

describe('secrets', () => {
  it('judge a round from its stats', () => {
    const perfect = { volleys: S.perfectMinVolleys, wastedVolleys: 0, steamKills: S.perfectMinVolleys };
    expect(findSecrets(perfect)).toEqual(['notADropWasted']);
    expect(findSecrets({ ...perfect, wastedVolleys: 1 })).toEqual([]);
    expect(findSecrets({ ...perfect, volleys: S.perfectMinVolleys - 1, steamKills: 0 })).toEqual([]);
    expect(findSecrets({ volleys: S.thriftyMinVolleys, wastedVolleys: 2, steamKills: S.thriftyMinVolleys + 1 }))
      .toEqual(['moreLeavesThanSteam']);
    expect(findSecrets({ volleys: 2, wastedVolleys: 0, steamKills: 4 })).toEqual([]); // too few shots to count
  });

  it('reward a perfect round with points and sugar for the next cup', () => {
    const game = playingGame();
    for (let i = 0; i < game.state.target - 1; i++) killOne(game);
    const score = game.state.score;
    killOne(game);
    expect(game.state.phase).toBe('reading');
    expect(game.state.secrets).toEqual(['notADropWasted']);
    expect(game.drainEvents().filter((e) => e.type === 'secret')).toHaveLength(1);
    expect(game.state.score).toBe(score + CONFIG.scoring.steamKill + S.perfectPoints);
    game.state.nextFortune = 'star';
    brewNext(game);
    expect(game.state.secrets).toEqual([]);
    expect(game.state.sugarLeft).toBe(sugarCapacity(game.state) + S.perfectSugar);
    completeRound(game);
    game.state.nextFortune = 'star';
    brewNext(game);
    expect(game.state.sugarLeft).toBe(sugarCapacity(game.state)); // only once
  });

  it('say nothing after a round with a wasted shot', () => {
    const game = playingGame();
    fire(game);
    step(game, 1);
    for (let i = 0; i < game.state.target; i++) killOne(game);
    expect(game.state.phase).toBe('reading');
    expect(game.state.secrets).toEqual([]);
  });

  it('gild the spoon when steam outnumbers its shots', () => {
    const game = playingGame();
    Object.assign(game.state.roundStats, { volleys: 9, steamKills: 12, wastedVolleys: 1 });
    completeRound(game);
    expect(game.state.secrets).toEqual(['moreLeavesThanSteam']);
    expect(game.state.goldenSpoon).toBe(CONFIG.goldenSpoon.duration);
  });
});
