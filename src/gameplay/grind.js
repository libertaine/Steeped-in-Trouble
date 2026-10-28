// The Daily Grind: a furious little espresso machine that sometimes rises out
// of the cup between rounds. Its safety valve turns to face one lane after
// another and blows open for a moment; steam (or sugar) down that lane while
// it is open is what hurts it. Meanwhile it throws coffee beans out along the
// lanes and, now and then, builds up pressure and fires scalding coffee down
// the lanes it has warned about.
//
// The encounter keeps its own damage meter: three scalds and the machine
// escapes. Neither outcome touches the cups (except as a reward), the spoon,
// the round, or the next fortune; the first victory opens Chapter 2 (see
// game.js and gameplay/progress.js). Like Hot Chocolate Havoc it has its own
// random generator (passed in as `rng`), so the normal rounds play out the
// same with or without it. Functions receive `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { LANES, LANE_STEP, TAU, angleDifference, laneAngle, wrapLane } from './arena.js';
import { advanceEnemy, washBack } from './enemies.js';
import { spoonLane } from './player.js';
import { findStrikingShot, spendDart } from './weapons.js';

const G = CONFIG.grind;
const RIM = CONFIG.arena.rimRadius;

/** How angry the machine is, 0–1: the share of its health it has lost. */
export const fury = (g) => 1 - g.health / G.health;

/** A [calm, furious] pair, at the machine's current fury. */
const by = ([calm, furious], f) => calm + (furious - calm) * f;

// ── When it happens ──────────────────────────────────────────────────────

// Until it is beaten the machine is Chapter 1's milestone: state.grindAfter
// holds the round it is guaranteed to follow (G.milestoneAfter at first, then
// G.retryAfter rounds after each escape), and nothing else can take that
// reading. Once beaten, it returns now and then as a rematch with nothing at
// stake for the chapters.

/** At a reading: is the milestone encounter (the first, or a rematch after an escape) due? */
export function milestoneDue(state) {
  return state.grindAfter !== null && state.round >= state.grindAfter;
}

/**
 * At a reading, once any Hot Chocolate Havoc has been settled: does the
 * machine appear before the next cup? Until beaten, only when its milestone
 * is due; after that, an occasional rematch, never alongside the hot
 * chocolate (the rematch simply waits for a later reading).
 */
export function grindDue(state, rng) {
  if (state.grindAfter !== null) return milestoneDue(state);
  if (state.havocDue) return false;
  return state.round - state.lastGrind >= G.minGap && rng.next() < G.chance;
}

// ── State ────────────────────────────────────────────────────────────────

/** A fresh encounter; `milestone` if beating it opens the next chapter. It is the same fight either way. */
export function createGrind({ milestone = false } = {}) {
  return {
    milestone,
    stage: 'intro', // intro → fight → outro
    time: 0, // seconds in the current stage
    left: G.duration, // seconds of fighting left
    clock: 0, // seconds of fighting so far
    health: G.health,
    scalds: 0,
    safe: 0, // seconds before another scald can land
    flinch: 0, // seconds of shuddering after a hit
    valve: { lane: LANES / 2, from: LANES / 2, stage: 'turning', time: 0, length: by(G.valveTurn, 0) },
    attack: null, // see startAttack()
    attackTimer: G.firstAttack,
    lastAttack: null,
    lastPattern: null,
    beans: [], // { id, angle, radius, home, speed, backwash, alpha, spin }
    nextId: 1,
    rage: 0, // 0, 1 (half health), 2 (a fifth left): announced as it rises
    tally: { valveHits: 0, beans: 0 },
    result: null, // 'victory' or 'escaped', once it is over
    summary: null,
  };
}

/** The encounter in progress (or paused), or null. */
export function grindInProgress(state) {
  const inIt = state?.phase === PHASE.GRIND || (state?.phase === PHASE.PAUSED && state.pausedFrom === PHASE.GRIND);
  return inIt ? state.grind : null;
}

/** Is the safety valve open and facing this angle's lane? */
export function valveExposed(g, angle) {
  return g.valve.stage === 'open' && Math.abs(angleDifference(angle, laneAngle(g.valve.lane))) < LANE_STEP * 0.5;
}

/** The lanes a pressure attack has warned about (empty unless one is coming). */
export function threatenedLanes(g) {
  return g.attack?.kind === 'pressure' && g.attack.stage !== 'build' ? g.attack.lanes : [];
}

const nearSpoon = (state, angle) => Math.abs(angleDifference(angle, state.angle)) < LANE_STEP * G.hitHalfWidth;

// ── The safety valve ─────────────────────────────────────────────────────

/** Turn the valve towards a lane a little way round from the spoon. */
function turnValve({ state, rng, emit }) {
  const g = state.grind;
  const v = g.valve;
  const reach = G.valveReachMin + rng.int(G.valveReachMax - G.valveReachMin + 1);
  v.from = v.lane;
  v.lane = wrapLane(spoonLane(state) + reach * (rng.next() < 0.5 ? -1 : 1));
  v.stage = 'turning';
  v.time = 0;
  v.length = by(G.valveTurn, fury(g));
  emit('valveTurn', { lane: v.lane, from: v.from });
}

function updateValve(sim, dt) {
  const v = sim.state.grind.valve;
  v.time += dt;
  if (v.time < v.length) return;
  if (v.stage === 'turning') {
    v.stage = 'open';
    v.time = 0;
    v.length = G.valveOpen;
    sim.emit('valveOpen', { lane: v.lane, angle: laneAngle(v.lane) });
  } else {
    turnValve(sim);
  }
}

// ── Attacks ──────────────────────────────────────────────────────────────

/**
 * Coffee Bean Barrage: beans flung out along the lanes, in one of three
 * patterns. A launch has `lanes`, or `aim` (offsets from wherever the spoon
 * is at that moment).
 */
function planBarrage(rng, f, spoon, last) {
  const patterns = ['ring', 'fan', 'spiral'].filter((p) => p !== last);
  const pattern = patterns[rng.int(patterns.length)];
  const launches = [];
  if (pattern === 'ring') {
    // Every other lane, then the others: a ring of beans spreading out.
    const parity = rng.int(2);
    for (let k = 0; k < (f > 0.5 ? 4 : 3); k++) {
      const lanes = [];
      for (let lane = (parity + k) % 2; lane < LANES; lane += 2) lanes.push(lane);
      launches.push({ at: k * 0.8, lanes });
    }
  } else if (pattern === 'fan') {
    // Aimed at the spoon: either side of it, then straight at it.
    for (let k = 0; k < (f > 0.5 ? 5 : 4); k++) launches.push({ at: k * 0.6, aim: k % 2 ? [-1, 1] : [-2, 0, 2], speed: 1.15 });
  } else {
    // A pinwheel: two (later three) arms sweeping round the cup.
    const arms = f > 0.6 ? 3 : 2;
    const dir = rng.next() < 0.5 ? -1 : 1;
    const start = wrapLane(spoon + LANES / 2);
    for (let k = 0; k < 12; k++) {
      const lanes = [];
      for (let arm = 0; arm < arms; arm++) lanes.push(wrapLane(start + dir * k + Math.round((arm * LANES) / arms)));
      launches.push({ at: k * 0.17, lanes });
    }
  }
  return { kind: 'barrage', pattern, time: 0, launches, next: 0 };
}

/**
 * Pressure Release: the lanes it will fire down, always including the
 * spoon's, so the player has to move, and always leaving a safe lane within
 * easy reach.
 */
function pressureLanes(rng, f, spoon) {
  const pattern = f > 0.35 && rng.next() < 0.4 ? 'pinwheel' : rng.next() < 0.6 ? 'wedge' : 'alternate';
  const lanes = [];
  if (pattern === 'wedge') {
    const width = Math.round(by(G.wedgeLanes, f));
    const first = spoon + rng.int(3) - 1 - Math.floor(width / 2);
    for (let k = 0; k < width; k++) lanes.push(wrapLane(first + k));
  } else if (pattern === 'alternate') {
    for (let lane = spoon % 2; lane < LANES; lane += 2) lanes.push(lane);
  } else {
    // Four pairs of lanes, a quarter of the cup apart.
    const offset = spoon - rng.int(2);
    for (let k = 0; k < 4; k++) lanes.push(wrapLane(offset + k * 4), wrapLane(offset + k * 4 + 1));
  }
  return { pattern, lanes };
}

function startAttack(sim) {
  const { state, rng, emit } = sim;
  const g = state.grind;
  const f = fury(g);
  // Mostly alternating, so both attacks keep turning up; it always opens with beans.
  const kind = g.lastAttack === null ? 'barrage'
    : rng.next() < 0.75 ? (g.lastAttack === 'barrage' ? 'pressure' : 'barrage') : g.lastAttack;
  g.lastAttack = kind;
  if (kind === 'barrage') {
    g.attack = planBarrage(rng, f, spoonLane(state), g.lastPattern);
    g.lastPattern = g.attack.pattern;
    emit('barrage', { pattern: g.attack.pattern });
  } else {
    g.attack = { kind: 'pressure', stage: 'build', time: 0, length: G.pressureBuild, lanes: [], pattern: null, milked: false, reach: 0 };
    emit('pressureBuild', {});
  }
}

function endAttack(g) {
  g.attack = null;
  g.attackTimer = by(G.attackGap, fury(g));
}

function launchBeans({ state, rng, emit }, lanes, speed = 1) {
  const g = state.grind;
  const launched = [];
  for (const lane of lanes) {
    if (g.beans.length >= G.maxBeans) break;
    const radius = G.bodyRadius + 4;
    g.beans.push({
      id: g.nextId++, angle: laneAngle(lane), radius, home: radius, speed: by(G.beanSpeed, fury(g)) * speed,
      backwash: 0, alpha: 0.4, shifted: true, spin: rng.range(0, TAU),
    });
    launched.push(lane);
  }
  if (launched.length) emit('beans', { lanes: launched });
}

function updateBarrage(sim, a, dt) {
  a.time += dt;
  while (a.next < a.launches.length && a.time >= a.launches[a.next].at) {
    const launch = a.launches[a.next++];
    const spoon = spoonLane(sim.state);
    launchBeans(sim, launch.lanes ?? launch.aim.map((offset) => wrapLane(spoon + offset)), launch.speed);
  }
  if (a.next >= a.launches.length && a.time >= a.launches[a.launches.length - 1].at + 0.5) endAttack(sim.state.grind);
}

function updatePressure(sim, a, dt) {
  const { state, rng, emit } = sim;
  const g = state.grind;
  a.time += dt;
  if (a.stage === 'build' && a.time >= a.length) {
    Object.assign(a, pressureLanes(rng, fury(g), spoonLane(state)));
    a.stage = 'warn';
    a.time = 0;
    a.length = by(G.pressureWarn, fury(g));
    emit('pressureWarn', { lanes: a.lanes, time: a.length });
  } else if (a.stage === 'warn' && a.time >= a.length) {
    a.stage = 'burst';
    a.time = 0;
    a.length = G.pressureBurst;
    a.reach = G.bodyRadius;
    emit('pressureBurst', { lanes: a.lanes });
  } else if (a.stage === 'burst') {
    a.reach = Math.min(RIM, a.reach + G.jetSpeed * dt);
    if (a.reach >= RIM - 8) {
      const lane = a.lanes.find((l) => nearSpoon(state, laneAngle(l)));
      if (lane !== undefined) scald(sim, laneAngle(lane), 'jet');
    }
    if (g.stage === 'fight' && a.time >= a.length) endAttack(g);
  }
}

function updateAttack(sim, dt) {
  const g = sim.state.grind;
  if (!g.attack) {
    g.attackTimer -= dt;
    if (g.attackTimer <= 0) startAttack(sim);
    return;
  }
  if (g.attack.kind === 'barrage') updateBarrage(sim, g.attack, dt);
  else updatePressure(sim, g.attack, dt);
}

// ── Milk ─────────────────────────────────────────────────────────────────

/**
 * After a milk pour (pourMilk() in weapons.js has already spent it and laid
 * the cloud): beans under it are washed back, and a pressure attack that is
 * still building sputters and waits a little longer, once.
 */
export function milkTheMachine({ state, emit }) {
  const g = state.grind;
  const cloud = state.clouds[state.clouds.length - 1];
  if (!cloud) return;
  const M = CONFIG.milk;
  for (const bean of g.beans) {
    if (Math.abs(angleDifference(cloud.angle, bean.angle)) < LANE_STEP * M.slowHalfWidthLanes * cloud.spread) washBack(bean, M.backwash);
  }
  const a = g.attack;
  if (a?.kind === 'pressure' && a.stage !== 'burst' && !a.milked) {
    a.milked = true;
    a.time -= G.milkDelay;
    emit('sputter', { lanes: a.lanes });
  }
}

// ── Hits, both ways ──────────────────────────────────────────────────────

/** A bean or a jet reaches the spoon. Returns true if it scalded. */
function scald(sim, angle, source) {
  const { state, emit } = sim;
  const g = state.grind;
  if (g.safe > 0) return false;
  g.scalds++;
  g.safe = G.safeTime;
  emit('scald', { angle, by: source, scalds: g.scalds, left: G.scalds - g.scalds });
  if (g.scalds >= G.scalds) finish(sim, 'escaped', 'scalds');
  return true;
}

function damage(sim, amount, shot) {
  const { state, emit } = sim;
  const g = state.grind;
  g.health = Math.max(0, g.health - amount);
  g.flinch = 0.3;
  g.tally.valveHits++;
  state.score += G.hitPoints;
  emit('grindHit', { angle: shot.angle, health: g.health, damage: amount, sugar: shot.sugar, hits: g.tally.valveHits });
  const rage = fury(g) >= 0.8 ? 2 : fury(g) >= 0.5 ? 1 : 0;
  if (rage > g.rage && g.health > 0) {
    g.rage = rage;
    emit('grindRage', { level: rage });
  }
  if (g.health === 0) finish(sim, 'victory');
}

function updateBeans(sim, dt) {
  const { state, emit } = sim;
  const g = state.grind;
  for (let i = g.beans.length - 1; i >= 0; i--) {
    const bean = g.beans[i];
    bean.spin += dt * 5;
    advanceEnemy(bean, sim, dt); // milk slows and washes back beans just as it does leaves
    const struck = findStrikingShot(state.shots, bean);
    if (struck >= 0) {
      // Steam cracks a bean and is spent; sugar crunches straight through.
      const shot = state.shots[struck];
      if (!shot.sugar) spendDart(state, state.shots.splice(struck, 1)[0], true);
      g.beans.splice(i, 1);
      g.tally.beans++;
      state.score += G.beanPoints;
      emit('beanCrack', { angle: bean.angle, radius: bean.radius, sugar: shot.sugar });
      continue;
    }
    if (bean.radius < RIM - 8) continue;
    g.beans.splice(i, 1);
    if (nearSpoon(state, bean.angle) && scald(sim, bean.angle, 'bean')) {
      if (g.stage !== 'fight') return;
    } else {
      emit('beanSplat', { angle: bean.angle });
    }
  }
}

/** Darts that reach the machine: the open valve takes damage; anything else just clanks. */
function strikeMachine(sim) {
  const { state, emit } = sim;
  const g = state.grind;
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const shot = state.shots[i];
    if (shot.radius > G.bodyRadius) continue;
    state.shots.splice(i, 1);
    spendDart(state, shot, true);
    if (valveExposed(g, shot.angle)) {
      damage(sim, shot.sugar ? G.sugarDamage : G.steamDamage, shot);
      if (g.stage !== 'fight') return;
    } else {
      emit('clank', { angle: shot.angle, sugar: shot.sugar });
    }
  }
}

/** Advance the fight: the valve, the attacks, the beans, the darts, and the clock. */
export function updateGrind(sim, dt) {
  const g = sim.state.grind;
  g.clock += dt;
  g.safe = Math.max(0, g.safe - dt);
  g.flinch = Math.max(0, g.flinch - dt);
  updateValve(sim, dt);
  updateAttack(sim, dt);
  if (g.stage !== 'fight') return;
  updateBeans(sim, dt);
  if (g.stage !== 'fight') return;
  strikeMachine(sim);
  if (g.stage !== 'fight') return;
  g.left = Math.max(0, g.left - dt);
  if (g.left === 0) finish(sim, 'escaped', 'time');
}

// ── The end ──────────────────────────────────────────────────────────────

/**
 * Victory or escape. A victory pays out at once: points, and a Golden Spoon
 * whose time starts with the next cup. Without a single scald it is also a
 * Perfect Brew, which restores a cup (up to G.maxLives), or pays a little
 * extra if there's no room.
 */
function finish({ state, emit }, result, reason = null) {
  const g = state.grind;
  g.stage = 'outro';
  g.time = 0;
  g.result = result;
  g.attack = null;
  const beans = g.beans.map((b) => ({ angle: b.angle, radius: b.radius }));
  g.beans = [];
  state.shots = [];
  state.volleys = {};
  const summary = {
    result, reason, perfect: false, cup: false, bonus: 0, cash: 0, scalds: g.scalds,
    valveHits: g.tally.valveHits, beans: g.tally.beans, time: g.clock,
  };
  if (result === 'victory') {
    summary.bonus = G.points;
    // Beating a milestone boss pays Tea Cash too (gameplay/shortage.js).
    if (g.milestone) {
      summary.cash = CONFIG.teaCash.milestone;
      state.teaCash += summary.cash;
    }
    state.goldenSpoon = Math.max(state.goldenSpoon, G.goldenSpoon);
    if (g.scalds === 0) {
      summary.perfect = true;
      if (state.lives < G.maxLives) {
        state.lives++;
        summary.cup = true;
      } else {
        summary.bonus += G.fullCupPoints;
      }
    }
    state.score += summary.bonus;
  }
  g.summary = summary;
  emit(result === 'victory' ? 'grindDefeat' : 'grindEscape', { ...summary, beansLeft: beans });
}
