import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import {
  AMBIENT, ambientPolicy, capacity, createVisitor, drawAnt, inflate, intersects, safeRegions, subtract,
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
  win.matchMedia = () => win.media;
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
  return { win, doc, host, frame, gameCanvas, panel, layer, context, reads: () => reads };
}

const PLAYING = Object.freeze({ phase: 'playing', pausedFrom: null, offer: false, blocked: false, holding: false });

function run(ambient, seconds, scene = PLAYING) {
  for (let t = 0; t < seconds; t += FRAME) ambient.update(FRAME, scene);
}

/** Run until the visitor is out, or fail. */
function untilVisible(ambient, scene = PLAYING) {
  ambient.summon();
  for (let i = 0; i < 600 && ambient.snapshot().state === 'absent'; i++) ambient.update(FRAME, scene);
  expect(ambient.snapshot().state).not.toBe('absent');
}

/** The ant's whole drawing, as a box. */
const footprint = ({ x, y }) => ({ x: x - AMBIENT.footprint, y: y - AMBIENT.footprint, w: AMBIENT.footprint * 2, h: AMBIENT.footprint * 2 });

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

  it('caps population at one visitor in this increment, from area rather than viewport width', () => {
    expect(capacity(safeRegions(stage, [game]))).toBe(1);
    expect(capacity([{ x: 0, y: 0, w: 40, h: 120, portals: ['left'] }])).toBe(0); // a corridor, but too small to host one
    expect(AMBIENT.maxVisitors).toBe(1);
  });

  it('does not combine disconnected slivers into room for a visitor', () => {
    // A tall portrait phone: 41 px strips above and below the cup, neither roomy enough alone.
    const phone = { x: 0, y: 0, w: 394, h: 436 };
    const cup = { x: 0, y: 57, w: 394, h: 322 };
    expect(safeRegions(phone, [cup], { minArea: 0 })).toHaveLength(2);
    expect(safeRegions(phone, [cup])).toEqual([]);
    expect(capacity(safeRegions(phone, [cup], { minArea: 0 }))).toBe(0);
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
    for (const p of visit(seed, 150).path) {
      const body = footprint(p);
      expect(intersects(body, inflate(game, AMBIENT.clearance - 0.01))).toBe(false);
      // On screen it is inside its region; beyond the region it is only ever through its portal side.
      const inside = body.x >= p.region.x - 1e-6 && body.x + body.w <= p.region.x + p.region.w + 1e-6
        && body.y >= p.region.y - 1e-6 && body.y + body.h <= p.region.y + p.region.h + 1e-6;
      if (!inside) {
        expect(['entering', 'leaving']).toContain(p.state);
        if (p.portal === 'left' || p.portal === 'right') {
          expect(body.y).toBeGreaterThanOrEqual(p.region.y);
          expect(body.y + body.h).toBeLessThanOrEqual(p.region.y + p.region.h);
        } else {
          expect(body.x).toBeGreaterThanOrEqual(p.region.x);
          expect(body.x + body.w).toBeLessThanOrEqual(p.region.x + p.region.w);
        }
      }
    }
    // Arrival begins wholly off screen, so it walks in rather than appearing.
    const first = visit(seed, 150).path[0];
    expect(intersects(footprint(first), visible)).toBe(false);
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

describe('the ant painter', () => {
  it('draws simpler bodies in Low quality and still legs when stopped', () => {
    const high = fakeContext(), low = fakeContext();
    drawAnt(high, { x: 10, y: 10, heading: 0, gait: 1 }, { quality: 'high' });
    drawAnt(low, { x: 10, y: 10, heading: 0, gait: 1 }, { quality: 'low' });
    expect(low.calls.lineTo).toBeLessThan(high.calls.lineTo);
    expect(low.calls.fill).toBeLessThan(high.calls.fill);
    expect(high.calls.save).toBe(high.calls.restore); // leaves the context as it found it
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
    expect(page.win.observers).toHaveLength(1);
    expect(page.win.observers[0].observed).toContain(page.gameCanvas);
    untilVisible(ambient);
    expect(page.layer.hidden).toBe(false);
    expect(page.layer.width).toBe(1200);
    ambient.dispose();
    expect(page.win.live + page.win.visualViewport.live + page.win.media.live).toBe(0);
    expect(page.win.observers[0].connected).toBe(false);
    expect(page.layer).toMatchObject({ width: 0, height: 0, hidden: true });
    expect(ambient.snapshot().state).toBe('absent');
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
    run(ambient, 2);
    expect(page.reads()).toBe(settled);
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

  it('follows viewport resizes and pixel ratio, capping backing pixels at 2×', () => {
    const page = fakePage({ dpr: 3 });
    const ambient = createAmbient({ canvas: page.layer, seed: 2 });
    untilVisible(ambient);
    expect([page.layer.width, page.layer.height]).toEqual([2400, 1000]);
    expect(ambient.snapshot().regions).toHaveLength(2);
    // Narrower: the gutters shrink and the visitor, if its gutter is gone, leaves with it.
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
    expect(after.state).toBe('absent');
    expect([page.layer.width, page.layer.height, page.layer.hidden]).toEqual([0, 0, true]);
    ambient.dispose();
  });

  it('shows nothing when the space is inadequate, however long it waits', () => {
    const page = fakePage({ stage: { left: 0, top: 0, width: 357, height: 356 }, game: { left: 0, top: 25, width: 357, height: 307 } });
    const ambient = createAmbient({ canvas: page.layer, seed: 3 });
    ambient.summon();
    run(ambient, 60);
    expect(ambient.snapshot()).toMatchObject({ state: 'absent', room: 0, hidden: true, width: 0, height: 0 });
    expect(page.context.calls.ellipse ?? 0).toBe(0);
    ambient.dispose();
  });

  it('honours graphics quality live, without reloading', () => {
    const page = fakePage();
    let quality = 'high';
    const ambient = createAmbient({ canvas: page.layer, seed: 4, quality: () => quality });
    untilVisible(ambient);
    const paused = { ...PLAYING, phase: 'paused', pausedFrom: 'playing' };
    ambient.update(FRAME, paused);
    const before = page.context.calls.lineTo;
    run(ambient, 0.5, paused);
    expect(page.context.calls.lineTo).toBe(before); // a still visitor is not redrawn
    quality = 'low';
    ambient.update(FRAME, paused);
    expect(page.context.calls.lineTo).toBeGreaterThan(before); // but is, once, in its new look
    ambient.dispose();
  });

  it('removes the visitor at once for reduced motion, including a live change, and keeps it away', () => {
    const page = fakePage();
    const ambient = createAmbient({ canvas: page.layer, seed: 5 });
    untilVisible(ambient);
    page.win.media.matches = true;
    page.win.media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    ambient.update(FRAME, PLAYING);
    expect(ambient.snapshot()).toMatchObject({ policy: 'off', state: 'absent', hidden: true });
    ambient.summon();
    run(ambient, 60);
    expect(ambient.snapshot().state).toBe('absent');
    ambient.dispose();

    const still = fakePage({ reduced: true });
    const quiet = createAmbient({ canvas: still.layer, seed: 5 });
    quiet.summon();
    run(quiet, 30);
    expect(quiet.snapshot()).toMatchObject({ policy: 'off', state: 'absent' });
    quiet.dispose();
  });

  it('freezes while paused or unfocused, hides under modals, and leaves with the scene', () => {
    const page = fakePage();
    const ambient = createAmbient({ canvas: page.layer, seed: 6 });
    untilVisible(ambient);
    const at = () => { const s = ambient.snapshot(); return [s.x, s.y]; };
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
    expect(page.layer.hidden).toBe(false); // back where it was, no catch-up
    run(ambient, 0.1, { ...PLAYING, phase: 'gameover' });
    expect(ambient.snapshot()).toMatchObject({ state: 'absent', hidden: true });
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
    untilVisible(ambient);
    run(ambient, 20);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    ambient.dispose();
  });

  it('leaves seeded gameplay identical: state, events and random streams', () => {
    function play(withAmbient, ambientSeed) {
      const game = createGame({ seed: 77 });
      const page = fakePage();
      const ambient = withAmbient ? createAmbient({ canvas: page.layer, seed: ambientSeed }) : null;
      ambient?.summon();
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
        // Stepped a varying number of times, as a slow or fast display would.
        for (let k = 0; k < (i % 3); k++) {
          ambient?.update(FRAME, { phase: s.phase, pausedFrom: s.pausedFrom, offer: !!s.offer, blocked: false, holding: false });
        }
        if (before) expect(JSON.stringify(game.state)).toBe(before);
      }
      ambient?.dispose();
      return { state: JSON.stringify(game.state), log };
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
