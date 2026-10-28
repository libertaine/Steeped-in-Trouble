// Auto Steam: an accessibility option (on by default with touch controls)
// that fires ordinary steam for the player, but only down the lane the spoon
// is already aiming at, and only when something there is waiting to be hit.
//
// It never turns the spoon, never looks at other lanes, and never pours milk
// or fires sugar. Shots go through fireSteam() like any other, so the
// cooldown, the Polished Spoon, the Golden Spoon, Double Trouble, and every
// round statistic (volleys, wasted volleys, steam kills) work exactly as they
// do for a held fire button. The decision is a pure function of the state.
//
// "Waiting to be hit" means a target in the spoon's lane that no dart already
// in flight down that lane will reach first: each volley in flight (or sugar
// dart, or nova dart) is counted against one target, so the spoon fires one
// shot per target instead of a stream at a single leaf.

import { CONFIG } from '../config.js';
import { LANE_STEP, angleDifference, laneAngle } from './arena.js';
import { valveExposed } from './grind.js';
import { spoonLane } from './player.js';
import { steamSpeed } from './weapons.js';

const { radialTolerance, laneTolerance } = CONFIG.collision;
const G = CONFIG.grind;

const inLane = (angle, lane) => Math.abs(angleDifference(angle, laneAngle(lane))) < LANE_STEP * laneTolerance;

/** Are there more targets in the lane than darts already on their way to them? */
function uncovered(targets, shots, lane) {
  if (!targets.length) return false;
  const nearest = Math.min(...targets.map((t) => t.radius)) - radialTolerance;
  const coming = new Set();
  for (const shot of shots) {
    if (shot.radius > nearest && inLane(shot.angle, lane)) coming.add(shot.volley ?? shot);
  }
  return targets.length > coming.size;
}

/** In a normal round: is a leaf, the golden cube, or the prismatic cube lined up and not yet covered? */
export function autoSteamWanted(state) {
  const lane = spoonLane(state);
  const targets = state.enemies.filter((e) => inLane(e.angle, lane));
  for (const cube of [state.golden, state.prismatic]) if (cube && inLane(cube.angle, lane)) targets.push(cube);
  return uncovered(targets, state.shots, lane);
}

/**
 * In The Daily Grind: a bean in the spoon's lane, or the safety valve facing
 * it (or about to) with time for the steam to arrive while it is open. The
 * player still has to bring the spoon to the valve, and out of the way of
 * the beans and the scalding lanes.
 */
export function autoSteamWantedInGrind(state) {
  const g = state.grind;
  const lane = spoonLane(state);
  const v = g.valve;
  const travel = (CONFIG.arena.rimRadius - CONFIG.steam.spawnInset - G.bodyRadius) / steamSpeed(state);
  if (v.lane === lane) {
    const left = v.length - v.time;
    if (valveExposed(g, laneAngle(lane)) && left > travel) return true;
    if (v.stage === 'turning' && left < travel) return true; // it will be open when the steam gets there
  }
  return uncovered(g.beans.filter((b) => inLane(b.angle, lane)), state.shots, lane);
}
