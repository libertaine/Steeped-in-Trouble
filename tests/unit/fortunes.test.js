import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import {
  BASE_MODIFIERS, FORTUNES, FORTUNE_PRIORITY, drawFortune, fortuneWeights, glyphPoint, modifiersFor, readLeafPattern,
  selectFortune,
} from '../../src/gameplay/fortunes.js';
import { awardGolden } from '../../src/gameplay/golden.js';
import { LANE_STEP, angleDifference, laneAngle } from '../../src/gameplay/arena.js';
import { brewNext, completeRound, killOne, placeEnemy, playingGame, step } from './helpers.js';

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

  it('checks the four pattern fortunes in priority order', () => {
    expect(FORTUNE_PRIORITY).toEqual(['veil', 'crown', 'spiral', 'star']);
    for (const id of FORTUNE_PRIORITY) expect(FORTUNES[id].matches).toBeTypeOf('function');
  });

  it('reads the leaves from the completed round in a real game', () => {
    const game = playingGame();
    game.pourMilk(); // lane 0
    killOne(game);
    killOne(game);
    completeRound(game); // third milk kill ends the round
    expect(FORTUNES[game.state.nextFortune]).toBeDefined();
    const event = game.drainEvents().find((e) => e.type === 'reading');
    expect(event.fortune).toBe(game.state.nextFortune);
  });
});

describe('drawing a fortune', () => {
  const plain = { milkKills: 0, milkUses: 0, sugarUses: 0, escapes: 1, leafLanes: [0, 4, 8, 12] }; // points at The Star

  /** How often each fortune comes up over many draws. */
  function tally(record, draws = 4000) {
    const rng = createRandom(11);
    const counts = Object.fromEntries(Object.keys(FORTUNES).map((id) => [id, 0]));
    for (let i = 0; i < draws; i++) counts[drawFortune(record, rng)]++;
    return counts;
  }

  it('can produce every fortune, and favours the pattern the leaves formed', () => {
    const counts = tally(plain);
    for (const id of Object.keys(FORTUNES)) expect(counts[id]).toBeGreaterThan(0);
    const [favourite] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    expect(favourite).toBe('star');
    expect(counts.star).toBeLessThan(4000 * 0.6); // a tendency, not a guarantee
  });

  it('keeps The Leaves Lie rare', () => {
    expect(tally(plain).lie / 4000).toBeLessThan(0.06);
  });

  it('leans towards Sugar Rush after heavy sugar use', () => {
    expect(tally({ ...plain, sugarUses: 3 }).sugarRush).toBeGreaterThan(tally(plain).sugarRush * 1.5);
  });

  it('leans towards defence after frequent milk use, and trouble after spills', () => {
    const base = fortuneWeights(plain);
    expect(fortuneWeights({ ...plain, milkUses: 2 }).veil).toBeGreaterThan(base.veil);
    expect(fortuneWeights({ ...plain, escapes: 2 }).tempest).toBeGreaterThan(base.tempest);
  });

  it('leans towards rewards after a clean round', () => {
    const clean = fortuneWeights({ ...plain, escapes: 0 });
    const messy = fortuneWeights(plain);
    expect(clean.golden).toBeGreaterThan(messy.golden);
    expect(clean.doubleTrouble).toBeGreaterThan(messy.doubleTrouble);
  });

  it('tolerates a sparse record', () => {
    expect(FORTUNES[drawFortune({ milkKills: 0, leafLanes: [] }, createRandom(3))]).toBeDefined();
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
    expect(modifiersFor('sugarRush')).toMatchObject({ sugarRegenInterval: CONFIG.fortunes.sugarRushInterval });
    expect(modifiersFor('doubleTrouble')).toMatchObject({ twinSteam: true });
    expect(modifiersFor('tempest')).toMatchObject({ enemySpeedMultiplier: CONFIG.fortunes.tempestEnemySpeed });
    expect(modifiersFor('golden')).toMatchObject({ goldenCube: true });
    expect(modifiersFor('lie')).toEqual(BASE_MODIFIERS); // all talk
  });

  it('gives every fortune the words it needs on screen', () => {
    for (const f of Object.values(FORTUNES)) {
      expect(f.name && f.quote && f.info && f.tag && f.color).toBeTruthy();
      expect(['good', 'trouble', 'odd']).toContain(f.tone);
    }
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
  brewNext(game);
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
    brewNext(game);
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
    brewNext(game);
    expect(game.state.sugarLeft).toBe(2);
    expect(game.state.modifiers.bonusSugar).toBe(0);
  });

  it('is cleared by a new match', () => {
    const game = gameWithFortune('crown');
    game.state.lives = 1;
    game.state.strainerLeft = 0; // no catch: the leaf spills
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    brewNext(game);
    expect(game.state.fortune).toBeNull();
    expect(game.state.sugarLeft).toBe(2);
  });
});

describe('Sugar Rush', () => {
  const interval = CONFIG.fortunes.sugarRushInterval;

  it('regrows one sugar burst per interval', () => {
    const game = gameWithFortune('sugarRush');
    game.sugarBurst();
    expect(game.state.sugarLeft).toBe(1);
    step(game, interval - 0.5);
    expect(game.state.sugarLeft).toBe(1);
    step(game, 0.6);
    expect(game.state.sugarLeft).toBe(2);
    expect(game.drainEvents().some((e) => e.type === 'sugarRegen')).toBe(true);
  });

  it('never regrows beyond the normal capacity, and the clock waits while full', () => {
    const game = gameWithFortune('sugarRush');
    step(game, interval * 3);
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound);
    game.sugarBurst();
    step(game, interval * 0.5);
    expect(game.state.sugarLeft).toBe(1); // a full interval, not a leftover one
    step(game, interval * 4);
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound);
  });

  it('stops after its round', () => {
    const game = gameWithFortune('sugarRush');
    completeRound(game);
    game.state.nextFortune = 'star';
    brewNext(game);
    game.state.spawnTimer = Infinity;
    game.sugarBurst();
    step(game, interval * 2);
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound - 1);
  });
});

describe('Double Trouble', () => {
  it('fires two darts that veer apart, sharing one cooldown', () => {
    const game = gameWithFortune('doubleTrouble');
    game.fireSteam();
    expect(game.fireSteam()).toBe(false);
    const [a, b] = game.state.shots;
    expect(game.state.shots).toHaveLength(2);
    expect(a.angle).toBe(b.angle);
    step(game, 0.2);
    expect(Math.abs(a.angle - b.angle)).toBeGreaterThan(0.1);
  });

  it('can strike two leaves with one shot', () => {
    const game = gameWithFortune('doubleTrouble');
    game.state.angle = laneAngle(4);
    placeEnemy(game.state, { lane: 4, radius: 200 }).angle -= 0.05;
    placeEnemy(game.state, { lane: 4, radius: 200 }).angle += 0.05;
    game.fireSteam();
    step(game, 0.25);
    expect(game.state.kills).toBe(2);
  });

  it('goes back to a single dart next round', () => {
    const game = gameWithFortune('doubleTrouble');
    completeRound(game);
    game.state.nextFortune = 'crown';
    brewNext(game);
    game.fireSteam();
    expect(game.state.shots).toHaveLength(1);
  });
});

describe('Tempestuous Tea', () => {
  it('hurries the leaves along, for one round only', () => {
    const calm = gameWithFortune('star');
    const stormy = gameWithFortune('tempest');
    const a = placeEnemy(calm.state, { radius: 50, speed: 40 });
    const b = placeEnemy(stormy.state, { radius: 50, speed: 40 });
    step(calm, 1);
    step(stormy, 1);
    expect(b.radius - 50).toBeCloseTo((a.radius - 50) * CONFIG.fortunes.tempestEnemySpeed, 3);
    completeRound(stormy);
    stormy.state.nextFortune = 'star';
    brewNext(stormy);
    expect(stormy.state.modifiers.enemySpeedMultiplier).toBe(1);
  });
});

describe('Golden Opportunity', () => {
  const G = CONFIG.golden;

  /** Wait for the cube to appear. */
  function withCube() {
    const game = gameWithFortune('golden');
    for (let t = 0; t < G.delayMax + 0.1 && !game.state.golden; t += 1 / 60) step(game, 1 / 60);
    return game;
  }

  it('shows the cube once, within reach, then dissolves it', () => {
    const game = withCube();
    const cube = game.state.golden;
    expect(cube).not.toBeNull();
    expect(cube.radius).toBeGreaterThanOrEqual(G.radiusMin);
    expect(cube.radius).toBeLessThanOrEqual(G.radiusMax);
    const lanesAway = Math.abs(Math.round(angleDifference(cube.angle, game.state.angle) / LANE_STEP));
    expect(lanesAway).toBeLessThanOrEqual(G.laneReach);
    step(game, G.life + 0.1);
    expect(game.state.golden).toBeNull();
    expect(game.drainEvents().map((e) => e.type)).toContain('goldenGone');
    step(game, 20);
    expect(game.state.golden).toBeNull(); // only once
  });

  it('pays out when steam strikes it', () => {
    const game = withCube();
    const before = { score: game.state.score, lives: game.state.lives, sugar: game.state.sugarLeft };
    game.state.angle = game.state.golden.angle;
    game.state.shotCooldown = 0;
    game.fireSteam();
    step(game, 0.4);
    expect(game.state.golden).toBeNull();
    const catchEvent = game.drainEvents().find((e) => e.type === 'goldenCatch');
    expect(['points', 'sugar', 'life', 'jackpot']).toContain(catchEvent.reward);
    const after = { score: game.state.score, lives: game.state.lives, sugar: game.state.sugarLeft };
    expect(after).not.toEqual(before);
  });

  it('never grants more than one extra cup', () => {
    for (let seed = 1; seed < 200; seed++) {
      const game = playingGame({ seed });
      game.state.modifiers = modifiersFor('golden');
      game.state.lives = CONFIG.lives + 1;
      awardGolden({ state: game.state, rng: createRandom(seed) });
      expect(game.state.lives).toBeLessThanOrEqual(CONFIG.lives + 1);
    }
  });

  it('vanishes when the round ends, and is gone after a restart', () => {
    const game = withCube();
    completeRound(game);
    expect(game.state.golden).toBeNull();
    game.state.nextFortune = 'star';
    brewNext(game);
    step(game, G.delayMax + 1);
    expect(game.state.golden).toBeNull();

    const lost = withCube();
    lost.state.lives = 1;
    lost.state.strainerLeft = 0; // no catch: the leaf spills
    placeEnemy(lost.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(lost, 0.05);
    expect(lost.state.phase).toBe('gameover');
    expect(lost.state.golden).toBeNull();
    lost.restart();
    expect(lost.state.fortune).toBeNull();
    expect(lost.state.modifiers).toEqual(BASE_MODIFIERS);
    expect(lost.state.goldenTimer).toBeNull();
  });
});

describe('The Leaves Lie', () => {
  it('changes its mind during the reading', () => {
    const game = playingGame();
    completeRound(game);
    game.state.nextFortune = 'lie';
    game.drainEvents();
    step(game, CONFIG.fortunes.lieRetractAt + 0.1);
    expect(game.drainEvents().map((e) => e.type)).toEqual(['reveal', 'retract']);
  });

  it('changes nothing about how the next round plays', () => {
    const game = gameWithFortune('lie');
    expect(game.state.modifiers).toEqual(BASE_MODIFIERS);
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound);
  });
});

describe('a restart clears every new fortune', () => {
  for (const id of ['sugarRush', 'doubleTrouble', 'tempest', 'golden', 'lie']) {
    it(`clears ${FORTUNES[id].name}`, () => {
      const game = gameWithFortune(id);
      game.state.lives = 1;
      game.state.strainerLeft = 0; // no catch: the leaf spills
      placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
      step(game, 0.05);
      game.restart();
      expect(game.state.fortune).toBeNull();
      expect(game.state.modifiers).toEqual(BASE_MODIFIERS);
      expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound);
      game.fireSteam();
      expect(game.state.shots).toHaveLength(1);
    });
  }
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
