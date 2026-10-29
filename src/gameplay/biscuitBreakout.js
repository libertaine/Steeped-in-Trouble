// Biscuit Breakout: a spoon paddle, a sugar-cube ball, and a wall of biscuits.
// The layout (tints, decorations and which biscuit has a face) is drawn from
// the mission's own generator when it is created; after that nothing here
// draws randomness. Fixed 120 Hz ticks, like the Tea Run and The Daily Pour.
// The cube moves one axis at a time and is pushed back out of whatever it
// touched, so it can neither tunnel nor stick. Every rebound keeps it within
// cube.maxAngle of vertical, so rallies can never go flat.
import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { awardInterlude } from './arcadeInterludes.js';

const P = CONFIG.biscuitBreakout;
const A = P.arena;
const TICK = 1 / 120;

/** Mixed into the game seed for this mission's private generator. */
export const BREAKOUT_SALT = 0xb15c0175;

export const TALKER_LINE = 'THAT’S A CRUMBY WAY TO TREAT SOMEONE!';

export const RESULTS = Object.freeze({
  perfect: { title: 'NOTHING LEFT BUT CRUMBS!', line: 'All biscuits destroyed.' },
  success: { title: 'A CRUMBLING SUCCESS.', line: 'Some biscuits survived. Their victory will be brief.' },
  failure: { title: 'THE BISCUITS HAVE WON THIS ROUND.', line: 'An inquiry has been launched.' },
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const paddleTop = () => P.paddle.y - P.paddle.halfHeight;

export function planWall(rng) {
  const { rows, cols, width, height, gap, top } = P.biscuits;
  const left = (A.left + A.right - (cols * width + (cols - 1) * gap)) / 2;
  const talker = rng.int(rows * cols);
  return Array.from({ length: rows * cols }, (_, id) => {
    const row = Math.floor(id / cols);
    const col = id % cols;
    return {
      id, row, col, x: left + col * (width + gap), y: top + row * (height + gap), w: width, h: height,
      tint: rng.int(3), style: rng.int(3), face: id === talker, alive: true, brokenAt: null,
    };
  });
}

/** The cube resting on the spoon, ready to launch. */
function rest(m) {
  m.cube = { x: m.paddle.x, y: paddleTop() - P.cube.half, vx: 0, vy: 0, held: true };
}

export function createBreakout(rng) {
  const biscuits = planWall(rng);
  const m = {
    stage: 'intro', time: 0, clock: 0, age: 0, accumulator: 0,
    paddle: { x: (A.left + A.right) / 2, dir: 0 }, cube: null,
    cubes: P.cubes, launches: 0, speed: P.cube.speed,
    biscuits, total: biscuits.length, broken: 0, lost: 0,
    talker: biscuits.find((b) => b.face).id, remark: null, summary: null,
  };
  rest(m);
  return m;
}

export function breakoutInProgress(state) {
  return (state.phase === PHASE.BISCUIT_BREAKOUT
    || (state.phase === PHASE.PAUSED && state.pausedFrom === PHASE.BISCUIT_BREAKOUT)) ? state.biscuitBreakout : null;
}

export function startBreakout(m) {
  if (m.stage !== 'intro') return false;
  m.stage = 'play';
  m.time = 0;
  return true;
}

/**
 * Send the waiting cube up, leaning the way the spoon is moving (or, standing
 * still, alternately right and left). Only a cube resting on the spoon launches.
 */
export function launchCube({ state, emit }) {
  const m = state.biscuitBreakout;
  if (m?.stage !== 'play' || !m.cube.held) return false;
  const lean = m.paddle.dir || (m.launches % 2 ? -1 : 1);
  const a = lean * P.cube.launchAngle;
  Object.assign(m.cube, { held: false, vx: m.speed * Math.sin(a), vy: -m.speed * Math.cos(a) });
  m.launches++;
  emit('cubeLaunch', { x: m.cube.x });
  return true;
}

/** The live biscuit the cube overlaps most, if any (ties go to the lower id). */
function touching(m) {
  const { x, y } = m.cube;
  const h = P.cube.half;
  let best = null;
  let most = 0;
  for (const b of m.biscuits) {
    if (!b.alive) continue;
    const ox = Math.min(x + h, b.x + b.w) - Math.max(x - h, b.x);
    const oy = Math.min(y + h, b.y + b.h) - Math.max(y - h, b.y);
    if (ox > 0 && oy > 0 && ox * oy > most) {
      best = b;
      most = ox * oy;
    }
  }
  return best;
}

function crumble({ emit }, m, b) {
  b.alive = false;
  b.brokenAt = m.age;
  m.broken++;
  m.speed = Math.min(P.cube.maxSpeed, P.cube.speed + P.cube.speedPerBiscuit * m.broken);
  const s = Math.hypot(m.cube.vx, m.cube.vy) || 1;
  m.cube.vx *= m.speed / s;
  m.cube.vy *= m.speed / s;
  emit('biscuitBreak', { id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2, broken: m.broken });
  if (b.face) {
    m.remark = { at: m.age, x: b.x + b.w / 2 };
    emit('biscuitTalk', { id: b.id });
  }
}

/** One axis of movement, then walls and biscuits on that axis. */
function moveX(sim, m) {
  const c = m.cube;
  const h = P.cube.half;
  c.x += c.vx * TICK;
  if (c.x - h < A.left) {
    c.x = A.left + h;
    c.vx = Math.abs(c.vx);
    sim.emit('cubeWall');
  } else if (c.x + h > A.right) {
    c.x = A.right - h;
    c.vx = -Math.abs(c.vx);
    sim.emit('cubeWall');
  }
  const b = touching(m);
  if (!b) return;
  c.x = c.vx > 0 ? b.x - h : b.x + b.w + h;
  c.vx = -c.vx;
  crumble(sim, m, b);
}

function moveY(sim, m) {
  const c = m.cube;
  const h = P.cube.half;
  const before = c.y + h;
  c.y += c.vy * TICK;
  if (c.y - h < A.top) {
    c.y = A.top + h;
    c.vy = Math.abs(c.vy);
    sim.emit('cubeWall');
  }
  const b = touching(m);
  if (b) {
    c.y = c.vy > 0 ? b.y - h : b.y + b.h + h;
    c.vy = -c.vy;
    crumble(sim, m, b);
    return;
  }
  // The spoon only catches a falling cube that crosses its top edge this tick.
  const top = paddleTop();
  const off = c.x - m.paddle.x;
  const reach = P.paddle.halfWidth + h;
  if (c.vy > 0 && before <= top + 1e-9 && c.y + h >= top && Math.abs(off) <= reach) {
    const a = clamp(off / reach, -1, 1) * P.cube.maxAngle;
    c.y = top - h;
    c.vx = m.speed * Math.sin(a);
    c.vy = -m.speed * Math.cos(a);
    sim.emit('cubePaddle', { x: c.x, offset: off / reach });
  }
}

function finish(sim, m, reason) {
  const perfect = m.broken === m.total;
  const success = m.broken >= Math.ceil(m.total * P.successShare);
  const result = RESULTS[perfect ? 'perfect' : success ? 'success' : 'failure'];
  const summary = {
    broken: m.broken, total: m.total, success, perfect, reason, ...result,
    points: m.broken * P.biscuitPoints + (perfect ? P.clearBonus : 0),
    cash: success ? P.successCash : 0,
  };
  if (awardInterlude(sim.state, m, summary)) sim.emit('breakoutFinish', summary);
  m.stage = 'outro';
  m.time = 0;
}

function play(sim, m, input) {
  m.clock = Math.min(P.duration, m.clock + TICK);
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  m.paddle.dir = dir;
  m.paddle.x = clamp(m.paddle.x + dir * P.paddle.speed * TICK, A.left + P.paddle.halfWidth, A.right - P.paddle.halfWidth);
  const c = m.cube;
  if (c.held) {
    c.x = m.paddle.x;
  } else {
    moveX(sim, m);
    if (m.broken < m.total) moveY(sim, m);
    if (c.y - P.cube.half > A.bottom) {
      m.cubes--;
      m.lost++;
      sim.emit('cubeLost', { left: m.cubes });
      if (m.cubes > 0) rest(m);
    }
  }
  if (m.broken === m.total) finish(sim, m, 'cleared');
  else if (m.cubes === 0) finish(sim, m, 'cubes');
  else if (m.clock >= P.duration - 1e-9) finish(sim, m, 'time');
}

/**
 * @param {{ state: object, emit: Function }} sim
 * @param {number} dt
 * @param {{ left: boolean, right: boolean }} input held controls
 */
export function updateBreakout(sim, dt, input) {
  const m = sim.state.biscuitBreakout;
  m.accumulator += dt;
  while (m.accumulator >= TICK - 1e-10) {
    m.accumulator = Math.max(0, m.accumulator - TICK);
    m.time += TICK;
    m.age += TICK;
    if (m.stage === 'intro') {
      if (m.time >= P.introTime - 1e-9 && startBreakout(m)) sim.emit('breakoutGo');
      continue;
    }
    if (m.stage === 'play') play(sim, m, input);
  }
}

/** The talking biscuit's complaint, read from the mission clock (it freezes when paused). */
export function biscuitRemark(m) {
  if (!m.remark) return null;
  const since = m.age - m.remark.at;
  return since < P.remark ? { ...m.remark, since } : null;
}
