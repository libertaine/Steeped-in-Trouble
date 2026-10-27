// Unexpected brews: combinations of upgrades, fortunes, and the Golden Spoon
// that unlock a new behaviour rather than a bigger number. Each is announced
// the first time it happens in a pot, then keeps working without a word.
// Functions receive `sim` = { state, rng, emit }.
//
// To add one, add an entry to COMBOS, put its rule where the rule it bends
// lives, and call discover() when it first takes effect.

import { CONFIG } from '../config.js';
import { LANE_STEP, angleDifference } from './arena.js';
import { turnSpeed } from './player.js';

const C = CONFIG.combos;
const RIM = CONFIG.arena.rimRadius;

export const COMBOS = Object.freeze({
  perfectStorm: {
    id: 'perfectStorm',
    name: 'The Perfect Storm',
    words: 'Milk in Tempestuous Tea spreads wider and swirls around the cup.',
  },
  silverTornado: {
    id: 'silverTornado',
    name: 'The Silver Tornado',
    words: 'A polished, quick spoon leaves a wake along the rim. Keep stirring.',
  },
  doubleGilt: {
    id: 'doubleGilt',
    name: 'Double Gilt',
    words: 'Golden twin darts splash the next leaf over.',
  },
});

/** Announce a combination the first time it happens this pot. */
export function discover({ state, emit }, id) {
  if (state.discovered.includes(id)) return;
  state.discovered.push(id);
  emit('discover', { id });
}

/** Track how long the spoon has been turning one way (dir: -1, 0, or 1). */
export function updateStir(state, dir, dt) {
  state.stir.time = dir && dir === state.stir.dir ? state.stir.time + dt : 0;
  state.stir.dir = dir;
}

/**
 * The Silver Tornado (Polished Spoon + Quick Stir): after a moment of steady
 * turning, the rim the spoon has just swept is a wake that destroys leaves
 * near the edge. Returns { angle, arc, dir, depth }, or null.
 */
export function tornadoWake(state) {
  const { polished, quickStir } = state.spoon;
  if (!polished || !quickStir || state.stir.time < C.tornadoSpinUp) return null;
  return {
    angle: state.angle,
    arc: turnSpeed(state) * C.tornadoTrail,
    dir: state.stir.dir,
    depth: C.tornadoDepth + C.tornadoDepthPerLevel * (polished + quickStir - 2),
  };
}

/** Is a leaf inside the wake? Half a lane ahead of the spoon counts too. */
export function inWake(wake, enemy) {
  if (enemy.radius < RIM - wake.depth) return false;
  const behind = angleDifference(wake.angle, enemy.angle) * wake.dir;
  return behind > -LANE_STEP * 0.5 && behind < wake.arc;
}

/** Distance between two points in the cup, from their polar coordinates. */
function distance(a, b) {
  return Math.sqrt(a.radius ** 2 + b.radius ** 2 - 2 * a.radius * b.radius * Math.cos(a.angle - b.angle));
}

/**
 * Double Gilt (Golden Spoon + Double Trouble): when a golden twin dart
 * destroys a leaf, the nearest other leaf within reach is splashed too.
 * Returns that leaf, or null.
 */
export function giltSplashTarget(enemies, victim, shot) {
  if (!shot.golden || !shot.veer || shot.sugar) return null;
  let best = null;
  let bestDistance = C.giltSplash;
  for (const enemy of enemies) {
    const d = distance(enemy, victim);
    if (enemy !== victim && d < bestDistance) {
      best = enemy;
      bestDistance = d;
    }
  }
  return best;
}
