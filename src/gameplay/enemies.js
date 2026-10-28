// Tea-leaf enemies: spawning and movement. Functions receive
// `sim` = { state, rng, emit }.
//
// Leaves come in kinds. An ordinary 'leaf' just rises. Two behaviours can be
// layered on, each a little stage machine in plain data with a visible
// warning before anything happens:
//   - 'darter' (Green Tea): crouches and flickers, then dashes a fixed
//     distance further than an ordinary leaf would go in that time.
//   - 'wanderer' (Earl Grey): leans one way, then glides into that lane.
// Each takes its warning time (and a darter its dash distance) from the
// round it appears in; see gameplay/strength.js.
// A glide ({ shift, length, time, done }) moves a leaf sideways smoothly;
// wanderers and Chai's spice currents both use it, and it adds to (rather
// than overwrites) any other change of angle, such as The Spiral's drift.
//
// To add an enemy type, give spawned enemies a `kind` and branch on it in
// advanceEnemy() (movement) and in the renderer's drawEnemy() (appearance).

import { CONFIG } from '../config.js';
import { LANES, LANE_STEP, TAU, laneAngle } from './arena.js';
import { byStage } from './strength.js';
import { isNearCloud } from './weapons.js';

const E = CONFIG.enemies;
const S = CONFIG.spawning;
const D = CONFIG.darting;
const WANDER = CONFIG.wandering;

const ease = (u) => u * u * (3 - 2 * u);

/** Which kind a new leaf is, under the round's modifiers. Draws only when a behaviour is possible. */
function pickKind(modifiers, rng) {
  const { dartChance, wanderChance } = modifiers;
  if (!dartChance && !wanderChance) return 'leaf';
  const roll = rng.next();
  if (roll < dartChance) return 'darter';
  if (roll < dartChance + wanderChance) return 'wanderer';
  return 'leaf';
}

export function spawnEnemy({ state, rng }) {
  const lane = rng.int(LANES);
  const radius = rng.range(E.spawnRadiusMin, E.spawnRadiusMax);
  const enemy = {
    kind: 'leaf',
    angle: laneAngle(lane),
    radius,
    home: radius, // milk and the recovering cup never push it further in than this
    speed: rng.range(E.speedMin, E.speedMax) + Math.min(E.maxRoundSpeedBonus, state.round * E.speedPerRound),
    wiggle: rng.range(0, TAU), // animation phase only
    shifted: false, // has drifted under The Spiral
    size: rng.range(E.sizeMin, E.sizeMax),
    alpha: 0,
    backwash: 0, // distance still to be washed back towards the centre
    glide: null, // a sideways glide in progress
  };
  const kind = pickKind(state.modifiers, rng);
  if (kind === 'darter') {
    enemy.kind = kind;
    enemy.dart = {
      stage: 'waiting', at: rng.range(D.atMin, D.atMax), time: 0,
      warn: byStage(D.warnTime, state.round), distance: byStage(D.dashDistance, state.round),
    };
  } else if (kind === 'wanderer') {
    enemy.kind = kind;
    enemy.wander = {
      stage: 'waiting', at: rng.range(WANDER.atMin, WANDER.atMax), dir: rng.next() < 0.5 ? -1 : 1, time: 0,
      warn: byStage(WANDER.warnTime, state.round),
    };
  }
  state.enemies.push(enemy);
  return enemy;
}

/** Seconds until the next spawn in a given round (scaled by the tea, if a modifier is given). */
export function nextSpawnDelay(round, rng, intervalMultiplier = 1) {
  const interval = Math.min(S.maxInterval, Math.max(S.minInterval, S.baseInterval - round * S.intervalPerRound));
  return interval * intervalMultiplier * rng.range(S.jitterMin, S.jitterMax);
}

export function updateSpawning(sim, dt) {
  const { state, rng } = sim;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.enemies.length < E.maxActive) {
    state.spawnTimer = nextSpawnDelay(state.round, rng, state.modifiers.spawnIntervalMultiplier);
    spawnEnemy(sim);
  }
}

/** Start washing a leaf back towards the centre (milk, or the recovering cup). */
export function washBack(enemy, distance) {
  enemy.backwash = Math.max(enemy.backwash ?? 0, distance);
}

/**
 * Glide a leaf sideways by `shift` radians over `length` seconds. A glide
 * already under way folds its unfinished part into the new one.
 */
export function glide(enemy, shift, length) {
  const g = enemy.glide;
  const left = g ? g.shift * (1 - g.done) : 0;
  enemy.glide = { shift: shift + left, length, time: 0, done: 0 };
}

function advanceGlide(enemy, dt) {
  const g = enemy.glide;
  if (!g) return;
  g.time = Math.min(g.length, g.time + dt);
  const now = ease(g.time / g.length);
  enemy.angle += g.shift * (now - g.done);
  g.done = now;
  if (g.time >= g.length) enemy.glide = null;
}

/**
 * Green Tea's darters: advance the crouch and the dash through this frame.
 * Returns `pace`, the seconds of ordinary movement the leaf makes (less
 * while crouching), and `dash`, the extra outward distance the dash adds.
 * Stage changes part-way through a frame are split exactly, so the leaf
 * covers the same ground at any frame rate.
 */
function advanceDart(enemy, emit, dt) {
  const d = enemy.dart;
  if (!d || d.stage === 'done') return { pace: dt, dash: 0 };
  if (d.stage === 'waiting') {
    if (enemy.radius < d.at) return { pace: dt, dash: 0 };
    if (enemy.radius > D.latestAt) {
      d.stage = 'done';
      return { pace: dt, dash: 0 };
    }
    d.stage = 'warning';
    d.time = 0;
    emit('dartWarn', { radius: enemy.radius, angle: enemy.angle });
  }
  let left = dt;
  let pace = 0;
  let dash = 0;
  if (d.stage === 'warning') {
    const t = Math.min(left, d.warn - d.time);
    d.time += t;
    pace += t * D.warnPace;
    left -= t;
    if (d.time >= d.warn) {
      d.stage = 'darting';
      d.time = 0;
      emit('dart', { radius: enemy.radius, angle: enemy.angle });
    }
  }
  if (d.stage === 'darting' && left > 0) {
    // The extra distance eases in and out: a visible burst that settles back into a rise.
    const t = Math.min(left, D.dashTime - d.time);
    const before = ease(d.time / D.dashTime);
    d.time += t;
    dash = d.distance * (ease(d.time / D.dashTime) - before);
    pace += t;
    left -= t;
    if (d.time >= D.dashTime) d.stage = 'done';
  }
  return { pace: pace + left, dash };
}

/** Earl Grey's wanderers: lean towards the next lane, then glide into it. */
function advanceWander(enemy, emit, dt) {
  const w = enemy.wander;
  if (!w || w.stage === 'done') return;
  if (w.stage === 'waiting') {
    if (enemy.radius < w.at) return;
    if (enemy.radius > WANDER.latestAt) {
      w.stage = 'done';
      return;
    }
    w.stage = 'warning';
    w.time = 0;
    emit('wanderWarn', { radius: enemy.radius, angle: enemy.angle, dir: w.dir });
  }
  w.time += dt;
  if (w.time < w.warn) return;
  w.stage = 'done';
  glide(enemy, w.dir * LANE_STEP, WANDER.glideTime);
  emit('wander', { radius: enemy.radius, angle: enemy.angle, dir: w.dir });
}

/**
 * Move one enemy outward, slowed by milk, hurried by the tea and Tempestuous
 * Tea, held or dashing by its own behaviour, nudged by The Spiral, carried by
 * any glide, and washed back by a milk wave or the recovering cup. A dash's
 * extra distance is fixed (speed modifiers don't stretch it), milk slows it
 * like any movement, and a leaf being washed back doesn't dash.
 */
export function advanceEnemy(enemy, { state, rng, emit }, dt) {
  enemy.alpha = Math.min(1, enemy.alpha + dt * E.fadeInRate);
  const { pace, dash } = advanceDart(enemy, emit, dt);
  const slowed = isNearCloud(state.clouds, enemy.angle, CONFIG.milk.slowHalfWidthLanes);
  const rise = enemy.speed * state.modifiers.enemySpeedMultiplier * pace + (enemy.backwash > 0 ? 0 : dash);
  enemy.radius += rise * (slowed ? CONFIG.milk.slowFactor : 1);
  if (enemy.backwash > 0) {
    // The push eases out: quick at first, then settling.
    const move = enemy.backwash * (1 - Math.exp(-dt * CONFIG.milk.backwashRate));
    const home = enemy.home ?? E.spawnRadiusMin;
    enemy.backwash = enemy.backwash - move < 0.5 ? 0 : enemy.backwash - move;
    enemy.radius = Math.max(home, enemy.radius - move);
    if (enemy.radius === home) enemy.backwash = 0;
  }
  advanceWander(enemy, emit, dt);
  advanceGlide(enemy, dt);
  if (state.modifiers.laneDrift && !enemy.shifted && enemy.radius > CONFIG.fortunes.spiralDriftRadius) {
    enemy.angle += LANE_STEP * (rng.next() < 0.5 ? -1 : 1);
    enemy.shifted = true;
    emit('drift', { radius: enemy.radius, angle: enemy.angle });
  }
}

export function hasEscaped(enemy) {
  return enemy.radius >= CONFIG.arena.rimRadius - E.escapeInset;
}
