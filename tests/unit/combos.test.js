import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { LANE_STEP, angleDifference, laneAngle } from '../../src/gameplay/arena.js';
import { giltSplashTarget, tornadoWake } from '../../src/gameplay/combos.js';
import { modifiersFor } from '../../src/gameplay/fortunes.js';
import { IDLE, placeEnemy, playingGame, step } from './helpers.js';

const C = CONFIG.combos;
const RIM = CONFIG.arena.rimRadius;
const RIGHT = Object.freeze({ ...IDLE, right: true });
const LEFT = Object.freeze({ ...IDLE, left: true });
const discoveries = (game) => game.drainEvents().filter((e) => e.type === 'discover').map((e) => e.id);

describe('The Perfect Storm', () => {
  it('spreads milk wider in Tempestuous Tea and carries it round the cup', () => {
    const game = playingGame();
    game.state.modifiers = modifiersFor('tempest');
    game.state.angle = laneAngle(0);
    // Two and a half lanes away: outside an ordinary cloud, inside a stormy one.
    const leaf = placeEnemy(game.state, { lane: 0, radius: 100, speed: 40 });
    leaf.angle += LANE_STEP * 2.4;
    game.pourMilk();
    const [cloud] = game.state.clouds;
    expect(cloud.spread).toBe(C.stormSpread);
    expect(Math.abs(cloud.drift)).toBe(C.stormDrift);
    expect(leaf.backwash).toBeGreaterThan(0);
    const before = cloud.angle;
    step(game, 1);
    expect(Math.abs(angleDifference(cloud.angle, before))).toBeCloseTo(C.stormDrift, 1);
    expect(discoveries(game)).toEqual(['perfectStorm']);
    game.pourMilk();
    expect(discoveries(game)).toEqual([]); // announced once a pot
  });

  it('leaves ordinary milk alone', () => {
    const game = playingGame();
    game.pourMilk();
    expect(game.state.clouds[0]).toMatchObject({ spread: 1, drift: 0 });
    expect(discoveries(game)).toEqual([]);
  });
});

describe('The Silver Tornado', () => {
  const tornadoGame = (polished = 1, quickStir = 1) => {
    const game = playingGame();
    Object.assign(game.state.spoon, { polished, quickStir });
    return game;
  };

  it('needs both a Polished Spoon and Quick Stir, and a moment of steady turning', () => {
    const polishedOnly = tornadoGame(3, 0);
    step(polishedOnly, 1, RIGHT);
    expect(polishedOnly.state.wake).toBeNull();

    const game = tornadoGame();
    step(game, C.tornadoSpinUp - 0.1, RIGHT);
    expect(game.state.wake).toBeNull();
    step(game, 0.2, RIGHT);
    expect(game.state.wake).toMatchObject({ dir: 1, depth: C.tornadoDepth });
    expect(discoveries(game)).toEqual(['silverTornado']);
    step(game, 1 / 60, LEFT); // changing direction starts over
    expect(game.state.wake).toBeNull();
    step(game, 1 / 60);
    expect(game.state.wake).toBeNull();
  });

  it('cuts deeper with more upgrades', () => {
    const game = tornadoGame(3, 2);
    step(game, C.tornadoSpinUp + 0.1, RIGHT);
    expect(tornadoWake(game.state).depth).toBe(C.tornadoDepth + 3 * C.tornadoDepthPerLevel);
  });

  it('destroys leaves near the rim in its wake, but not deeper ones or those ahead', () => {
    const game = tornadoGame();
    game.state.angle = laneAngle(0);
    step(game, C.tornadoSpinUp + 0.05, RIGHT);
    const behind = game.state.angle - LANE_STEP * 0.4;
    const edge = placeEnemy(game.state, { radius: RIM - 8 });
    edge.angle = behind;
    const deep = placeEnemy(game.state, { radius: RIM - C.tornadoDepth - 20 });
    deep.angle = behind;
    const ahead = placeEnemy(game.state, { radius: RIM - 8 });
    ahead.angle = game.state.angle + LANE_STEP * 2;
    step(game, 1 / 60, RIGHT);
    expect(game.state.enemies).not.toContain(edge);
    expect(game.state.enemies).toContain(deep);
    expect(game.state.enemies).toContain(ahead);
    expect(game.state.kills).toBe(1);
    expect(game.state.roundStats.steamKills).toBe(0);
  });
});

describe('Double Gilt', () => {
  it('has golden twin darts splash the nearest leaf', () => {
    const game = playingGame();
    game.state.modifiers = modifiersFor('doubleTrouble');
    game.state.goldenSpoon = CONFIG.goldenSpoon.duration;
    game.state.angle = laneAngle(0);
    placeEnemy(game.state, { lane: 0, radius: 200 });
    const neighbour = placeEnemy(game.state, { lane: 0, radius: 175 });
    neighbour.angle += LANE_STEP * 0.5;
    game.fireSteam();
    for (let t = 0; t < 1 && game.state.kills < 1; t += 1 / 60) step(game, 1 / 60);
    expect(game.state.kills).toBe(2);
    const events = game.drainEvents();
    expect(events.filter((e) => e.type === 'kill').map((e) => e.by)).toContain('splash');
    expect(events.filter((e) => e.type === 'discover').map((e) => e.id)).toEqual(['doubleGilt']);
  });

  it('needs both gold and a twin dart, and a leaf close by', () => {
    const victim = { radius: 200, angle: 0 };
    const near = { radius: 180, angle: 0.05 };
    const far = { radius: 100, angle: 0 };
    const enemies = [near, far];
    expect(giltSplashTarget(enemies, victim, { golden: true, veer: 0.4 })).toBe(near);
    expect(giltSplashTarget(enemies, victim, { golden: true, veer: 0 })).toBeNull();
    expect(giltSplashTarget(enemies, victim, { golden: false, veer: 0.4 })).toBeNull();
    expect(giltSplashTarget([far], victim, { golden: true, veer: 0.4 })).toBeNull();
  });
});

describe('discoveries', () => {
  it('are forgotten when a new pot starts', () => {
    const game = playingGame();
    game.state.modifiers = modifiersFor('tempest');
    game.pourMilk();
    expect(game.state.discovered).toEqual(['perfectStorm']);
    game.state.lives = 1;
    game.state.strainerLeft = 0;
    placeEnemy(game.state, { radius: RIM, speed: 1 });
    step(game, 0.05);
    game.restart();
    expect(game.state.discovered).toEqual([]);
  });
});
