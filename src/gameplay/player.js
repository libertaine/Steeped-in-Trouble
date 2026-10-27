import { CONFIG } from '../config.js';
import { laneOf, normalizeAngle } from './arena.js';
import { turnSpeedFactor } from './upgrades.js';

/** Radians per second the spoon turns, Quick Stir included. */
export function turnSpeed(state) {
  return CONFIG.player.turnSpeed * turnSpeedFactor(state.spoon);
}

/**
 * Rotate the spoon around the rim. Holding both directions cancels out.
 * @param {{ left: boolean, right: boolean }} input
 */
export function moveSpoon(state, input, dt) {
  const step = turnSpeed(state) * dt;
  if (input.left && !input.right) {
    state.angle -= step;
    state.roundStats.motionTime += dt;
  } else if (input.right && !input.left) {
    state.angle += step;
    state.roundStats.motionTime += dt;
  }
  state.angle = normalizeAngle(state.angle);
}

/** The lane the spoon currently aims down. */
export function spoonLane(state) {
  return laneOf(state.angle);
}
