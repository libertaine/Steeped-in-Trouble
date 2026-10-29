// The Tea Run: a silver spoon on legs runs down the sidewalk to the tea shop.
//
// A self-contained side-scroller. The spoon runs on its own at a steady
// speed; the player only jumps (over a rolling sugar cube or a spilled tea
// puddle) and slides (under a giant coffee cup hanging over the pavement).
// Three stumbles and the errand is off; reach the shop door and the tea is
// restocked. Neither outcome touches the cups, the spoon's upgrades, the
// round, or the next fortune.
//
// Everything is plain data on state.run, advanced in time-based steps: the
// first jump is a fixed parabola over CONFIG.teaRun.jumpTime. Aerial impulses
// start at the current altitude; 120 Hz ticks keep collision decisions stable.
// The course is planned in full at the start from the
// run's own random generator (`rng`, separate from the cup's), so a seed and
// the same presses always give the same errand.
//
// Distances run along the sidewalk from the gate (0) to the shop door
// (run.finish); `run.distance` is where the spoon's centre is. Heights are
// above the paving. Functions receive `sim` = { state, rng, emit }.
//
// Stages: intro → run → finish (trotting into the shop) → outro; or
// intro → run → outro when the errand fails.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { earnTeaCash, restock } from './shortage.js';

const R = CONFIG.teaRun;
const KINDS = Object.keys(R.obstacles);
const GRAVITY = 8 * R.jumpHeight / R.jumpTime ** 2;
const IMPULSE = 4 * R.jumpHeight / R.jumpTime;

/** One opportunity for the whole run. Lower encounters never steal an orbital ticket. */
function aerialOpportunity(rng) {
  let roll = rng.next();
  for (const [kind, spec] of Object.entries(R.aerial)) {
    if (roll < spec.chance) return kind;
    roll -= spec.chance;
  }
  return null;
}

const lerp = (a, b, u) => a + (b - a) * u;

// ── The course ───────────────────────────────────────────────────────────

/** The obstacle's hitbox at a moment of the run: { left, right, bottom, top }. */
export function obstacleBox(ob, clock) {
  const O = R.obstacles[ob.kind];
  const left = ob.x0 - ob.roll * clock;
  if (ob.kind === 'coffeeCup') {
    return { left: left + O.inset, right: left + O.width - O.inset, bottom: O.clearance, top: O.clearance + O.height };
  }
  return { left: left + O.inset, right: left + O.width - O.inset, bottom: 0, top: O.height - (ob.kind === 'puddle' ? 2 : O.inset) };
}

/** Where an obstacle's drawing starts along the sidewalk at a moment of the run. */
export const obstacleX = (ob, clock) => ob.x0 - ob.roll * clock;

/**
 * Seconds the spoon spends alongside an obstacle's hitbox at full speed: the
 * window its jump or slide has to cover.
 */
export function overlapTime(kind) {
  const O = R.obstacles[kind];
  return (O.width - 2 * O.inset + 2 * R.spoon.halfWidth) / (R.speed + (O.roll ?? 0));
}

/** The next obstacle kind: anything but a third in a row of the same. */
function pickKind(rng, previous) {
  const [a, b] = previous.slice(-2);
  const pool = a && a === b ? KINDS.filter((k) => k !== a) : KINDS;
  return pool[rng.int(pool.length)];
}

/**
 * Plan the whole errand. Obstacle i meets the spoon (its hitbox reaches the
 * spoon's front) `at` seconds into the run, at full speed. The first three
 * show one of each kind, and the gaps narrow a little towards the shop but
 * never below CONFIG.teaRun.minGap, which leaves a jump or slide, the moment
 * of recovery after it, and more than half a second to spare between any two.
 */
export function planCourse(rng) {
  const { speed } = R;
  const hw = R.spoon.halfWidth;
  const opening = [...KINDS];
  for (let i = opening.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [opening[i], opening[j]] = [opening[j], opening[i]];
  }
  const obstacles = [];
  const pickups = [];
  const last = R.courseTime - R.clearRun;
  let at = R.firstAt;
  for (let i = 0; at <= last; i++) {
    const kind = i < opening.length ? opening[i] : pickKind(rng, obstacles.map((o) => o.kind));
    const O = R.obstacles[kind];
    const roll = O.roll ?? 0;
    // Placed so its hitbox meets the spoon's front at `at`, rolling or not.
    const x0 = speed * at + hw - O.inset + roll * at;
    obstacles.push({ id: i, kind, at, x0, roll, hitAt: null });
    // Where the spoon's centre is when it is level with the obstacle's middle.
    const middle = speed * (at + overlapTime(kind) / 2);
    if (rng.next() < R.packetChance) {
      pickups.push({ kind: 'packet', x: middle, height: O.action === 'jump' ? R.packetHeight : 12, takenAt: null });
    }
    const gap = Math.max(R.minGap, lerp(R.gapStart, R.gapEnd, at / R.courseTime) + rng.range(0, R.gapJitter));
    if (rng.next() < R.coinChance && gap >= R.coinGap && at + gap <= last) {
      const mid = speed * (at + gap / 2);
      for (const k of [-1, 0, 1]) pickups.push({ kind: 'coin', x: mid + k * 36, height: 20, takenAt: null });
    }
    at += gap;
  }
  return { obstacles, pickups, finish: speed * R.courseTime };
}

// ── State ────────────────────────────────────────────────────────────────

export function createRun(rng) {
  const { obstacles, pickups, finish } = planCourse(rng);
  return {
    stage: 'intro',
    time: 0, // seconds in the current stage
    age: 0, // presentation clock, frozen by pause/backgrounding along with simulation
    accumulator: 0,
    clock: 0, // seconds of running
    left: R.timeLimit, // seconds until the shop shuts
    distance: 0,
    finish,
    spoon: {
      action: 'run', // 'run', 'jump', or 'slide'
      time: 0, // seconds into the action
      recover: 0, // seconds before the next action can start
      queued: null, // a press waiting for the spoon to be ready: 'jump' or 'slide'
      queuedFor: 0, // seconds it will wait
      tumble: 0, // seconds of tumbling left
      safe: 0, // seconds before another stumble can land
      launchHeight: 0,
      chain: 0,
      locked: false,
      smoke: 0,
    },
    obstacles,
    pickups,
    hits: 0,
    coins: 0,
    packets: 0,
    result: null, // 'success' or 'failed', once it is over
    summary: null,
    opportunity: aerialOpportunity(rng),
    encounter: null,
    encountered: null,
    notice: null,
    camera: 0,
  };
}

/** The errand in progress (or paused), or null. */
export function runInProgress(state) {
  const inIt = state?.phase === PHASE.TEA_RUN || (state?.phase === PHASE.PAUSED && state.pausedFrom === PHASE.TEA_RUN);
  return inIt ? state.run : null;
}

// ── The spoon ────────────────────────────────────────────────────────────

/** Height above the paving, using the same gravity/impulse as the ordinary jump. */
export function spoonHeight(spoon) {
  if (spoon.action !== 'jump') return 0;
  return Math.max(0, (spoon.launchHeight ?? 0) + IMPULSE * spoon.time - GRAVITY * spoon.time ** 2 / 2);
}

/** The spoon's hitbox: { left, right, bottom, top }. Sliding, it is much lower. */
export function spoonBox(run) {
  const { spoon, distance } = run;
  const bottom = spoonHeight(spoon);
  const height = spoon.action === 'slide' ? R.spoon.slideHeight : R.spoon.height;
  return { left: distance - R.spoon.halfWidth, right: distance + R.spoon.halfWidth, bottom, top: bottom + height };
}

const ready = (spoon) => spoon.action === 'run' && spoon.recover <= 0 && spoon.tumble <= 0;

function begin(spoon, action, emit) {
  spoon.action = action;
  spoon.time = 0;
  spoon.queued = null;
  if (action === 'jump') {
    spoon.launchHeight = 0;
    spoon.chain = 1;
    spoon.locked = false;
  }
  emit(action === 'jump' ? 'runJump' : 'runSlide', {});
}

/**
 * Fresh airborne Jump presses try an independent impulse; failure locks the
 * chain until landing and is never buffered. Other busy presses retain the
 * short ground-action buffer. An airborne Slide waits for landing.
 */
export function press(sim, action) {
  const run = sim.state.run;
  if (run?.stage !== 'run' || run.encounter || !['jump', 'slide'].includes(action)) return false;
  const { spoon } = run;
  if (spoon.action === 'jump' && action === 'jump') {
    // A failed aerial press is consumed here, never buffered into another takeoff.
    spoon.queued = null;
    if (spoon.locked) return false;
    if (sim.rng.next() >= R.aerialChance) {
      spoon.locked = true;
      run.feedback = { success: false, at: run.age };
      sim.emit('runAerialFail', {});
      return false;
    }
    spoon.launchHeight = spoonHeight(spoon);
    spoon.time = 0;
    spoon.chain++;
    run.feedback = { success: true, at: run.age };
    sim.emit('runAerialJump', { chain: spoon.chain });
    return true;
  }
  if (ready(spoon)) begin(spoon, action, sim.emit);
  else {
    spoon.queued = action;
    spoon.queuedFor = R.bufferTime;
  }
  return true;
}

function updateSpoon(spoon, dt, emit) {
  spoon.safe = Math.max(0, spoon.safe - dt);
  spoon.tumble = Math.max(0, spoon.tumble - dt);
  spoon.smoke = Math.max(0, spoon.smoke - dt);
  if (spoon.action !== 'run') {
    spoon.time += dt;
    const landed = spoon.action === 'jump' && spoon.time >= R.jumpTime - 1e-9 && spoonHeight(spoon) <= 1e-7;
    if (landed || (spoon.action === 'slide' && spoon.time >= R.slideTime - 1e-9)) {
      if (spoon.action === 'jump') emit('runLand', {});
      spoon.action = 'run';
      spoon.time = 0;
      spoon.recover = R.recoverTime;
      spoon.chain = 0;
      spoon.locked = false;
      spoon.launchHeight = 0;
    }
  } else {
    spoon.recover = Math.max(0, spoon.recover - dt);
  }
  if (spoon.queued) {
    if (ready(spoon)) begin(spoon, spoon.queued, emit);
    else {
      spoon.queuedFor -= dt;
      if (spoon.queuedFor <= 0) spoon.queued = null;
    }
  }
}

// ── Collisions ───────────────────────────────────────────────────────────

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.bottom < b.top && b.bottom < a.top;

/** A stumble: the obstacle is knocked flat (and can't trip the spoon again), and the spoon tumbles. */
function stumble({ state, emit }, ob) {
  const run = state.run;
  const { spoon } = run;
  ob.hitAt = run.clock;
  run.hits++;
  spoon.safe = R.safeTime;
  spoon.tumble = R.tumbleTime;
  spoon.queued = null;
  // A slide ends in a heap; a jump keeps its arc, so the spoon never drops out of the air.
  if (spoon.action === 'slide') {
    spoon.action = 'run';
    spoon.time = 0;
  }
  emit('runHit', { kind: ob.kind, hits: run.hits, left: R.hits - run.hits });
}

function collide(sim) {
  const run = sim.state.run;
  if (run.spoon.safe > 0) return; // still seeing stars: nothing lands
  const box = spoonBox(run);
  for (const ob of run.obstacles) {
    if (ob.hitAt !== null || ob.bypassed) continue;
    if (overlaps(box, obstacleBox(ob, run.clock))) {
      stumble(sim, ob);
      return;
    }
  }
}

function collect({ state, emit }) {
  const run = state.run;
  const box = spoonBox(run);
  const r = R.pickupRadius;
  for (const p of run.pickups) {
    if (p.takenAt !== null) continue;
    if (p.x + r < box.left || p.x - r > box.right || p.height + r < box.bottom || p.height - r > box.top) continue;
    p.takenAt = run.clock;
    if (p.kind === 'coin') run.coins++;
    else run.packets++;
    emit('runPickup', { kind: p.kind, coins: run.coins, packets: run.packets });
  }
}

// ── The end ──────────────────────────────────────────────────────────────

/**
 * Settle the errand. Coins and tea packets are worth a few points however it
 * ends; only reaching the shop restocks the tea and pays the run's Tea Cash.
 */
function finish({ state, emit }, result, reason = null) {
  const run = state.run;
  run.result = result;
  run.stage = result === 'success' ? 'finish' : 'outro';
  run.time = 0;
  run.spoon.queued = null;
  const summary = {
    result, reason, hits: run.hits, coins: run.coins, packets: run.packets, time: run.clock,
    points: run.coins * R.coinPoints + run.packets * R.packetPoints, cash: 0, sugar: 0,
  };
  state.score += summary.points;
  if (result === 'success') {
    restock(state);
    summary.sugar = CONFIG.shortage.restockSugar;
    summary.cash = earnTeaCash(state, CONFIG.teaCash.runBonus);
  }
  run.summary = summary;
  emit(result === 'success' ? 'runFinish' : 'runFail', { ...summary });
}

/** Leave the intro and start running. */
export function startRunning(run) {
  run.stage = 'run';
  run.time = 0;
}

export const AERIAL_DISCOVERIES = Object.freeze({
  bird: { title: 'A LITTLE BIRD TOLD ME...', detail: 'Apparently, spoons cannot fly.' },
  power: { title: 'A SHOCKING DEVELOPMENT', detail: 'Conductivity was not covered in the instructions.' },
  orbit: { title: 'ONE GIANT LEAP FOR SPOONKIND.', detail: 'Please remain within walking distance of the store.' },
});

function encounterDue({ state, emit }) {
  const run = state.run;
  const kind = run.opportunity;
  if (!kind || run.encountered || spoonHeight(run.spoon) < R.aerial[kind].altitude) return false;
  run.encountered = kind;
  run.encounter = { kind, time: 0, height: spoonHeight(run.spoon), camera: run.camera, reentry: false };
  run.spoon.queued = null;
  state.aerialDiscoveries ??= [];
  if (!state.aerialDiscoveries.includes(kind)) {
    state.aerialDiscoveries.push(kind);
    emit('runDiscovery', { id: kind });
  }
  emit(kind === 'bird' ? 'runBird' : kind === 'power' ? 'runZap' : 'runOrbit', {});
  return true;
}

function returnSafely({ state, emit }) {
  const run = state.run;
  const kind = run.encounter.kind;
  // Keep distance, course, clocks and pickups. Only bypass hazards within the
  // reaction window, including a rolling cube that could enter that window.
  for (const ob of run.obstacles) {
    const box = obstacleBox(ob, run.clock);
    if (box.right >= run.distance - R.spoon.halfWidth
      && box.left <= run.distance + R.spoon.halfWidth + (R.speed + ob.roll) * R.safeTime) ob.bypassed = true;
  }
  Object.assign(run.spoon, { action: 'run', time: 0, recover: R.recoverTime,
    queued: null, queuedFor: 0, launchHeight: 0, chain: 0, locked: false,
    smoke: kind === 'power' ? 3 : 0 });
  run.encounter = null;
  run.camera = 0;
  run.notice = { kind, left: 2.8 };
  emit('runReturn', { kind });
}

/** Fixed runner ticks keep collision/threshold decisions independent of display rate. */
export function updateRun(sim, dt) {
  const run = sim.state.run;
  run.accumulator += dt;
  const tick = 1 / 120;
  while (run.accumulator >= tick - 1e-10) {
    run.accumulator = Math.max(0, run.accumulator - tick);
    updateStep(sim, tick);
  }
}

function updateStep(sim, dt) {
  const run = sim.state.run;
  run.age += dt;
  if (run.encounter) {
    const e = run.encounter;
    e.time += dt;
    if (e.kind === 'orbit' && e.time >= 3.5 && !e.reentry) {
      e.reentry = true;
      sim.emit('runReentry', {});
    }
    if (e.time >= R.aerial[e.kind].duration - 1e-9) returnSafely(sim);
    return;
  }
  if (run.notice) {
    run.notice.left -= dt;
    if (run.notice.left <= 0) run.notice = null;
  }
  run.time += dt;
  if (run.stage === 'intro') {
    if (run.time >= R.introTime) {
      startRunning(run);
      sim.emit('runGo', {});
    }
    return;
  }
  if (run.stage === 'finish') {
    // A last few steps, slowing into the shop doorway.
    const u = Math.min(1, run.time / R.finishTime);
    run.distance = Math.min(run.finish + 60, run.distance + R.speed * 0.4 * (1 - u) * dt);
    if (run.time >= R.finishTime) {
      run.stage = 'outro';
      run.time = 0;
    }
    return;
  }
  if (run.stage !== 'run') return;
  const { spoon } = run;
  run.clock += dt;
  run.left = Math.max(0, R.timeLimit - run.clock);
  run.distance += R.speed * (spoon.tumble > 0 ? R.tumblePace : 1) * dt;
  updateSpoon(spoon, dt, sim.emit);
  const targetCamera = Math.max(0, spoonHeight(spoon) - 190);
  run.camera += (targetCamera - run.camera) * (1 - Math.exp(-dt * 10));
  // Keep the spoon below the top edge even on a very long chain.
  run.camera = Math.max(run.camera, spoonHeight(spoon) - 330);
  run.camera = Math.min(run.camera, Math.max(0, spoonHeight(spoon) - 115));
  if (encounterDue(sim)) return;
  collide(sim);
  collect(sim);
  if (run.hits >= R.hits) finish(sim, 'failed', 'hits');
  else if (run.distance >= run.finish) finish(sim, 'success');
  else if (run.left === 0) finish(sim, 'failed', 'time');
}
