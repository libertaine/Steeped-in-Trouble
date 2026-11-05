import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import {
  AMBIENT, ambientPolicy, capacity, createColony, createVisitor, cubeRoom, displayBudget, drawAnt, drawCrumb, drawCube,
  formation, inflate, intersects, narrowPortrait, phoneShape, planRoute, populationLimit, regionCapacity, safeRegions,
  subtract,
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

/** A recording 2D context: counts calls, draws nothing; remembers fill colours in order and cleared sizes. */
function fakeContext() {
  const calls = {}, fills = [], cleared = [];
  return new Proxy({ calls, fills, cleared }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        calls[key] = (calls[key] ?? 0) + 1;
        if (key === 'clearRect') cleared.push(args[2]);
        return args;
      };
    },
    set(target, key, value) {
      if (key === 'fillStyle') fills.push(value);
      target[key] = value;
      return true;
    },
  });
}

/**
 * Just enough of the page for the ambient adapter: a playfield frame holding
 * a stage, the game canvas, one panel and the decorative layer. Rectangles
 * are viewport CSS pixels and can be changed between frames.
 */
function fakePage({ stage = { left: 0, top: 0, width: 1200, height: 500 },
  game = { left: 350, top: 0, width: 500, height: 500 }, viewport = [1200, 800], dpr = 1, reduced = false,
  touch = false, screen = [1920, 1080] } = {}) {
  const win = new Target();
  Object.assign(win, { innerWidth: viewport[0], innerHeight: viewport[1], devicePixelRatio: dpr,
    screen: { width: screen[0], height: screen[1] } });
  win.visualViewport = new Target();
  win.media = Object.assign(new Target(), { matches: reduced });
  win.orientation = Object.assign(new Target(), { matches: viewport[1] > viewport[0] });
  // The primary pointer: coarse on a touch-first device, otherwise fine.
  win.coarse = Object.assign(new Target(), { matches: touch });
  win.matchMedia = (query) => (query.includes('orientation') ? win.orientation
    : query === '(pointer: coarse)' ? win.coarse
    : query === '(pointer: fine)' ? { matches: !win.coarse.matches }
    : query.includes('pointer') ? { matches: false } : win.media);
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
  /** Add a protected panel to the stage (shown at once), as a reveal or a new control would. */
  function addPanel(rect) {
    const added = element(rect);
    host.children = [...host.children, added];
    return added;
  }
  return { win, doc, host, frame, gameCanvas, panel, layer, context, relayout, addPanel, reads: () => reads };
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
/** A desktop window (a 1920 × 1080 screen, a mouse), and a touch-first 412 × 915 phone held either way. */
const desk = (w, h) => ({ viewport: { w, h }, screen: { w: 1920, h: 1080 }, touch: false });
const phone = (w, h) => ({ viewport: { w, h }, screen: { w: 412, h: 915 }, touch: true });
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

  /** Every pair of regions is disjoint, each clear of every exclusion's margin and open to a real edge. */
  function expectSound(regions, exclusions, visible = stage) {
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) expect(intersects(regions[i], regions[j])).toBe(false);
      for (const e of exclusions) expect(intersects(regions[i], inflate(e, AMBIENT.clearance - 0.01))).toBe(false);
      expect(regions[i].portals.length).toBeGreaterThan(0);
      const r = regions[i];
      expect(r.x >= visible.x && r.y >= visible.y && r.x + r.w <= visible.x + visible.w && r.y + r.h <= visible.y + visible.h).toBe(true);
    }
  }

  it('never overlaps regions where strips meet round a panel, so no space counts twice', () => {
    // A badge in the left gutter's top corner leaves an L of free space.
    const badge = { x: 0, y: 0, w: 150, h: 120 };
    const exclusions = [game, badge];
    const blocked = exclusions.map((e) => inflate(e, AMBIENT.clearance));
    const pieces = subtract(stage, blocked).filter((p) => p.x < 350);
    expect(pieces.some((p, i) => pieces.some((q, j) => j > i && intersects(p, q)))).toBe(true); // the raw strips overlap
    const regions = safeRegions(stage, exclusions);
    expectSound(regions, exclusions);
    // The L holds 342 × 500 − 158 × 128 px²: room for six at most, never the eight the two strips would claim.
    const left = regions.filter((r) => r.x < 350);
    const free = 342 * 500 - 158 * 128;
    expect(left.reduce((sum, r) => sum + r.w * r.h, 0)).toBeLessThanOrEqual(free);
    expect(capacity(left)).toBeLessThanOrEqual(Math.floor(free / AMBIENT.areaPerVisitor));
    expect(pieces.reduce((sum, p) => sum + regionCapacity(p), 0)).toBe(8);
    expect(capacity(left)).toBe(5);
  });

  it('keeps regions disjoint and clear around a control partly covering a gutter', () => {
    const button = { x: 100, y: 200, w: 80, h: 60 };
    const exclusions = [game, button, { x: 0, y: 440, w: 1200, h: 60 }];
    const regions = safeRegions(stage, exclusions);
    expectSound(regions, exclusions);
    // A seam between two regions is never a way in.
    for (const r of regions) {
      if (r.portals.includes('left')) expect(r.x).toBe(0);
      if (r.portals.includes('top')) expect(r.y).toBe(0);
    }
    expect(capacity(regions)).toBeGreaterThan(0);
  });

  it.each([1, 2, 3, 4, 5, 6])('stays disjoint and clear for scattered panels and partly hidden stages (seed %i)', (seed) => {
    const random = createRandom(seed);
    for (let trial = 0; trial < 40; trial++) {
      const visible = { x: 0, y: 0, w: random.range(600, 1600), h: random.range(300, 900) };
      const exclusions = Array.from({ length: random.int(6) + 1 }, () => ({
        x: random.range(-50, visible.w), y: random.range(-50, visible.h), w: random.range(20, 500), h: random.range(20, 400),
      }));
      const regions = safeRegions(visible, exclusions, { open: { left: true, right: random.next() < 0.5, top: true, bottom: random.next() < 0.5 } });
      expectSound(regions, exclusions, visible);
      expect(regions.reduce((sum, r) => sum + r.w * r.h, 0)).toBeLessThanOrEqual(visible.w * visible.h);
    }
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
    ['1920 × 1080 desktop', gutters(256, 857), desk(1920, 1080), 6],
    ['1600 × 900 desktop', gutters(361, 677), desk(1600, 900), 6],
    ['1366 × 768 laptop', gutters(331, 545), desk(1366, 768), 4],
    ['1280 × 720 laptop', gutters(315, 498), desk(1280, 720), 4],
    ['1024 × 768 tablet or small window', gutters(154, 554), desk(1024, 768), 3],
    ['800 × 600 window', gutters(103, 482), desk(800, 600), 2],
    ['1200 × 480 short desktop window, by its geometry alone', gutters(300, 330), desk(1200, 480), 3],
    ['844 × 390 landscape phone', gutters(152, 272), phone(844, 390), 2],
    ['932 × 430 landscape phone', gutters(173, 312), phone(932, 430), 2],
    ['844 × 390 landscape phone, even with roomier gutters', gutters(300, 330), phone(844, 390), 2],
    ['412 × 839 portrait phone, even with bands above and below the cup', gutters(394, 86), phone(412, 839), 0],
    ['412 × 839 narrow portrait desktop window, whatever its input', gutters(394, 86), desk(412, 839), 0],
    ['500 × 900 portrait window, at the limit', gutters(300, 330), desk(500, 900), 0],
    ['501 × 900 portrait window, by its geometry', gutters(300, 330), desk(501, 900), 3],
    ['844 × 390 short landscape desktop window, by its geometry', gutters(247, 272), desk(844, 390), 2],
  ])('scales the ceiling with the measured space: %s → %i', (_, regions, device, expected) => {
    expect(displayBudget(regions, device)).toBe(expected);
  });

  it('never exceeds the prototype cap, however much room; a debug override reaches the slot count and no further', () => {
    const vast = gutters(2000, 2000);
    expect(capacity(vast)).toBe(AMBIENT.slots);
    expect(displayBudget(vast, desk(3840, 2160))).toBe(AMBIENT.maxVisitors);
    expect(AMBIENT.maxVisitors).toBe(6);
    expect(AMBIENT.slots).toBe(12);
    expect(displayBudget(vast, desk(3840, 2160), { override: 12 })).toBe(12);
    expect(displayBudget(vast, desk(3840, 2160), { override: 50 })).toBe(12);
    expect(displayBudget(vast, desk(3840, 2160), { override: 0 })).toBe(0);
    // A portrait phone stays empty even under an override.
    expect(displayBudget(vast, phone(412, 839), { override: 12 })).toBe(0);
  });

  it('keeps every upright viewport up to 500 px wide empty, whatever the device; never a landscape one', () => {
    expect(narrowPortrait({ w: 412, h: 839 })).toBe(true);
    expect(narrowPortrait({ w: 500, h: 501 })).toBe(true);
    expect(narrowPortrait({ w: 501, h: 900 })).toBe(false);
    expect(narrowPortrait({ w: 500, h: 500 })).toBe(false); // square is not upright
    expect(narrowPortrait({ w: 844, h: 390 })).toBe(false);
    expect(narrowPortrait({ w: 1200, h: 480 })).toBe(false);
    expect(narrowPortrait(null)).toBe(false);
    // With a mouse, with touch, even under a debug override.
    for (const touch of [false, true]) {
      const device = { viewport: { w: 412, h: 839 }, screen: { w: 1920, h: 1080 }, touch };
      expect(displayBudget(gutters(2000, 2000), device)).toBe(0);
      expect(displayBudget(gutters(2000, 2000), device, { override: 12 })).toBe(0);
    }
    // The short desktop window is still a desktop, and a phone held sideways still holds two.
    expect(displayBudget(gutters(300, 330), desk(1200, 480))).toBe(3);
    expect(displayBudget(gutters(300, 330), phone(844, 390))).toBe(2);
  });

  it('tells a phone by its device, and which way up by its viewport', () => {
    expect(phoneShape(phone(412, 839))).toBe('portrait');
    expect(phoneShape(phone(844, 390))).toBe('landscape');
    expect(phoneShape(phone(915, 412))).toBe('landscape');
    // Short or narrow desktop windows are not phones, whatever their shape.
    expect(phoneShape(desk(1200, 480))).toBe(null);
    expect(phoneShape(desk(844, 390))).toBe(null);
    expect(phoneShape(desk(412, 839))).toBe(null);
    expect(phoneShape(desk(1280, 720))).toBe(null);
    // Touch alone is not a phone: a touch laptop, or a tablet, follows its geometry.
    expect(phoneShape({ viewport: { w: 1200, h: 480 }, screen: { w: 1920, h: 1080 }, touch: true })).toBe(null);
    expect(phoneShape({ viewport: { w: 768, h: 1024 }, screen: { w: 768, h: 1024 }, touch: true })).toBe(null);
    // Nor is a small screen driven by a mouse; and with no screen reported, nothing is a phone.
    expect(phoneShape({ viewport: { w: 412, h: 839 }, screen: { w: 412, h: 915 }, touch: false })).toBe(null);
    expect(phoneShape({ viewport: { w: 412, h: 839 }, touch: true })).toBe(null);
    expect(phoneShape()).toBe(null);
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

  it.each([62, 63, 64])('keeps ants in neighbouring regions apart where panels divide a gutter (seed %i)', (seed) => {
    // The 1920 × 1080 left gutter, with a badge in its corner and a button part way down.
    const panels = [DESKTOP.game, { x: 0, y: 0, w: 140, h: 110 }, { x: 90, y: 420, w: 100, h: 60 }];
    const rooms = safeRegions(DESKTOP.visible, panels);
    expect(rooms.filter((r) => r.x < 264).length).toBeGreaterThan(1);
    let shared = 0;
    simulate(seed, 120, { limit: 12, tuning: LINGER, rooms, each: (colony, t) => {
      if (t < FRAME) colony.summon(12);
      const out = present(colony);
      for (const a of out) {
        for (const p of panels) expect(intersects(footprint(a), inflate(p, AMBIENT.clearance - 0.01))).toBe(false);
        if (a.state === 'wandering' || a.state === 'paused') expectContained(a, DESKTOP.game);
      }
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          if (out[i].region === out[j].region) continue;
          shared++;
          expect(intersects(footprint(out[i]), footprint(out[j]))).toBe(false);
        }
      }
    } });
    expect(shared).toBeGreaterThan(0);
  });

  it('on a layout change keeps every ant that still fits where it stands, and retires at once those that do not', () => {
    const { colony } = simulate(65, 20, { tuning: LINGER, each: (c, t) => { if (t < FRAME) c.summon(6); } });
    // Half of them are already on their way home.
    colony.step(FRAME, regions, 3);
    const out = present(colony).map((a) => ({ a, x: a.x, y: a.y, state: a.state, tx: a.targetX, ty: a.targetY, region: a.region }));
    expect(out.some((o) => o.state === 'leaving')).toBe(true);
    // A panel now covers the middle of the left gutter.
    const panel = { x: 0, y: 200, w: 256, h: 300 };
    const next = safeRegions(DESKTOP.visible, [DESKTOP.game, panel]);
    const meets = (o) => intersects(footprint(o), inflate(panel, AMBIENT.clearance));
    const fits = (o) => next.some((r) => o.x - AMBIENT.footprint >= r.x && o.x + AMBIENT.footprint <= r.x + r.w
      && o.y - AMBIENT.footprint >= r.y && o.y + AMBIENT.footprint <= r.y + r.h);
    colony.relayout(next);
    let kept = 0, retired = 0;
    for (const o of out) {
      if (meets(o)) { expect(o.a.state).toBe('absent'); retired++; continue; } // gone before it can be drawn on the panel
      if (o.state === 'wandering' || o.state === 'paused') expect(o.a.state).toBe(fits(o) ? o.state : 'absent');
      if (o.a.state === 'absent') continue;
      kept++;
      // Kept: not moved at all, in the new region holding its footprint, and still heading somewhere safe.
      expect([o.a.x, o.a.y]).toEqual([o.x, o.y]);
      expect(next).toContain(o.a.region);
      if (o.a.state === 'leaving') continue;
      const r = inflate(o.a.region, -AMBIENT.footprint);
      const safe = (x, y) => x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6;
      expect(safe(o.a.targetX, o.a.targetY)).toBe(true);
      if (safe(o.tx, o.ty)) expect([o.a.targetX, o.a.targetY]).toEqual([o.tx, o.ty]); // a safe target is kept
    }
    expect(retired).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
    expect(out.some((o) => o.region === regions[0] && o.a.state !== 'absent')).toBe(true); // the cut gutter keeps some
    // From here on nobody comes near it.
    for (let t = 0; t < 60; t += FRAME) {
      if (t < FRAME) colony.summon(6);
      colony.step(FRAME, next, 6);
      for (const a of present(colony)) expect(intersects(footprint(a), inflate(panel, AMBIENT.clearance - 0.01))).toBe(false);
    }
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

  it.each([91, 96, 97, 98, 99])('picks a leader close enough to catch, walking ahead of its follower (seed %i)', (seed) => {
    const frames = moment('follow', seed);
    const start = frames.findIndex((f) => f.some((a) => a.mode === 'follow'));
    expect(start).toBeGreaterThanOrEqual(0);
    const follower = frames[start].findIndex((a) => a.mode === 'follow');
    const leader = frames[start][follower].partner;
    const gap = (f) => Math.hypot(f[follower].x - f[leader].x, f[follower].y - f[leader].y);
    expect(gap(frames[start])).toBeLessThanOrEqual(AMBIENT.social.followReach);
    // The leader is the nearest settled companion it could have had, and walks on ahead of it.
    const others = frames[start].filter((a, i) => i !== follower && i !== leader && a.state !== 'absent' && a.state !== 'entering'
      && a.state !== 'leaving');
    const near = others.filter((a) => Math.hypot(a.x - frames[start][follower].x, a.y - frames[start][follower].y) < gap(frames[start]) - 1e-6);
    expect(near.filter((a) => a.mode === 'solo')).toHaveLength(0);
    // Either the follower is behind the leader, or the leader is in front of the follower: never head to head.
    const [f, l] = [frames[start][follower], frames[start][leader]];
    const behind = Math.cos(l.heading) * (f.x - l.x) + Math.sin(l.heading) * (f.y - l.y) <= 0;
    const ahead = Math.cos(f.heading) * (l.x - f.x) + Math.sin(f.heading) * (l.y - f.y) > 0;
    expect(behind || ahead).toBe(true);
    // It is soon walking close behind, not chasing a speck across the gutter.
    let caught = false;
    for (let i = start; i < Math.min(frames.length, start + 6 * 60) && frames[i][follower].mode === 'follow'; i++) {
      if (gap(frames[i]) < AMBIENT.social.catchUp) caught = true;
    }
    expect(caught).toBe(true);
  });

  it('lets a follower that falls far behind give up', () => {
    const left = [regions[0]]; // one gutter, and the pair a few steps apart in it
    const colony = createColony({ random: createRandom(5), tuning: LINGER });
    for (let t = 0; t < 12; t += FRAME) { if (t < FRAME) colony.summon(2); colony.step(FRAME, left, 2); }
    const [a, b] = colony.ants;
    Object.assign(b, { x: a.x + (a.x < left[0].x + left[0].w / 2 ? 40 : -40), y: a.y, targetX: a.x, targetY: a.y });
    colony.socialize('follow');
    let follower = null;
    for (let t = 0; t < 30 && !follower; t += FRAME) {
      colony.step(FRAME, left, 2);
      follower = colony.ants.find((a) => a.mode === 'follow') ?? null;
    }
    expect(follower).not.toBe(null);
    // Its leader is suddenly well out of reach (a wild sprint, for the test).
    const leader = follower.partner;
    leader.y = leader.y < 400 ? leader.y + 400 : leader.y - 400;
    colony.step(FRAME, left, 2);
    expect(follower.mode).toBe('solo');
    expect(follower.partner).toBe(null);
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

  it('keeps a social moment through a layout change that leaves both ants room, and retires ants whose gutter is gone', () => {
    const { colony } = simulate(92, 14, { tuning: LINGER, each: (c, t) => {
      if (t < FRAME) c.summon(6);
      if (Math.abs(t - 12) < FRAME / 2) c.socialize('greet');
    } });
    const pair = colony.ants.filter((a) => a.mode === 'greet');
    expect(pair).toHaveLength(2);
    colony.relayout(regions);
    expect(pair.map((a) => a.mode)).toEqual(['greet', 'greet']);
    expect(colony.ants.filter((a) => a.state !== 'absent')).toHaveLength(6);
    // The pair's gutter stays; the other one is covered now.
    const kept = pair[0].region, other = regions.find((r) => r !== kept);
    const gone = colony.ants.filter((a) => a.state !== 'absent' && a.region === other);
    expect(gone.length).toBeGreaterThan(0);
    colony.relayout([kept]);
    for (const a of gone) expect(a.state).toBe('absent');
    for (const a of colony.ants) if (a.state !== 'absent') expect(a.region).toBe(kept);
    expect(pair.map((a) => a.mode)).toEqual(['greet', 'greet']);
    // The moment plays out as usual.
    for (let t = 0; t < 10; t += FRAME) colony.step(FRAME, [kept], 6);
    expect(pair.every((a) => a.mode === 'solo' || a.state === 'absent')).toBe(true);
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
  describe('crumbs', () => {
    const K = AMBIENT.crumb;
    const MAX_STEP = AMBIENT.speed[1] * FRAME; // the farthest an ant walks in one frame

    /** Six lingering ants, a crumb asked for at 8 s; `each(colony, t)` every frame from then on. */
    function crumbRun(seed, seconds, { rooms = regions, each, limit = 6, social = true, tuning = LINGER } = {}) {
      return simulate(seed, 8 + seconds, { tuning, rooms, limit, social, each: (colony, t) => {
        if (t < FRAME) colony.summon(limit);
        if (Math.abs(t - 8) < FRAME / 2) colony.crumble();
        if (t >= 8) each?.(colony, t);
      } });
    }

    /** The crumb's whole outline, as a box. */
    const outline = ({ x, y }) => ({ x: x - K.radius, y: y - K.radius, w: K.radius * 2, h: K.radius * 2 });
    const within = (inner, outer) => inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6
      && inner.x + inner.w <= outer.x + outer.w + 1e-6 && inner.y + inner.h <= outer.y + outer.h + 1e-6;

    /** Follow one crumb from the request to its end: per-frame copies of it and of whoever claims it. */
    function story(seed, seconds = 40, options = {}) {
      const frames = [];
      let claimer = null;
      crumbRun(seed, seconds, { ...options, each: (colony, t) => {
        const c = colony.crumb;
        if (c.claim && claimer === null) claimer = colony.ants.indexOf(c.claim);
        const a = claimer === null ? null : colony.ants[claimer];
        frames.push({ t, crumb: { state: c.state, x: c.x, y: c.y, alpha: c.alpha, region: c.region, claim: c.claim },
          ant: a && { state: a.state, mode: a.mode, cargo: a.cargo, x: a.x, y: a.y, heading: a.heading, region: a.region, portal: a.portal },
          count: colony.count, spell: colony.spell,
          others: colony.ants.map((o) => ({ state: o.state, mode: o.mode, cargo: o.cargo, x: o.x, y: o.y })) });
        options.each?.(colony, t);
      } });
      return { frames, claimer };
    }

    it.each([1, 2, 3, 4, 5, 6])('turns up only among settled ants, well inside a region and clear of everyone (seed %i)', (seed) => {
      const { frames } = story(seed, 10);
      const first = frames.find((f) => f.crumb.state === 'lying');
      expect(first).toBeDefined();
      expect(first.count).toBeGreaterThan(0);
      expect(first.spell).toBe('active');
      expect(regions).toContain(first.crumb.region);
      // Room for a whole ant to stand over it, inside the region.
      expect(within(outline(first.crumb), inflate(first.crumb.region, -(AMBIENT.footprint + K.mouth)))).toBe(true);
      expect(intersects(outline(first.crumb), inflate(DESKTOP.game, AMBIENT.clearance))).toBe(false);
      for (const o of first.others) {
        if (o.state !== 'absent') expect(Math.hypot(o.x - first.crumb.x, o.y - first.crumb.y)).toBeGreaterThanOrEqual(AMBIENT.spacing * 2);
      }
      // It fades in rather than popping into view.
      expect(first.crumb.alpha).toBeLessThan(0.1);
    });

    it('never turns up without ants, space or an active colony', () => {
      for (const [limit, rooms] of [[0, regions], [6, []]]) {
        const { colony } = simulate(7, 60, { limit, rooms, each: (c, t) => { if (t < FRAME) { c.summon(6); c.crumble(); } } });
        expect(colony.crumb.state).toBe('none');
      }
      // Quiet spells bring none either: requested before anyone is about, it waits for them.
      const { counts, colony } = simulate(8, 2, { each: (c, t) => { if (t < FRAME) c.crumble(); expect(c.crumb.state).toBe('none'); } });
      expect(Math.max(...counts)).toBe(0);
      expect(colony.crumb.state).toBe('none');
    });

    it.each([2, 3, 5, 7])('is noticed by a free ant close by, which walks over and looks it over, facing it (seed %i)', (seed) => {
      const { frames, claimer } = story(seed);
      expect(claimer).not.toBe(null);
      const claimed = frames.findIndex((f) => f.crumb.claim);
      const at = frames[claimed];
      expect(at.crumb.alpha).toBe(1); // noticed once fully there
      expect(Math.hypot(at.ant.x - at.crumb.x, at.ant.y - at.crumb.y)).toBeLessThanOrEqual(K.notice + MAX_STEP);
      expect(at.ant.mode).toBe('forage');
      // Investigating: standing still with its jaws at the crumb, turned toward it, for a moment.
      const looking = frames.filter((f, i) => i > claimed && f.ant.mode === 'forage' && f.ant.state === 'paused');
      expect(looking.length * FRAME).toBeGreaterThanOrEqual(K.investigate[0] - 2 * FRAME);
      for (const f of looking) expect(Math.hypot(f.ant.x - f.crumb.x, f.ant.y - f.crumb.y)).toBeLessThanOrEqual(K.mouth + 4);
      const lifted = frames.findIndex((f) => f.crumb.state === 'carried');
      expect(lifted).toBeGreaterThan(claimed);
      const before = frames[lifted - 1];
      const toward = Math.atan2(before.crumb.y - before.ant.y, before.crumb.x - before.ant.x);
      expect(Math.abs(Math.atan2(Math.sin(toward - before.ant.heading), Math.cos(toward - before.ant.heading)))).toBeLessThan(0.35);
    });

    it.each([2, 3, 5, 7])('is lifted into the jaws and held there, never jumping (seed %i)', (seed) => {
      const { frames } = story(seed);
      const lifted = frames.findIndex((f) => f.crumb.state === 'carried');
      expect(lifted).toBeGreaterThan(0);
      let jump = 0;
      for (let i = 1; i < frames.length; i++) {
        const [a, b] = [frames[i - 1].crumb, frames[i].crumb];
        if (a.state === 'none' || b.state === 'none') continue;
        jump = Math.max(jump, Math.hypot(b.x - a.x, b.y - a.y));
      }
      // At most a step and a turn of the head in one frame: the crumb never teleports.
      expect(jump).toBeLessThan(MAX_STEP + AMBIENT.turnRate * 2.5 * FRAME * K.mouth + 0.5);
      // Once lifted, it sits exactly in the jaws: a stable attachment.
      const settledAt = lifted + Math.ceil(K.lift / FRAME) + 1;
      let held = 0;
      for (const f of frames.slice(settledAt)) {
        if (f.crumb.state !== 'carried') break;
        held++;
        expect(f.crumb.x).toBeCloseTo(f.ant.x + Math.cos(f.ant.heading) * K.mouth, 9);
        expect(f.crumb.y).toBeCloseTo(f.ant.y + Math.sin(f.ant.heading) * K.mouth, 9);
      }
      expect(held).toBeGreaterThan(30);
    });

    it.each([2, 3, 5, 7, 11, 13])('is carried slowly home, within the region, out through one of its portals (seed %i)', (seed) => {
      const { frames } = story(seed, 60);
      const lifted = frames.findIndex((f) => f.crumb.state === 'carried');
      expect(lifted).toBeGreaterThan(0);
      let fastest = 0, leaving = null;
      for (let i = lifted + 1; i < frames.length; i++) {
        const [a, b] = [frames[i - 1], frames[i]];
        if (b.ant.state === 'absent') {
          // Home: both are gone together, beyond the portal it walked out of.
          expect(b.crumb.state).toBe('none');
          expect(leaving).not.toBe(null);
          expect(a.ant.region.portals).toContain(leaving);
          const r = a.ant.region;
          const out = { left: a.ant.x < r.x, right: a.ant.x > r.x + r.w, top: a.ant.y < r.y, bottom: a.ant.y > r.y + r.h }[leaving];
          expect(out).toBe(true);
          return;
        }
        fastest = Math.max(fastest, Math.hypot(b.ant.x - a.ant.x, b.ant.y - a.ant.y));
        if (b.ant.state === 'leaving') leaving = b.ant.portal;
        expect(b.ant.cargo).toBe(true);
        // The crumb's whole outline stays in the region (or beyond its portal, out of sight, on the way out).
        const r = b.ant.region;
        if (b.ant.state !== 'leaving') expect(within(outline(b.crumb), r)).toBe(true);
        expect(intersects(outline(b.crumb), inflate(DESKTOP.game, AMBIENT.clearance - 0.01))).toBe(false);
        // Slower than usual.
        expect(fastest).toBeLessThanOrEqual(AMBIENT.speed[1] * K.pace * FRAME + 1e-9);
      }
      throw new Error('the carrier never got home');
    });

    it('fades away again if nobody notices it', () => {
      // Nobody ever notices: it lies there for its while, then fades out.
      const blind = { ...LINGER, crumb: { ...K, notice: 0 } };
      const { frames } = story(4, 40, { tuning: blind });
      const lying = frames.filter((f) => f.crumb.state === 'lying');
      expect(lying.length * FRAME).toBeGreaterThanOrEqual(K.linger[0]);
      expect(lying.length * FRAME).toBeLessThanOrEqual(K.linger[1] + 2 * K.fade + 0.1);
      const gone = frames.findIndex((f, i) => i > 0 && f.crumb.state === 'none' && frames[i - 1].crumb.state === 'lying');
      expect(frames[gone - 1].crumb.alpha).toBeLessThan(0.05); // faded, not snatched away
    });

    it('is one crumb for one ant: the others, and ants busy with each other, leave it alone', () => {
      let foragers = 0, socialForagers = 0, carried = 0;
      for (const seed of [21, 22, 23, 24]) {
        simulate(seed, 240, { tuning: LINGER, each: (colony, t) => {
          if (t < FRAME) colony.summon(6);
          if (Math.round(t * 60) % 600 === 0) { colony.crumble(); colony.socialize(); }
          const busy = colony.ants.filter((a) => a.mode === 'forage' || a.cargo);
          expect(busy.length).toBeLessThanOrEqual(1);
          if (busy.length) {
            foragers++;
            expect(colony.crumb.claim).toBe(busy[0]);
          }
          for (const a of colony.ants) if (['follow', 'greet', 'drift'].includes(a.mode) && (a.cargo || a.crumb)) socialForagers++;
          if (colony.crumb.state === 'carried') carried++;
        } });
      }
      expect(foragers).toBeGreaterThan(0);
      expect(carried).toBeGreaterThan(0);
      expect(socialForagers).toBe(0);
    });

    it('is never claimed by an ant in a social moment, or by a leader being followed', () => {
      const colony = createColony({ random: createRandom(31), tuning: LINGER });
      const left = [regions[0]];
      for (let t = 0; t < 12; t += FRAME) { if (t < FRAME) colony.summon(2); colony.step(FRAME, left, 2); }
      const [a, b] = colony.ants;
      Object.assign(b, { x: a.x, y: a.y + (a.y < 400 ? 40 : -40) });
      colony.socialize('follow');
      for (let t = 0; t < 3 && !colony.ants.some((x) => x.mode === 'follow'); t += FRAME) colony.step(FRAME, left, 2);
      const follower = colony.ants.find((x) => x.mode === 'follow');
      expect(follower).toBeDefined();
      // A crumb right between them, fully there and waiting.
      Object.assign(colony.crumb, { state: 'lying', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, alpha: 1, life: 30,
        region: left[0], claim: null });
      let together = 0;
      for (let t = 0; t < 10 && follower.mode === 'follow'; t += FRAME) {
        colony.step(FRAME, left, 2);
        together++;
        expect(colony.crumb.claim).toBe(null);
      }
      expect(together).toBeGreaterThan(30);
      // Once the moment is over, one of them is free to notice it after all.
      let claimed = false;
      for (let t = 0; t < 20 && !claimed; t += FRAME) {
        colony.step(FRAME, left, 2);
        claimed = colony.crumb.claim !== null || colony.crumb.state === 'carried';
      }
      expect(claimed).toBe(true);
    });

    it('is reproducible from a seed, and different seeds tell different stories', () => {
      const trace = (seed) => story(seed, 30).frames.filter((f, i) => i % 20 === 0)
        .map((f) => `${f.crumb.state}${f.crumb.claim ? '*' : ''}@${f.crumb.x.toFixed(3)},${f.crumb.y.toFixed(3)}`);
      expect(trace(3)).toEqual(trace(3));
      expect(trace(3)).not.toEqual(trace(4));
    });

    it('keeps a carrier and its crumb where they are through a layout change they still fit (a paused cup)', () => {
      let checked = false;
      crumbRun(5, 40, { each: (c) => {
        if (checked || c.crumb.state !== 'carried' || c.crumb.lift < 1) return;
        const a = c.crumb.claim;
        if (a.state !== 'wandering' && a.state !== 'paused') return;
        checked = true;
        const before = [a.x, a.y, a.heading, a.targetX, a.targetY, c.crumb.x, c.crumb.y];
        // The cup shrinks to make room for the paused panel below it: wider, shorter gutters.
        const paused = safeRegions(DESKTOP.visible, [{ x: 298, y: 0, w: 930, h: 790 }, { x: 0, y: 806, w: 1526, h: 51 }]);
        const fits = paused.some((r) => a.x - AMBIENT.footprint >= r.x && a.x + AMBIENT.footprint <= r.x + r.w
          && a.y - AMBIENT.footprint >= r.y && a.y + AMBIENT.footprint <= r.y + r.h);
        expect(fits).toBe(true);
        c.relayout(paused);
        expect(a).toMatchObject({ cargo: true, mode: 'carry' });
        expect(c.crumb).toMatchObject({ state: 'carried', claim: a });
        expect([a.x, a.y, a.heading, a.targetX, a.targetY, c.crumb.x, c.crumb.y]).toEqual(before);
        expect(paused).toContain(a.region);
      } });
      expect(checked).toBe(true);
    });

    it('goes at once with its region on a layout change, lying or carried; a surviving region keeps it', () => {
      for (const until of [(c) => c.crumb.state === 'lying' && c.crumb.claim, (c) => c.crumb.state === 'carried']) {
        // Run to that moment, then cover the crumb's gutter.
        let done = false;
        crumbRun(5, 40, { each: (c) => {
          if (done || !until(c)) return;
          done = true;
          const home = c.crumb.region ?? c.crumb.claim.region;
          const kept = regions.filter((r) => r !== home);
          // The same layout again keeps everything as it was.
          const state = c.crumb.state;
          c.relayout(regions);
          expect(c.crumb.state).toBe(state);
          c.relayout(kept);
          expect(c.crumb.state).toBe('none');
          expect(c.ants.some((a) => a.mode === 'forage' || a.cargo || a.crumb)).toBe(false);
          for (const a of present(c)) expect(kept).toContain(a.region);
        } });
        expect(done).toBe(true);
      }
    });

    it('keeps going in Low graphics (it is not a social moment), and leaves the population alone', () => {
      let carried = 0, most = 0;
      crumbRun(2, 40, { social: false, limit: 2, each: (colony) => {
        if (colony.crumb.state === 'carried') carried++;
        most = Math.max(most, colony.count);
      } });
      expect(carried).toBeGreaterThan(0);
      expect(most).toBeLessThanOrEqual(2);
    });

    it('stays uncommon in the colony\'s own rhythm: a few an hour, never two at once', () => {
      let appeared = 0, carried = 0, was = 'none';
      for (const seed of [41, 42, 43]) {
        simulate(seed, 1200, { each: (colony) => {
          const now = colony.crumb.state;
          if (now === 'lying' && was === 'none') appeared++;
          if (now === 'carried' && was === 'lying') carried++;
          was = now;
        } });
      }
      const perTen = (n) => n / 6; // three runs of twenty minutes
      expect(carried).toBeGreaterThan(0);
      expect(perTen(appeared)).toBeLessThan(4);
      expect(perTen(carried)).toBeLessThan(3);
    });
  });

  describe('the sugar cube', () => {
    const C = AMBIENT.cube;
    const team = (colony) => [...colony.cube.members.slice(0, colony.cube.size)].map((i) => colony.ants[i]);
    const out = (colony) => colony.cube.phase !== 'none' && colony.cube.phase !== 'fade';
    const boxIn = (r, x, y, d, portal = null) => (x - d >= r.x - 1e-6 || portal === 'left') && (x + d <= r.x + r.w + 1e-6 || portal === 'right')
      && (y - d >= r.y - 1e-6 || portal === 'top') && (y + d <= r.y + r.h + 1e-6 || portal === 'bottom');

    /** Six lingering ants, a cube asked for at 8 s; `each(colony, t)` every frame from then on. */
    function cubeRun(seed, seconds, { size = null, quirk = null, rooms = regions, limit = 6, social = true, tuning = LINGER, each } = {}) {
      return simulate(seed, 8 + seconds, { tuning, rooms, limit, social, each: (colony, t) => {
        if (t < FRAME) colony.summon(limit);
        if (Math.abs(t - 8) < FRAME / 2) colony.sweeten({ size, quirk });
        if (t >= 8) each?.(colony, t);
      } });
    }

    /**
     * Follow one procession from the request to its end: per-frame copies of
     * the cube, its team and everyone else, from the frame it turns up to the
     * frame after it has gone.
     */
    function procession(seed, { seconds = 100, ...options } = {}) {
      const frames = [];
      let state = 'waiting', members = null;
      cubeRun(seed, seconds, { ...options, each: (colony, t) => {
        const k = colony.cube;
        if (state === 'waiting' && k.phase !== 'none') { state = 'out'; members = team(colony); }
        if (state !== 'out') return;
        frames.push({ t, phase: k.phase, exiting: k.exiting, hurry: k.hurry, quirk: k.quirk, px: k.px, py: k.py, x: k.x, y: k.y,
          heading: k.heading, angle: k.angle, alpha: k.alpha, lift: k.lift, size: k.size, region: k.region, portal: k.portal,
          route: [...k.route.slice(0, k.legs * 2)], leg: k.leg,
          pending: [...k.pending.slice(0, k.size)],
          members: members.map((a) => ({ x: a.x, y: a.y, heading: a.heading, state: a.state, mode: a.mode, region: a.region, portal: a.portal })),
          others: colony.ants.filter((a) => a.state !== 'absent' && !members.includes(a))
            .map((a) => ({ x: a.x, y: a.y, state: a.state, mode: a.mode, region: a.region })) });
        if (k.phase === 'none') state = 'done';
        options.each?.(colony, t);
      } });
      return { frames, done: state === 'done' };
    }

    // Where place m is for a frame, with the cube's sway (as the carriers see it).
    const placeOf = (f, m) => {
      const p = formation(f.size)[m], c = Math.cos(f.heading), s = Math.sin(f.heading);
      return { x: f.x + c * p[0] - s * p[1], y: f.y + s * p[0] + c * p[1], facing: f.heading + p[2] };
    };
    const turned = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

    it('needs a roomy region: a corridor wide and long enough, whatever an ant on its own could use', () => {
      for (const r of regions) expect(cubeRoom(r)).toBe(true); // 1920 × 1080: 256 × 857 gutters
      const ok = (w, h) => cubeRoom({ x: 0, y: 0, w, h, portals: ['left'] });
      expect(ok(315, 498)).toBe(true); // 1280 × 720
      expect(ok(154, 554)).toBe(true); // 1024 × 768
      expect(ok(391, 329)).toBe(true); // a 1200 × 480 window
      expect(ok(C.corridor - 1, 857)).toBe(false); // an ant fits a 32 px gutter; a procession does not
      expect(ok(40, 857)).toBe(false);
      expect(ok(C.corridor, C.length - 1)).toBe(false);
      expect(ok(C.corridor, 800)).toBe(true);
      expect(ok(C.corridor, 600)).toBe(false); // room for two ants only
      expect(cubeRoom({ x: 0, y: 0, w: 300, h: 600, portals: [] })).toBe(false); // no way in or out
      // Ants wander a narrow gutter; asked for one over and over, no cube ever turns up there.
      const narrow = [{ x: 0, y: 0, w: 90, h: 857, portals: ['left', 'top', 'bottom'] }];
      let ants = 0;
      simulate(3, 80, { tuning: LINGER, rooms: narrow, each: (c, t) => {
        if (t < FRAME) c.summon(6);
        if (Math.round(t * 60) % 120 === 0) c.sweeten();
        expect(c.cube.phase).toBe('none');
        ants = Math.max(ants, c.count);
      } });
      expect(ants).toBe(3);
    });

    it('places three or four carriers round the cube: one pulling, two lifting at the sides, one pushing; well apart and within reach', () => {
      for (const size of [3, 4]) {
        const places = formation(size);
        expect(places).toHaveLength(size);
        // In front, facing the cube (walking backwards); the sides turned in to it; behind, facing the way.
        expect(places[0][0]).toBeGreaterThan(C.half);
        expect(Math.abs(places[0][2])).toBeCloseTo(Math.PI, 9);
        expect(places[1][1]).toBeGreaterThan(C.half);
        expect(places[2][1]).toBeLessThan(-C.half);
        expect(places[1][2]).toBeLessThan(0);
        expect(places[2][2]).toBeGreaterThan(0);
        if (size === 4) expect(places[3][0]).toBeLessThan(-C.half);
        let farthest = 0;
        for (let i = 0; i < size; i++) {
          farthest = Math.max(farthest, Math.hypot(places[i][0], places[i][1]));
          for (let j = i + 1; j < size; j++) {
            // Well apart even if both stray toward each other a little.
            expect(Math.hypot(places[i][0] - places[j][0], places[i][1] - places[j][1])).toBeGreaterThanOrEqual(19);
          }
          // Its body touches the cube (its head or legs at the edge), never stands on it.
          expect(Math.max(Math.abs(places[i][0]), Math.abs(places[i][1]))).toBeGreaterThanOrEqual(C.half + 4.5);
        }
        // The whole procession, strays and sway included, fits its reach; others keep 14 px from every carrier.
        expect(farthest + C.stumble + AMBIENT.footprint + C.sway).toBeLessThanOrEqual(C.reach);
        expect(C.radius + C.sway).toBeLessThanOrEqual(C.reach);
        expect(C.clear - (farthest + C.stumble + C.sway)).toBeGreaterThanOrEqual(AMBIENT.spacing);
        expect(C.clear - C.radius - C.sway).toBeGreaterThan(AMBIENT.footprint);
      }
      // The exception is a controlled one: closer than the colony's rule, never overlapping.
      expect(C.spacing).toBeLessThan(AMBIENT.spacing);
      expect(C.spacing).toBeGreaterThan(2 * 2.2 + 1); // two bodies' half-widths
    });

    it('plans a way out that keeps the whole procession inside, then through a portal to beyond sight', () => {
      const r = regions[0], route = new Float64Array(4);
      const b = inflate(r, -C.reach);
      for (const portal of r.portals) {
        for (const along of [-300, -120, 0, 90, 400]) {
          const x = b.x + b.w * 0.6, y = b.y + b.h * 0.4;
          const n = planRoute(r, x, y, portal, along, route);
          for (let k = 0; k < n - 1; k++) expect(boxIn(r, route[k * 2], route[k * 2 + 1], C.reach)).toBe(true);
          const ex = route[(n - 1) * 2], ey = route[(n - 1) * 2 + 1];
          // The last point lies beyond the portal side, so the whole reach is out of sight, and level with the region.
          expect(boxIn(r, ex, ey, C.reach, portal)).toBe(true);
          const beyond = { left: r.x - ex, right: ex - (r.x + r.w), top: r.y - ey, bottom: ey - (r.y + r.h) }[portal];
          expect(beyond).toBeGreaterThanOrEqual(C.reach);
          // Straight lines along the side, then straight out: no diagonal crossing of the region.
          const [lx, ly] = n === 2 ? [route[0], route[1]] : [x, y];
          if (portal === 'left' || portal === 'right') { expect(ly).toBe(ey); if (n === 2) expect(lx).toBe(x); }
          else { expect(lx).toBe(ex); if (n === 2) expect(ly).toBe(y); }
        }
      }
    });

    it.each([1, 3, 4, 7])('turns up deep inside a roomy region, near a free ant, clear of everyone, and fades in (seed %i)', (seed) => {
      const { frames } = procession(seed);
      const first = frames[0];
      expect(first).toBeDefined();
      expect(first.phase).toBe('gather');
      expect(regions).toContain(first.region);
      expect(boxIn(first.region, first.px, first.py, C.reach + C.margin)).toBe(true);
      expect(first.alpha).toBeLessThan(0.1);
      for (const o of first.others) expect(Math.hypot(o.x - first.px, o.y - first.py)).toBeGreaterThanOrEqual(C.clear + 2 - 1e-6);
      let near = 0;
      first.members.forEach((m, i) => {
        if (first.pending[i]) return;
        near++;
        expect(Math.hypot(m.x - first.px, m.y - first.py)).toBeGreaterThanOrEqual(C.keep + 6 - 1e-6);
        expect(Math.hypot(m.x - first.px, m.y - first.py)).toBeLessThanOrEqual(C.recruit + AMBIENT.speed[1] * FRAME);
      });
      expect(near).toBeGreaterThanOrEqual(1); // someone close by, called over
    });

    it.each([[3, 2], [4, 3], [3, 9], [4, 4]])('gathers a team of %i: called ants walk round to their places, newcomers come in through a portal (seed %i)', (size, seed) => {
      const { frames } = procession(seed, { size });
      const lift = frames.findIndex((f) => f.phase === 'lift');
      expect(lift).toBeGreaterThan(0);
      expect(frames[0].size).toBe(size);
      // Nobody walks over the cube: until it steps in, a gatherer keeps its distance.
      for (const f of frames.slice(0, lift)) {
        f.members.forEach((m, i) => {
          if (f.pending[i] || m.mode !== 'gather') return;
          expect(Math.hypot(m.x - f.px, m.y - f.py)).toBeGreaterThanOrEqual(C.keep - 1e-6);
        });
      }
      // Every carrier ends up exactly at its place round the cube, facing its way, as it is lifted.
      const at = frames[lift];
      at.members.forEach((m, i) => {
        const p = placeOf(at, i);
        expect(m.mode).toBe('haul');
        expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThan(1e-6);
        expect(turned(m.heading, p.facing)).toBeLessThan(1e-6);
      });
      // Newcomers walk in from beyond a portal side, never appear in the open.
      frames[0].pending.forEach((pending, i) => {
        if (!pending) return;
        const seen = frames.find((f) => !f.pending[i]);
        const m = seen.members[i];
        expect(m.state).toBe('entering');
        expect(boxIn(seen.region, m.x, m.y, AMBIENT.footprint)).toBe(false); // still out of sight, partly
      });
      // It fades in over its time, and is fully there before it is lifted.
      expect(at.alpha).toBe(1);
    });

    it.each([1, 3, 4, 5, 6, 7, 8])('carries it as one: every carrier at its place round the moving cube, smoothly, never jumping (seed %i)', (seed) => {
      const { frames, done } = procession(seed);
      expect(done).toBe(true);
      const carrying = frames.filter((f) => ['lift', 'carry', 'turn'].includes(f.phase));
      expect(carrying.length).toBeGreaterThan(120);
      let moved = 0;
      for (let i = 1; i < frames.length; i++) {
        const [a, b] = [frames[i - 1], frames[i]];
        if (b.phase === 'none' || a.phase === 'gather' || b.phase === 'gather' || b.phase === 'fade') continue;
        // Shared movement: the cube's centre at most one frame's pace, turning at the team's rate.
        expect(Math.hypot(b.px - a.px, b.py - a.py)).toBeLessThanOrEqual(C.speed[1] * FRAME + 1e-9);
        expect(turned(b.heading, a.heading)).toBeLessThanOrEqual(C.turnRate * FRAME + 1e-9);
        expect(turned(b.angle, a.angle)).toBeLessThan(0.05);
        moved += Math.hypot(b.px - a.px, b.py - a.py);
        b.members.forEach((m, k) => {
          // Attached: at its place, give or take its small stray.
          const p = placeOf(b, k);
          expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThanOrEqual(C.stumble + 1e-6);
          // No teleporting, and no snapping round.
          expect(Math.hypot(m.x - a.members[k].x, m.y - a.members[k].y)).toBeLessThan(1.2);
          expect(turned(m.heading, a.members[k].heading)).toBeLessThan(0.15);
        });
      }
      expect(moved).toBeGreaterThan(80); // a journey worth the name
    });

    it.each([1, 3, 4, 5, 6, 7, 8])('keeps the whole procession inside its region, turns only standing still, and leaves through a portal (seed %i)', (seed) => {
      const { frames, done } = procession(seed);
      expect(done).toBe(true);
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (f.phase === 'none') {
          // Home: the cube and its whole team gone together, beyond the portal they walked out of.
          const before = frames[i - 1];
          expect(before.exiting).toBe(true);
          expect(before.region.portals).toContain(before.portal);
          expect(f.members.every((m) => m.state === 'absent')).toBe(true);
          const r = before.region;
          const beyond = { left: r.x - before.px, right: before.px - (r.x + r.w), top: r.y - before.py, bottom: before.py - (r.y + r.h) }[before.portal];
          expect(beyond).toBeGreaterThanOrEqual(C.reach - 1e-6);
          continue;
        }
        const r = f.region;
        expect(boxIn(r, f.px, f.py, C.reach, f.exiting ? f.portal : null)).toBe(true);
        expect(intersects(inflate({ x: f.x, y: f.y, w: 0, h: 0 }, C.radius), inflate(DESKTOP.game, AMBIENT.clearance - 0.01))).toBe(false);
        f.members.forEach((m, k) => {
          if (f.pending[k]) return;
          expect(intersects(footprint(m), inflate(DESKTOP.game, AMBIENT.clearance - 0.01))).toBe(false);
          if (m.state === 'leaving') expect(boxIn(r, m.x, m.y, AMBIENT.footprint, m.portal)).toBe(true);
          else if (m.state !== 'entering') expect(boxIn(r, m.x, m.y, AMBIENT.footprint)).toBe(true);
          expect(m.region).toBe(r);
        });
        if (i > 0 && f.phase === 'turn' && frames[i - 1].phase === 'turn') expect([f.px, f.py]).toEqual([frames[i - 1].px, frames[i - 1].py]);
        if (f.exiting) expect(f.members.every((m) => m.state === 'leaving' && m.portal === f.portal)).toBe(true);
      }
      // It turned at least once on the way (a corner), or went straight out.
      const legs = frames[0].route.length / 2;
      expect(legs === 1 || frames.some((f) => f.phase === 'turn')).toBe(true);
    });

    it('keeps everyone else clear: no other ant within its berth, or 14 px of a carrier; carriers keep their own spacing', () => {
      let checked = 0, closest = Infinity;
      for (const seed of [1, 3, 4, 5, 7, 8, 10, 11]) {
        const { frames } = procession(seed, { limit: 8, tuning: { ...LINGER, crumb: { ...AMBIENT.crumb, every: [1e6, 1e6] } } });
        for (const f of frames) {
          if (f.phase === 'none' || f.phase === 'fade') continue;
          for (const o of f.others) {
            expect(Math.hypot(o.x - f.px, o.y - f.py)).toBeGreaterThanOrEqual(C.clear - 1e-6);
            for (const m of f.members) if (m.state !== 'absent') expect(Math.hypot(o.x - m.x, o.y - m.y)).toBeGreaterThanOrEqual(AMBIENT.spacing);
            checked++;
          }
          for (let i = 0; i < f.size; i++) {
            for (let j = i + 1; j < f.size; j++) {
              if (f.pending[i] || f.pending[j]) continue;
              const d = Math.hypot(f.members[i].x - f.members[j].x, f.members[i].y - f.members[j].y);
              expect(d).toBeGreaterThanOrEqual(C.spacing);
              closest = Math.min(closest, d);
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(1000); // others really were about
      expect(closest).toBeLessThan(AMBIENT.spacing + 6); // and the team really is close-knit
    });

    it.each(['wrong-way', 'reconsider', 'straggler', 'reposition'])('now and then gets it slightly wrong (%s), and always recovers', (quirk) => {
      const { frames, done } = procession(3, { quirk, size: 4 });
      expect(done).toBe(true);
      // The first time it happens, from start to finish.
      const start = frames.findIndex((f) => f.quirk === quirk);
      expect(start).toBeGreaterThan(0);
      let end = start;
      while (frames[end + 1]?.quirk === quirk) end++;
      const during = frames.slice(start, end + 1);
      expect(during.length).toBeGreaterThan(20);
      const stray = (f, k) => { const p = placeOf(f, k); return { d: Math.hypot(f.members[k].x - p.x, f.members[k].y - p.y), turn: turned(f.members[k].heading, p.facing) }; };
      const most = (fn) => Math.max(...during.map(fn));
      if (quirk === 'wrong-way') expect(most((f) => Math.max(...f.members.map((m, k) => stray(f, k).turn)))).toBeGreaterThan(1.5);
      if (quirk === 'straggler') expect(most((f) => Math.max(...f.members.map((m, k) => stray(f, k).d)))).toBeGreaterThan(3);
      if (quirk === 'reconsider' || quirk === 'reposition') {
        // The cube stops a moment while they look about or shift their grip.
        let still = 0;
        for (let i = start + 1; i <= end; i++) if (frames[i].px === frames[i - 1].px && frames[i].py === frames[i - 1].py) still++;
        expect(still * FRAME).toBeGreaterThan(0.3);
        expect(most((f) => Math.max(...f.members.map((m, k) => stray(f, k).turn)))).toBeGreaterThan(0.05);
      }
      // Subtle, and soon over: everyone back at their places afterwards.
      for (const f of during) f.members.forEach((m, k) => expect(stray(f, k).d).toBeLessThanOrEqual(C.stumble + 1e-6));
      expect((end - start) * FRAME).toBeLessThan(2.6);
      const after = frames.slice(end + 1).find((f, i, rest) => rest.slice(i, i + 60).every((g) => !g.quirk) && f.phase !== 'none');
      expect(after).toBeDefined();
      const later = frames[frames.indexOf(after) + 59];
      if (later.phase !== 'none') later.members.forEach((m, k) => expect(stray(later, k).d).toBeLessThan(0.05));
    });

    it('never waits for ever: an ant in the way is asked to step aside, and failing that the cube is given up', () => {
      // An ant turns up on the route just ahead, standing still.
      function obstruct(colony) {
        const k = colony.cube;
        const blocker = colony.ants.find((a) => a.state === 'absent' && !team(colony).includes(a));
        const tx = k.route[k.leg * 2], ty = k.route[k.leg * 2 + 1], d = Math.hypot(tx - k.px, ty - k.py);
        Object.assign(blocker, { state: 'paused', mode: 'solo', region: k.region, timer: 1e9, stay: 1e9, twitch: 0,
          x: k.px + ((tx - k.px) / d) * (C.clear + 12), y: k.py + ((ty - k.py) / d) * (C.clear + 12) });
        return { ant: blocker, x: blocker.x, y: blocker.y };
      }
      for (const stubborn of [false, true]) {
        let blocker = null, held = 0, longest = 0;
        const { frames } = procession(3, { size: 3, limit: 4, seconds: 150, each: (colony) => {
          const k = colony.cube;
          const ahead = Math.hypot(k.route[k.leg * 2] - k.px, k.route[k.leg * 2 + 1] - k.py);
          if (!blocker && k.phase === 'carry' && !k.exiting && ahead > 90 && k.speed > 5) blocker = obstruct(colony);
          // One that will not budge, whatever it is asked: pinned where it stands.
          if (stubborn && blocker) Object.assign(blocker.ant, { state: 'paused', mode: 'solo', x: blocker.x, y: blocker.y, timer: 1e9 });
          if (k.blocked > 0) held++;
          longest = Math.max(longest, k.blocked);
        } });
        expect(blocker).not.toBe(null);
        expect(held).toBeGreaterThan(0);
        const fate = frames.at(-2);
        if (stubborn) {
          // It never moves: after a fair wait the team gives up, the cube fades and the carriers wander off.
          const gaveUp = frames.findIndex((f) => f.phase === 'fade');
          expect(gaveUp).toBeGreaterThan(0);
          expect(longest).toBeGreaterThanOrEqual(C.stuck);
          expect(longest).toBeLessThanOrEqual(C.stuck + 2 * FRAME);
          expect(frames[gaveUp].members.every((m) => m.mode === 'solo')).toBe(true);
          expect(frames.at(-1).phase).toBe('none');
        } else {
          // Asked to make way, it does, and the procession goes on home.
          expect(frames.some((f) => f.phase === 'fade')).toBe(false);
          expect(fate.exiting).toBe(true);
          expect(longest).toBeLessThan(C.shoo + 1);
        }
      }
    });

    it('always ends, never in a deadlock: every procession in long natural runs is home or given up within its lifetime', () => {
      let home = 0, given = 0, longest = 0, total = 0;
      // As in the game, the gutters open only on their outer sides; and open at their ends as well.
      const sides = safeRegions(DESKTOP.visible, [DESKTOP.game], { open: { left: true, right: true, top: false, bottom: false } });
      for (const [seed, rooms] of [[51, regions], [52, regions], [53, sides], [54, sides], [55, sides], [56, sides]]) {
        let start = null, faded = false;
        simulate(seed, 30 * 60, { rooms, tuning: { ...AMBIENT, cube: { ...C, every: [60, 120] } }, each: (colony, t) => {
          const k = colony.cube;
          if (k.phase !== 'none' && start === null) { start = t; faded = false; }
          if (k.phase === 'fade') faded = true;
          if (k.phase === 'none' && start !== null) {
            longest = Math.max(longest, t - start);
            if (faded) given++; else home++;
            total++;
            start = null;
          }
          if (out(colony)) expect(team(colony).every((a) => a.state !== 'absent' || colony.cube.pending[team(colony).indexOf(a)])).toBe(true);
        } });
      }
      expect(total).toBeGreaterThan(50);
      expect(home + given).toBe(total);
      expect(given).toBeLessThanOrEqual(Math.max(1, total * 0.03)); // the rare one fades away gracefully
      expect(longest).toBeLessThanOrEqual(C.lifetime + C.fade + 0.1);
    }, 30_000);

    it('keeps the procession where it is through a layout change it still fits, with a safe route', () => {
      let checked = false;
      cubeRun(3, 60, { size: 4, each: (colony) => {
        const k = colony.cube;
        if (checked || k.phase !== 'carry' || k.exiting) return;
        checked = true;
        const before = { px: k.px, py: k.py, route: [...k.route], ants: team(colony).map((a) => [a.x, a.y, a.heading]) };
        // The same layout again changes nothing.
        colony.relayout(regions);
        expect([k.px, k.py, [...k.route]]).toEqual([before.px, before.py, before.route]);
        // A paused cup: the gutters become wider and shorter; the procession still fits where it stands.
        const paused = safeRegions(DESKTOP.visible, [{ x: 298, y: 0, w: 930, h: 790 }, { x: 0, y: 806, w: 1526, h: 51 }]);
        const fits = paused.find((r) => boxIn(r, k.px, k.py, C.reach));
        expect(fits).toBeDefined();
        colony.relayout(paused);
        expect(k.phase).toBe('carry');
        expect(k.region).toBe(fits);
        expect(team(colony).map((a) => [a.x, a.y, a.heading])).toEqual(before.ants); // not moved
        for (let n = k.leg; n < k.legs - 1; n++) expect(boxIn(fits, k.route[n * 2], k.route[n * 2 + 1], C.reach)).toBe(true);
        expect(fits.portals).toContain(k.portal);
        // And it carries on safely in the new layout.
        let home = false;
        for (let t = 0; t < 80 && !home; t += FRAME) {
          colony.step(FRAME, paused, 6);
          if (k.phase === 'none') { home = true; break; }
          expect(boxIn(k.region, k.px, k.py, C.reach, k.exiting ? k.portal : null)).toBe(true);
        }
        expect(home).toBe(true);
      } });
      expect(checked).toBe(true);
    });

    it('cancels at once when the layout cuts into it, retiring carriers a panel covers and freeing the rest', () => {
      for (const phase of ['gather', 'carry']) {
        let checked = false;
        cubeRun(4, 60, { size: 4, each: (colony) => {
          const k = colony.cube;
          if (checked || k.phase !== phase || (phase === 'gather' && k.alpha < 0.5)) return;
          checked = true;
          const members = team(colony).filter((a) => a.state !== 'absent');
          // A panel over the cube and the carriers on one side of it.
          const panel = { x: k.px - 4, y: k.py - 60, w: 200, h: 120 };
          const next = safeRegions(DESKTOP.visible, [DESKTOP.game, panel]);
          const covered = members.filter((a) => intersects(footprint(a), inflate(panel, AMBIENT.clearance)));
          colony.relayout(next);
          expect(k.phase).toBe('none');
          expect(colony.ants.some((a) => a.mode === 'haul' || a.mode === 'gather')).toBe(false);
          for (const a of covered) expect(a.state).toBe('absent');
          for (const a of members) if (a.state !== 'absent') expect(a.mode).toBe('solo');
          for (let t = 0; t < 20; t += FRAME) {
            colony.step(FRAME, next, 6);
            for (const a of present(colony)) expect(intersects(footprint(a), inflate(panel, AMBIENT.clearance - 0.01))).toBe(false);
          }
        } });
        expect(checked).toBe(true);
      }
      // Its whole gutter gone: gone with it, team and all.
      let gone = false;
      cubeRun(5, 60, { each: (colony) => {
        const k = colony.cube;
        if (gone || k.phase !== 'carry') return;
        gone = true;
        const kept = regions.filter((r) => r !== k.region), members = team(colony);
        colony.relayout(kept);
        expect(k.phase).toBe('none');
        expect(members.every((a) => a.state === 'absent')).toBe(true);
      } });
      expect(gone).toBe(true);
    });

    it('fades away, its team free again, when a carrier walking over is lost to a layout change but the cube still fits', () => {
      let checked = false;
      cubeRun(9, 60, { size: 3, each: (colony) => {
        const k = colony.cube;
        if (checked || k.phase !== 'gather') return;
        const walker = team(colony).find((a, m) => !k.pending[m] && a.mode === 'gather' && Math.hypot(a.x - k.px, a.y - k.py) > 80);
        if (!walker) return;
        checked = true;
        const panel = { x: walker.x - 20, y: walker.y - 20, w: 40, h: 40 };
        const next = safeRegions(DESKTOP.visible, [DESKTOP.game, panel]);
        colony.relayout(next);
        expect(walker.state).toBe('absent');
        expect(['fade', 'none']).toContain(k.phase);
        expect(colony.ants.some((a) => a.mode === 'haul' || a.mode === 'gather')).toBe(false);
      } });
      expect(checked).toBe(true);
    });

    it('never starts in Low graphics, and heads straight home when the ceiling drops mid-carry', () => {
      const { colony } = cubeRun(3, 40, { social: false });
      expect(colony.cube.phase).toBe('none');
      let dropped = false, quirksAfter = 0;
      const { frames, done } = procession(3, { seconds: 120, each: (c) => {
        const k = c.cube;
        if (!dropped && k.phase === 'carry' && !k.exiting && k.leg === 0) { dropped = true; c.step(FRAME, regions, 2, { social: false }); }
        if (dropped && k.quirk) quirksAfter++;
      } });
      expect(dropped).toBe(true);
      expect(done).toBe(true);
      const hurried = frames.find((f) => f.hurry);
      expect(hurried).toBeDefined();
      expect(hurried.route.length).toBe(2); // straight out
      expect(quirksAfter).toBe(0);
      expect(frames.some((f) => f.phase === 'fade')).toBe(false); // carried home, not dropped
    });

    it('never shares the colony with a crumb', () => {
      let cubes = 0, crumbs = 0;
      for (const seed of [61, 62, 63]) {
        simulate(seed, 300, { tuning: LINGER, each: (colony, t) => {
          if (t < FRAME) colony.summon(6);
          if (Math.round(t * 60) % 240 === 0) { colony.crumble(); colony.sweeten(); }
          const cube = colony.cube.phase !== 'none', crumb = colony.crumb.state !== 'none';
          expect(cube && crumb).toBe(false);
          if (cube) cubes++;
          if (crumb) crumbs++;
        } });
      }
      expect(cubes).toBeGreaterThan(0);
      expect(crumbs).toBeGreaterThan(0);
    });

    it('recruits only free ants: no social moment is cut short, and no new one starts meanwhile', () => {
      let launches = 0;
      for (const seed of [71, 72, 73, 74]) {
        let was = new Map(), wasOut = false;
        simulate(seed, 240, { tuning: LINGER, each: (colony, t) => {
          if (t < FRAME) colony.summon(6);
          if (Math.round(t * 60) % 300 === 0) { colony.socialize(); colony.sweeten(); }
          colony.ants.forEach((a) => {
            const before = was.get(a);
            if (a.mode === 'gather' && before && before !== 'gather') {
              expect(['solo']).toContain(before);
              launches++;
            }
            if (['follow', 'greet', 'drift'].includes(a.mode) && before && !['follow', 'greet', 'drift'].includes(before)) {
              expect(wasOut).toBe(false);
            }
          });
          was = new Map(colony.ants.map((a) => [a, a.state === 'absent' ? null : a.mode]));
          wasOut = colony.cube.phase !== 'none';
        } });
      }
      expect(launches).toBeGreaterThan(0);
    });

    it('stays within the population ceiling and its region\'s capacity, newcomers included', () => {
      let seen = false;
      for (const [seed, limit] of [[81, 3], [82, 4], [83, 6], [84, 12]]) {
        cubeRun(seed, 80, { limit, each: (colony) => {
          if (colony.cube.phase !== 'none') seen = true;
          let reserved = 0;
          for (let m = 0; m < colony.cube.size; m++) if (colony.cube.phase === 'gather') reserved += colony.cube.pending[m];
          expect(colony.count + reserved).toBeLessThanOrEqual(limit);
          for (const r of regions) {
            const inside = colony.ants.filter((a) => a.state !== 'absent' && a.region === r).length;
            expect(inside).toBeLessThanOrEqual(regionCapacity(r));
          }
        } });
      }
      expect(seen).toBe(true);
    });

    it('is reproducible from a seed, and different seeds tell different stories', () => {
      const trace = (seed) => procession(seed).frames.filter((f, i) => i % 15 === 0)
        .map((f) => `${f.phase}${f.quirk ?? ''}@${f.px.toFixed(3)},${f.py.toFixed(3)}:${f.members.map((m) => `${m.x.toFixed(2)},${m.y.toFixed(2)}`).join(' ')}`);
      expect(trace(3)).toEqual(trace(3));
      expect(trace(3)).not.toEqual(trace(4));
    });

    it('stays rare in the colony\'s own rhythm: well under one an opportunity window, a few an hour at most', () => {
      let started = 0, home = 0;
      for (const seed of [91, 92, 93]) {
        let was = 'none';
        simulate(seed, 60 * 60, { each: (colony) => {
          const now = colony.cube.phase;
          if (was === 'none' && now !== 'none') started++;
          if (was !== 'none' && was !== 'fade' && now === 'none') home++;
          was = now;
        } });
      }
      // Three hours at 1920 × 1080: an opportunity every 12–20 minutes of eligible time.
      expect(started).toBeGreaterThanOrEqual(3);
      expect(started).toBeLessThanOrEqual(15);
      expect(home).toBeGreaterThan(0);
    }, 30_000);
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

  it('draws a crumb within its radius, small beside the ant, and held within the ant\'s footprint', () => {
    let reach = 0, lineWidth = 1;
    const ctx = {
      save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, closePath() {}, stroke() {}, fill() {},
      globalAlpha: 1, fillStyle: null, strokeStyle: null,
      set lineWidth(w) { lineWidth = w; }, get lineWidth() { return lineWidth; },
      moveTo(x, y) { reach = Math.max(reach, Math.hypot(x, y) + lineWidth / 2); },
      lineTo(x, y) { reach = Math.max(reach, Math.hypot(x, y) + lineWidth / 2); },
      arc(x, y, r) { reach = Math.max(reach, Math.hypot(x, y) + r); },
    };
    const random = createRandom(3);
    for (let n = 0; n < 50; n++) {
      const shape = Float64Array.from({ length: 7 }, () => random.range(0.72, 1));
      for (const quality of ['high', 'low']) drawCrumb(ctx, { x: 0, y: 0, angle: 0, alpha: 1, shape }, { quality });
    }
    drawCrumb(ctx, { x: 0, y: 0, shape: Float64Array.from({ length: 7 }, () => 1) });
    expect(reach).toBeGreaterThan(AMBIENT.crumb.radius * 0.8);
    expect(reach).toBeLessThanOrEqual(AMBIENT.crumb.radius + 1e-9);
    // Comparable to the ant's body (its gaster is 6 px long), and in its jaws it stays inside the ant's footprint.
    expect(AMBIENT.crumb.radius * 2).toBeLessThan(6);
    expect(AMBIENT.crumb.mouth + AMBIENT.crumb.radius).toBeLessThanOrEqual(AMBIENT.footprint);
  });

  it('draws a plainer crumb in Low quality, honours its fade, and leaves the context as it found it', () => {
    const shape = Float64Array.from({ length: 7 }, () => 0.9);
    const high = fakeContext(), low = fakeContext(), faded = fakeContext();
    drawCrumb(high, { x: 5, y: 5, angle: 1, alpha: 1, shape }, { quality: 'high' });
    drawCrumb(low, { x: 5, y: 5, angle: 1, alpha: 1, shape }, { quality: 'low' });
    drawCrumb(faded, { x: 5, y: 5, alpha: 0, shape });
    expect(low.calls.lineTo ?? 0).toBe(0);
    expect(high.calls.lineTo).toBeGreaterThan(0);
    expect(low.calls.fill).toBeLessThan(high.calls.fill);
    expect(high.calls.save).toBe(high.calls.restore);
    expect(faded.calls.save ?? 0).toBe(0); // nothing at all while invisible
  });

  it('draws the sugar cube within its radius at any angle and lift, clearly bigger than an ant', () => {
    // Records geometry through translate and rotate: drawCube translates to the cube and draws about it.
    let reach = 0, lineWidth = 1, m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const see = (x, y, extra) => reach = Math.max(reach, Math.hypot(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]) + extra);
    const ctx = {
      save() { stack.push([...m]); }, restore() { m = stack.pop(); },
      translate(x, y) { m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
      rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]]; },
      beginPath() {}, closePath() {}, fill() {}, stroke() {}, globalAlpha: 1, fillStyle: null, strokeStyle: null, lineJoin: null,
      set lineWidth(w) { lineWidth = w; }, get lineWidth() { return lineWidth; },
      moveTo(x, y) { see(x, y, lineWidth / 2); }, lineTo(x, y) { see(x, y, lineWidth / 2); },
      arc(x, y, r) { see(x, y, r); },
    };
    for (const quality of ['high', 'low']) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
        for (const lift of [0, 0.3, 1]) drawCube(ctx, { x: 0, y: 0, angle, alpha: 1, lift }, { quality });
      }
    }
    expect(stack).toHaveLength(0);
    expect(reach).toBeGreaterThan(AMBIENT.cube.half * Math.SQRT2); // the measurement saw its corners
    expect(reach).toBeLessThanOrEqual(AMBIENT.cube.radius);
    // Comically large beside an ant (about 12 px from gaster to head), and its procession's reach holds it.
    expect(AMBIENT.cube.half * 2).toBeGreaterThan(12);
    expect(AMBIENT.cube.radius + AMBIENT.cube.sway).toBeLessThanOrEqual(AMBIENT.cube.reach);
  });

  it('draws a plainer cube in Low quality, honours its fade, and leaves the context as it found it', () => {
    const high = fakeContext(), low = fakeContext(), faded = fakeContext();
    drawCube(high, { x: 5, y: 5, angle: 0.4, alpha: 1, lift: 0.5 }, { quality: 'high' });
    drawCube(low, { x: 5, y: 5, angle: 0.4, alpha: 1, lift: 0.5 }, { quality: 'low' });
    drawCube(faded, { x: 5, y: 5, alpha: 0 });
    expect(low.calls.fill).toBeLessThan(high.calls.fill); // no shadow, no grains
    expect(low.calls.stroke ?? 0).toBe(0);
    expect(low.calls.arc ?? 0).toBe(0);
    expect(high.calls.arc).toBeGreaterThan(0);
    expect(high.fills).toContain('#fbf7ee');
    expect(high.calls.save).toBe(high.calls.restore);
    expect(faded.calls.save ?? 0).toBe(0); // nothing at all while invisible
  });

  it('allocates no per-ant arrays while drawing', () => {
    const source = readFileSync(new URL('../../src/rendering/ambient.js', import.meta.url), 'utf8');
    const painter = source.slice(source.indexOf('export function drawAnt'));
    expect(painter).not.toMatch(/\[\s*-1\s*,\s*1\s*\]|\.map\(|\.filter\(|new /);
  });
});

describe('the ambient layer', () => {
  const PHONE = Object.freeze({ touch: true, screen: [412, 915] }); // Pixel 7
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
    expect(page.win.coarse.live).toBe(1);
    expect(page.win.observers).toHaveLength(1);
    expect(page.win.observers[0].observed).toContain(page.gameCanvas);
    untilVisible(ambient, 4);
    expect(page.layer.hidden).toBe(false);
    expect(page.layer.width).toBe(1200);
    ambient.dispose();
    expect(page.win.live + page.win.visualViewport.live + page.win.media.live + page.win.orientation.live
      + page.win.coarse.live).toBe(0);
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

  it('never draws an ant over a panel that appears in its gutter: ants it covers go at once, the rest stay', () => {
    const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    const ambient = createAmbient({ canvas: page.layer, seed: 9 });
    untilVisible(ambient, 6);
    run(ambient, 4);
    const before = ambient.snapshot();
    // A panel unfolds across the middle of the left gutter (no resize event: the child count changes).
    const panel = { x: 0, y: 100, w: 256, h: 200 }; // stage-local
    const meets = (a) => intersects(footprint(a), inflate(panel, AMBIENT.clearance));
    const covered = before.ants.filter(meets).map((a) => a.slot);
    const stays = before.ants.filter((a) => a.region.x < 264 && !meets(a)).map((a) => a.slot);
    const right = before.ants.filter((a) => a.region.x >= 264 && a.state !== 'leaving').map((a) => a.slot);
    expect(covered.length).toBeGreaterThan(0);
    expect(stays.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    page.addPanel({ left: 197 + panel.x, top: 100 + panel.y, width: panel.w, height: panel.h });
    let shown = 0;
    for (let t = 0; t < 30; t += FRAME) {
      ambient.update(FRAME, PLAYING);
      const s = ambient.snapshot();
      if (s.hidden) continue;
      if (shown++ === 0) {
        // Those the panel covers were retired, not walked out past it; the rest stood still while it settled.
        expect(s.ants.filter((a) => covered.includes(a.slot))).toEqual([]);
        expect(s.ants.filter((a) => right.includes(a.slot))).toHaveLength(right.length);
        expect(s.ants.filter((a) => stays.includes(a.slot))).toHaveLength(stays.length); // in the cut gutter, clear of it
        for (const a of s.ants) {
          const was = before.ants.find((b) => b.slot === a.slot);
          if (was) expect(Math.hypot(a.x - was.x, a.y - was.y)).toBeLessThanOrEqual(AMBIENT.speed[1] * 1.4 * FRAME + 1e-9);
        }
      }
      for (const a of s.ants) expect(intersects(footprint(a), inflate(panel, AMBIENT.clearance - 0.01))).toBe(false);
    }
    expect(shown).toBeGreaterThan(0);
    ambient.dispose();
  });

  /** A 1920 × 1080 page with six ants out and a crumb asked for; runs until `until(snapshot)` (or fails). */
  function crumbPage(seed, until, quality = () => 'high') {
    const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    const ambient = createAmbient({ canvas: page.layer, seed, quality });
    untilVisible(ambient, 6);
    run(ambient, 4);
    ambient.crumble();
    for (let i = 0; i < 60 * 60 && !until(ambient.snapshot()); i++) ambient.update(FRAME, PLAYING);
    expect(until(ambient.snapshot())).toBe(true);
    return { page, ambient };
  }

  it('draws a lying crumb under the ants and clears its spot too', () => {
    const { page, ambient } = crumbPage(3, (s) => s.crumb?.state === 'lying' && s.crumb.alpha === 1);
    const calls = page.context.calls;
    ambient.update(FRAME, PLAYING);
    const [clears, saves] = [calls.clearRect, calls.save];
    ambient.update(FRAME, PLAYING);
    const s = ambient.snapshot();
    expect(s.crumb).not.toBe(null);
    expect(calls.save - saves).toBe(s.count + 1); // every ant and the crumb
    expect(calls.clearRect - clears).toBe(s.count + 1); // last frame's spots, the crumb's included
    ambient.dispose();
  });

  it('holds a carried crumb still while paused or unfocused, hides it under modals, and drops it for reduced motion', () => {
    const { page, ambient } = crumbPage(5, (s) => s.crumb?.state === 'carried');
    const where = () => { const s = ambient.snapshot(); return [s.crumb, s.ants.map((a) => [a.slot, a.x, a.y])]; };
    const paused = { ...PLAYING, phase: 'paused', pausedFrom: 'playing' };
    ambient.update(FRAME, paused);
    const here = where();
    const before = page.context.calls.lineTo;
    run(ambient, 1, paused);
    expect(where()).toEqual(here);
    expect(page.context.calls.lineTo).toBe(before); // a still scene is not redrawn
    expect(page.layer.hidden).toBe(false);
    page.win.dispatchEvent(new Event('blur'));
    run(ambient, 0.5);
    expect(where()).toEqual(here);
    page.win.dispatchEvent(new Event('focus'));
    run(ambient, 0.5, { ...PLAYING, blocked: true });
    expect(page.layer.hidden).toBe(true);
    expect(where()).toEqual(here);
    // Back in play, the carrier walks on with it.
    run(ambient, 0.5);
    expect(ambient.snapshot().crumb?.state ?? 'none').not.toBe('lying');
    page.win.media.matches = true;
    page.win.media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    ambient.update(FRAME, PLAYING);
    expect(ambient.snapshot()).toMatchObject({ crumb: null, count: 0, hidden: true });
    ambient.crumble();
    ambient.summon(6);
    run(ambient, 20);
    expect(ambient.snapshot().crumb).toBe(null);
    ambient.dispose();
  });

  /** A 1920 × 1080 page with six ants out and a sugar cube asked for; runs until `until(snapshot)` (or fails). */
  function cubePage(seed, until, { quality = () => 'high', size = null, quirk = null } = {}) {
    const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    const ambient = createAmbient({ canvas: page.layer, seed, quality });
    untilVisible(ambient, 6);
    run(ambient, 2);
    ambient.sweeten({ size, quirk });
    for (let i = 0; i < 60 * 90 && !until(ambient.snapshot()); i++) {
      if (i % 600 === 599 && !ambient.snapshot().cube) { ambient.summon(6); ambient.sweeten({ size, quirk }); }
      ambient.update(FRAME, PLAYING);
    }
    expect(until(ambient.snapshot())).toBe(true);
    return { page, ambient };
  }
  const carrying = (s) => s.cube?.phase === 'carry' && !s.cube.exiting;

  it('draws the sugar cube under its carriers, and clears its larger spot too', () => {
    const { page, ambient } = cubePage(3, carrying);
    const { calls, fills, cleared } = page.context;
    ambient.update(FRAME, PLAYING);
    const [clears, saves, from] = [calls.clearRect, calls.save, fills.length];
    cleared.length = 0;
    ambient.update(FRAME, PLAYING);
    const s = ambient.snapshot();
    expect(calls.save - saves).toBe(s.count + 1); // every ant and the cube
    expect(calls.clearRect - clears).toBe(s.count + 1); // last frame's spots, the cube's included
    expect(cleared).toContain((AMBIENT.cube.radius + 2) * 2);
    const frame = fills.slice(from);
    expect(frame.indexOf('#fbf7ee')).toBeGreaterThanOrEqual(0); // the cube's top
    expect(frame.indexOf('#fbf7ee')).toBeLessThan(frame.indexOf('#7a4a2c')); // before any ant
    // The whole procession, carriers and cube, is on the layer, never near the game.
    for (const a of s.ants) expect(intersects(footprint(a), inflate({ x: 264, y: 0, w: 998, h: 857 }, AMBIENT.clearance - 0.01))).toBe(false);
    ambient.dispose();
  });

  it('holds a procession still while paused, unfocused or hidden, hides it under modals, and drops it for reduced motion', () => {
    const { page, ambient } = cubePage(4, carrying);
    const where = () => { const s = ambient.snapshot(); return [s.cube, s.ants.map((a) => [a.slot, a.x, a.y, a.heading])]; };
    const paused = { ...PLAYING, phase: 'paused', pausedFrom: 'playing' };
    ambient.update(FRAME, paused);
    const here = where();
    const before = page.context.calls.lineTo;
    run(ambient, 1, paused);
    expect(where()).toEqual(here);
    expect(page.context.calls.lineTo).toBe(before); // a still scene is not redrawn
    page.win.dispatchEvent(new Event('blur'));
    run(ambient, 0.5);
    expect(where()).toEqual(here);
    page.win.dispatchEvent(new Event('focus'));
    page.doc.visibilityState = 'hidden';
    run(ambient, 0.5);
    expect(where()).toEqual(here);
    page.doc.visibilityState = 'visible';
    run(ambient, 0.5, { ...PLAYING, blocked: true });
    expect(page.layer.hidden).toBe(true);
    expect(where()).toEqual(here);
    // Back in play it picks up where it left off: one frame's worth of movement, no catch-up.
    ambient.update(FRAME, PLAYING);
    const now = ambient.snapshot();
    expect(Math.hypot(now.cube.x - here[0].x, now.cube.y - here[0].y)).toBeLessThanOrEqual(AMBIENT.cube.speed[1] * FRAME + AMBIENT.cube.sway);
    for (const [slot, x, y] of here[1]) {
      const a = now.ants.find((b) => b.slot === slot);
      if (a) expect(Math.hypot(a.x - x, a.y - y)).toBeLessThan(1.5);
    }
    page.win.media.matches = true;
    page.win.media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    ambient.update(FRAME, PLAYING);
    expect(ambient.snapshot()).toMatchObject({ cube: null, count: 0, hidden: true });
    ambient.sweeten();
    ambient.summon(6);
    run(ambient, 20);
    expect(ambient.snapshot().cube).toBe(null);
    ambient.dispose();
  });

  it('carries on, plainer and straight home, when graphics turn Low mid-carry; never starts in Low', () => {
    let look = 'high';
    const { page, ambient } = cubePage(3, carrying, { quality: () => look });
    const arcs = () => page.context.calls.arc ?? 0;
    let before = arcs();
    ambient.update(FRAME, PLAYING);
    expect(arcs()).toBeGreaterThan(before); // grains on the cube's top in High
    look = 'low';
    ambient.update(FRAME, PLAYING);
    before = arcs();
    ambient.update(FRAME, PLAYING);
    const s = ambient.snapshot();
    expect(s).toMatchObject({ quality: 'low', limit: 2 });
    expect(s.cube).toMatchObject({ hurry: true, phase: expect.stringMatching(/carry|turn/) });
    expect(arcs()).toBe(before); // a plain cube in Low
    let home = false;
    for (let t = 0; t < 60 && !home; t += FRAME) {
      ambient.update(FRAME, PLAYING);
      const now = ambient.snapshot();
      expect(now.cube?.phase ?? 'none').not.toBe('fade'); // carried home, not dropped
      home = now.cube === null;
    }
    expect(home).toBe(true);
    run(ambient, 30);
    expect(ambient.snapshot().count).toBeLessThanOrEqual(2);
    // In Low, asking again brings no cube.
    ambient.summon(6);
    ambient.sweeten();
    for (let t = 0; t < 30; t += FRAME) { ambient.update(FRAME, PLAYING); expect(ambient.snapshot().cube).toBe(null); }
    ambient.dispose();
  });

  it('drops the procession at once when a panel covers it, and retires the carriers it covers', () => {
    const { page, ambient } = cubePage(5, carrying);
    const s = ambient.snapshot();
    const panel = { x: s.cube.x - 40, y: s.cube.y - 40, w: 80, h: 80 };
    page.addPanel({ left: 197 + panel.x, top: 100 + panel.y, width: panel.w, height: panel.h });
    let shown = 0;
    for (let t = 0; t < 3; t += FRAME) {
      ambient.update(FRAME, PLAYING);
      const now = ambient.snapshot();
      if (now.hidden) continue;
      shown++;
      expect(now.cube).toBe(null);
      for (const a of now.ants) expect(intersects(footprint(a), inflate(panel, AMBIENT.clearance - 0.01))).toBe(false);
    }
    expect(shown).toBeGreaterThan(0);
    ambient.dispose();
  });

  it('keeps ants (and a procession) standing where they are through the pause reflow if they still fit, and resumes without catching up', () => {
    const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
    const ambient = createAmbient({ canvas: page.layer, seed: 4 });
    untilVisible(ambient, 6);
    run(ambient, 3);
    const paused = { ...PLAYING, phase: 'paused', pausedFrom: 'playing' };
    ambient.update(FRAME, paused); // paused: from here on nothing moves
    const before = ambient.snapshot().ants;
    // Pausing shrinks the cup to make room for a panel below it, as the real stage does (59 px shorter).
    page.gameCanvas.box = { left: 197 + 298, top: 100, width: 930, height: 790 };
    const below = page.addPanel({ left: 197, top: 100 + 806, width: 1526, height: 51 });
    run(ambient, 0.5, paused);
    const s = ambient.snapshot();
    expect(s.policy).toBe('frozen');
    expect(s.hidden).toBe(false);
    expect(s.regions.every((r) => r.h < 857)).toBe(true); // the paused layout, measured
    const fits = (a) => s.regions.some((r) => a.x - AMBIENT.footprint >= r.x - 1e-6 && a.x + AMBIENT.footprint <= r.x + r.w + 1e-6
      && a.y - AMBIENT.footprint >= r.y - 1e-6 && a.y + AMBIENT.footprint <= r.y + r.h + 1e-6);
    let kept = 0;
    for (const a of before) {
      const now = s.ants.find((b) => b.slot === a.slot);
      if (a.state === 'wandering' || a.state === 'paused') expect(!!now).toBe(fits(a));
      if (!now) continue;
      kept++;
      expect([now.x, now.y, now.heading]).toEqual([a.x, a.y, a.heading]); // exactly where it stood
    }
    expect(kept).toBeGreaterThan(2);
    // However long it stays paused, nothing moves.
    const still = JSON.stringify(ambient.snapshot().ants);
    run(ambient, 3, paused);
    expect(JSON.stringify(ambient.snapshot().ants)).toBe(still);
    // Unpausing reflows back; ants still there carry on from where they were, one frame at a time.
    page.gameCanvas.box = { left: 461, top: 100, width: 998, height: 857 };
    page.host.children = page.host.children.filter((child) => child !== below);
    const frozen = ambient.snapshot().ants;
    let resumed = null;
    for (let i = 0; i < 60 && !resumed; i++) {
      ambient.update(FRAME, PLAYING);
      const now = ambient.snapshot();
      if (!now.hidden && now.policy === 'run') resumed = now;
    }
    expect(resumed).not.toBe(null);
    for (const a of resumed.ants) {
      const was = frozen.find((b) => b.slot === a.slot);
      if (was) expect(Math.hypot(a.x - was.x, a.y - was.y)).toBeLessThanOrEqual(AMBIENT.speed[1] * 1.4 * FRAME + 1e-9);
    }
    // A procession under way is kept, frozen, through the same reflow if it still fits.
    ambient.sweeten({ size: 3 });
    for (let i = 0; i < 60 * 60 && !carrying(ambient.snapshot()); i++) {
      if (i % 600 === 599 && !ambient.snapshot().cube) { ambient.summon(6); ambient.sweeten({ size: 3 }); }
      ambient.update(FRAME, PLAYING);
    }
    expect(carrying(ambient.snapshot())).toBe(true);
    ambient.update(FRAME, paused);
    const cube = ambient.snapshot().cube;
    page.gameCanvas.box = { left: 197 + 298, top: 100, width: 930, height: 790 };
    page.addPanel({ left: 197, top: 100 + 806, width: 1526, height: 51 });
    run(ambient, 0.5, paused);
    const after = ambient.snapshot();
    const room = after.regions.some((r) => cube.x - AMBIENT.cube.reach >= r.x - 2 && cube.x + AMBIENT.cube.reach <= r.x + r.w + 2
      && cube.y - AMBIENT.cube.reach >= r.y - 2 && cube.y + AMBIENT.cube.reach <= r.y + r.h + 2);
    expect(room).toBe(true); // it still fits the paused gutter
    expect(after.cube).toMatchObject({ x: cube.x, y: cube.y, phase: 'carry' });
    expect(after.ants.filter((a) => cube.members.includes(a.slot)).map((a) => a.mode)).toEqual(['haul', 'haul', 'haul']);
    ambient.dispose();
  });

  it('carries on with the crumb in a plainer look when graphics turn Low mid-carry', () => {
    let look = 'high';
    const { page, ambient } = crumbPage(8, (s) => s.crumb?.state === 'carried', () => look);
    const carrier = ambient.snapshot().crumb.claim;
    look = 'low';
    const arcs = page.context.calls.arc ?? 0;
    ambient.update(FRAME, PLAYING);
    const s = ambient.snapshot();
    expect(s.quality).toBe('low');
    expect(s.crumb).toMatchObject({ state: 'carried', claim: carrier });
    expect(s.ants.find((a) => a.slot === carrier).cargo).toBe(true);
    expect(page.context.calls.arc).toBeGreaterThan(arcs); // drawn as a plain dot now
    // It still gets home, and the colony settles to Low's two.
    let home = false;
    for (let t = 0; t < 40 && !home; t += FRAME) {
      ambient.update(FRAME, PLAYING);
      const now = ambient.snapshot();
      home = now.crumb === null && !now.ants.some((a) => a.slot === carrier && a.cargo);
    }
    expect(home).toBe(true);
    run(ambient, 30);
    expect(ambient.snapshot().count).toBeLessThanOrEqual(2);
    ambient.dispose();
  });

  it('drops the crumb, and its carrier, at once when a panel covers their gutter', () => {
    const { page, ambient } = crumbPage(5, (s) => s.crumb?.state === 'carried');
    const s = ambient.snapshot();
    const region = s.crumb.region ?? s.ants.find((a) => a.slot === s.crumb.claim).region;
    // A panel over the whole of that gutter.
    page.addPanel({ left: 197 + region.x, top: 100 + region.y, width: region.w, height: region.h });
    for (let t = 0; t < 2; t += FRAME) {
      ambient.update(FRAME, PLAYING);
      const now = ambient.snapshot();
      if (now.hidden) continue;
      expect(now.crumb).toBe(null);
      expect(now.ants.some((a) => a.slot === s.crumb.claim)).toBe(false);
    }
    ambient.dispose();
  });

  it('retires every ant at once when the window narrows to an upright phone width, even ants that would fit', () => {
    // The same stage and cup either way: bands above and below the cup that ants can use.
    const layout = { stage: { left: 9, top: 200, width: 394, height: 600 }, game: { left: 9, top: 300, width: 394, height: 200 } };
    const page = fakePage({ ...layout, viewport: [520, 839] });
    const ambient = createAmbient({ canvas: page.layer, seed: 3 });
    untilVisible(ambient, 2);
    const before = ambient.snapshot();
    expect(before.regions.length).toBeGreaterThan(0);
    // Only the window's width changes: nothing moves, but the display now allows none.
    page.relayout({ ...layout, viewport: [480, 839] });
    page.win.dispatchEvent(new Event('resize'));
    for (let t = 0; t < 0.5; t += FRAME) {
      ambient.update(FRAME, PLAYING);
      const s = ambient.snapshot();
      if (s.budget === 0) expect(s).toMatchObject({ count: 0, hidden: true, width: 0 });
    }
    expect(ambient.snapshot()).toMatchObject({ budget: 0, count: 0, hidden: true });
    expect(ambient.snapshot().regions).toEqual(before.regions); // the gutters are still there; the rule is the display's
    ambient.dispose();
  });

  it('keeps a narrow portrait desktop window empty, and lets ants back when it is widened', () => {
    const narrow = { stage: { left: 9, top: 200, width: 394, height: 527 }, game: { left: 9, top: 300, width: 394, height: 327 }, viewport: [412, 839] };
    const page = fakePage(narrow); // a mouse and a desktop screen: not a phone
    const ambient = createAmbient({ canvas: page.layer, seed: 3 });
    ambient.summon(6);
    run(ambient, 10);
    expect(ambient.snapshot()).toMatchObject({ shape: null, budget: 0, room: 0, count: 0, hidden: true, width: 0 });
    expect(ambient.snapshot().space).toBeGreaterThan(0); // the geometry alone would allow some
    page.relayout({ stage: { left: 27, top: 120, width: 1146, height: 340 }, game: { left: 410, top: 120, width: 380, height: 340 }, viewport: [1200, 480] });
    page.win.dispatchEvent(new Event('resize'));
    run(ambient, 0.3);
    expect(ambient.snapshot().budget).toBeGreaterThan(2);
    untilVisible(ambient, 2);
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
    const page = fakePage({ stage: { left: 9, top: 200, width: 394, height: 527 }, game: { left: 9, top: 300, width: 394, height: 327 }, viewport: [412, 839], ...PHONE });
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
    const page = fakePage({ ...landscape, ...PHONE });
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

  it('treats a short desktop window by its geometry, not as a phone held sideways', () => {
    // 1200 × 480: two roomy gutters beside a 380 px cup, on a 1920 × 1080 desktop screen.
    const short = { stage: { left: 27, top: 120, width: 1146, height: 340 }, game: { left: 410, top: 120, width: 380, height: 340 }, viewport: [1200, 480] };
    const desktop = fakePage(short);
    const ambient = createAmbient({ canvas: desktop.layer, seed: 4 });
    run(ambient, 0.3);
    const s = ambient.snapshot();
    expect(s.shape).toBe(null);
    expect(s.budget).toBeGreaterThan(AMBIENT.phoneLandscape);
    expect(s.room).toBe(Math.min(s.space, s.budget));
    untilVisible(ambient, 3);
    ambient.dispose();
    // The same layout on a phone keeps the phone's conservative ceiling.
    const handset = fakePage({ ...short, ...PHONE });
    const sideways = createAmbient({ canvas: handset.layer, seed: 4 });
    run(sideways, 0.3);
    expect(sideways.snapshot()).toMatchObject({ shape: 'landscape', budget: 2, room: 2 });
    sideways.dispose();
  });

  it('re-evaluates when the primary pointer changes, and when a resize makes a phone portrait', () => {
    const short = { stage: { left: 27, top: 120, width: 1146, height: 340 }, game: { left: 410, top: 120, width: 380, height: 340 }, viewport: [1200, 480] };
    const page = fakePage({ ...short, screen: [412, 915] }); // small screen, but a mouse for now
    const ambient = createAmbient({ canvas: page.layer, seed: 5 });
    run(ambient, 0.3);
    expect(ambient.snapshot().shape).toBe(null);
    page.win.coarse.matches = true;
    page.win.coarse.dispatchEvent(new Event('change'));
    run(ambient, 0.3);
    expect(ambient.snapshot()).toMatchObject({ shape: 'landscape', budget: 2 });
    // Only a resize reports this one: now it is upright.
    page.relayout({ stage: { left: 9, top: 200, width: 394, height: 527 }, game: { left: 9, top: 300, width: 394, height: 327 }, viewport: [412, 839] });
    page.win.dispatchEvent(new Event('resize'));
    run(ambient, 0.3);
    expect(ambient.snapshot()).toMatchObject({ shape: 'portrait', budget: 0, room: 0, count: 0 });
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

  it('leaves seeded gameplay identical with a whole colony, its crumbs and sugar cubes: state, events and random streams', () => {
    function play(withAmbient, ambientSeed) {
      const game = createGame({ seed: 77 });
      const page = fakePage({ stage: { left: 197, top: 100, width: 1526, height: 857 }, game: { left: 461, top: 100, width: 998, height: 857 }, viewport: [1920, 1080] });
      const ambient = withAmbient ? createAmbient({ canvas: page.layer, seed: ambientSeed, ants: 12 }) : null;
      ambient?.summon(12);
      const log = [];
      let crumbs = 0, cubes = 0;
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
        if (i % 600 === 300) { ambient?.socialize(); ambient?.crumble(); }
        if (i % 900 === 450) ambient?.sweeten();
        if (withAmbient && i % 30 === 0 && ambient.snapshot().crumb) crumbs++;
        if (withAmbient && i % 30 === 0 && ambient.snapshot().cube) cubes++;
        // Stepped a varying number of times, as a slow or fast display would.
        for (let k = 0; k < (i % 3); k++) {
          ambient?.update(FRAME, { phase: s.phase, pausedFrom: s.pausedFrom, offer: !!s.offer, blocked: false, holding: false });
        }
        if (before) expect(JSON.stringify(game.state)).toBe(before);
      }
      const seen = ambient?.snapshot().count;
      ambient?.dispose();
      return { state: JSON.stringify(game.state), log, seen, crumbs, cubes };
    }
    const plain = play(false);
    const decorated = play(true, 1);
    const otherSeed = play(true, 99);
    expect(decorated.log).toEqual(plain.log);
    expect(decorated.state).toBe(plain.state);
    expect(otherSeed.state).toBe(plain.state);
    expect(plain.log.some((entry) => entry.endsWith(':kill'))).toBe(true);
    expect(decorated.crumbs + otherSeed.crumbs).toBeGreaterThan(0); // crumbs came and went meanwhile
    expect(decorated.cubes + otherSeed.cubes).toBeGreaterThan(0); // and sugar cubes
  }, 30_000);
});
