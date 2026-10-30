// Crossing the Street: a silver spoon, five lanes of traffic, and a tea shop
// on the far side. The road (each lane's direction, speed, vehicles and
// spacing) is drawn from the mission's own generator when it is created, and
// never changes: a bump sends the spoon back to the curb but the traffic
// carries on, so the pattern can be learnt. Fixed 120 Hz ticks, like the other
// Arcade Interludes. Every vehicle's position is a closed-form function of the
// tick count, so nothing drifts and the display rate cannot matter.
//
// Collisions compare the spoon's box with the space each vehicle swept during
// the tick, so no speed can carry a vehicle through it. The sidewalks and the
// median are never driven on, so the curb is always a safe place to land.
import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { awardInterlude } from './arcadeInterludes.js';

const P = CONFIG.crossingStreet;
const W = CONFIG.arena.width;
const TICK = 1 / 120;
const LO = -P.margin; // where each lane's loop begins, off the left edge

/** Mixed into the game seed for this mission's private generator. */
export const CROSSING_SALT = 0x0c2055ed;

/** The rows vehicles drive in, nearest first. */
export const TRAFFIC_ROWS = Object.freeze([1, 2, 3, 5, 6]);

export const SIGN_LINES = Object.freeze(['NO JAYWALKING.', 'NO EXCEPTIONS FOR CUTLERY.']);
export const EXCHANGE = Object.freeze({
  shopkeeper: 'We don’t serve spoons.',
  spoon: 'Good. I’m here for the tea.',
});

export const RESULTS = Object.freeze({
  perfect: { title: 'NOT A SCRATCH ON THE SILVER!', line: 'The traffic has filed a complaint.' },
  success: { title: 'THE SPOON MADE IT!', line: 'Against the advice of several motorists.' },
  failure: { title: 'THE TRAFFIC HAS SPOKEN.', line: 'The spoon intends to appeal.' },
});

/** Hop directions as [columns, rows]. Rows count upwards, towards the shop. */
export const DIRECTIONS = Object.freeze({ up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] });

export const colX = (col) => P.left + (col + 0.5) * P.column;
export const rowY = (row) => P.bottom - (row + 0.5) * P.row;

/** Where a vehicle's centre is at traffic time t: on a loop running from LO to LO + span. */
export function vehicleX(lane, vehicle, t) {
  const s = lane.span;
  const x = vehicle.offset + lane.dir * lane.speed * t - LO;
  return LO + (((x % s) + s) % s);
}

/**
 * The x-ranges a vehicle covers between traffic times a and b (b > a). One
 * range, or two if it wrapped from one end of its loop to the other.
 */
function sweptRanges(lane, v, a, b) {
  const h = v.length / 2;
  const xa = vehicleX(lane, v, a);
  const xb = vehicleX(lane, v, b);
  const travel = lane.speed * (b - a);
  if (travel < lane.span / 2 && Math.abs(xb - xa) <= travel + 1e-6) {
    return [[Math.min(xa, xb) - h, Math.max(xa, xb) + h]];
  }
  if (travel >= lane.span / 2) return [[LO - h, LO + lane.span + h]]; // anywhere at all
  const end = LO + lane.span;
  return lane.dir > 0
    ? [[xa - h, end + h], [LO - h, xb + h]]
    : [[LO - h, xa + h], [xb - h, end + h]];
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One lane's traffic: its own kind first, then its mix, as many as fit with fair gaps. */
function drawLane(rng, row, character, dir) {
  const rule = P.lanes[character];
  const speed = Math.round(rng.range(rule.speed[0], rule.speed[1]));
  const span = W + 2 * P.margin + 40 * rng.int(5);
  const gap = Math.max(P.minGap, speed * P.minGapTime);
  const vehicles = [];
  let used = 0;
  while (vehicles.length < P.maxPerLane) {
    const kind = vehicles.length ? rule.kinds[rng.int(rule.kinds.length)] : rule.kinds[0];
    const { length, halfHeight } = P.vehicles[kind];
    if (used + length + gap > span) break;
    vehicles.push({ id: vehicles.length, kind, length, halfHeight, paint: rng.int(4), offset: 0, x: 0 });
    used += length + gap;
  }
  // The slack is shared unevenly between the gaps, so lanes have rhythm but never gridlock.
  const weights = vehicles.map(() => 0.2 + rng.next());
  const total = weights.reduce((a, b) => a + b, 0);
  let at = rng.range(0, span);
  vehicles.forEach((v, i) => {
    v.offset = at + v.length / 2;
    at += v.length + gap + (span - used) * (weights[i] / total);
  });
  return { row, character, dir, speed, span, gap, vehicles };
}

function drawLanes(rng) {
  const characters = shuffle(['car', 'car', 'van', 'van', 'milk'], rng);
  const first = rng.next() < 0.5 ? 1 : -1;
  return TRAFFIC_ROWS.map((row, i) => drawLane(rng, row, characters[i], i % 2 ? -first : first));
}

/** A known-gentle road, used only if every drawn road were refused. */
export function gentleRoad() {
  return TRAFFIC_ROWS.map((row, i) => {
    const character = ['car', 'van', 'milk', 'van', 'car'][i];
    const kind = P.lanes[character].kinds[0];
    const { length, halfHeight } = P.vehicles[kind];
    const speed = P.lanes[character].speed[0];
    const span = W + 2 * P.margin;
    const vehicles = [0, 1].map((id) => ({ id, kind, length, halfHeight, paint: (i + id) % 4, offset: id * span / 2 + i * 157, x: 0 }));
    return { row, character, dir: i % 2 ? -1 : 1, speed, span, gap: span / 2 - length, vehicles };
  });
}

/**
 * A cautious crossing from traffic time t0: one move (or a wait) every
 * `repeat` seconds, and never in a cell any vehicle comes near during that
 * step, so it holds however the hop is timed within it. Breadth-first, so the
 * first found is the quickest. Returns the moves ('wait' or a direction), or
 * null if none reaches the shop within `horizon` seconds.
 */
export function planCrossing(lanes, t0 = 0, { horizon = P.fair.horizon, margin = P.fair.margin, col = P.startCol, row = 0 } = {}) {
  const step = P.repeat;
  const pad = 2 * TICK; // a press lands on a tick boundary
  const byRow = new Map(lanes.map((l) => [l.row, l]));
  const blocked = new Map();
  const isBlocked = (k, r, c) => {
    const lane = byRow.get(r);
    if (!lane) return false;
    const key = (k * 8 + r) * P.columns + c;
    if (blocked.has(key)) return blocked.get(key);
    const lo = colX(c) - P.spoon.halfWidth - margin;
    const hi = colX(c) + P.spoon.halfWidth + margin;
    const a = t0 + k * step - pad;
    const b = t0 + (k + 1) * step + pad;
    const hit = lane.vehicles.some((v) => sweptRanges(lane, v, a, b).some(([x0, x1]) => x1 > lo && x0 < hi));
    blocked.set(key, hit);
    return hit;
  };
  let frontier = new Map([[row * P.columns + col, null]]);
  const steps = Math.ceil(horizon / step);
  for (let k = 0; k < steps; k++) {
    const next = new Map();
    for (const [cell, node] of frontier) {
      const r = Math.floor(cell / P.columns);
      const c = cell % P.columns;
      for (const move of ['up', 'wait', 'left', 'right', 'down']) {
        const [dc, dr] = move === 'wait' ? [0, 0] : DIRECTIONS[move];
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nc >= P.columns || nr < 0 || nr > P.shop) continue;
        const key = nr * P.columns + nc;
        if (next.has(key) || isBlocked(k, r, c) || isBlocked(k, nr, nc)) continue;
        const link = { move, prev: node };
        if (nr === P.shop) {
          const moves = [];
          for (let n = link; n; n = n.prev) moves.unshift(n.move);
          return moves;
        }
        next.set(key, link);
      }
    }
    if (!next.size) return null;
    frontier = next;
  }
  return null;
}

/** Can a careful spoon get across, starting from the curb at every sampled moment? */
export function fairRoad(lanes) {
  for (let t = 0; t <= P.fair.until + 1e-9; t += P.fair.every) {
    if (!planCrossing(lanes, t)) return false;
  }
  return true;
}

/** Draw roads until one is fair (it nearly always is first time); deterministic for a generator. */
export function planRoad(rng) {
  for (let attempt = 0; attempt < P.fair.attempts; attempt++) {
    const lanes = drawLanes(rng);
    if (fairRoad(lanes)) return lanes;
  }
  return gentleRoad();
}

function placeTraffic(m) {
  const t = m.ticks * TICK;
  for (const lane of m.lanes) for (const v of lane.vehicles) v.x = vehicleX(lane, v, t);
}

function curb() {
  return { col: P.startCol, row: 0, hop: null, face: 'up', stumble: 0, freeze: 0, fallen: null };
}

export function createCrossing(rng) {
  const m = {
    stage: 'intro', time: 0, clock: 0, age: 0, ticks: 0, accumulator: 0,
    lanes: planRoad(rng), spoon: curb(),
    attempts: P.attempts, hits: 0, hops: 0,
    credited: [], // { row, col, at }: each traffic lane's first landing, once per mission
    pressed: null, holdDir: null, repeatAt: 0,
    bump: null, whooshAt: -Infinity, summary: null,
  };
  placeTraffic(m);
  return m;
}

export function crossingInProgress(state) {
  return (state.phase === PHASE.CROSSING_STREET
    || (state.phase === PHASE.PAUSED && state.pausedFrom === PHASE.CROSSING_STREET)) ? state.crossingStreet : null;
}

export function startCrossing(m) {
  if (m?.stage !== 'intro') return false;
  m.stage = 'play';
  m.time = 0;
  m.pressed = null;
  m.holdDir = null;
  return true;
}

/**
 * A fresh press of a direction. It waits for a hop in progress to land, but
 * is dropped while the spoon is dazed or getting up. Only one is kept.
 */
export function pressHop(m, dir) {
  if (m?.stage !== 'play' || !Object.hasOwn(DIRECTIONS, dir)) return false;
  if (m.spoon.stumble > 0 || m.spoon.freeze > 0) return false;
  m.pressed = dir;
  return true;
}

/** Where the spoon's hitbox is centred right now, partway through any hop. */
export function spoonPoint(m) {
  const s = m.spoon;
  if (s.fallen) return { x: s.fallen.x, y: s.fallen.y };
  const k = s.hop ? Math.min(1, s.hop.time / P.hop) : 1;
  const from = s.hop?.from ?? s;
  return {
    x: colX(from.col) + (colX(s.col) - colX(from.col)) * k,
    y: rowY(from.row) + (rowY(s.row) - rowY(from.row)) * k,
  };
}

/** The vehicle the spoon is touching this tick, if any (boxes must overlap, not merely meet). */
export function struckBy(m) {
  const { x, y } = spoonPoint(m);
  const { halfWidth: hw, halfHeight: hh } = P.spoon;
  const now = m.ticks * TICK;
  for (const lane of m.lanes) {
    const ly = rowY(lane.row);
    for (const v of lane.vehicles) {
      if (y + hh <= ly - v.halfHeight || y - hh >= ly + v.halfHeight) continue;
      const ranges = sweptRanges(lane, v, Math.max(0, now - TICK), now);
      if (ranges.some(([x0, x1]) => x + hw > x0 && x - hw < x1)) return { lane, vehicle: v };
    }
  }
  return null;
}

function hop(sim, m, dir) {
  const s = m.spoon;
  const [dc, dr] = DIRECTIONS[dir];
  s.face = dir;
  const col = s.col + dc;
  const row = s.row + dr;
  if (col < 0 || col >= P.columns || row < 0 || row > P.shop) return false;
  s.hop = { from: { col: s.col, row: s.row }, time: 0, dir };
  s.col = col;
  s.row = row;
  m.hops++;
  sim.emit('crossingHop', { dir, col, row });
  return true;
}

function finish(sim, m, reason) {
  const success = reason === 'shop';
  const perfect = success && m.hits === 0;
  const lanes = m.credited.length;
  const summary = {
    reason, success, perfect, hits: m.hits, lanes, ...RESULTS[perfect ? 'perfect' : success ? 'success' : 'failure'],
    points: lanes * P.lanePoints + (success ? P.shopBonus : 0) + (perfect ? P.perfectBonus : 0),
    cash: success ? P.successCash : 0,
  };
  if (awardInterlude(sim.state, m, summary)) sim.emit('crossingFinish', summary);
  m.stage = 'outro';
  m.time = 0;
  m.pressed = null;
  m.holdDir = null;
}

function land(sim, m) {
  const s = m.spoon;
  s.hop = null;
  if (TRAFFIC_ROWS.includes(s.row) && !m.credited.some((c) => c.row === s.row)) {
    m.credited.push({ row: s.row, col: s.col, at: m.age });
    sim.emit('crossingLane', { row: s.row, lanes: m.credited.length, points: P.lanePoints });
  }
  if (s.row === P.shop) finish(sim, m, 'shop');
}

function bump(sim, m, { lane, vehicle }) {
  const s = m.spoon;
  const at = spoonPoint(m);
  m.hits++;
  m.attempts--;
  s.hop = null;
  s.stumble = P.stumble;
  s.fallen = { ...at, dir: lane.dir, kind: vehicle.kind };
  m.pressed = null;
  m.holdDir = null;
  m.bump = { at: m.age, x: at.x, y: at.y };
  sim.emit('crossingHit', { attempts: m.attempts, kind: vehicle.kind, row: lane.row, x: at.x, y: at.y });
  if (m.attempts <= 0) finish(sim, m, 'attempts');
}

/** Take a press, or repeat the held direction, once the spoon is free to hop. */
function steer(sim, m, input) {
  const s = m.spoon;
  if (s.stumble > 0 || s.freeze > 0) {
    m.pressed = null;
    m.holdDir = null;
    return;
  }
  if (m.holdDir && !input[m.holdDir]) m.holdDir = null;
  if (s.hop) return;
  let dir = null;
  if (m.pressed) {
    dir = m.pressed;
    m.pressed = null;
  } else if (m.holdDir && m.age >= m.repeatAt - 1e-9) {
    dir = m.holdDir;
  }
  if (!dir) return;
  m.holdDir = input[dir] ? dir : null;
  m.repeatAt = m.age + P.repeat;
  hop(sim, m, dir);
}

/** Traffic passing close by (in the spoon's row or either beside it): a sound cue, nothing more. */
function whoosh(sim, m) {
  const s = m.spoon;
  if (s.stumble > 0 || m.age - m.whooshAt < 0.35) return;
  const { x } = spoonPoint(m);
  const t = m.ticks * TICK;
  for (const lane of m.lanes) {
    if (Math.abs(lane.row - s.row) > 1) continue;
    for (const v of lane.vehicles) {
      const before = vehicleX(lane, v, t - TICK);
      if ((before - x) * (v.x - x) <= 0 && Math.abs(v.x - before) < lane.span / 2) {
        m.whooshAt = m.age;
        sim.emit('crossingWhoosh', { kind: v.kind, row: lane.row });
        return;
      }
    }
  }
}

function play(sim, m, input) {
  const s = m.spoon;
  m.clock = Math.min(P.duration, m.clock + TICK);
  if (s.stumble > 0) {
    s.stumble = Math.max(0, s.stumble - TICK);
    if (s.stumble === 0) {
      Object.assign(s, curb(), { freeze: P.respawnFreeze });
      sim.emit('crossingRespawn', { attempts: m.attempts });
    }
  } else if (s.freeze > 0) {
    s.freeze = Math.max(0, s.freeze - TICK);
  }
  steer(sim, m, input);
  if (s.hop) {
    s.hop.time += TICK;
    if (s.hop.time >= P.hop - 1e-9) land(sim, m);
  }
  if (m.stage !== 'play') return;
  if (s.stumble === 0) {
    const hit = struckBy(m);
    if (hit) bump(sim, m, hit);
    else whoosh(sim, m);
  }
  if (m.stage === 'play' && m.clock >= P.duration - 1e-9) finish(sim, m, 'time');
}

const NO_WALK = Object.freeze({ up: false, down: false, left: false, right: false });

/**
 * @param {{ state: object, emit: Function }} sim
 * @param {number} dt seconds; anything unusable counts as none, and a long gap is capped
 * @param {{ up?: boolean, down?: boolean, left?: boolean, right?: boolean }} input held directions
 */
export function updateCrossing(sim, dt, input = NO_WALK) {
  const m = sim.state.crossingStreet;
  m.accumulator += Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  while (m.accumulator >= TICK - 1e-10) {
    m.accumulator = Math.max(0, m.accumulator - TICK);
    m.ticks++;
    m.time += TICK;
    m.age += TICK;
    placeTraffic(m);
    if (m.stage === 'intro') {
      if (m.time >= P.introTime - 1e-9 && startCrossing(m)) sim.emit('crossingGo');
      continue;
    }
    if (m.stage === 'play') play(sim, m, input);
  }
}

/** The doorstep exchange after a successful crossing, read from the outro clock (it freezes when paused). */
export function shopExchange(m) {
  if (m?.stage !== 'outro' || !m.summary?.success || m.time >= P.exchange) return null;
  return { time: m.time, shopkeeper: m.time < P.exchange, spoon: m.time >= 1.1 };
}
