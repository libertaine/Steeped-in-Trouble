// Golden Opportunity: a golden sugar cube that appears once, briefly, in the
// round after the fortune. Steam (or sugar) that strikes it before it
// dissolves wins a small random reward. Functions receive
// `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { laneAngle, wrapLane } from './arena.js';
import { spoonLane } from './player.js';
import { findStrikingShot, sugarCapacity } from './weapons.js';

const G = CONFIG.golden;

/** Place the cube within reach of the spoon, partway down the cup. */
export function spawnGolden({ state, rng, emit }) {
  const lane = wrapLane(spoonLane(state) + rng.int(G.laneReach * 2 + 1) - G.laneReach);
  state.golden = { angle: laneAngle(lane), radius: rng.range(G.radiusMin, G.radiusMax), time: G.life, life: G.life };
  emit('goldenAppear', { angle: state.golden.angle, radius: state.golden.radius });
}

/** Roll and apply a reward. Returns { reward, points }. */
export function awardGolden({ state, rng }) {
  const roll = rng.next();
  const points = (n) => {
    state.score += n;
    return n;
  };
  let edge = G.jackpotChance;
  if (roll < edge) {
    state.sugarLeft = Math.max(state.sugarLeft, sugarCapacity(state));
    state.milkLeft = Math.max(state.milkLeft, CONFIG.milk.perRound);
    return { reward: 'jackpot', points: points(G.jackpotPoints) };
  }
  edge += G.lifeChance;
  if (roll < edge && state.lives < CONFIG.lives + 1) {
    state.lives++;
    return { reward: 'life', points: 0 };
  }
  edge += G.sugarChance;
  if (roll < edge) {
    state.sugarLeft = Math.max(state.sugarLeft, sugarCapacity(state)) + 1;
    return { reward: 'sugar', points: 0 };
  }
  return { reward: 'points', points: points(G.points) };
}

export function updateGolden(sim, dt) {
  const { state, emit } = sim;
  if (state.goldenTimer !== null) {
    state.goldenTimer -= dt;
    if (state.goldenTimer <= 0) {
      state.goldenTimer = null;
      spawnGolden(sim);
    }
  }
  const cube = state.golden;
  if (!cube) return;
  cube.time -= dt;
  const struck = findStrikingShot(state.shots, cube);
  if (struck >= 0) {
    state.shots.splice(struck, 1);
    state.golden = null;
    emit('goldenCatch', { angle: cube.angle, radius: cube.radius, ...awardGolden(sim) });
  } else if (cube.time <= 0) {
    state.golden = null;
    emit('goldenGone', { angle: cube.angle, radius: cube.radius });
  }
}
