// Steam darts, sugar bursts, milk clouds, and the hit test between darts and
// tea leaves. Functions receive `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { LANE_STEP, angleDifference, laneAngle, normalizeAngle, wrapLane } from './arena.js';
import { spoonLane } from './player.js';
import { steamSpeedFactor } from './upgrades.js';
import { discover } from './combos.js';

const RIM = CONFIG.arena.rimRadius;
const GS = CONFIG.goldenSpoon;

/**
 * Steam dart speed: the base speed, scaled by the round's fortune, the
 * Polished Spoon, and the Golden Spoon. Each bonus multiplies the others, so
 * a temporary effect never replaces a lasting one.
 */
export function steamSpeed(state) {
  return CONFIG.steam.speed * state.modifiers.steamSpeedMultiplier * steamSpeedFactor(state.spoon)
    * (state.goldenSpoon > 0 ? GS.speedFactor : 1);
}

/** Seconds between steam darts; the Golden Spoon shortens it. */
export function steamCooldown(state) {
  return CONFIG.steam.cooldown * (state.goldenSpoon > 0 ? GS.cooldownFactor : 1);
}

/**
 * Launch steam down one lane: a single dart, or under Double Trouble two
 * darts that veer apart as they travel. Every bonus to steam applies.
 */
function launchSteam(state, lane, extra = {}) {
  const rate = CONFIG.fortunes.twinSpreadRate;
  const golden = state.goldenSpoon > 0;
  for (const veer of state.modifiers.twinSteam ? [-rate, rate] : [0]) {
    state.shots.push({
      angle: laneAngle(lane),
      radius: RIM - CONFIG.steam.spawnInset,
      speed: steamSpeed(state),
      sugar: false,
      veer, // radians per second of sideways drift
      golden, // fired by the Golden Spoon (cosmetic tint)
      ...extra,
    });
  }
}

/**
 * Fire steam down the spoon's lane if the cooldown allows. Each shot is a
 * volley: its darts share an id, and the volley counts as wasted only if none
 * of them hits anything (see spendDart()).
 */
export function fireSteam({ state, emit }) {
  if (state.shotCooldown > 0) return false;
  state.shotCooldown = steamCooldown(state);
  const volley = ++state.roundStats.volleys;
  const before = state.shots.length;
  const lane = spoonLane(state);
  launchSteam(state, lane, { volley });
  state.volleys[volley] = state.shots.length - before; // darts still in flight
  emit('steam', { lane, twin: state.modifiers.twinSteam, golden: state.goldenSpoon > 0 });
  return true;
}

/**
 * Steam Nova: ordinary steam down every lane at once, so Double Trouble, the
 * Golden Spoon, and every speed bonus carry over. It ignores the cooldown.
 */
export function steamNova({ state, emit }) {
  const before = state.shots.length;
  for (let lane = 0; lane < CONFIG.arena.lanes; lane++) launchSteam(state, lane, { nova: true });
  emit('nova', {
    angle: state.angle, count: state.shots.length - before,
    twin: state.modifiers.twinSteam, golden: state.goldenSpoon > 0,
  });
}

/** The most sugar bursts the spoon can hold this round, Sugar Scoop included. */
export function sugarCapacity(state) {
  return CONFIG.sugar.perRound + state.modifiers.bonusSugar + state.spoon.sugarScoop;
}

/** Sugar Rush: regrow one burst per interval, never beyond capacity. */
export function updateSugarRegen({ state, emit }, dt) {
  const interval = state.modifiers.sugarRegenInterval;
  if (!interval) return;
  if (state.sugarLeft >= sugarCapacity(state)) {
    state.sugarRegenTimer = interval; // the clock only runs while there is room
    return;
  }
  state.sugarRegenTimer -= dt;
  if (state.sugarRegenTimer <= 0) {
    state.sugarRegenTimer = interval;
    state.sugarLeft++;
    emit('sugarRegen', { angle: state.angle });
  }
}

/** Fire three sugar darts across the spoon's lane and its neighbours. */
export function sugarBurst({ state, emit }) {
  if (state.sugarLeft <= 0) return false;
  state.sugarLeft--;
  const lane = spoonLane(state);
  for (const offset of CONFIG.sugar.laneOffsets) {
    state.shots.push({
      angle: laneAngle(wrapLane(lane + offset)),
      radius: RIM - CONFIG.sugar.spawnInset,
      speed: CONFIG.sugar.speed,
      sugar: true,
      veer: 0,
    });
  }
  state.roundStats.sugarUses++;
  emit('sugar', { lanes: CONFIG.sugar.laneOffsets.map((offset) => wrapLane(lane + offset)) });
  return true;
}

/**
 * Pour a milk cloud over the spoon's lane, slowing nearby leaves. The pour's
 * first wave also washes the leaves under it back towards the centre (see
 * advanceEnemy() for how the push plays out). In stormy tea the cloud is
 * wider and drifts with the currents (The Perfect Storm).
 */
export function pourMilk(sim) {
  const { state, rng, emit } = sim;
  if (state.milkLeft <= 0) return false;
  state.milkLeft--;
  state.roundStats.milkUses++;
  const M = CONFIG.milk;
  const duration = M.duration + state.modifiers.milkDurationBonus;
  const angle = laneAngle(spoonLane(state));
  const stormy = state.modifiers.stormyMilk;
  const spread = stormy ? CONFIG.combos.stormSpread : 1;
  const drift = stormy ? CONFIG.combos.stormDrift * (rng.next() < 0.5 ? -1 : 1) : 0;
  state.clouds.push({ angle, time: duration, duration, spread, drift });
  let pushed = 0;
  for (const enemy of state.enemies) {
    if (Math.abs(angleDifference(angle, enemy.angle)) >= LANE_STEP * M.slowHalfWidthLanes * spread) continue;
    if (enemy.radius > RIM * M.rescueShare) state.roundStats.nearMisses++;
    enemy.backwash = Math.max(enemy.backwash ?? 0, M.backwash);
    pushed++;
  }
  emit('milk', { angle: state.angle, cloud: angle, pushed, spread });
  if (stormy) discover(sim, 'perfectStorm');
  return true;
}

/**
 * The recovery pulse that follows every milk pour in a normal round: a wave
 * through the whole cup pushes every leaf back a little and slows it for a
 * moment (see milkSlow() in enemies.js). Under the pour's own cloud the
 * stronger push and slowdown win rather than adding up, and a second pour
 * starts the pulse again rather than deepening it. The pulse counts no near
 * misses, kills, or milk credit of its own: those stay with the cloud.
 */
export function milkPulse({ state, emit }) {
  const P = CONFIG.milk.pulse;
  for (const enemy of state.enemies) enemy.backwash = Math.max(enemy.backwash ?? 0, P.backwash);
  state.pulse = P.duration;
  emit('milkPulse', { leaves: state.enemies.length });
}

/**
 * A dart is used up, on a target (`hit`) or by fizzling out at the centre.
 * A hit settles its volley at once; the volley is wasted when its last dart
 * fizzles without any of them having hit.
 */
export function spendDart(state, shot, hit) {
  const left = state.volleys[shot.volley];
  if (left === undefined) return;
  if (hit) delete state.volleys[shot.volley];
  else if (left > 1) state.volleys[shot.volley] = left - 1;
  else {
    delete state.volleys[shot.volley];
    state.roundStats.wastedVolleys++;
  }
}

export function updateShots(state, dt) {
  for (const shot of state.shots) {
    shot.radius -= shot.speed * dt;
    shot.angle += shot.veer * dt;
  }
  state.shots = state.shots.filter((shot) => {
    if (shot.radius >= CONFIG.steam.despawnRadius) return true;
    spendDart(state, shot, false);
    return false;
  });
}

/** Milk clouds and the recovery pulse wear off; clouds drift if they are stormy. */
export function updateClouds(state, dt) {
  state.pulse = Math.max(0, (state.pulse ?? 0) - dt);
  for (let i = state.clouds.length - 1; i >= 0; i--) {
    const cloud = state.clouds[i];
    cloud.time -= dt;
    cloud.angle = normalizeAngle(cloud.angle + cloud.drift * dt);
    if (cloud.time <= 0) state.clouds.splice(i, 1);
  }
}

/** Is an angle within `halfWidthLanes` lanes (scaled by each cloud's spread) of any active milk cloud? */
export function isNearCloud(clouds, angle, halfWidthLanes) {
  return clouds.some((cloud) => Math.abs(angleDifference(cloud.angle, angle)) < LANE_STEP * halfWidthLanes * cloud.spread);
}

/** Index of the most recently fired dart touching a target ({ radius, angle }), or -1. */
export function findStrikingShot(shots, enemy) {
  const { radialTolerance, laneTolerance } = CONFIG.collision;
  for (let j = shots.length - 1; j >= 0; j--) {
    const shot = shots[j];
    if (Math.abs(enemy.radius - shot.radius) < radialTolerance
      && Math.abs(angleDifference(enemy.angle, shot.angle)) < LANE_STEP * laneTolerance) {
      return j;
    }
  }
  return -1;
}

/** Points for destroying a leaf with a given dart under the round's modifiers. */
export function killScore(shot, modifiers) {
  const base = shot.sugar ? CONFIG.scoring.sugarKill : CONFIG.scoring.steamKill;
  return Math.round(base * modifiers.scoreMultiplier);
}
