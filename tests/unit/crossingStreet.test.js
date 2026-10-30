import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import {
  DIRECTIONS, EXCHANGE, RESULTS, SIGN_LINES, TRAFFIC_ROWS, colX, createCrossing, fairRoad, gentleRoad, planCrossing,
  planRoad, pressHop, rowY, shopExchange, spoonPoint, startCrossing, struckBy, updateCrossing, vehicleX,
} from '../../src/gameplay/crossingStreet.js';

const P = CONFIG.crossingStreet;
const TICK = 1 / 120;
const IDLE = Object.freeze({ up: false, down: false, left: false, right: false });
const held = (dir) => ({ ...IDLE, [dir]: true });
const LO = -P.margin;

function street(seed = 42) {
  const state = { crossingStreet: createCrossing(createRandom(seed)), score: 100, teaCash: 7 };
  const events = [];
  const sim = { state, emit: (type, data = {}) => events.push({ type, ...data }) };
  const m = state.crossingStreet;
  const ticks = (n, input = IDLE) => { for (let i = 0; i < n; i++) updateCrossing(sim, TICK, input); };
  const advance = (seconds, input = IDLE) => ticks(Math.round(seconds / TICK), input);
  const count = (type) => events.filter((e) => e.type === type).length;
  return { state, sim, m, events, ticks, advance, count };
}

/** Under way, on an empty road. */
function emptyStreet(seed = 42) {
  const r = street(seed);
  startCrossing(r.m);
  for (const lane of r.m.lanes) lane.vehicles = [];
  return r;
}

/** One vehicle in `row`, whose centre will be at x on the next tick. */
function park(m, row, x, { kind = 'car', speed } = {}) {
  const lane = m.lanes.find((l) => l.row === row);
  if (speed !== undefined) lane.speed = speed;
  const { length, halfHeight } = P.vehicles[kind];
  const t = (m.ticks + 1) * TICK;
  const v = { id: 9, kind, length, halfHeight, paint: 0, x, offset: x - lane.dir * lane.speed * t };
  lane.vehicles = [v];
  return { lane, v };
}

/** On a real road: hop into the first lane with the traffic held back, and be bumped there by a parked car. */
function bumpInFirstLane(r) {
  const saved = r.m.lanes.map((l) => l.vehicles);
  for (const l of r.m.lanes) l.vehicles = [];
  hopOnce(r, 'up');
  park(r.m, 1, colX(r.m.spoon.col));
  r.ticks(1);
  r.m.lanes.forEach((l, i) => { l.vehicles = saved[i]; });
}

/** Press a hop and let it land. */
function hopOnce(r, dir) {
  pressHop(r.m, dir);
  r.ticks(Math.ceil(P.hop / TICK) + 1);
}

/** Follow a planner route: one press (or wait) every `repeat` seconds, through the real simulation. */
function follow(r, moves) {
  const every = Math.round(P.repeat / TICK);
  for (const move of moves) {
    if (r.m.stage !== 'play') break;
    if (move !== 'wait') pressHop(r.m, move);
    r.ticks(every);
  }
}

/** Cautious crossing from wherever the spoon is right now. */
function crossNow(r) {
  const s = r.m.spoon;
  const moves = planCrossing(r.m.lanes, (r.m.ticks + 1) * TICK, { col: s.col, row: s.row });
  expect(moves).not.toBeNull();
  follow(r, moves);
  return moves;
}

describe('the road', () => {
  it('is the same for the same seed, and differs for another', () => {
    expect(createCrossing(createRandom(5)).lanes).toEqual(createCrossing(createRandom(5)).lanes);
    expect(createCrossing(createRandom(6)).lanes).not.toEqual(createCrossing(createRandom(5)).lanes);
  });

  it('has five traffic lanes around a safe median, with the sidewalks never driven on', () => {
    const { m } = street();
    expect(m.lanes.map((l) => l.row)).toEqual([1, 2, 3, 5, 6]);
    expect(TRAFFIC_ROWS).not.toContain(P.median);
    for (const row of [0, P.median, P.shop]) expect(m.lanes.some((l) => l.row === row)).toBe(false);
  });

  it('runs neighbouring lanes in opposite directions, with every vehicle type on the road', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { lanes } = createCrossing(createRandom(seed));
      for (let i = 1; i < lanes.length; i++) expect(lanes[i].dir).toBe(-lanes[i - 1].dir);
      const kinds = new Set(lanes.flatMap((l) => l.vehicles.map((v) => v.kind)));
      expect([...kinds].sort()).toEqual(['car', 'milk', 'van']);
      expect(new Set(lanes.map((l) => l.speed)).size).toBeGreaterThan(2);
      for (const lane of lanes) {
        expect(lane.vehicles.length).toBeGreaterThanOrEqual(2);
        for (const v of lane.vehicles) expect(v.halfHeight * 2).toBeLessThan(P.row);
      }
    }
  });

  it('moves traffic at each lane’s own speed and direction, during the introduction too', () => {
    const r = street();
    const before = r.m.lanes.map((l) => l.vehicles.map((v) => v.x));
    r.advance(0.5);
    expect(r.m.stage).toBe('intro');
    r.m.lanes.forEach((lane, i) => lane.vehicles.forEach((v, j) => {
      const moved = v.x - before[i][j];
      if (Math.abs(moved) < lane.span / 2) expect(moved).toBeCloseTo(lane.dir * lane.speed * 0.5, 6);
    }));
  });

  it('wraps each vehicle round off-screen, staying within its loop, so lanes never empty', () => {
    const r = street(3);
    const lane = r.m.lanes[0];
    const v = lane.vehicles[0];
    let wraps = 0;
    let last = v.x;
    for (let i = 0; i < 120 * 30; i++) {
      r.ticks(1);
      if (Math.abs(v.x - last) > lane.span / 2) {
        wraps++;
        // The jump happens with the vehicle entirely out of sight, at both ends.
        for (const x of [v.x, last]) expect(x + v.length / 2 < 0 || x - v.length / 2 > CONFIG.arena.width).toBe(true);
      }
      last = v.x;
      for (const l of r.m.lanes) for (const o of l.vehicles) {
        expect(o.x).toBeGreaterThanOrEqual(LO - 1e-6);
        expect(o.x).toBeLessThan(LO + l.span + 1e-6);
      }
    }
    expect(wraps).toBeGreaterThanOrEqual(2);
  });

  it('keeps at least the minimum gap, in time and distance, between vehicles in every lane', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const lane of createCrossing(createRandom(seed)).lanes) {
        for (const t of [0, 7.3, 31.9]) {
          const along = lane.vehicles.map((v) => ({ v, x: vehicleX(lane, v, t) - LO })).sort((a, b) => a.x - b.x);
          along.forEach((a, i) => {
            const b = along[(i + 1) % along.length];
            const between = (((b.x - a.x) % lane.span) + lane.span) % lane.span || lane.span;
            const gap = between - (a.v.length + b.v.length) / 2;
            expect(gap).toBeGreaterThanOrEqual(Math.max(P.minGap, lane.speed * P.minGapTime) - 1e-6);
          });
        }
      }
    }
  });

  it('always admits a cautious crossing, from every sampled moment, for hundreds of seeds', () => {
    for (let seed = 0; seed < 300; seed++) expect(fairRoad(createCrossing(createRandom(seed)).lanes)).toBe(true);
    expect(fairRoad(gentleRoad())).toBe(true);
  });

  it('refuses an impossible road and falls back to the gentle one', () => {
    const wall = gentleRoad().map((l) => ({ ...l, vehicles: [{ id: 0, kind: 'milk', length: l.span, halfHeight: 26, offset: 0 }] }));
    expect(planCrossing(wall, 0)).toBeNull();
    expect(fairRoad(wall)).toBe(false);
    const never = { next: () => 0.5, range: (a, b) => (a + b) / 2, int: () => 0 };
    const road = planRoad(never);
    expect(fairRoad(road)).toBe(true);
  });
});

describe('the spoon’s hops', () => {
  it('starts on the curb in the middle of the near sidewalk', () => {
    const { m } = street();
    expect(m.spoon).toMatchObject({ col: P.startCol, row: 0, hop: null });
    expect(spoonPoint(m)).toEqual({ x: colX(P.startCol), y: rowY(0) });
  });

  it('hops one square in each of the four directions, taking `hop` seconds to land', () => {
    const r = emptyStreet();
    hopOnce(r, 'up');
    expect(r.m.spoon).toMatchObject({ col: 6, row: 1, hop: null });
    hopOnce(r, 'right');
    expect(r.m.spoon).toMatchObject({ col: 7, row: 1 });
    hopOnce(r, 'left'); hopOnce(r, 'left');
    expect(r.m.spoon).toMatchObject({ col: 5, row: 1 });
    hopOnce(r, 'down');
    expect(r.m.spoon).toMatchObject({ col: 5, row: 0 });
    expect(r.count('crossingHop')).toBe(5);
  });

  it('moves the hitbox smoothly through the hop, exactly with the drawing', () => {
    const r = emptyStreet();
    pressHop(r.m, 'up');
    r.ticks(6);
    const mid = spoonPoint(r.m);
    expect(mid.x).toBe(colX(6));
    expect(mid.y).toBeLessThan(rowY(0));
    expect(mid.y).toBeGreaterThan(rowY(1));
    r.ticks(20);
    expect(spoonPoint(r.m).y).toBe(rowY(1));
  });

  it('makes one hop per press, however long the press lasts below the repeat time', () => {
    const r = emptyStreet();
    pressHop(r.m, 'up');
    r.ticks(Math.round(P.repeat / TICK) - 2, held('up'));
    r.ticks(60, IDLE);
    expect(r.m.spoon.row).toBe(1);
    expect(r.m.hops).toBe(1);
  });

  it('repeats a held direction every `repeat` seconds, and only after a fresh press', () => {
    const r = emptyStreet();
    r.advance(1, held('right')); // held with no press: nothing
    expect(r.m.hops).toBe(0);
    pressHop(r.m, 'right');
    r.advance(0.6 + TICK, held('right')); // the first hop lands on the first tick
    expect(r.m.hops).toBe(1 + Math.floor(0.6 / P.repeat));
    const at = r.m.spoon.col;
    r.advance(1, IDLE);
    expect(r.m.spoon.col).toBe(at);
  });

  it('keeps a press made mid-hop for the landing, but only one', () => {
    const r = emptyStreet();
    pressHop(r.m, 'up');
    r.ticks(3);
    pressHop(r.m, 'left'); pressHop(r.m, 'right');
    r.ticks(40);
    expect(r.m.spoon).toMatchObject({ row: 1, col: 7 });
    expect(r.m.hops).toBe(2);
  });

  it('never leaves the street: edges and both sidewalks hold it in', () => {
    const r = emptyStreet();
    for (let i = 0; i < 20; i++) hopOnce(r, 'left');
    expect(r.m.spoon.col).toBe(0);
    for (let i = 0; i < 20; i++) hopOnce(r, 'right');
    expect(r.m.spoon.col).toBe(P.columns - 1);
    hopOnce(r, 'down');
    expect(r.m.spoon.row).toBe(0);
    expect(r.m.hops).toBe(P.columns - 1 - 0 + (P.startCol - 0));
  });

  it('ignores hops before the crossing starts and once it is over', () => {
    const r = street();
    expect(pressHop(r.m, 'up')).toBe(false);
    expect(pressHop(r.m, 'sideways')).toBe(false);
    startCrossing(r.m);
    expect(pressHop(r.m, 'up')).toBe(true);
    r.m.stage = 'outro';
    expect(pressHop(r.m, 'up')).toBe(false);
  });
});

describe('collisions', () => {
  it('bump the spoon when a vehicle’s body overlaps it', () => {
    const r = emptyStreet();
    hopOnce(r, 'up');
    park(r.m, 1, colX(6) + 30);
    r.ticks(1);
    expect(r.count('crossingHit')).toBe(1);
    expect(r.m).toMatchObject({ hits: 1, attempts: P.attempts - 1 });
  });

  it('never through a visible gap, or merely touching edges', () => {
    const r = emptyStreet();
    hopOnce(r, 'up');
    const edge = P.spoon.halfWidth + P.vehicles.car.length / 2;
    park(r.m, 1, colX(6) + edge + 1, { speed: 0 });
    r.ticks(30);
    expect(r.m.hits).toBe(0);
    park(r.m, 1, colX(6) - edge, { speed: 0 });
    r.ticks(30);
    expect(r.m.hits).toBe(0);
    expect(struckBy(r.m)).toBeNull();
  });

  it('only from vehicles in the spoon’s own row unless it is hopping between rows', () => {
    const r = emptyStreet();
    hopOnce(r, 'up'); // row 1
    park(r.m, 2, colX(6), { speed: 0 }); // directly above, in the next lane
    r.ticks(60);
    expect(r.m.hits).toBe(0);
    pressHop(r.m, 'up'); // into it
    r.ticks(20);
    expect(r.m.hits).toBe(1);
  });

  it('cannot be tunnelled through by a very fast vehicle', () => {
    const r = emptyStreet();
    hopOnce(r, 'up');
    // 60 000 px/s covers 500 px a tick: it is clear of the spoon before the tick and after it.
    const dir = r.m.lanes[0].dir;
    park(r.m, 1, colX(6) - dir * 260, { speed: 60000 });
    r.ticks(1);
    expect(r.m.hits).toBe(0);
    r.ticks(1);
    expect(Math.abs(r.m.lanes[0].vehicles[0].x - colX(6))).toBeGreaterThan(P.vehicles.car.length / 2 + P.spoon.halfWidth);
    expect(r.m.hits).toBe(1);
  });

  it('costs exactly one attempt per bump, with no second bump while dazed', () => {
    const r = emptyStreet();
    hopOnce(r, 'up');
    const { lane } = park(r.m, 1, colX(6), { kind: 'milk', speed: 1 });
    lane.vehicles[0].length = 400; // parked right over the dazed spoon the whole time
    r.advance(P.stumble - 0.05);
    expect(r.count('crossingHit')).toBe(1);
    expect(r.m.attempts).toBe(P.attempts - 1);
    expect(pressHop(r.m, 'up')).toBe(false); // no orders while dazed
  });

  it('sends the spoon back to the curb, frozen briefly, with traffic and the clock carrying on', () => {
    const r = emptyStreet();
    hopOnce(r, 'up'); hopOnce(r, 'up');
    const road = structuredClone(r.m.lanes.map((l) => ({ dir: l.dir, speed: l.speed, span: l.span })));
    park(r.m, 2, colX(6));
    r.ticks(1);
    const clock = r.m.clock;
    r.advance(P.stumble + 0.02);
    expect(r.count('crossingRespawn')).toBe(1);
    expect(r.m.spoon).toMatchObject({ col: P.startCol, row: 0, hop: null, fallen: null });
    expect(r.m.spoon.freeze).toBeGreaterThan(0);
    expect(pressHop(r.m, 'up')).toBe(false);
    expect(r.m.clock).toBeGreaterThan(clock + P.stumble - 0.01);
    expect(r.m.lanes.map((l) => ({ dir: l.dir, speed: l.speed, span: l.span }))).toEqual(road);
    r.advance(P.respawnFreeze);
    expect(pressHop(r.m, 'up')).toBe(true);
  });

  it('never strikes on the curb after respawning, even with traffic right beside it', () => {
    const r = street(11);
    startCrossing(r.m);
    hopOnce(r, 'up');
    park(r.m, 1, colX(6));
    r.advance(P.stumble + P.respawnFreeze + 0.1);
    for (let i = 0; i < 600; i++) {
      r.ticks(1);
      expect(struckBy(r.m)).toBeNull();
    }
    expect(r.m.hits).toBe(1);
  });

  it('never bumps the spoon resting on the median or either sidewalk, in any traffic', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = street(seed);
      startCrossing(r.m);
      Object.assign(r.m.spoon, { row: P.median, col: seed % P.columns });
      r.advance(P.duration);
      expect(r.m.hits).toBe(0);
      const s = street(seed); startCrossing(s.m);
      s.advance(P.duration);
      expect(s.m.hits).toBe(0);
    }
  });
});

describe('how a crossing ends', () => {
  it('times out after the limit with a failure, paying lane points only', () => {
    const r = emptyStreet();
    hopOnce(r, 'up');
    r.advance(P.duration + 1);
    expect(r.m.stage).toBe('outro');
    expect(r.m.summary).toMatchObject({ reason: 'time', success: false, perfect: false, cash: 0, lanes: 1,
      points: P.lanePoints, ...RESULTS.failure });
    expect(r.state).toMatchObject({ score: 100 + P.lanePoints, teaCash: 7 });
  });

  it('fails after three bumps', () => {
    const r = emptyStreet();
    for (let i = 0; i < P.attempts; i++) {
      hopOnce(r, 'up');
      park(r.m, 1, colX(r.m.spoon.col));
      r.ticks(1);
      r.advance(P.stumble + P.respawnFreeze + 0.02);
    }
    expect(r.m.stage).toBe('outro');
    expect(r.m.summary).toMatchObject({ reason: 'attempts', hits: 3, success: false, cash: 0, title: 'THE TRAFFIC HAS SPOKEN.' });
    expect(r.count('crossingHit')).toBe(3);
    expect(r.m.attempts).toBe(0);
  });

  it('crosses a real road with genuine hops and collisions: a perfect crossing pays everything', () => {
    const r = street(42);
    r.advance(P.introTime);
    expect(r.m.stage).toBe('play');
    crossNow(r);
    expect(r.m.stage).toBe('outro');
    expect(r.m.spoon.row).toBe(P.shop);
    const best = TRAFFIC_ROWS.length * P.lanePoints + P.shopBonus + P.perfectBonus;
    expect(r.m.summary).toMatchObject({ reason: 'shop', success: true, perfect: true, hits: 0, lanes: 5,
      points: best, cash: P.successCash, ...RESULTS.perfect });
    expect(r.state).toMatchObject({ score: 100 + best, teaCash: 7 + P.successCash });
    expect(r.count('crossingLane')).toBe(5);
  });

  it('pays the success without the perfect bonus after a bump, keeping lanes already credited', () => {
    const r = street(42);
    r.advance(P.introTime);
    bumpInFirstLane(r);
    expect(r.m.hits).toBe(1);
    expect(r.m.credited.map((c) => c.row)).toEqual([1]);
    r.advance(P.stumble + P.respawnFreeze + 0.02);
    crossNow(r);
    expect(r.m.summary).toMatchObject({ success: true, perfect: false, hits: 1, lanes: 5, ...RESULTS.success,
      points: 5 * P.lanePoints + P.shopBonus, cash: P.successCash });
  });

  it('credits each lane once only, however often it is crossed', () => {
    const r = emptyStreet();
    hopOnce(r, 'up'); hopOnce(r, 'down'); hopOnce(r, 'up'); hopOnce(r, 'right'); hopOnce(r, 'up'); hopOnce(r, 'down');
    expect(r.m.credited.map((c) => c.row)).toEqual([1, 2]);
    expect(r.count('crossingLane')).toBe(2);
    r.advance(P.duration);
    expect(r.m.summary.points).toBe(2 * P.lanePoints);
  });

  it('settles once, however many more updates follow', () => {
    const r = emptyStreet();
    for (let i = 0; i < P.shop; i++) hopOnce(r, 'up');
    const { score, teaCash } = r.state;
    const summary = structuredClone(r.m.summary);
    r.advance(30);
    expect(r.state).toMatchObject({ score, teaCash });
    expect(r.m.summary).toEqual(summary);
    expect(r.count('crossingFinish')).toBe(1);
  });

  it('has the doorstep exchange once, after a success only, and it ends', () => {
    const r = emptyStreet();
    for (let i = 0; i < P.shop; i++) hopOnce(r, 'up');
    expect(shopExchange(r.m)).toMatchObject({ shopkeeper: true, spoon: false });
    r.advance(1.3);
    expect(shopExchange(r.m)).toMatchObject({ shopkeeper: true, spoon: true });
    r.advance(P.exchange);
    expect(shopExchange(r.m)).toBeNull();
    const f = emptyStreet(); f.advance(P.duration + 0.1);
    expect(shopExchange(f.m)).toBeNull();
    expect(EXCHANGE).toEqual({ shopkeeper: 'We don’t serve spoons.', spoon: 'Good. I’m here for the tea.' });
    expect(SIGN_LINES.join(' ')).toBe('NO JAYWALKING. NO EXCEPTIONS FOR CUTLERY.');
  });
});

describe('timing', () => {
  it('ignores unusable time and caps a long gap', () => {
    const r = street();
    for (const dt of [NaN, -1, Infinity, undefined]) updateCrossing(r.sim, dt);
    expect(r.m.ticks).toBe(0);
    updateCrossing(r.sim, 1e9);
    expect(r.m.ticks).toBe(30);
    for (const lane of r.m.lanes) for (const v of lane.vehicles) expect(Number.isFinite(v.x)).toBe(true);
  });

  /** A scripted crossing: presses only on 1/30 s boundaries, so every display rate sees them alike. */
  function scripted(fps, seed = 7) {
    const r = street(seed);
    const presses = { 3.5: 'up', 4: 'up', 4.6: 'right', 5.1: 'up', 6: 'up', 7.2: 'left', 8: 'up', 9.5: 'up', 10: 'up' };
    const frames = Math.round(16 * fps);
    for (let f = 0; f < frames; f++) {
      const t = f / fps;
      for (const [at, dir] of Object.entries(presses)) if (Math.abs(t - Number(at)) < 1e-9) pressHop(r.m, dir);
      const hold = t >= 8 && t < 8.6 ? held('up') : IDLE;
      updateCrossing(r.sim, 1 / fps, hold);
    }
    const { spoon, lanes, hits, attempts, credited, clock, stage, summary } = r.m;
    return { spoon, lanes, hits, attempts, credited, clock, stage, summary, events: r.events.map((e) => e.type) };
  }

  it('plays out identically at 30, 60, 120 and 240 Hz', () => {
    const [a, ...rest] = [30, 60, 120, 240].map((fps) => scripted(fps));
    expect(a.events).toContain('crossingHop');
    for (const b of rest) {
      expect(b.events).toEqual(a.events);
      expect(b.spoon).toEqual(a.spoon);
      expect(b).toMatchObject({ hits: a.hits, attempts: a.attempts, credited: a.credited, stage: a.stage });
      b.lanes.forEach((lane, i) => lane.vehicles.forEach((v, j) => expect(v.x).toBeCloseTo(a.lanes[i].vehicles[j].x, 6)));
    }
  });

  it('replays exactly from the same seed and inputs', () => {
    expect(scripted(60, 19)).toEqual(scripted(60, 19));
  });
});

describe('long seeded simulations', () => {
  /** A scatter of presses and holds from a private generator: an erratic, impatient spoon. */
  function erratic(seed) {
    const r = street(seed);
    const pick = createRandom(seed ^ 0x51ab);
    const dirs = Object.keys(DIRECTIONS);
    const hits = [];
    const problems = new Set();
    const check = (ok, what) => { if (!ok) problems.add(what); };
    let hold = IDLE;
    let ticks = 0;
    let lastAttempts = r.m.attempts;
    while (r.m.stage !== 'outro' && ticks <= (P.introTime + P.duration) / TICK + 2) {
      if (pick.next() < 0.03) pressHop(r.m, pick.next() < 0.55 ? 'up' : dirs[pick.int(4)]);
      if (pick.next() < 0.01) hold = pick.next() < 0.5 ? IDLE : held(dirs[pick.int(4)]);
      const dazed = r.m.spoon.stumble > 0;
      const before = r.events.length;
      r.ticks(1, hold);
      ticks++;
      if (r.events.slice(before).some((e) => e.type === 'crossingHit')) {
        check(!dazed, 'bumped while dazed');
        check(r.m.attempts === lastAttempts - 1, 'not exactly one attempt');
        hits.push(ticks);
      }
      lastAttempts = r.m.attempts;
      const s = r.m.spoon;
      check(s.col >= 0 && s.col < P.columns && s.row >= 0 && s.row <= P.shop, 'spoon off the street');
      const at = spoonPoint(r.m);
      check(Number.isFinite(at.x) && Number.isFinite(at.y), 'spoon NaN');
      check(s.stumble === 0 || !!s.fallen, 'dazed spoon without a place');
      for (const lane of r.m.lanes) for (const v of lane.vehicles) {
        check(Number.isFinite(v.x) && v.x >= LO - 1e-6 && v.x < LO + lane.span + 1e-6, 'vehicle out of its loop');
      }
    }
    check(r.m.stage === 'outro', 'endless mission');
    expect([...problems]).toEqual([]);
    return { r, hits };
  }

  it('stays in bounds, finite and fair for 120 erratic seeded missions, and always ends', () => {
    let successes = 0;
    let bumps = 0;
    for (let seed = 0; seed < 120; seed++) {
      const { r, hits } = erratic(seed);
      expect(r.m.summary).not.toBeNull();
      expect(r.m.hits).toBe(hits.length);
      expect(r.m.hits).toBeLessThanOrEqual(P.attempts);
      expect(Number.isFinite(r.m.summary.points)).toBe(true);
      if (r.m.summary.success) successes++;
      bumps += hits.length;
    }
    expect(bumps).toBeGreaterThan(0); // the traffic is real
    expect(successes).toBeGreaterThan(0); // and passable even without looking
  });

  it('a cautious spoon crosses every road without a scratch, starting at many different moments', () => {
    for (let seed = 0; seed < 80; seed++) {
      const r = street(seed);
      r.advance(P.introTime + (seed % 9) * 1.7);
      crossNow(r);
      expect(r.m.summary).toMatchObject({ success: true, perfect: true, hits: 0 });
    }
  });

  it('a cautious spoon can still cross after a bump, from the curb, with the same traffic', () => {
    for (let seed = 0; seed < 25; seed++) {
      const r = street(seed);
      r.advance(P.introTime);
      bumpInFirstLane(r);
      r.advance(P.stumble + P.respawnFreeze + 0.02);
      crossNow(r);
      expect(r.m.summary).toMatchObject({ success: true, hits: 1 });
    }
  });
});
