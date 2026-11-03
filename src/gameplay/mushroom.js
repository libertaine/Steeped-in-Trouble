// Mushroom Tea (Chapter 3): puffballs, their spore clouds, and their sprouts.
// Functions receive `sim` = { state, rng, emit } where they need it.
//
// A puffball is a leaf kind (spawned in enemies.js, with `puff: { stage, at,
// time, warn }`). Popped by anything that destroys a leaf (steam, sugar, a
// Steam Nova, the Silver Tornado, a Double Gilt splash) it leaves a spore
// cloud where it was. Leaves inside a cloud giggle: they hardly rise, and
// score more if destroyed while giggling. A puffball nobody pops swells once
// it passes its ripening radius and then splits into sprouts, small leaves
// that slide out into the lanes either side, never beyond the cup's leaf
// limit. Sprouts are ordinary leaves in every other way.
//
// Clouds are plain data in state.spores ({ angle, radius, time, duration }),
// cleared with the field, so the boss and the bonus rounds never see one.
// Nothing here draws random numbers.

import { CONFIG } from '../config.js';
import { LANE_STEP } from './arena.js';

const P = CONFIG.puffballs;
const SP = CONFIG.spores;
const E = CONFIG.enemies;

/** Distance between two points in the cup, from their polar coordinates. */
function distance(a, b) {
  return Math.sqrt(Math.max(0, a.radius ** 2 + b.radius ** 2 - 2 * a.radius * b.radius * Math.cos(a.angle - b.angle)));
}

/** Is a leaf ({ radius, angle }) inside any spore cloud? */
export function inSpores(spores, target) {
  return spores.some((cloud) => distance(cloud, target) < SP.radius);
}

/**
 * Giggling: inside a cloud, and for a moment after leaving one. Returns the
 * share of its usual rise a leaf makes this frame. A leaf only gains the
 * `giggle` field once spores have touched it.
 */
export function giggleSlow(enemy, state, dt) {
  if (state.spores?.length && inSpores(state.spores, enemy)) enemy.giggle = SP.linger;
  else if (enemy.giggle) enemy.giggle = Math.max(0, enemy.giggle - dt);
  return enemy.giggle > 0 ? SP.hold : 1;
}

/** A popped puffball's cloud, where it popped. The oldest cloud clears if there are too many. */
export function releaseSpores({ state, emit }, puffball) {
  state.spores.push({ angle: puffball.angle, radius: puffball.radius, time: SP.duration, duration: SP.duration });
  if (state.spores.length > SP.max) state.spores.shift();
  emit('spores', { angle: puffball.angle, radius: puffball.radius });
}

export function updateSpores(state, dt) {
  for (let i = state.spores.length - 1; i >= 0; i--) {
    state.spores[i].time -= dt;
    if (state.spores[i].time <= 0) state.spores.splice(i, 1);
  }
}

/**
 * A puffball's swelling: once it passes its ripening radius it slows and
 * swells for `warn` seconds, then is ready to split ('burst'). Returns the
 * seconds of ordinary movement it makes this frame.
 */
export function advancePuff(enemy, emit, dt) {
  const p = enemy.puff;
  if (p.stage === 'waiting') {
    if (enemy.radius < p.at) return dt;
    p.stage = 'swelling';
    p.time = 0;
    emit('puffWarn', { radius: enemy.radius, angle: enemy.angle });
  }
  if (p.stage !== 'swelling') return 0;
  const t = Math.min(dt, p.warn - p.time);
  p.time += t;
  if (p.time >= p.warn) p.stage = 'burst';
  return t * P.warnPace;
}

/**
 * Split a ripe puffball (already removed from state.enemies) into sprouts,
 * clockwise first, as many as the leaf limit allows (always at least one).
 * Each starts where the puffball was and slides out into its own lane.
 */
export function sproutPuffball({ state, emit }, puffball) {
  const count = Math.min(P.sprouts, E.maxActive - state.enemies.length);
  for (let k = 0; k < count; k++) {
    const side = k % 2 === 0 ? 1 : -1;
    state.enemies.push({
      kind: 'sprout',
      angle: puffball.angle,
      radius: puffball.radius,
      home: puffball.home,
      speed: puffball.speed * P.sproutSpeed,
      wiggle: puffball.wiggle + k * 2.1,
      shifted: puffball.shifted,
      size: P.sproutSize,
      alpha: 1, // seen at once: it is close to the rim
      backwash: 0,
      glide: { shift: side * LANE_STEP, length: P.sproutGlide, time: 0, done: 0 },
    });
  }
  emit('sprout', { radius: puffball.radius, angle: puffball.angle, count });
  return count;
}
