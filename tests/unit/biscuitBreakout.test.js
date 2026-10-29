import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import {
  RESULTS, TALKER_LINE, biscuitRemark, createBreakout, launchCube, planWall, startBreakout, updateBreakout,
} from '../../src/gameplay/biscuitBreakout.js';

const P = CONFIG.biscuitBreakout;
const A = P.arena;
const H = P.cube.half;
const IDLE = Object.freeze({ left: false, right: false });
const LEFT = Object.freeze({ left: true, right: false });
const RIGHT = Object.freeze({ left: false, right: true });
const paddleTop = P.paddle.y - P.paddle.halfHeight;

function wall(seed = 42) {
  const state = { biscuitBreakout: createBreakout(createRandom(seed)), score: 100, teaCash: 7 };
  const events = [];
  const sim = { state, emit: (type, data = {}) => events.push({ type, ...data }) };
  const m = state.biscuitBreakout;
  const advance = (seconds, input = IDLE, dt = 1 / 120) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) updateBreakout(sim, dt, input);
  };
  return { state, sim, m, events, advance, count: (type) => events.filter((e) => e.type === type).length };
}

/** Under way, with the cube free at a chosen spot and velocity. */
function flying(cube, seed = 42) {
  const r = wall(seed);
  startBreakout(r.m);
  Object.assign(r.m.cube, { held: false, vx: 0, vy: 0, ...cube });
  return r;
}

/** An empty tray: every biscuit already gone, without counting as broken. */
function clearWall(m) {
  for (const b of m.biscuits) b.alive = false;
}

/** Fire the cube straight up from just under a biscuit; real collisions do the rest. */
function breakFromBelow(r, b) {
  Object.assign(r.m.cube, { held: false, x: b.x + b.w / 2, y: b.y + b.h + H + 20, vx: 0, vy: -r.m.speed });
  for (let i = 0; i < 240 && b.alive && r.m.stage === 'play'; i++) updateBreakout(r.sim, 1 / 120, IDLE);
  expect(b.alive).toBe(false);
}

/** Clear the way below a biscuit (without counting), so a shot from below reaches it. */
function exposed(m, b) {
  for (const o of m.biscuits) if (o.col === b.col && o.row > b.row) o.alive = false;
  return b;
}

/** Break the first `n` biscuits, bottom row first, each by a genuine hit. */
function breakSome(r, n) {
  const order = [...r.m.biscuits].sort((a, b) => b.row - a.row || a.col - b.col).slice(0, n);
  for (const b of order) breakFromBelow(r, b);
}

describe('Biscuit Breakout wall', () => {
  it('lays out a deterministic, varied 4 × 6 wall with exactly one face', () => {
    expect(planWall(createRandom(4))).toEqual(planWall(createRandom(4)));
    expect(planWall(createRandom(4))).not.toEqual(planWall(createRandom(5)));
    for (let seed = 0; seed < 100; seed++) {
      const biscuits = planWall(createRandom(seed));
      expect(biscuits).toHaveLength(24);
      expect(biscuits.filter((b) => b.face)).toHaveLength(1);
      for (const b of biscuits) {
        expect(b.x).toBeGreaterThanOrEqual(A.left + 2 * H);
        expect(b.x + b.w).toBeLessThanOrEqual(A.right - 2 * H);
        expect(b.y).toBeGreaterThanOrEqual(A.top + 2 * H);
        expect(b.y + b.h).toBeLessThan(paddleTop - 200);
        for (const o of biscuits) {
          if (o === b) continue;
          const apart = o.x >= b.x + b.w || b.x >= o.x + o.w || o.y >= b.y + b.h || b.y >= o.y + o.h;
          expect(apart).toBe(true);
        }
      }
    }
    // Seeds move the face around and vary the decoration.
    const faces = new Set(Array.from({ length: 50 }, (_, s) => planWall(createRandom(s)).find((b) => b.face).id));
    expect(faces.size).toBeGreaterThan(10);
  });

  it('starts with the cube resting on the centred spoon, in the introduction', () => {
    const { m } = wall();
    expect(m).toMatchObject({ stage: 'intro', cubes: 3, broken: 0, total: 24, summary: null });
    expect(m.paddle.x).toBe((A.left + A.right) / 2);
    expect(m.cube).toMatchObject({ held: true, x: m.paddle.x, y: paddleTop - H });
  });

  it('runs the introduction, then plays; launching waits for play', () => {
    const r = wall();
    expect(launchCube(r.sim)).toBe(false);
    r.advance(P.introTime);
    expect(r.m.stage).toBe('play');
    expect(r.count('breakoutGo')).toBe(1);
    expect(launchCube(r.sim)).toBe(true);
  });
});

describe('the spoon paddle', () => {
  it('moves with held controls, carries a waiting cube, and stays inside the tray', () => {
    const r = wall(); startBreakout(r.m);
    r.advance(0.25, RIGHT);
    expect(r.m.paddle.x).toBeCloseTo((A.left + A.right) / 2 + P.paddle.speed * 0.25, 6);
    expect(r.m.cube.x).toBe(r.m.paddle.x);
    r.advance(5, RIGHT);
    expect(r.m.paddle.x).toBe(A.right - P.paddle.halfWidth);
    r.advance(5, LEFT);
    expect(r.m.paddle.x).toBe(A.left + P.paddle.halfWidth);
    r.advance(1, { left: true, right: true });
    expect(r.m.paddle.x).toBe(A.left + P.paddle.halfWidth);
  });

  it('launches once per waiting cube, upward, leaning the way the spoon moves', () => {
    const r = wall(); startBreakout(r.m);
    expect(launchCube(r.sim)).toBe(true);
    expect(launchCube(r.sim)).toBe(false); // mashing does nothing while it flies
    expect(r.count('cubeLaunch')).toBe(1);
    const { vx, vy } = r.m.cube;
    expect(vy).toBeLessThan(0);
    expect(Math.atan2(vx, -vy)).toBeCloseTo(P.cube.launchAngle, 9);
    const left = wall(); startBreakout(left.m);
    left.advance(1 / 60, LEFT);
    launchCube(left.sim);
    expect(Math.atan2(left.m.cube.vx, -left.m.cube.vy)).toBeCloseTo(-P.cube.launchAngle, 9);
  });

  it.each([[0, 0], [0.5, 0.5], [1, 1], [-1, -1], [-0.25, -0.25], [1.4, 1]])(
    'sends a cube landing at offset %s of its reach off at that share of the maximum angle',
    (offset, share) => {
      const reach = P.paddle.halfWidth + H;
      const r = flying({ x: 0, y: paddleTop - H - 2, vy: 300 });
      clearWall(r.m);
      r.m.cube.x = r.m.paddle.x + offset * reach;
      r.advance(1 / 60);
      const { vx, vy } = r.m.cube;
      expect(r.count('cubePaddle')).toBe(Math.abs(offset) <= 1 ? 1 : 0);
      if (Math.abs(offset) > 1) return; // past the edge: it falls
      expect(vy).toBeLessThan(0);
      expect(Math.atan2(vx, -vy)).toBeCloseTo(share * P.cube.maxAngle, 9);
      expect(Math.hypot(vx, vy)).toBeCloseTo(r.m.speed, 9);
    },
  );

  it('never catches a cube from below or the side once it has passed the spoon', () => {
    const r = flying({ x: 0, y: paddleTop + 6, vy: 300 });
    clearWall(r.m);
    r.m.cube.x = r.m.paddle.x;
    r.advance(1);
    expect(r.count('cubePaddle')).toBe(0);
    expect(r.count('cubeLost')).toBe(1);
  });
});

describe('the sugar cube', () => {
  it.each([
    ['right', { x: A.right - H - 1, y: 500, vx: 300, vy: -200 }, (c) => c.vx < 0 && c.x <= A.right - H],
    ['left', { x: A.left + H + 1, y: 500, vx: -300, vy: -200 }, (c) => c.vx > 0 && c.x >= A.left + H],
    ['top', { x: 450, y: A.top + H + 1, vx: 120, vy: -300 }, (c) => c.vy > 0 && c.y >= A.top + H],
  ])('reflects cleanly off the %s wall, keeping its speed', (_, cube, ok) => {
    const r = flying(cube);
    clearWall(r.m);
    const speed = Math.hypot(cube.vx, cube.vy);
    r.advance(1 / 30);
    expect(ok(r.m.cube)).toBe(true);
    expect(Math.hypot(r.m.cube.vx, r.m.cube.vy)).toBeCloseTo(speed, 9);
    expect(r.count('cubeWall')).toBe(1);
  });

  it('breaks a biscuit it hits from below, bounces back down, and speeds up a little', () => {
    const r = wall(); startBreakout(r.m);
    const b = r.m.biscuits.find((x) => x.row === 3 && x.col === 2);
    breakFromBelow(r, b);
    expect(r.m.broken).toBe(1);
    expect(r.m.cube.vy).toBeGreaterThan(0);
    expect(r.m.cube.y - H).toBeGreaterThanOrEqual(b.y + b.h - 1e-9);
    expect(r.m.speed).toBeCloseTo(P.cube.speed + P.cube.speedPerBiscuit, 9);
    expect(Math.hypot(r.m.cube.vx, r.m.cube.vy)).toBeCloseTo(r.m.speed, 9);
    expect(r.events.filter((e) => e.type === 'biscuitBreak')).toEqual([expect.objectContaining({ id: b.id, broken: 1 })]);
  });

  it('bounces sideways off a biscuit it meets edge-on', () => {
    const r = wall(); startBreakout(r.m);
    const b = r.m.biscuits.find((x) => x.row === 1 && x.col === 0);
    for (const o of r.m.biscuits) if (o !== b) o.alive = false; // the wall around it is gone
    Object.assign(r.m.cube, { held: false, x: b.x - H - 3, y: b.y + b.h / 2, vx: 300, vy: 10 });
    r.advance(1 / 30);
    expect(b.alive).toBe(false);
    expect(r.m.cube.vx).toBeLessThan(0);
    expect(r.m.cube.x + H).toBeLessThanOrEqual(b.x + 1e-9);
  });

  it('never tunnels: at top speed and the longest frame it always meets the nearest biscuit first', () => {
    for (const dt of [1 / 240, 1 / 60, CONFIG.timing.maxFrameSeconds]) {
      for (let col = 0; col < 6; col++) {
        for (const nudge of [0, 17, 43]) {
          const r = wall(); startBreakout(r.m);
          const b = r.m.biscuits.find((x) => x.row === 3 && x.col === col);
          r.m.speed = P.cube.maxSpeed;
          Object.assign(r.m.cube, { held: false, x: b.x + 8 + nudge, y: 640, vx: 0, vy: -P.cube.maxSpeed });
          r.advance(1, IDLE, dt);
          expect(r.events.find((e) => e.type === 'biscuitBreak').id).toBe(b.id);
        }
      }
    }
  });

  it('scores each biscuit once and never touches a broken one again', () => {
    const r = wall(); startBreakout(r.m);
    breakSome(r, 6);
    const ids = r.events.filter((e) => e.type === 'biscuitBreak').map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.m.broken).toBe(6);
    // Send the cube straight through the gap the bottom row left: nothing more breaks there.
    const gone = r.m.biscuits.find((b) => !b.alive);
    Object.assign(r.m.cube, { held: false, x: gone.x + gone.w / 2, y: gone.y + gone.h / 2, vx: 0, vy: 1 });
    r.advance(1 / 60);
    expect(r.m.broken).toBe(6);
  });

  it('keeps every rally inside the tray, out of the biscuits, and never flat, over long seeded play', () => {
    const faults = [];
    for (let seed = 0; seed < 12; seed++) {
      const r = wall(seed); startBreakout(r.m);
      const minVy = (s) => s * Math.cos(P.cube.maxAngle) - 1e-6;
      for (let i = 0; i < 120 * P.duration && r.m.stage === 'play'; i++) {
        const c = r.m.cube;
        if (c.held) launchCube(r.sim);
        // A deliberately imperfect autopilot: it chases the cube, and sometimes wanders off.
        const target = c.x + 40 * Math.sin(i / 97 + seed);
        const input = { left: target < r.m.paddle.x - 6, right: target > r.m.paddle.x + 6 };
        updateBreakout(r.sim, 1 / 120, input);
        if (r.m.cube.held || r.m.stage !== 'play') continue;
        const { x, y, vx, vy } = r.m.cube;
        if (x - H < A.left - 1e-9 || x + H > A.right + 1e-9 || y - H < A.top - 1e-9) faults.push([seed, i, 'outside']);
        if (Math.abs(vy) < minVy(r.m.speed)) faults.push([seed, i, 'flat']);
        if (Math.hypot(vx, vy) > P.cube.maxSpeed + 1e-6) faults.push([seed, i, 'fast']);
        if (r.m.biscuits.some((b) => b.alive && x + H > b.x && x - H < b.x + b.w && y + H > b.y && y - H < b.y + b.h)) {
          faults.push([seed, i, 'inside a biscuit']);
        }
      }
      expect(r.m.stage).toBe('outro');
      expect(r.m.broken).toBeGreaterThan(0);
    }
    expect(faults).toEqual([]);
  }, 20_000);
});

describe('cubes, time and results', () => {
  it('serves a fresh cube on the spoon after a loss, up to the supply', () => {
    const r = flying({ x: 450, y: A.bottom - 5, vy: 400 });
    r.advance(0.2);
    expect(r.m).toMatchObject({ cubes: 2, lost: 1, stage: 'play' });
    expect(r.m.cube).toMatchObject({ held: true, x: r.m.paddle.x, y: paddleTop - H });
    expect(r.events.find((e) => e.type === 'cubeLost')).toMatchObject({ left: 2 });
    for (let i = 0; i < 2; i++) {
      launchCube(r.sim);
      Object.assign(r.m.cube, { x: 450, y: A.bottom - 5, vx: 0, vy: 400 });
      r.advance(0.2);
    }
    expect(r.m).toMatchObject({ cubes: 0, lost: 3, stage: 'outro' });
    expect(launchCube(r.sim)).toBe(false);
    expect(r.m.summary).toMatchObject({ reason: 'cubes', success: false, perfect: false, points: 0, cash: 0, ...RESULTS.failure });
  });

  it('ends at the time limit even if the cube was never launched, with nothing lost', () => {
    const r = wall(); startBreakout(r.m);
    r.advance(P.duration - 0.05);
    expect(r.m.stage).toBe('play');
    r.advance(0.1);
    expect(r.m.stage).toBe('outro');
    expect(r.m.summary).toMatchObject({ reason: 'time', broken: 0, points: 0, cash: 0 });
    expect(r.state).toMatchObject({ score: 100, teaCash: 7 });
  });

  it('clears the whole wall with real hits for a perfect result, at once', () => {
    const r = wall(); startBreakout(r.m);
    breakSome(r, 24);
    expect(r.m.stage).toBe('outro');
    expect(r.m.clock).toBeLessThan(P.duration);
    expect(r.m.summary).toMatchObject({ reason: 'cleared', broken: 24, perfect: true, success: true, ...RESULTS.perfect });
    expect(r.m.summary.points).toBe(24 * P.biscuitPoints + P.clearBonus);
    expect(r.state).toMatchObject({ score: 100 + 290, teaCash: 7 + 5 });
  });

  it.each([[17, true], [16, false], [5, false]])('with %s biscuits broken pays points always and Tea Cash only from 70%%', (n, success) => {
    const r = wall(); startBreakout(r.m);
    breakSome(r, n);
    Object.assign(r.m.cube, { held: true }); // parked on the spoon while the clock runs out
    r.advance(P.duration);
    expect(r.m.summary).toMatchObject({ broken: n, success, perfect: false, points: n * 10, cash: success ? 5 : 0 });
    expect(r.m.summary.title).toBe(success ? RESULTS.success.title : RESULTS.failure.title);
    expect(r.state).toMatchObject({ score: 100 + n * 10, teaCash: 7 + (success ? 5 : 0) });
  });

  it('settles rewards exactly once however long the result is shown', () => {
    const r = wall(); startBreakout(r.m);
    breakSome(r, 24);
    const { score, teaCash } = r.state;
    r.advance(30);
    expect(r.state).toMatchObject({ score, teaCash });
    expect(r.count('breakoutFinish')).toBe(1);
  });

  it('has the result copy the brief asks for', () => {
    expect(RESULTS.perfect).toEqual({ title: 'NOTHING LEFT BUT CRUMBS!', line: 'All biscuits destroyed.' });
    expect(RESULTS.success).toEqual({ title: 'A CRUMBLING SUCCESS.', line: 'Some biscuits survived. Their victory will be brief.' });
    expect(RESULTS.failure).toEqual({ title: 'THE BISCUITS HAVE WON THIS ROUND.', line: 'An inquiry has been launched.' });
  });
});

describe('the talking biscuit', () => {
  it('complains once when broken, for a while, and is otherwise an ordinary biscuit', () => {
    const r = wall(); startBreakout(r.m);
    const talker = r.m.biscuits.find((b) => b.face);
    expect(r.m.talker).toBe(talker.id);
    expect(biscuitRemark(r.m)).toBeNull();
    // The same hit on the same wall without a face, for comparison.
    const plain = wall(); startBreakout(plain.m);
    plain.m.biscuits[talker.id].face = false;
    exposed(r.m, talker);
    exposed(plain.m, plain.m.biscuits[talker.id]);
    breakFromBelow(r, talker);
    breakFromBelow(plain, plain.m.biscuits[talker.id]);
    expect(r.m.cube).toEqual(plain.m.cube);
    expect(r.m.broken).toBe(plain.m.broken);
    expect(r.count('biscuitTalk')).toBe(1);
    expect(plain.count('biscuitTalk')).toBe(0);
    expect(biscuitRemark(r.m)).toMatchObject({ x: talker.x + talker.w / 2 });
    expect(TALKER_LINE).toBe('THAT’S A CRUMBY WAY TO TREAT SOMEONE!');
    r.advance(P.remark + 0.05);
    expect(biscuitRemark(r.m)).toBeNull();
    expect(r.count('biscuitTalk')).toBe(1);
  });

  it('pays no special points for the face', () => {
    const r = wall(); startBreakout(r.m);
    breakFromBelow(r, exposed(r.m, r.m.biscuits.find((b) => b.face)));
    r.m.cube.held = true;
    r.advance(P.duration);
    expect(r.m.summary.points).toBe(P.biscuitPoints);
  });
});

describe('deterministic replay', () => {
  /** A scripted run: inputs change only on 1/30 s boundaries, so every display rate sees them alike. */
  function scripted(fps) {
    const r = wall(7); startBreakout(r.m);
    const plan = [[0, 0.5, RIGHT], [0.5, 1, IDLE], [1, 2.2, LEFT], [2.2, 3, IDLE], [3, 3.8, RIGHT], [3.8, 6, IDLE]];
    const frames = Math.round(12 * fps);
    for (let f = 0; f < frames && r.m.stage === 'play'; f++) {
      const t = f / fps;
      if (Math.abs(t - 0.5) < 1e-9 || Math.abs(t - 4) < 1e-9 || Math.abs(t - 8) < 1e-9) launchCube(r.sim);
      const input = plan.find(([from, to]) => t >= from - 1e-9 && t < to - 1e-9)?.[2] ?? IDLE;
      updateBreakout(r.sim, 1 / fps, input);
    }
    const { biscuits, broken, cubes, lost, cube, paddle, clock, speed } = r.m;
    return { biscuits, broken, cubes, lost, cube, paddle, clock, speed, events: r.events.map((e) => e.type) };
  }

  it('produces the same wall, rallies and results at 30, 60, 120 and 240 Hz', () => {
    const [a, ...rest] = [30, 60, 120, 240].map(scripted);
    expect(a.events).toContain('cubePaddle');
    for (const b of rest) {
      expect(b.biscuits).toEqual(a.biscuits);
      expect(b.events).toEqual(a.events);
      expect(b.cube.x).toBeCloseTo(a.cube.x, 6);
      expect(b.cube.y).toBeCloseTo(a.cube.y, 6);
      expect(b).toMatchObject({ broken: a.broken, cubes: a.cubes, lost: a.lost });
    }
  });

  it('replays exactly from the same seed and inputs', () => {
    expect(scripted(60)).toEqual(scripted(60));
  });
});
