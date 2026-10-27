// Tea-leaf enemies: spawning and movement. Functions receive
// `sim` = { state, rng, emit }.
//
// To add an enemy type, give spawned enemies a `kind` and branch on it in
// advanceEnemy() (movement) and in the renderer's drawEnemy() (appearance).

import { CONFIG } from '../config.js';
import { LANES, LANE_STEP, TAU, laneAngle } from './arena.js';
import { isNearCloud } from './weapons.js';

const E = CONFIG.enemies;
const S = CONFIG.spawning;

export function spawnEnemy({ state, rng }) {
  const lane = rng.int(LANES);
  const radius = rng.range(E.spawnRadiusMin, E.spawnRadiusMax);
  state.enemies.push({
    angle: laneAngle(lane),
    radius,
    home: radius, // milk and the recovering cup never push it further in than this
    speed: rng.range(E.speedMin, E.speedMax) + Math.min(E.maxRoundSpeedBonus, state.round * E.speedPerRound),
    wiggle: rng.range(0, TAU), // animation phase only
    shifted: false, // has drifted under The Spiral
    size: rng.range(E.sizeMin, E.sizeMax),
    alpha: 0,
    backwash: 0, // distance still to be washed back towards the centre
  });
}

/** Seconds until the next spawn in a given round. */
export function nextSpawnDelay(round, rng) {
  const interval = Math.min(S.maxInterval, Math.max(S.minInterval, S.baseInterval - round * S.intervalPerRound));
  return interval * rng.range(S.jitterMin, S.jitterMax);
}

export function updateSpawning(sim, dt) {
  const { state, rng } = sim;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.enemies.length < E.maxActive) {
    state.spawnTimer = nextSpawnDelay(state.round, rng);
    spawnEnemy(sim);
  }
}

/** Start washing a leaf back towards the centre (milk, or the recovering cup). */
export function washBack(enemy, distance) {
  enemy.backwash = Math.max(enemy.backwash ?? 0, distance);
}

/**
 * Move one enemy outward, slowed by milk, hurried by Tempestuous Tea, nudged
 * by The Spiral, and washed back by a milk wave or the recovering cup.
 */
export function advanceEnemy(enemy, { state, rng, emit }, dt) {
  enemy.alpha = Math.min(1, enemy.alpha + dt * E.fadeInRate);
  const slowed = isNearCloud(state.clouds, enemy.angle, CONFIG.milk.slowHalfWidthLanes);
  enemy.radius += enemy.speed * dt * state.modifiers.enemySpeedMultiplier * (slowed ? CONFIG.milk.slowFactor : 1);
  if (enemy.backwash > 0) {
    // The push eases out: quick at first, then settling.
    const move = enemy.backwash * (1 - Math.exp(-dt * CONFIG.milk.backwashRate));
    const home = enemy.home ?? E.spawnRadiusMin;
    enemy.backwash = enemy.backwash - move < 0.5 ? 0 : enemy.backwash - move;
    enemy.radius = Math.max(home, enemy.radius - move);
    if (enemy.radius === home) enemy.backwash = 0;
  }
  if (state.modifiers.laneDrift && !enemy.shifted && enemy.radius > CONFIG.fortunes.spiralDriftRadius) {
    enemy.angle += LANE_STEP * (rng.next() < 0.5 ? -1 : 1);
    enemy.shifted = true;
    emit('drift', { radius: enemy.radius, angle: enemy.angle });
  }
}

export function hasEscaped(enemy) {
  return enemy.radius >= CONFIG.arena.rimRadius - E.escapeInset;
}
