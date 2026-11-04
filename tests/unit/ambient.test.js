import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import {
  AMBIENT, ambientPolicy, capacity, createColony, createVisitor, displayBudget, drawAnt, inflate, intersects,
  phoneShape, populationLimit, regionCapacity, safeRegions, subtract,
} from '../../src/rendering/ambient.js';
import { createAmbient, measureLayout } from '../../src/ui/ambient.js';

const FRAME = 1 / 60;

/** An event target that remembers which listeners are still attached. */
class Target extends EventTarget {
  attached = new Map();
  addEventListener(type, handler, options) {
    this.attached.set(type, (this.attached.get(type) ?? 0) + 1);
    super.addEventListener(type, handler, options);
  }
  removeEventListener(type, handler, options) {
    this.attached.set(type, this.attached.get(type) - 1);
    super.removeEventListener(type, handler, options);
  }
  get live() { return [...this.attached.values()].reduce((a, b) => a + b, 0); }
}

/** A recording 2D context: counts calls, draws nothing. */
function fakeContext() {
  const calls = {};
  return new Proxy({ calls }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { calls[key] = (calls[key] ?? 0) + 1; return args; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

/**
 * Just enough of the page for the ambient adapter: a playfield frame holding
 * a stage, the game canvas, one panel and the decorative layer. Rectangles
 * are viewport CSS pixels and can be changed between frames.
 */
function fakePage({ stage = { left: 0, top: 0, width: 1200, height: 500 },
  game = { left: 350, top: 0, width: 500, height: 500 }, viewport = [1200, 800], dpr = 1, reduced = false } = {}) {
  const win = new Target();
  Object.assign(win, { innerWidth: viewport[0], innerHeight: viewport[1], devicePixelRatio: dpr });
  win.visualViewport = new Target();
  win.media = Object.assign(new Target(), { matches: reduced });
  win.orientation = Object.assign(new Target(), { matches: viewport[1] > viewport[0] });
  win.matchMedia = (query) => (query.includes('orientation') ? win.orientation : win.media);
  win.observers = [];
  win.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.observed = []; this.connected = true; win.observers.push(this); }
    observe(element) { this.observed.push(element); }
    disconnect() { this.connected = false; }
  };
  let reads = 0;
  const element = (box, extra = {}) => ({
    box, hidden: false, children: [], attributes: {},
    getBoundingClientRect() { reads++; return this.hidden ? { left: 0, top: 0, width: 0, height: 0 } : this.box; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    ...extra,
  });
  const frame = element({ left: stage.left - 1, top: stage.top - 1, width: stage.width + 2, height: stage.height + 2 });
  const host = element(stage, { closest: (selector) => (selector === '.playfield' ? frame : null) });
  const gameCanvas = element(game, { id: 'game' });
  const panel = element({ left: 0, top: 0, width: 0, height: 0 }, { id: 'readingPresentation' });
  panel.hidden = true;
  const ring = element({ left: 0, top: 0, width: 64, height: 64 });
  ring.attributes['aria-hidden'] = 'true';
  const screenReaderOnly = element({ left: 40, top: 40, width: 1, height: 1 });
  const context = fakeContext();
  const doc = {
    defaultView: win, visibilityState: 'visible', body: { dataset: { view: 'full', phase: 'playing' } },
    hasFocus: () => true,
    getElementById: (id) => ({ game: gameCanvas, readingPresentation: panel })[id] ?? null,
  };
  const layer = element(stage, { ownerDocument: doc, parentElement: host, width: 0, height: 0, getContext: vi.fn(() => context) });
  layer.attributes['aria-hidden'] = 'true';
  layer.hidden = true;
  host.children = [gameCanvas, ring, layer, panel];
  frame.children = [host, screenReaderOnly];
  /** Lay the page out afresh: a new stage, game and viewport, as a rotation or resize would. */
  function relayout({ stage: s, game: g, viewport: v }) {
    host.box = s;
    frame.box = { left: s.left - 1, top: s.top - 1, width: s.width + 2, height: s.height + 2 };
    gameCanvas.box = g;
    [win.innerWidth, win.innerHeight] = v;
  }
  return { win, doc, host, frame, gameCanvas, panel, layer, context, relayout, reads: () => reads };
}

const PLAYING = Object.freeze({ phase: 'playing', pausedFrom: null, offer: false, blocked: false, holding: false });

function run(ambient, seconds, scene = PLAYING) {
  for (let t = 0; t < seconds; t += FRAME) ambient.update(FRAME, scene);
}

/** Bring `n` visits forward and run until that many ants are out (or fail). */
function untilVisible(ambient, n = 1, scene = PLAYING) {
  ambient.summon(n);
  for (let i = 0; i < 900 && ambient.snapshot().count < n; i++) ambient.update(FRAME, scene);
  expect(ambient.snapshot().count).toBeGreaterThanOrEqual(n);
}

/** The ant's whole drawing, as a box. */
const footprint = ({ x, y }) => ({ x: x - AMBIENT.footprint, y: y - AMBIENT.footprint, w: AMBIENT.footprint * 2, h: AMBIENT.footprint * 2 });

// Measured 0.20.0 layouts (production build, Chromium; see docs/ARCHITECTURE.md).
const DESKTOP = { visible: { x: 0, y: 0, w: 1526, h: 857 }, game: { x: 264, y: 0, w: 998, h: 857 } }; // 1920 × 1080, Full
const regionsOf = ({ visible, game }) => safeRegions(visible, [game]);
const gutters = (w, h) => [
  { x: 0, y: 0, w, h, portals: ['left', 'top', 'bottom'] },
  { x: 2000, y: 0, w, h, portals: ['right', 'top', 'bottom'] },
];

describe('safe-region geometry', () => {
  const stage = { x: 0, y: 0, w: 1200, h: 500 };
  const game = { x: 350, y: 0, w: 500, h: 500 };

  it('leaves the gutters beside the game, with clearance, and portals on open edges', () => {
    const regions = safeRegions(stage, [game]);
    expect(regions).toEqual([
      { x: 0, y: 0, w: 342, h: 500, portals: ['left', 'top', 'bottom'] },
      { x: 858, y: 0, w: 342, h: 500, portals: ['right', 'top', 'bottom'] },
    ]);
    for (const r of regions) expect(intersects(r, inflate(game, AMBIENT.clearance - 0.01))).toBe(false);
  });

  it('only opens portals on real borders, not internal seams', () => {
    const regions = safeRegions(stage, [game], { open: { left: true, right: false, top: false, bottom: false } });
    expect(regions.map((r) => r.portals)).toEqual([['left']]); // the right gutter has no way in
  });

  it('subtracts several exclusions without leaving any piece overlapping them', () => {
    const exclusions = [game, { x: 0, y: 420, w: 1200, h: 80 }, { x: 1000, y: 0, w: 60, h: 60 }];
    const pieces = subtract(stage, exclusions);
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) for (const e of exclusions) expect(intersects(p, e)).toBe(false);
  });

  it('keeps nothing narrower than a practical corridor, and no space means no visitors', () => {
    // A phone in portrait: the game fills the width, with a sliver above and below.
    const phone = { x: 0, y: 0, w: 357, h: 356 };
    const regions = safeRegions(phone, [{ x: 0, y: 25, w: 357, h: 307 }]);
    expect(regions).toEqual([]);
    expect(capacity(regions)).toBe(0);
    expect(safeRegions(null, [])).toEqual([]);
    expect(safeRegions({ x: 0, y: 0, w: 0, h: 400 }, [])).toEqual([]);
  });

  it('measures host-local rectangles, skipping hidden, decorative and 1 px elements and clipping to the viewport', () => {
    const page = fakePage({ stage: { left: 100, top: 50, width: 1200, height: 900 }, game: { left: 450, top: 50, width: 500, height: 500 }, viewport: [1400, 700] });
    page.panel.hidden = true;
    const layout = measureLayout({ host: page.host, clip: page.frame, viewport: { x: 0, y: 0, w: 1400, h: 700 },
      candidates: [page.gameCanvas, page.panel, page.frame.children[1]] });
    expect(layout.visible).toEqual({ x: 0, y: 0, w: 1200, h: 650 });
    expect(layout.exclusions).toEqual([{ x: 350, y: 0, w: 500, h: 500 }]);
    // Left, right and top meet the frame; the bottom is cut by the screen edge.
    expect(layout.open).toEqual({ left: true, right: true, top: true, bottom: true });
  });
});

describe('population', () => {
  it('counts each region on its own: disconnected slivers never combine into room', () => {
    // A tall portrait phone: 41 px strips above and below the cup, neither roomy enough alone.
    const phone = { x: 0, y: 0, w: 394, h: 436 };
    const cup = { x: 0, y: 57, w: 394, h: 322 };
    expect(safeRegions(phone, [cup], { minArea: 0 })).toHaveLength(2);
    expect(safeRegions(phone, [cup])).toEqual([]);
    expect(capacity(safeRegions(phone, [cup], { minArea: 0 }))).toBe(0);
    // Two 150 × 150 gutters hold 45,000 px² between them, but neither holds one ant.
    expect(capacity(gutters(150, 150))).toBe(0);
    // A roomy gutter beside a small one: 9 + 1, never pooled or shared.
    const mixed = [{ x: 0, y: 0, w: 256, h: 857, portals: ['left'] }, { x: 2000, y: 0, w: 160, h: 160, portals: ['right'] }];
    expect(mixed.map((r) => regionCapacity(r))).toEqual([9, 1]);
    expect(capacity(mixed)).toBe(10);
    expect(capacity(mixed, { max: 4 })).toBe(4);
  });

  it.each([
    ['1920 × 1080 desktop', gutters(256, 857), [1920, 1080], 6],
    ['1600 × 900 desktop', gutters(361, 677), [1600, 900], 6],
    ['1366 × 768 laptop', gutters(331, 545), [1366, 768], 4],
    ['1280 × 720 laptop', gutters(315, 498), [1280, 720], 4],
    ['1024 × 768 tablet or small window', gutters(154, 554), [1024, 768], 3],
    ['800 × 600 window', gutters(103, 482), [800, 600], 2],
    ['844 × 390 landscape phone', gutters(152, 272), [844, 390], 2],
    ['932 × 430 landscape phone', gutters(173, 312), [932, 430], 2],
    ['412 × 839 portrait phone, even with bands above and below the cup', gutters(394, 86), [412, 839], 0],
  ])('scales the ceiling with the measured space: %s → %i', (_, regions, [w, h], expected) => {
    expect(displayBudget(regions, { w, h })).toBe(expected);
  });

  it('never exceeds the prototype cap, however much room; a debug override reaches the slot count and no further', () => {
    const vast = gutters(2000, 2000);
    expect(capacity(vast)).toBe(AMBIENT.slots);
    expect(displayBudget(vast, { w: 3840, h: 2160 })).toBe(AMBIENT.maxVisitors);
    expect(AMBIENT.maxVisitors).toBe(6);
    expect(AMBIENT.slots).toBe(12);
    expect(displayBudget(vast, { w: 3840, h: 2160 }, { override: 12 })).toBe(12);
    expect(displayBudget(vast, { w: 3840, h: 2160 }, { override: 50 })).toBe(12);
    expect(displayBudget(vast, { w: 3840, h: 2160 }, { override: 0 })).toBe(0);
    // A portrait phone stays empty even under an override.
    expect(displayBudget(vast, { w: 412, h: 839 }, { override: 12 })).toBe(0);
  });

  it('tells phone shapes from the viewport, separately from the measured space', () => {
    expect(phoneShape({ w: 412, h: 839 })).toBe('portrait');
    expect(phoneShape({ w: 844, h: 390 })).toBe('landscape');
    expect(phoneShape({ w: 768, h: 1024 })).toBe(null); // a tablet in portrait follows its geometry
    expect(phoneShape({ w: 1280, h: 720 })).toBe(null);
  });

  it('allows at most two in Low graphics', () => {
    expect(populationLimit(6, 'high')).toBe(6);
    expect(populationLimit(6, 'low')).toBe(2);
    expect(populationLimit(1, 'low')).toBe(1);
    expect(populationLimit(0, 'low')).toBe(0);
  });
});

describe('presentation policy', () => {
  it.each([
    [{ phase: 'playing' }, 'run'],
    [{ phase: 'ready' }, 'run'],
    [{ phase: 'reading' }, 'run'],
    [{ phase: 'reading', offer: true }, 'off'], // an upgrade decision
    [{ phase: 'paused', pausedFrom: 'playing' }, 'frozen'],
    [{ phase: 'paused', pausedFrom: 'grind' }, 'off'],
    [{ phase: 'playing', holding: true }, 'frozen'], // a rewind holds time still
    [{ phase: 'playing', focused: false }, 'frozen'],
    [{ phase: 'playing', hidden: true }, 'frozen'],
    [{ phase: 'playing', blocked: true }, 'hidden'], // title, instructions, Tea Break, collection
    [{ phase: 'playing', reduced: true }, 'off'],
    ...['gameover', 'shortage', 'day', 'arcadeOffer', 'chocolate', 'grind', 'manager', 'teaRun',
      'dailyPour', 'biscuitBreakout', 'crossingStreet'].map((phase) => [{ phase }, 'off']),
  ])('%o → %s', (scene, expected) => {
    expect(ambientPolicy(scene)).toBe(expected);
  });
});

describe('the wandering visitor', () => {
  const regions = safeRegions({ x: 0, y: 0, w: 1200, h: 500 }, [{ x: 350, y: 0, w: 500, h: 500 }]);

  function visit(seed, seconds = 120) {
    const visitor = createVisitor({ random: createRandom(seed) });
    const seen = [];
    const path = [];
    for (let t = 0; t < seconds; t += FRAME) {
      visitor.step(FRAME, regions, 1);
      const { state, x, y, region, portal } = visitor.ant;
      if (seen.at(-1) !== state) seen.push(state);
      if (state !== 'absent') path.push({ x, y, state, region, portal });
    }
    return { seen, path, visitor };
  }

  it('enters, wanders with pauses, leaves, stays away a while, and comes back', () => {
    const { seen } = visit(3, 240);
    expect(seen.slice(0, 4)).toEqual(['absent', 'entering', 'wandering', expect.stringMatching(/paused|wandering|leaving/)]);
    expect(seen).toContain('paused');
    const firstLeave = seen.indexOf('leaving');
    expect(seen[firstLeave + 1]).toBe('absent');
    expect(seen.lastIndexOf('entering')).toBeGreaterThan(firstLeave); // a later visit
  });

  it('stays absent for a while between visits', () => {
    const visitor = createVisitor({ random: createRandom(9) });
    let absent = 0;
    let left = false;
    for (let t = 0; t < 200; t += FRAME) {
      visitor.step(FRAME, regions, 1);
      if (visitor.ant.state === 'leaving') left = true;
      else if (left && visitor.ant.state === 'absent') absent += FRAME;
      else if (left && absent > 0) break;
    }
    expect(absent).toBeGreaterThanOrEqual(AMBIENT.cooldown[0] - 0.1);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('never lets any part of the ant into protected space (seed %i)', (seed) => {
    const game = { x: 350, y: 0, w: 500, h: 500 };
    const visible = { x: 0, y: 0, w: 1200, h: 500 };
    const { path } = visit(seed, 150);
    for (const p of path) expectContained(p, game);
    // Arrival begins wholly off screen, so it walks in rather than appearing.
    expect(intersects(footprint(path[0]), visible)).toBe(false);
  });

  it('wanders irregularly: different visits and seeds take different paths, and it turns smoothly', () => {
    const a = visit(11, 60).path, b = visit(12, 60).path;
    expect(a.slice(0, 600).map((p) => Math.round(p.x))).not.toEqual(b.slice(0, 600).map((p) => Math.round(p.x)));
    const visitor = createVisitor({ random: createRandom(11) });
    let previous = null, maxTurn = 0;
    for (let t = 0; t < 60; t += FRAME) {
      visitor.step(FRAME, regions, 1);
      const { state, heading } = visitor.ant;
      if (state === 'absent') { previous = null; continue; }
      if (previous !== null) maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous))));
      previous = heading;
    }
    expect(maxTurn).toBeLessThanOrEqual(AMBIENT.turnRate * 2.5 * FRAME + 1e-9); // no snapping round
  });

  it('never appears without room, and retires at once when the space it uses goes away', () => {
    const visitor = createVisitor({ random: createRandom(4) });
    for (let t = 0; t < 120; t += FRAME) visitor.step(FRAME, [], 0);
    expect(visitor.ant.state).toBe('absent');
    for (let t = 0; t < 30 && visitor.ant.state === 'absent'; t += FRAME) visitor.step(FRAME, regions, 1);
    expect(visitor.visible).toBe(true);
    visitor.relayout(regions); // unchanged layout: carries on
    expect(visitor.visible).toBe(true);
    visitor.relayout([]);
    expect(visitor.visible).toBe(false);
  });
});

/** On screen the whole ant is inside its region; beyond it, only ever through its portal side. */
function expectContained(p, game) {
  const body = footprint(p);
  expect(intersects(body, inflate(game, AMBIENT.clearance - 0.01))).toBe(false);
  const r = p.region;
  const inside = body.x >= r.x - 1e-6 && body.x + body.w <= r.x + r.w + 1e-6
    && body.y >= r.y - 1e-6 && body.y + body.h <= r.y + r.h + 1e-6;
  if (inside) return;
  expect(['entering', 'leaving']).toContain(p.state);
  if (p.portal === 'left' || p.portal === 'right') {
    expect(body.y).toBeGreaterThanOrEqual(r.y - 1e-6);
    expect(body.y + body.h).toBeLessThanOrEqual(r.y + r.h + 1e-6);
  } else {
    expect(body.x).toBeGreaterThanOrEqual(r.x - 1e-6);
    expect(body.x + body.w).toBeLessThanOrEqual(r.x + r.w + 1e-6);
  }
}

describe('the colony', () => {
  const regions = regionsOf(DESKTOP);
  // Long stays and an endless spell keep a crowd in view for behaviour tests.
  const LINGER = Object.freeze({ ...AMBIENT, stay: [60, 90], spell: [1e6, 1e6] });

  /**
   * Run a colony, calling `each(colony, t)` every frame.
   * Returns a per-frame record of how many ants were out.
   */
  function simulate(seed, seconds, { limit = 6, tuning = AMBIENT, social = true, each, rooms = regions } = {}) {
    const colony = createColony({ random: createRandom(seed), tuning });
    const counts = [];
    for (let t = 0; t < seconds; t += FRAME) {
      colony.step(FRAME, rooms, limit, { social });
      counts.push(colony.count);
      each?.(colony, t);
    }
    return { colony, counts };
  }

  const present = (colony) => colony.ants.filter((a) => a.state !== 'absent');

  it('never exceeds the population ceiling, and reaches it with a summons', () => {
    for (const limit of [1, 2, 4, 6, 12]) {
      const { colony, counts } = simulate(limit, 20, { limit, tuning: LINGER, each: (c, t) => { if (t < FRAME) c.summon(limit); } });
      expect(Math.max(...counts)).toBeLessThanOrEqual(limit);
      expect(colony.count).toBe(limit);
    }
  });

  it('keeps the gutters empty for stretches, and fills them gradually rather than all at once', () => {
    const { counts } = simulate(21, 600);
    expect(Math.max(...counts)).toBeGreaterThan(2); // a colony, not a lone ant
    let longestEmpty = 0, run = 0;
    for (const n of counts) { run = n === 0 ? run + FRAME : 0; longestEmpty = Math.max(longestEmpty, run); }
    expect(longestEmpty).toBeGreaterThanOrEqual(AMBIENT.empty[0]);
    expect(counts.filter((n) => n === 0).length / counts.length).toBeGreaterThan(0.15);
    // Arrivals come one at a time, never several in the same frame.
    for (let i = 1; i < counts.length; i++) expect(counts[i] - counts[i - 1]).toBeLessThanOrEqual(1);
  });

  it.each([31, 32, 33, 34])('keeps every ant clear of the game and inside its region (seed %i)', (seed) => {
    simulate(seed, 200, { limit: 12, tuning: LINGER, each: (colony, t) => {
      if (t < FRAME) colony.summon(12);
      for (const a of colony.ants) if (a.state !== 'absent') expectContained(a, DESKTOP.game);
    } });
  });

  it.each([41, 42, 43, 44])('never stacks ants: no two come nearer than the spacing (seed %i)', (seed) => {
    let nearest = Infinity;
    simulate(seed, 200, { limit: 12, tuning: LINGER, each: (colony, t) => {
      if (t < FRAME) colony.summon(12);
      const out = present(colony);
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) nearest = Math.min(nearest, Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y));
      }
    } });
    expect(nearest).toBeGreaterThanOrEqual(AMBIENT.spacing - 1e-6);
  });

  it('spreads out rather than clustering at one spot', () => {
    let pairs = 0, total = 0, close = 0;
    simulate(51, 120, { tuning: LINGER, each: (colony, t) => {
      if (t < FRAME) colony.summon(6);
      if (t < 15) return;
      const out = present(colony).filter((a) => a.state !== 'entering');
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          if (out[i].region !== out[j].region) continue;
          const d = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y);
          pairs++; total += d; if (d < 40) close++;
        }
      }
    } });
    expect(total / pairs).toBeGreaterThan(120);
    expect(close / pairs).toBeLessThan(0.1);
  });

  it('never puts more ants in a region than that region holds', () => {
    const small = { x: 0, y: 0, w: 160, h: 160, portals: ['left'] }; // room for one
    const large = { x: 1000, y: 0, w: 256, h: 857, portals: ['right'] };
    const rooms = [small, large];
    simulate(61, 300, { limit: 6, tuning: LINGER, rooms, each: (colony, t) => {
      if (t < FRAME) colony.summon(6);
      const inSmall = colony.ants.filter((a) => a.state !== 'absent' && a.state !== 'leaving' && a.region === small).length;
      expect(inSmall).toBeLessThanOrEqual(1);
    } });
  });

  it('sends the extras home when the ceiling drops, and lets no more in', () => {
    const { colony } = simulate(71, 20, { tuning: LINGER, each: (c, t) => { if (t < FRAME) c.summon(6); } });
    expect(colony.count).toBe(6);
    colony.step(FRAME, regions, 2);
    expect(colony.ants.filter((a) => a.state === 'leaving')).toHaveLength(4);
    let most = 6;
    for (let t = 0; t < 30; t += FRAME) { colony.step(FRAME, regions, 2); if (t > 15) most = Math.max(most === 6 ? 0 : most, colony.count); }
    expect(colony.count).toBeLessThanOrEqual(2);
    expect(most).toBeLessThanOrEqual(2);
  });

  it('wanders alone by default: social moments are occasional', () => {
    let solo = 0, social = 0;
    const kinds = new Set();
    simulate(81, 600, { each: (colony) => {
      for (const a of colony.ants) {
        if (a.state === 'absent') continue;
        if (a.mode === 'solo') solo++; else { social++; kinds.add(a.mode); }
      }
    } });
    expect(social).toBeGreaterThan(0);
    expect(solo / (solo + social)).toBeGreaterThan(0.6);
  });

  /** Gather six lingering ants, then ask for one kind of social moment and watch it. */
  function moment(kind, seed, seconds = 30) {
    const frames = [];
    simulate(seed, 12 + seconds, { tuning: LINGER, each: (colony, t) => {
      if (t < FRAME) colony.summon(6);
      if (Math.abs(t - 12) < FRAME / 2) colony.socialize(kind);
      if (t >= 12) {
        frames.push(colony.ants.map((a) => ({ state: a.state, mode: a.mode, x: a.x, y: a.y, heading: a.heading,
          partner: a.partner && colony.ants.indexOf(a.partner) })));
      }
    } });
    return frames;
  }

  it('lets one ant follow another, loosely, then wander off on its own', () => {
    const frames = moment('follow', 91);
    const start = frames.findIndex((f) => f.some((a) => a.mode === 'follow'));
    expect(start).toBeGreaterThanOrEqual(0);
    const follower = frames[start].findIndex((a) => a.mode === 'follow');
    const leader = frames[start][follower].partner;
    const gaps = [];
    let end = -1;
    for (let i = start; i < frames.length; i++) {
      const f = frames[i][follower];
      if (f.mode !== 'follow') { end = i; break; }
      gaps.push(Math.hypot(f.x - frames[i][leader].x, f.y - frames[i][leader].y));
    }
    expect(end).toBeGreaterThan(start); // it ends by itself
    expect(frames[end][follower].mode).toBe('solo');
    // It closes in behind its leader, but the gap breathes: no rigid formation.
    const later = gaps.slice(Math.floor(gaps.length / 2));
    expect(Math.min(...later)).toBeLessThan(60);
    const mean = later.reduce((a, b) => a + b, 0) / later.length;
    const spread = Math.sqrt(later.reduce((a, b) => a + (b - mean) ** 2, 0) / later.length);
    expect(spread).toBeGreaterThan(2);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(AMBIENT.spacing - 1e-6);
  });

  it('lets two ants meet, stand face to face a moment, then go their own ways', () => {
    const frames = moment('greet', 92);
    const start = frames.findIndex((f) => f.some((a) => a.mode === 'greet'));
    expect(start).toBeGreaterThanOrEqual(0);
    const a = frames[start].findIndex((x) => x.mode === 'greet');
    const b = frames[start][a].partner;
    expect(frames[start][b].partner).toBe(a);
    // Both reach each other and stop, facing one another.
    const met = frames.findIndex((f, i) => i > start && f[a].state === 'paused' && f[b].state === 'paused'
      && f[a].mode === 'greet' && f[b].mode === 'greet');
    expect(met).toBeGreaterThan(start);
    let facing = false;
    for (let i = met; i < frames.length && frames[i][a].mode === 'greet' && frames[i][b].mode === 'greet'; i++) {
      const f = frames[i];
      const toward = Math.atan2(f[b].y - f[a].y, f[b].x - f[a].x);
      if (Math.abs(Math.atan2(Math.sin(toward - f[a].heading), Math.cos(toward - f[a].heading))) < 0.3) facing = true;
      expect(Math.hypot(f[a].x - f[b].x, f[a].y - f[b].y)).toBeLessThan(AMBIENT.social.meet + 6);
    }
    expect(facing).toBe(true);
    const parted = frames.findIndex((f, i) => i > met && f[a].mode === 'solo' && f[b].mode === 'solo');
    expect(parted).toBeGreaterThan(met);
    // A few seconds later they are well apart again.
    const after = frames[Math.min(frames.length - 1, parted + 240)];
    expect(Math.hypot(after[a].x - after[b].x, after[a].y - after[b].y)).toBeGreaterThan(AMBIENT.social.meet + 20);
  });

  it('lets a few ants travel the same way for a while, each at its own pace', () => {
    const frames = moment('drift', 93);
    const start = frames.findIndex((f) => f.some((a) => a.mode === 'drift'));
    expect(start).toBeGreaterThanOrEqual(0);
    const members = frames[start].map((a, i) => (a.mode === 'drift' ? i : -1)).filter((i) => i >= 0);
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.length).toBeLessThanOrEqual(3);
    // Once turned (half a second or so), the members still drifting all move the same way.
    const [from, to] = [frames[start + 45], frames[start + 120]];
    const still = members.filter((i) => to[i].mode === 'drift');
    expect(still.length).toBeGreaterThanOrEqual(2);
    const moves = still.map((i) => [to[i].x - from[i].x, to[i].y - from[i].y]);
    const along = moves.map(([dx, dy]) => (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0));
    expect(new Set(along).size).toBe(1); // the gutters are tall: all up, or all down
    expect(along[0]).not.toBe(0);
    const paces = moves.map(([dx, dy]) => Math.hypot(dx, dy));
    expect(Math.max(...paces) - Math.min(...paces)).toBeGreaterThan(0.5);
    const end = frames.findIndex((f, i) => i > start && members.every((m) => f[m].mode === 'solo'));
    expect(end).toBeGreaterThan(start);
  });

  it('keeps to plain wandering without social moments (Low graphics), calming any in progress', () => {
    let seen = 0;
    simulate(94, 120, { social: false, each: (colony) => {
      for (const a of colony.ants) if (a.mode !== 'solo') seen++;
    } });
    expect(seen).toBe(0);
    const { colony } = simulate(92, 14, { tuning: LINGER, each: (c, t) => {
      if (t < FRAME) c.summon(6);
      if (Math.abs(t - 12) < FRAME / 2) c.socialize('greet');
    } });
    expect(colony.ants.some((a) => a.mode !== 'solo')).toBe(true);
    colony.step(FRAME, regions, 2, { social: false });
    expect(colony.ants.every((a) => a.mode === 'solo')).toBe(true);
  });

  it('ends social moments and retires ants whose gutter is gone on a layout change', () => {
    const { colony } = simulate(92, 14, { tuning: LINGER, each: (c, t) => {
      if (t < FRAME) c.summon(6);
      if (Math.abs(t - 12) < FRAME / 2) c.socialize('greet');
    } });
    colony.relayout(regions);
    expect(colony.ants.every((a) => a.mode === 'solo')).toBe(true);
    expect(colony.ants.filter((a) => a.state !== 'absent')).toHaveLength(6);
    colony.relayout([regions[0]]); // the right gutter is covered now
    for (const a of colony.ants) if (a.state !== 'absent') expect(a.region).toBe(regions[0]);
  });

  it('is reproducible from a seed, and different seeds make different scenes', () => {
    const trace = (seed) => {
      const out = [];
      simulate(seed, 90, { each: (colony, t) => { if (Math.round(t * 60) % 30 === 0) out.push(colony.ants.map((a) => `${a.state}${Math.round(a.x)},${Math.round(a.y)}`).join(' ')); } });
      return out;
    };
    expect(trace(7)).toEqual(trace(7));
    expect(trace(7)).not.toEqual(trace(8));
  });

  it('turns smoothly with company too, greeting included', () => {
    let maxTurn = 0;
    const last = new Array(AMBIENT.slots).fill(null);
    simulate(95, 60, { tuning: LINGER, each: (colony, t) => {
      if (t < FRAME) colony.summon(6);
      if (Math.abs(t - 12) < FRAME / 2) colony.socialize('greet');
      colony.ants.forEach((a, i) => {
        if (a.state === 'absent') { last[i] = null; return; }
        if (last[i] !== null) maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(a.heading - last[i]), Math.cos(a.heading - last[i]))));
        last[i] = a.heading;
      });
    } });
    expect(maxTurn).toBeLessThanOrEqual(AMBIENT.turnRate * 2.5 * FRAME + 1e-9);
  });
});

describe('the ant painter', () => {
  it('draws simpler bodies in Low quality and still legs when stopped', () => {
    const high = fakeContext(), low = fakeContext();
    drawAnt(high, { x: 10, y: 10, heading: 0, gait: 1 }, { quality: 'high' });
    drawAnt(low, { x: 10, y: 10, heading: 0, gait: 1 }, { quality: 'low' });
    expect(low.calls.lineTo).toBeLessThan(high.calls.lineTo);
    expect(low.calls.fill).toBeLessThan(high.calls.fill);
    expect(high.calls.save).toBe(high.calls.restore); // leaves the context as it found it
  });

  it('keeps the whole drawing, legs and antennae included, inside the footprint', () => {
    // Records local (ant-space) geometry: drawAnt translates to the ant, then draws about the origin.
    let reach = 0, lineWidth = 1;
    const ctx = {
      save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, stroke() {}, fill() {},
      set lineWidth(w) { lineWidth = w; }, get lineWidth() { return lineWidth; },
      moveTo(x, y) { reach = Math.max(reach, Math.hypot(x, y) + lineWidth / 2); },
      lineTo(x, y) { reach = Math.max(reach, Math.hypot(x, y) + lineWidth / 2); },
      ellipse(x, y, rx, ry) { reach = Math.max(reach, Math.hypot(x, y) + Math.max(rx, ry)); },
    };
    for (const quality of ['high', 'low']) {
      for (let gait = 0; gait < Math.PI * 2; gait += 0.1) {
        for (const twitch of [0, 0.05, 0.17, 0.35]) {
          drawAnt(ctx, { x: 0, y: 0, heading: 0, gait, moving: true, twitch }, { quality });
          drawAnt(ctx, { x: 0, y: 0, heading: 0, gait, moving: false, twitch }, { quality });
        }
      }
    }
    expect(reach).toBeGreaterThan(7); // the measurement saw the legs
    expect(reach).toBeLessThanOrEqual(AMBIENT.footprint);
  });

  it('allocates no per-ant arrays while drawing', () => {
    const source = readFileSync(new URL('../../src/rendering/ambient.js', import.meta.url), 'utf8');
    const painter = source.slice(source.indexOf('export function drawAnt'));
    expect(painter).not.toMatch(/\[\s*-1\s*,\s*1\s*\]|\.map\(|\.filter\(|new /);
  });
});

describe('the ambient layer', () => {
  it('attaches to the existing loop: no timers, animation frames or input listeners of its own, and cleans up', () => {
    const page = fakePage();
    const frames = vi.fn(() => 0);
    page.win.requestAnimationFrame = frames;
    globalThis.requestAnimationFrame = frames;
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    const ambient = createAmbient({ canvas: page.layer, seed: 1 });
    expect(page.layer.getContext).toHaveBeenCalledTimes(1);
    expect([...page.win.attached.keys()].sort()).toEqual(['blur', 'focus', 'resize', 'scroll']);
    expect(page.win.orientation.live).toBe(1);
    expect(page.win.observers).toHaveLength(1);
    expect(page.win.observers[0].observed).toContain(page.gameCanvas);
    untilVisible(ambient, 4);
    expect(page.layer.hidden).toBe(false);
    expect(page.layer.width).toBe(1200);
    ambient.dispose();
    expect(page.win.live + page.win.visualViewport.live + page.win.media.live + page.win.orientation.live).toBe(0);
    expect(page.win.observers[0].connected).toBe(false);
    expect(page.layer).toMatchObject({ width: 0, height: 0, hidden: true });
    expect(ambient.snapshot()).toMatchObject({ count: 0, ants: [] });
    expect(frames).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    timeout.mockRestore();
    interval.mockRestore();
    delete globalThis.requestAnimationFrame;
  }, 10_000);

  it('measures once per layout change, not every frame', () => {
    const page = fakePage();
    const ambient = createAmbient({ canvas: page.layer, seed: 1 });
    run(ambient, 0.5);
    const settled = page.reads();
    untilVisible(ambient, 4);
    run(ambient, 2);
    expect(page.reads()).toBe(settled); // four ants, still no measuring
    page.win.dispatchEvent(new Event('resize'));
    page.win.dispatchEvent(new Event('resize'));
    run(ambient, 0.5);
    const once = page.reads() - settled;
    expect(once).toBeGreaterThan(0);
    page.doc.body.dataset.readingReady = 'true'; // a reveal without any resize event
    run(ambient, 0.5);
    expect(page.reads() - settled).toBe(once * 2);
    ambient.dispose();
  });

  it('scales the colony to the measured space: four in this 1200 × 500 stage, six at 1920 × 1080', () => {
    const page = fakePage();
    const ambient = createAmbient({ canvas: page.layer, seed: 2 });
    run(ambient, 0.3);
    expect(ambient.snapshot()).toMatchObject({ space: 12, budget: 4, room: 4, limit: 4 });
    page.relayout({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    page.win.dispatchEvent(new Event('resize'));
    run(ambient, 0.3);
    expect(ambient.snapshot()).toMatchObject({ space: 12, budget: 6, room: 6 });
    untilVisible(ambient, 6);
    run(ambient, 3);
    expect(ambient.snapshot().count).toBeLessThanOrEqual(6);
    ambient.dispose();
  });

  it('follows viewport resizes and pixel ratio, capping backing pixels at 2×', () => {
    const page = fakePage({ dpr: 3 });
    const ambient = createAmbient({ canvas: page.layer, seed: 2 });
    untilVisible(ambient, 2);
    expect([page.layer.width, page.layer.height]).toEqual([2400, 1000]);
    expect(ambient.snapshot().regions).toHaveLength(2);
    // Narrower: the gutters shrink and the visitors, if their gutter is gone, leave with it.
    page.host.box = { left: 0, top: 0, width: 600, height: 500 };
    page.frame.box = { left: -1, top: -1, width: 602, height: 502 };
    page.gameCanvas.box = { left: 30, top: 0, width: 540, height: 500 }; // 22 px gutters after clearance
    page.win.dispatchEvent(new Event('resize'));
    ambient.update(FRAME, PLAYING);
    expect(page.layer.hidden).toBe(true); // nothing drawn against a changing layout
    run(ambient, 0.3);
    const after = ambient.snapshot();
    expect(after.regions).toEqual([]);
    expect(after.room).toBe(0);
    expect(after.count).toBe(0);
    expect([page.layer.width, page.layer.height, page.layer.hidden]).toEqual([0, 0, true]);
    ambient.dispose();
  });

  it('shows nothing when the space is inadequate, however long it waits', () => {
    const page = fakePage({ stage: { left: 0, top: 0, width: 357, height: 356 }, game: { left: 0, top: 25, width: 357, height: 307 } });
    const ambient = createAmbient({ canvas: page.layer, seed: 3 });
    ambient.summon(6);
    run(ambient, 60);
    expect(ambient.snapshot()).toMatchObject({ count: 0, room: 0, hidden: true, width: 0, height: 0 });
    expect(page.context.calls.ellipse ?? 0).toBe(0);
    ambient.dispose();
  });

  it('keeps a portrait phone empty even where there is measured room, and frees the surface', () => {
    // A 412 × 839 phone in play: real bands above and below the cup, but the cup fills the width.
    const page = fakePage({ stage: { left: 9, top: 200, width: 394, height: 527 }, game: { left: 9, top: 300, width: 394, height: 327 }, viewport: [412, 839] });
    const ambient = createAmbient({ canvas: page.layer, seed: 3 });
    ambient.summon(6);
    run(ambient, 30);
    const s = ambient.snapshot();
    expect(s.space).toBeGreaterThan(0); // the geometry alone would allow one
    expect(s).toMatchObject({ budget: 0, room: 0, count: 0, hidden: true, width: 0, height: 0 });
    ambient.dispose();
  });

  it('re-evaluates on turning the device: landscape ants leave for portrait, and may return', () => {
    const landscape = { stage: { left: 104, top: 70, width: 636, height: 272 }, game: { left: 264, top: 70, width: 316, height: 272 }, viewport: [844, 390] };
    const portrait = { stage: { left: 9, top: 200, width: 394, height: 527 }, game: { left: 9, top: 300, width: 394, height: 327 }, viewport: [412, 839] };
    const page = fakePage(landscape);
    const ambient = createAmbient({ canvas: page.layer, seed: 4 });
    untilVisible(ambient, 2);
    expect(ambient.snapshot()).toMatchObject({ budget: 2, room: 2 });
    // Only the orientation query reports the turn; no resize event arrives.
    page.relayout(portrait);
    page.win.orientation.matches = true;
    page.win.orientation.dispatchEvent(new Event('change'));
    ambient.update(FRAME, PLAYING);
    expect(page.layer.hidden).toBe(true);
    run(ambient, 0.3);
    expect(ambient.snapshot()).toMatchObject({ room: 0, count: 0, hidden: true, width: 0 });
    page.relayout(landscape);
    page.win.orientation.matches = false;
    page.win.orientation.dispatchEvent(new Event('change'));
    run(ambient, 0.3);
    expect(ambient.snapshot().room).toBe(2);
    untilVisible(ambient, 1);
    ambient.dispose();
  });

  it('honours graphics quality live: at most two ants and no social moments in Low', () => {
    const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    let quality = 'high';
    const ambient = createAmbient({ canvas: page.layer, seed: 4, quality: () => quality });
    untilVisible(ambient, 5);
    const paused = { ...PLAYING, phase: 'paused', pausedFrom: 'playing' };
    ambient.update(FRAME, paused);
    const before = page.context.calls.lineTo;
    run(ambient, 0.5, paused);
    expect(page.context.calls.lineTo).toBe(before); // a still colony is not redrawn
    quality = 'low';
    ambient.update(FRAME, paused);
    expect(page.context.calls.lineTo).toBeGreaterThan(before); // but is, once, in its new look
    run(ambient, 0.1);
    expect(ambient.snapshot().limit).toBe(2);
    expect(ambient.snapshot().ants.filter((a) => a.state !== 'leaving').length).toBeLessThanOrEqual(2);
    ambient.socialize('greet');
    let most = 0, social = 0;
    for (let t = 0; t < 60; t += FRAME) {
      ambient.update(FRAME, PLAYING);
      const s = ambient.snapshot();
      if (t > 20) most = Math.max(most, s.count);
      social += s.ants.filter((a) => a.mode !== 'solo').length;
    }
    expect(most).toBeLessThanOrEqual(2);
    expect(social).toBe(0);
    quality = 'high';
    run(ambient, 0.1);
    expect(ambient.snapshot().limit).toBe(6);
    ambient.dispose();
  });

  it('removes every ant at once for reduced motion, including a live change, and keeps them away', () => {
    const page = fakePage();
    const ambient = createAmbient({ canvas: page.layer, seed: 5 });
    untilVisible(ambient, 3);
    page.win.media.matches = true;
    page.win.media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    ambient.update(FRAME, PLAYING);
    expect(ambient.snapshot()).toMatchObject({ policy: 'off', count: 0, ants: [], hidden: true });
    ambient.summon(4);
    run(ambient, 60);
    expect(ambient.snapshot().count).toBe(0);
    ambient.dispose();

    const still = fakePage({ reduced: true });
    const quiet = createAmbient({ canvas: still.layer, seed: 5 });
    quiet.summon(4);
    run(quiet, 30);
    expect(quiet.snapshot()).toMatchObject({ policy: 'off', count: 0 });
    quiet.dispose();
  });

  it('freezes every ant while paused or unfocused, hides under modals, and leaves with the scene', () => {
    const page = fakePage();
    const ambient = createAmbient({ canvas: page.layer, seed: 6 });
    untilVisible(ambient, 3);
    const at = () => ambient.snapshot().ants.map((a) => [a.slot, a.x, a.y]);
    const here = at();
    run(ambient, 1, { ...PLAYING, phase: 'paused', pausedFrom: 'playing' });
    expect(at()).toEqual(here);
    expect(page.layer.hidden).toBe(false);
    page.win.dispatchEvent(new Event('blur'));
    run(ambient, 1);
    expect(at()).toEqual(here);
    page.win.dispatchEvent(new Event('focus'));
    run(ambient, 1, { ...PLAYING, blocked: true });
    expect(at()).toEqual(here);
    expect(page.layer.hidden).toBe(true);
    run(ambient, 0.2);
    expect(page.layer.hidden).toBe(false); // back where they were, no catch-up
    run(ambient, 0.1, { ...PLAYING, phase: 'gameover' });
    expect(ambient.snapshot()).toMatchObject({ count: 0, hidden: true });
    ambient.dispose();
  });

  it('draws each ant once a frame and clears only where they were', () => {
    const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    const ambient = createAmbient({ canvas: page.layer, seed: 7, ants: 12 });
    untilVisible(ambient, 12);
    const calls = page.context.calls;
    const [clears, saves] = [calls.clearRect, calls.save];
    ambient.update(FRAME, PLAYING);
    const n = ambient.snapshot().count;
    expect(calls.save - saves).toBe(n); // one drawAnt per ant
    expect(calls.clearRect - clears).toBe(12); // last frame's twelve spots
    ambient.dispose();
  });

  it('stays cheap with a dozen ants: bounded work per frame and no growing state', () => {
    const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    const ambient = createAmbient({ canvas: page.layer, seed: 8, ants: 12 });
    untilVisible(ambient, 12);
    const frames = 60 * 30;
    const start = performance.now();
    for (let i = 0; i < frames; i++) ambient.update(FRAME, PLAYING);
    const perFrame = (performance.now() - start) / frames;
    // Generous for slow CI machines; locally it is a few hundredths of a millisecond.
    expect(perFrame).toBeLessThan(1);
    expect(ambient.snapshot().ants.length).toBeLessThanOrEqual(12);
    const source = readFileSync(new URL('../../src/ui/ambient.js', import.meta.url), 'utf8');
    const update = source.slice(source.indexOf('    update(dt, scene)'), source.indexOf('    /** Force a layout'));
    expect(update).not.toMatch(/\.map\(|\.filter\(|new |getBoundingClientRect/);
    ambient.dispose();
  });
});

describe('isolation from the game', () => {
  it('is decorative markup that cannot take input or focus', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const tag = html.match(/<canvas id="ambientLayer"[^>]*>/)?.[0];
    expect(tag).toMatch(/aria-hidden="true"/);
    expect(tag).not.toMatch(/tabindex|data-gestures|role=/);
    const css = readFileSync(new URL('../../styles/main.css', import.meta.url), 'utf8');
    const rule = css.match(/#ambientLayer \{[^}]*\}/)?.[0];
    expect(rule).toMatch(/pointer-events: none/);
    expect(rule).toMatch(/position: absolute/);
  });

  it('draws cosmetic randomness only from its own generator, never Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const page = fakePage();
    const ambient = createAmbient({ canvas: page.layer }); // unseeded: a fresh crypto seed
    untilVisible(ambient, 4);
    ambient.socialize();
    run(ambient, 20);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    ambient.dispose();
  });

  it('leaves seeded gameplay identical with a whole colony: state, events and random streams', () => {
    function play(withAmbient, ambientSeed) {
      const game = createGame({ seed: 77 });
      const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
      const ambient = withAmbient ? createAmbient({ canvas: page.layer, seed: ambientSeed, ants: 12 }) : null;
      ambient?.summon(12);
      const log = [];
      game.primaryAction();
      for (let i = 0; i < 60 * 40; i++) {
        const input = { left: Math.floor(i / 80) % 2 === 0, right: Math.floor(i / 80) % 2 === 1, fire: true };
        game.update(FRAME, input);
        if (game.offerOpen()) game.chooseUpgrade(0);
        else if (game.state.phase === 'reading' && game.state.readingTime > 1) game.primaryAction();
        if (game.state.phase === 'gameover') game.primaryAction();
        for (const event of game.drainEvents()) log.push(`${i}:${event.type}`);
        const before = withAmbient && i % 97 === 0 ? JSON.stringify(game.state) : null;
        const s = game.state;
        if (i % 600 === 300) ambient?.socialize();
        // Stepped a varying number of times, as a slow or fast display would.
        for (let k = 0; k < (i % 3); k++) {
          ambient?.update(FRAME, { phase: s.phase, pausedFrom: s.pausedFrom, offer: !!s.offer, blocked: false, holding: false });
        }
        if (before) expect(JSON.stringify(game.state)).toBe(before);
      }
      const seen = ambient?.snapshot().count;
      ambient?.dispose();
      return { state: JSON.stringify(game.state), log, seen };
    }
    const plain = play(false);
    const decorated = play(true, 1);
    const otherSeed = play(true, 99);
    expect(decorated.log).toEqual(plain.log);
    expect(decorated.state).toBe(plain.state);
    expect(otherSeed.state).toBe(plain.state);
    expect(plain.log.some((entry) => entry.endsWith(':kill'))).toBe(true);
  }, 30_000);
});
