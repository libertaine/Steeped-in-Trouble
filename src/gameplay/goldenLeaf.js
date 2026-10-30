// The Golden Leaf: a rare bonus target that mends the porcelain. It may drift
// up only in a normal round that starts with the cup cracked, at most once a
// cup, and a dart that strikes it before it sinks restores one lost cup
// (never a bonus fourth) and fills a crack with gold. It is not a tea leaf:
// it never counts towards the round's target, leaves no residue, and scores
// nothing. A dart that strikes it is a hit, like any bonus target's.
//
// It draws only from its own salted stream (`sim.rng` here is that stream), so
// fortunes, teas, leaves, bosses and every other bonus play out exactly as
// they would without it. Functions receive `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { LANE_STEP, TAU, laneAngle, wrapLane } from './arena.js';
import { spoonLane } from './player.js';
import { restoreLife } from './porcelain.js';
import { findStrikingShot, spendDart } from './weapons.js';

const L = CONFIG.goldenLeaf;

/** Salt for the Golden Leaf's own stream (see createGame()). */
export const GOLDEN_LEAF_SALT = 0x601dea4f;

/** Is there a crack a Golden Leaf could mend? */
export const repairable = (state) => state.lives < CONFIG.lives;

/**
 * At a normal round's start: maybe schedule its one Golden Leaf. Seconds
 * until it appears, or null. An eligible cup always draws twice from the
 * leaf's stream, whichever way the roll goes.
 */
export function rollGoldenLeaf(state, rng) {
  if (!repairable(state)) return null;
  const roll = rng.next();
  const delay = rng.range(L.delayMin, L.delayMax);
  return roll < L.chance ? delay : null;
}

/** Place the leaf within reach of the spoon, partway down the cup. */
export function spawnGoldenLeaf({ state, rng, emit }) {
  const lane = wrapLane(spoonLane(state) + rng.int(L.laneReach * 2 + 1) - L.laneReach);
  const home = laneAngle(lane);
  const depth = rng.range(L.radiusMin, L.radiusMax);
  const phase = rng.range(0, TAU);
  state.goldenLeaf = { home, depth, phase, angle: home, radius: depth, time: L.life, life: L.life };
  driftGoldenLeaf(state.goldenLeaf);
  emit('goldenLeafAppear', { angle: state.goldenLeaf.angle, radius: state.goldenLeaf.radius });
}

/** A gentle sway about its lane and a slow bob: never far enough to leave the lane's steam. */
function driftGoldenLeaf(leaf) {
  const age = leaf.life - leaf.time;
  leaf.angle = leaf.home + LANE_STEP * L.sway * Math.sin(leaf.phase + age * L.swayRate);
  leaf.radius = leaf.depth + L.bob * Math.sin(leaf.phase * 1.3 + age * L.bobRate);
}

export function updateGoldenLeaf(sim, dt) {
  const { state, emit } = sim;
  if (state.goldenLeafTimer !== null) {
    if (!repairable(state)) {
      state.goldenLeafTimer = null; // mended some other way first: this cup's chance has passed
    } else {
      state.goldenLeafTimer -= dt;
      if (state.goldenLeafTimer <= 0) {
        state.goldenLeafTimer = null;
        spawnGoldenLeaf(sim);
      }
    }
  }
  const leaf = state.goldenLeaf;
  if (!leaf) return;
  if (!repairable(state)) {
    state.goldenLeaf = null; // nothing left for it to mend
    emit('goldenLeafGone', { angle: leaf.angle, radius: leaf.radius, mended: true });
    return;
  }
  leaf.time -= dt;
  driftGoldenLeaf(leaf);
  const struck = findStrikingShot(state.shots, leaf);
  if (struck >= 0) {
    spendDart(state, state.shots.splice(struck, 1)[0], true);
    state.goldenLeaf = null;
    emit('goldenLeafCatch', { angle: leaf.angle, radius: leaf.radius });
    restoreLife(sim, CONFIG.lives, 'goldenLeaf');
  } else if (leaf.time <= 0) {
    state.goldenLeaf = null;
    emit('goldenLeafGone', { angle: leaf.angle, radius: leaf.radius, mended: false });
  }
}
