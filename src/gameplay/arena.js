// Cup geometry: angles, lanes, and the polar-to-canvas mapping.
//
// Simulation positions are polar: a radius from the cup centre and an angle in
// radians. Angle 0 points right; angles increase clockwise because canvas y
// grows downward. Lane 0 sits at the top of the cup (-PI/2) and lane numbers
// increase clockwise.

import { CONFIG } from '../config.js';

export const TAU = Math.PI * 2;
export const LANES = CONFIG.arena.lanes;
export const LANE_STEP = TAU / LANES;

const TOP = -Math.PI / 2;

/** Wrap an angle into [0, TAU). */
export function normalizeAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

/** Signed shortest angular distance from b to a, in (-PI, PI]. */
export function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Wrap any integer lane index into [0, LANES). */
export function wrapLane(lane) {
  return ((lane % LANES) + LANES) % LANES;
}

/** The lane whose centre line is nearest to an angle. */
export function laneOf(angle) {
  return wrapLane(Math.round((normalizeAngle(angle) + Math.PI / 2) / LANE_STEP));
}

/** The angle of a lane's centre line. */
export function laneAngle(lane) {
  return TOP + lane * LANE_STEP;
}

/** Convert a polar simulation position to logical canvas coordinates. */
export function toCanvasPoint(radius, angle) {
  return {
    x: CONFIG.arena.centerX + radius * Math.cos(angle),
    y: CONFIG.arena.centerY + radius * Math.sin(angle),
  };
}
