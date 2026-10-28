// Hot Chocolate Havoc: a bonus round that sometimes follows a reading. The
// tea turns to hot chocolate, marshmallows float up instead of leaves, and the
// spoon fires little flames. Nothing here costs a cup.
//
// Cooking: every flame that lands adds one level of doneness and one unit of
// heat, and heat cools off over time. Enough well-spaced flames toast a
// marshmallow perfectly, and it pops out of the cup at once; pile on the heat
// too fast and it catches fire. Anything still in the cup is scooped up at
// the rim (or when time runs out) and scores for how well done it is.
//
// The bonus round has its own random generator (passed in as `rng`), so the
// normal rounds play out exactly the same with or without it. Functions
// receive `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { LANES, LANE_STEP, TAU, angleDifference, laneAngle, wrapLane } from './arena.js';
import { spoonLane } from './player.js';
import { steamSpeedFactor } from './upgrades.js';

const C = CONFIG.chocolate;
const RIM = CONFIG.arena.rimRadius;

// ── When it happens ──────────────────────────────────────────────────────

/** At a new match: the round after which the first bonus is guaranteed. */
export function firstHavocRound(rng) {
  return C.firstAfterMin + rng.int(C.firstAfterMax - C.firstAfterMin + 1);
}

/**
 * At a reading: does a bonus round want to come before the next cup? The
 * first one is fixed in advance; after that it is a simple chance, never
 * sooner than C.minGap rounds after the last. A milestone boss due at the
 * same reading goes first, and the bonus is put off to the next reading
 * (see readLeaves() in game.js).
 */
export function havocDue(state, rng) {
  if (state.havocAfter !== null) return state.round >= state.havocAfter;
  return state.round - state.lastHavoc >= C.minGap && rng.next() < C.chance;
}

// ── State ────────────────────────────────────────────────────────────────

export function createHavoc(rng) {
  return {
    stage: 'intro', // intro → play → outro
    time: 0, // seconds in the current stage
    left: C.duration, // seconds of toasting left
    clock: 0, // seconds of toasting so far (drives the irregular drift)
    flames: [], // { angle, radius, speed, reach, travelled, golden }
    marshmallows: [], // see spawnMarshmallow()
    spawnTimer: 0,
    giantTimer: rng.next() < C.giantChance ? rng.range(C.giantDelayMin, C.giantDelayMax) : null,
    nextId: 1,
    tally: { perfect: 0, toasted: 0, burned: 0, raw: 0, crumbled: 0, points: 0 },
    summary: null, // filled in when the havoc ends
  };
}

/** The bonus round in progress (or paused), or null. */
export function havocInProgress(state) {
  const inIt = state?.phase === PHASE.CHOCOLATE || (state?.phase === PHASE.PAUSED && state.pausedFrom === PHASE.CHOCOLATE);
  return inIt ? state.chocolate : null;
}

/** How a marshmallow is doing: 'raw', 'toasted', 'perfect', or 'burned'. */
export function toastStage(m) {
  if (m.burned) return 'burned';
  if (m.cook >= C.perfectAt) return 'perfect';
  if (m.cook >= C.toastAt) return 'toasted';
  return 'raw';
}

/** Flames get the Polished Spoon's speed (and a little range) and the Golden Spoon's speed. */
export function flameSpeed(state) {
  return C.flameSpeed * steamSpeedFactor(state.spoon) * (state.goldenSpoon > 0 ? CONFIG.goldenSpoon.speedFactor : 1);
}

export function flameReach(state) {
  return C.flameRange * (1 + C.polishedRange * state.spoon.polished);
}

export function spawnMarshmallow({ state, rng }, props = {}) {
  const c = state.chocolate;
  const lane = props.lane ?? rng.int(LANES);
  const radius = props.radius ?? rng.range(C.spawnRadiusMin, C.spawnRadiusMax);
  const m = {
    id: c.nextId++,
    lane,
    angle: laneAngle(lane),
    radius,
    home: Math.min(radius, C.spawnRadiusMin), // never pushed further in than this
    speed: rng.range(C.speedMin, C.speedMax),
    size: C.size,
    cook: 0, // doneness: one level per flame
    heat: 0, // how hot it is right now; cools over time
    burned: false,
    giant: false,
    mini: false,
    hits: 0,
    push: 0, // distance still to be nudged back towards the centre
    hop: rng.range(C.hopMin, C.hopMax),
    seed: rng.range(0, TAU), // phase for its bobbing, spin, and drift
    bump: 0, // seconds before it can announce another bump
    age: 0,
    ...props,
  };
  c.marshmallows.push(m);
  return m;
}

// ── Flames ───────────────────────────────────────────────────────────────

/** Fire a flame down the spoon's lane if the cooldown allows. */
export function fireFlame({ state, emit }) {
  if (state.shotCooldown > 0) return false;
  const golden = state.goldenSpoon > 0;
  state.shotCooldown = C.flameCooldown * (golden ? CONFIG.goldenSpoon.cooldownFactor : 1);
  const lane = spoonLane(state);
  state.chocolate.flames.push({
    angle: laneAngle(lane),
    radius: RIM - CONFIG.steam.spawnInset,
    speed: flameSpeed(state),
    reach: flameReach(state),
    travelled: 0,
    golden,
  });
  emit('flame', { lane, golden });
  return true;
}

/** Does a flame touch a marshmallow? Bigger marshmallows are easier to hit. */
function touches(flame, m) {
  const halfWidth = Math.max(LANE_STEP * 0.48, Math.atan2(m.size * 0.9, Math.max(1, m.radius)));
  return Math.abs(m.radius - flame.radius) < m.size * 0.7 + 9
    && Math.abs(angleDifference(m.angle, flame.angle)) < halfWidth;
}

// ── Scoring ──────────────────────────────────────────────────────────────

/** Score a marshmallow leaving the cup, by how well done it is. */
function collect({ state, emit }, m, how) {
  const c = state.chocolate;
  const stage = toastStage(m);
  const points = C.points[stage];
  c.tally[stage]++;
  c.tally.points += points;
  state.score += points;
  emit(stage === 'perfect' ? 'perfect' : 'scoop', {
    angle: m.angle, radius: m.radius, stage, points, how, mini: m.mini, size: m.size,
  });
}

function remove(c, m) {
  const i = c.marshmallows.indexOf(m);
  if (i >= 0) c.marshmallows.splice(i, 1);
}

/** The giant marshmallow takes a flame: it swells, and eventually bursts. */
function inflate(sim, m) {
  const { state, rng, emit } = sim;
  const c = state.chocolate;
  m.hits++;
  m.size = C.giantSize * (1 + C.giantGrowth * m.hits);
  m.push = Math.max(m.push, C.knockback * 0.4);
  if (m.hits < C.giantHits) {
    emit('giantGrow', { angle: m.angle, radius: m.radius, hits: m.hits, left: C.giantHits - m.hits });
    return;
  }
  remove(c, m);
  // MARSHMALLOW CATASTROPHE: little ones fan out into the lanes around it.
  for (let i = 0; i < C.giantMinis; i++) {
    const offset = i - (C.giantMinis - 1) / 2;
    spawnMarshmallow(sim, {
      lane: wrapLane(m.lane + Math.round(offset)),
      angle: m.angle,
      radius: Math.min(RIM - 40, Math.max(C.spawnRadiusMin, m.radius + rng.range(-30, 30))),
      size: C.miniSize,
      mini: true,
    });
  }
  emit('catastrophe', { angle: m.angle, radius: m.radius, count: C.giantMinis });
}

/** A flame lands. */
function toast(sim, m, flame) {
  const { state, emit } = sim;
  if (m.giant) {
    inflate(sim, m);
    return;
  }
  const c = state.chocolate;
  if (m.burned) {
    // A burned marshmallow crumbles to ash, clearing the lane.
    remove(c, m);
    c.tally.crumbled++;
    emit('crumble', { angle: m.angle, radius: m.radius });
    return;
  }
  m.cook++;
  m.heat += flame.golden ? C.goldenHeat : 1;
  m.push = Math.max(m.push, C.knockback);
  if (m.heat > C.flashPoint) {
    m.burned = true;
    emit('burn', { angle: m.angle, radius: m.radius });
  } else if (m.cook >= C.perfectAt) {
    remove(c, m);
    collect(sim, m, 'perfect');
  } else {
    emit('toast', { angle: m.angle, radius: m.radius, stage: toastStage(m), cook: m.cook, heat: m.heat });
  }
}

// ── Per-frame update ─────────────────────────────────────────────────────

function drift(m, c, dt) {
  m.age += dt;
  m.bump = Math.max(0, m.bump - dt);
  m.heat = Math.max(0, m.heat - C.coolRate * dt);
  // Bob into neighbouring lanes now and then, easing across.
  m.angle += angleDifference(laneAngle(m.lane), m.angle) * Math.min(1, dt * 5);
  // Drift outward unevenly, as if the chocolate had lumps in it.
  const lumpy = 0.65 + 0.35 * Math.sin(c.clock * 1.3 + m.seed) + 0.1 * Math.sin(c.clock * 3.7 + m.seed * 2);
  m.radius += (m.giant ? C.giantSpeed : m.speed) * lumpy * dt;
  if (m.push > 0) {
    const move = m.push * (1 - Math.exp(-dt * 8));
    m.push = m.push - move < 0.5 ? 0 : m.push - move;
    m.radius = Math.max(m.home, m.radius - move);
  }
}

/** Marshmallows that drift into each other nudge apart (and say so, occasionally). */
function nudge({ state, emit }) {
  const list = state.chocolate.marshmallows;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (Math.abs(angleDifference(a.angle, b.angle)) > LANE_STEP * 0.6) continue;
      const room = (a.size + b.size) * 0.9;
      const gap = Math.abs(a.radius - b.radius);
      if (gap >= room) continue;
      const [outer, inner] = a.radius >= b.radius ? [a, b] : [b, a];
      const overlap = room - gap;
      outer.radius += overlap * 0.5;
      inner.radius = Math.max(inner.home, inner.radius - overlap * 0.5);
      if (overlap > 3 && !a.bump && !b.bump) {
        a.bump = b.bump = 1.2;
        emit('bump', { angle: outer.angle, radius: (outer.radius + inner.radius) / 2 });
      }
    }
  }
}

/** Advance the toasting: spawn, drift, flames, hits, and scooping at the rim. */
export function updateHavoc(sim, dt) {
  const { state, rng, emit } = sim;
  const c = state.chocolate;
  c.clock += dt;

  c.spawnTimer -= dt;
  if (c.spawnTimer <= 0) {
    c.spawnTimer = rng.range(C.spawnMin, C.spawnMax);
    if (c.marshmallows.filter((m) => !m.giant).length < C.maxActive) spawnMarshmallow(sim);
  }
  if (c.giantTimer !== null) {
    c.giantTimer -= dt;
    if (c.giantTimer <= 0) {
      c.giantTimer = null;
      const giant = spawnMarshmallow(sim, {
        lane: wrapLane(spoonLane(state) + rng.int(7) - 3), radius: C.giantRadius, size: C.giantSize, giant: true,
      });
      emit('giantAppear', { angle: giant.angle, radius: giant.radius });
    }
  }

  for (const m of c.marshmallows) drift(m, c, dt);
  nudge(sim);

  for (let i = c.flames.length - 1; i >= 0; i--) {
    const flame = c.flames[i];
    const step = flame.speed * dt;
    flame.radius -= step;
    flame.travelled += step;
    // The outermost marshmallow in its path takes the flame.
    let target = null;
    for (const m of c.marshmallows) {
      if (touches(flame, m) && (!target || m.radius > target.radius)) target = m;
    }
    if (target) {
      c.flames.splice(i, 1);
      toast(sim, target, flame);
    } else if (flame.travelled >= flame.reach) {
      c.flames.splice(i, 1);
    }
  }

  // Scooped at the rim.
  for (let i = c.marshmallows.length - 1; i >= 0; i--) {
    const m = c.marshmallows[i];
    if (m.radius < RIM - 8 - m.size * 0.4) continue;
    c.marshmallows.splice(i, 1);
    if (m.giant) emit('giantGone', { angle: m.angle });
    else collect(sim, m, 'rim');
  }
}

/**
 * Time's up: scoop up whatever is left, work out the rewards, and apply them.
 * Returns the summary shown while the chocolate turns back into tea.
 */
export function finishHavoc(sim) {
  const { state } = sim;
  const c = state.chocolate;
  for (const m of [...c.marshmallows]) {
    if (!m.giant) collect(sim, m, 'end');
  }
  c.flames = [];
  const { perfect, toasted, burned, raw, crumbled, points } = c.tally;
  const grade = perfect >= C.greatPerfects ? 'great' : perfect >= C.goodPerfects ? 'good' : 'modest';
  const bonus = grade === 'great' ? C.greatBonus : grade === 'good' ? C.goodBonus : 0;
  const sugar = grade === 'modest' ? 0 : C.rewardSugar;
  state.score += bonus;
  state.extraSugar += sugar;
  c.summary = { perfect, toasted, burned, raw, crumbled, points, bonus, sugar, grade, total: points + bonus };
  return c.summary;
}
