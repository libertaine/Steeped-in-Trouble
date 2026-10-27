import { CONFIG } from '../config.js';
import { laneOf, normalizeAngle } from './arena.js';
import { turnSpeedFactor } from './upgrades.js';
import { updateStir } from './combos.js';

/** Radians per second the spoon turns, Quick Stir included. */
export function turnSpeed(state) {
  return CONFIG.player.turnSpeed * turnSpeedFactor(state.spoon);
}

/**
 * Rotate the spoon around the rim. Holding both directions cancels out.
 * @param {{ left: boolean, right: boolean }} input
 */
export function moveSpoon(state, input, dt) {
  const dir = input.left === input.right ? 0 : input.right ? 1 : -1;
  state.angle = normalizeAngle(state.angle + dir * turnSpeed(state) * dt);
  if (dir) state.roundStats.motionTime += dt;
  updateStir(state, dir, dt);
}

/** The lane the spoon currently aims down. */
export function spoonLane(state) {
  return laneOf(state.angle);
}
