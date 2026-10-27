// The Prismatic Sugar Cube: a rare, fleeting crystal that may appear in any
// round after the first, whatever the fortune. Steam (or sugar) that strikes
// it before it fades sets off a Steam Nova. Functions receive
// `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { laneAngle, wrapLane } from './arena.js';
import { spoonLane } from './player.js';
import { findStrikingShot, spendDart, steamNova } from './weapons.js';

const P = CONFIG.prismatic;

/** At round start: maybe schedule the cube. Seconds until it appears, or null. */
export function rollPrismatic(round, rng) {
  if (round < P.firstRound || rng.next() >= P.chance) return null;
  return rng.range(P.delayMin, P.delayMax);
}

/** Place the cube within reach of the spoon, partway down the cup. */
export function spawnPrismatic({ state, rng, emit }) {
  const lane = wrapLane(spoonLane(state) + rng.int(P.laneReach * 2 + 1) - P.laneReach);
  state.prismatic = { angle: laneAngle(lane), radius: rng.range(P.radiusMin, P.radiusMax), time: P.life, life: P.life };
  emit('prismaticAppear', { angle: state.prismatic.angle, radius: state.prismatic.radius });
}

export function updatePrismatic(sim, dt) {
  const { state, emit } = sim;
  if (state.prismaticTimer !== null) {
    state.prismaticTimer -= dt;
    if (state.prismaticTimer <= 0) {
      state.prismaticTimer = null;
      spawnPrismatic(sim);
    }
  }
  const cube = state.prismatic;
  if (!cube) return;
  cube.time -= dt;
  const struck = findStrikingShot(state.shots, cube);
  if (struck >= 0) {
    spendDart(state, state.shots.splice(struck, 1)[0], true);
    state.prismatic = null;
    emit('prismaticCatch', { angle: cube.angle, radius: cube.radius });
    steamNova(sim);
  } else if (cube.time <= 0) {
    state.prismatic = null;
    emit('prismaticGone', { angle: cube.angle, radius: cube.radius });
  }
}
