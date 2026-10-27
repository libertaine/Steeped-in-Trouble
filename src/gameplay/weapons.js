// Steam darts, sugar bursts, milk clouds, and the hit test between darts and
// tea leaves. Functions receive `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { LANE_STEP, angleDifference, laneAngle, wrapLane } from './arena.js';
import { spoonLane } from './player.js';

const RIM = CONFIG.arena.rimRadius;

/**
 * Fire one steam dart down the spoon's lane if the cooldown allows. Under
 * Double Trouble it is two darts that veer apart as they travel.
 */
export function fireSteam({ state, emit }) {
  if (state.shotCooldown > 0) return false;
  state.shotCooldown = CONFIG.steam.cooldown;
  const twin = state.modifiers.twinSteam;
  const rate = CONFIG.fortunes.twinSpreadRate;
  for (const veer of twin ? [-rate, rate] : [0]) {
    state.shots.push({
      angle: laneAngle(spoonLane(state)),
      radius: RIM - CONFIG.steam.spawnInset,
      speed: CONFIG.steam.speed * state.modifiers.steamSpeedMultiplier,
      sugar: false,
      veer, // radians per second of sideways drift
    });
  }
  emit('steam', { twin });
  return true;
}

/** The most sugar bursts the spoon can hold this round. */
export function sugarCapacity(state) {
  return CONFIG.sugar.perRound + state.modifiers.bonusSugar;
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
  emit('sugar');
  return true;
}

/** Pour a milk cloud over the spoon's lane, slowing nearby leaves. */
export function pourMilk({ state, emit }) {
  if (state.milkLeft <= 0) return false;
  state.milkLeft--;
  state.roundStats.milkUses++;
  const duration = CONFIG.milk.duration + state.modifiers.milkDurationBonus;
  state.clouds.push({ angle: laneAngle(spoonLane(state)), time: duration, duration });
  emit('milk', { angle: state.angle });
  return true;
}

export function updateShots(state, dt) {
  for (const shot of state.shots) {
    shot.radius -= shot.speed * dt;
    shot.angle += shot.veer * dt;
  }
  state.shots = state.shots.filter((shot) => shot.radius >= CONFIG.steam.despawnRadius);
}

export function updateClouds(state, dt) {
  for (let i = state.clouds.length - 1; i >= 0; i--) {
    state.clouds[i].time -= dt;
    if (state.clouds[i].time <= 0) state.clouds.splice(i, 1);
  }
}

/** Is an angle within `halfWidthLanes` lanes of any active milk cloud? */
export function isNearCloud(clouds, angle, halfWidthLanes) {
  return clouds.some((cloud) => Math.abs(angleDifference(cloud.angle, angle)) < LANE_STEP * halfWidthLanes);
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
