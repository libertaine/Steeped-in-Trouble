import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import {
  BASE_MODIFIERS, FORTUNES, FORTUNE_PRIORITY, glyphPoint, modifiersFor, readLeafPattern, selectFortune,
} from '../../src/gameplay/fortunes.js';
import { completeRound, killOne, placeEnemy, playingGame, step } from './helpers.js';

const lanesEach = (lanes, perLane = 1) => lanes.flatMap((lane) => new Array(perLane).fill(lane));

describe('reading the leaves', () => {
  it('finds the densest run of three adjacent lanes, wrapping around the cup', () => {
    const reading = readLeafPattern([15, 15, 0, 1, 7]);
    expect(reading.maxCluster).toBe(4);
    expect(reading.clusterShare).toBeCloseTo(0.8);
    expect(reading.occupiedLanes).toBe(4);
    expect(reading.total).toBe(5);
  });

  it('handles an empty cup', () => {
    expect(readLeafPattern([])).toMatchObject({ total: 0, maxCluster: 0, clusterShare: 0, occupiedLanes: 0 });
  });
});

describe('fortune selection', () => {
  const scattered = lanesEach([0, 2, 4, 6, 8, 10, 12, 14, 1, 9, 5]); // 11 lanes, no cluster
  const clustered = [...lanesEach([3, 4, 5], 3), 10, 12]; // 9 of 11 in three lanes

  it('chooses The Veil for three or more milk kills, above all else', () => {
    expect(selectFortune({ milkKills: 3, leafLanes: clustered })).toBe('veil');
    expect(selectFortune({ milkKills: 2, leafLanes: clustered })).not.toBe('veil');
  });

  it('chooses The Crown when 40% of leaves sit in three adjacent lanes', () => {
    expect(selectFortune({ milkKills: 0, leafLanes: clustered })).toBe('crown');
    // 2 of 5 = exactly 40%
    expect(selectFortune({ milkKills: 0, leafLanes: [0, 1, 5, 8, 11] })).toBe('crown');
  });

  it('chooses The Spiral when leaves cover ten or more lanes without a cluster', () => {
    expect(selectFortune({ milkKills: 0, leafLanes: scattered })).toBe('spiral');
  });

  it('falls back to The Star', () => {
    const fewLanes = lanesEach([0, 4, 8, 12], 2); // 2 of 8 per cluster = 25%, 4 lanes
    expect(selectFortune({ milkKills: 0, leafLanes: fewLanes })).toBe('star');
  });

  it('treats an empty cup as a clear cup', () => {
    expect(selectFortune({ milkKills: 0, leafLanes: [] })).toBe('star');
  });

  it('checks every fortune in priority order', () => {
    expect([...FORTUNE_PRIORITY].sort()).toEqual(Object.keys(FORTUNES).sort());
    expect(FORTUNE_PRIORITY.at(-1)).toBe('star');
  });

  it('reads the leaves from the completed round in a real game', () => {
    const game = playingGame();
    game.pourMilk(); // lane 0
    killOne(game);
    killOne(game);
    completeRound(game); // third milk kill ends the round
    expect(game.state.nextFortune).toBe('veil');
    const event = game.drainEvents().find((e) => e.type === 'reading');
    expect(event.fortune).toBe('veil');
  });
});

describe('fortune modifiers', () => {
  it('applies no modifiers without a fortune', () => {
    expect(modifiersFor(null)).toEqual(BASE_MODIFIERS);
  });

  it('defines one explicit modifier set per fortune', () => {
    expect(modifiersFor('crown')).toMatchObject({ bonusSugar: 1 });
    expect(modifiersFor('veil')).toMatchObject({ milkDurationBonus: 2.5 });
    expect(modifiersFor('spiral')).toMatchObject({ laneDrift: true, scoreMultiplier: 1.25 });
    expect(modifiersFor('star')).toMatchObject({ steamSpeedMultiplier: 1.35 });
  });

  it('only declares modifiers that have a neutral default', () => {
    for (const fortune of Object.values(FORTUNES)) {
      for (const key of Object.keys(fortune.modifiers)) expect(BASE_MODIFIERS).toHaveProperty(key);
    }
  });
});

/** Play round 1 to a chosen fortune, then start round 2 under it. */
function gameWithFortune(id) {
  const game = playingGame();
  completeRound(game);
  game.state.nextFortune = id; // as if the leaves had read `id`
  game.primaryAction();
  game.state.spawnTimer = Infinity;
  return game;
}

describe('applying and expiring fortune effects', () => {
  it('reveals the fortune during the reading but applies it only next round', () => {
    const game = playingGame();
    completeRound(game);
    expect(game.state.fortune).toBeNull();
    expect(game.state.modifiers).toEqual(BASE_MODIFIERS);
    const id = game.state.nextFortune;
    game.primaryAction();
    expect(game.state.fortune).toBe(id);
    expect(game.state.modifiers).toEqual(modifiersFor(id));
  });

  it('The Crown grants one extra sugar burst', () => {
    expect(gameWithFortune('crown').state.sugarLeft).toBe(3);
  });

  it('The Veil makes milk clouds last 2.5 s longer', () => {
    const game = gameWithFortune('veil');
    game.pourMilk();
    expect(game.state.clouds[0].duration).toBeCloseTo(CONFIG.milk.duration + 2.5);
  });

  it('The Star speeds up regular steam darts by 35%', () => {
    const game = gameWithFortune('star');
    game.fireSteam();
    expect(game.state.shots[0].speed).toBeCloseTo(CONFIG.steam.speed * 1.35);
  });

  it('The Spiral drifts each leaf one lane once it passes radius 140', () => {
    const game = gameWithFortune('spiral');
    const enemy = placeEnemy(game.state, { lane: 4, radius: 135, speed: 40 });
    const startAngle = enemy.angle;
    step(game, 0.5);
    expect(enemy.shifted).toBe(true);
    expect(Math.abs(enemy.angle - startAngle)).toBeCloseTo(Math.PI / 8);
    const driftedAngle = enemy.angle;
    step(game, 0.5);
    expect(enemy.angle).toBe(driftedAngle); // only once
  });

  it('expires when the following round starts', () => {
    const game = gameWithFortune('crown');
    completeRound(game);
    game.state.nextFortune = 'star';
    game.primaryAction();
    expect(game.state.sugarLeft).toBe(2);
    expect(game.state.modifiers.bonusSugar).toBe(0);
  });

  it('is cleared by a new match', () => {
    const game = gameWithFortune('crown');
    game.state.lives = 1;
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    game.primaryAction();
    expect(game.state.fortune).toBeNull();
    expect(game.state.sugarLeft).toBe(2);
  });
});

describe('fortune glyphs', () => {
  it('lays every leaf out within the cup for every fortune', () => {
    for (const id of Object.keys(FORTUNES)) {
      for (let i = 0; i < 40; i++) {
        const { x, y } = glyphPoint(id, i, 40);
        expect(Math.hypot(x, y)).toBeLessThan(CONFIG.arena.rimRadius);
      }
    }
  });

  it('handles a single leaf', () => {
    expect(Number.isFinite(glyphPoint('crown', 0, 1).x)).toBe(true);
  });
});
