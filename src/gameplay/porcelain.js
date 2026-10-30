// The cup's condition: the porcelain remembers what the spoon survived.
//
// Lives stay the simulation's count (state.lives); this module keeps the
// visible history that goes with them in state.porcelain:
//   { serial, fractures: [{ id, kind, angle, seed }] }
// kind is 'crack' (active damage), 'seam' (a crack mended with gold, kept for
// the rest of the pot) or 'chip' (a superficial mark left by losing a bonus
// fourth cup). The invariant, checked when a pot is saved: there is exactly
// one active crack for every cup below the ordinary baseline,
//   cracks === max(0, CONFIG.lives - lives).
// Fracture shapes come from `seed` alone, which is derived from the fracture's
// serial number and angle: no gameplay random stream is ever consulted.

import { CONFIG } from '../config.js';
import { toSeed } from '../core/random.js';
import { normalizeAngle } from './arena.js';

const P = CONFIG.porcelain;
const BASELINE = CONFIG.lives;

/** What the HUD calls the cup at each life count. Presentation only. */
export const CONDITIONS = Object.freeze([
  Object.freeze({ id: 'shattered', label: 'SHATTERED', words: 'Shattered.' }),
  Object.freeze({ id: 'critical', label: 'STRUCTURAL FAILURE IMMINENT', words: 'Structural failure imminent: one more spill breaks the cup.' }),
  Object.freeze({ id: 'cracked', label: 'PORCELAIN CRACKED', words: 'Porcelain cracked.' }),
  Object.freeze({ id: 'stable', label: 'CUP STABLE', words: 'Cup stable.' }),
  Object.freeze({ id: 'reinforced', label: 'REINFORCED', words: 'Reinforced: one spill to spare.' }),
]);

export const FRACTURE_KINDS = Object.freeze(['chip', 'crack', 'seam']);

export function cupCondition(lives) {
  return CONDITIONS[Math.max(0, Math.min(CONDITIONS.length - 1, lives))];
}

export function createPorcelain() {
  return { serial: 0, fractures: [] };
}

/** A fracture's shape seed: stable for the pot, independent of every random stream. */
export function fractureSeed(id, angle) {
  return toSeed(Math.imul(id + 1, 0x9e3779b1) ^ Math.round(normalizeAngle(angle) * 1e4));
}

export const activeCracks = (porcelain) => porcelain.fractures.filter((f) => f.kind === 'crack').length;

/** The number of active cracks a cup with this many lives must show. */
export const cracksFor = (lives) => Math.max(0, BASELINE - lives);

function addFracture(porcelain, kind, angle) {
  const id = porcelain.serial++;
  const fracture = { id, kind, angle: normalizeAngle(angle), seed: fractureSeed(id, angle) };
  porcelain.fractures.push(fracture);
  // History is bounded: the oldest seam or chip gives way. Active cracks (at most
  // BASELINE of them) are never dropped, so the cup always tells the truth.
  while (porcelain.fractures.length > P.maxFractures) {
    const old = porcelain.fractures.findIndex((f) => f.kind !== 'crack');
    porcelain.fractures.splice(old, 1);
  }
  return fracture;
}

/**
 * A leaf has spilled and state.lives has already gone down: mark the rim where
 * it went over. Losing a bonus fourth cup only chips the glaze.
 * @returns {object} the new fracture
 */
export function crackCup(state, angle) {
  return addFracture(state.porcelain, state.lives >= BASELINE ? 'chip' : 'crack', angle);
}

/**
 * The one way a lost cup comes back, whatever brought it: up to `max` lives.
 * Back within the ordinary baseline, the most recent active crack is filled
 * with gold, and stays that way for the rest of the pot. Emits `mend` with the
 * new seam when one forms.
 * @param {{ state: object, emit?: Function }} sim
 * @param {number} max the most lives this source may bring the cup to
 * @param {string} source 'goldenLeaf', 'goldenCube' or 'grind'
 * @returns {boolean} true if a life was restored
 */
export function restoreLife({ state, emit = () => {} }, max, source) {
  if (state.lives >= max) return false;
  state.lives++;
  if (state.lives > BASELINE) return true; // reinforced: nothing to mend
  const crack = state.porcelain.fractures.findLast((f) => f.kind === 'crack');
  if (crack) {
    crack.kind = 'seam';
    emit('mend', { source, id: crack.id, angle: crack.angle, lives: state.lives });
  }
  return true;
}

/**
 * The cup a 0.16.0 save describes. It never recorded where its leaves spilled,
 * so its cracks sit at fixed, documented places rather than invented ones.
 */
export function porcelainForLives(lives) {
  const porcelain = createPorcelain();
  for (let i = 0; i < cracksFor(lives); i++) addFracture(porcelain, 'crack', P.migratedAngles[i]);
  return porcelain;
}
