// The ambient layer's page adapter: a decorative canvas over the stage on
// which a small colony of ants now and then wanders the empty gutters beside
// the cup.
//
// It is stepped by the main loop (no animation loop of its own), never
// receives input (pointer-events: none, aria-hidden, not focusable) and only
// reads the game's phase. Layout is measured when something changes, never
// every frame: resize observers, viewport/scroll listeners and a small layout
// key mark it dirty, and the next settled frame measures once.

import { createRandom } from '../core/random.js';
import {
  AMBIENT, ambientPolicy, capacity, createColony, displayBudget, drawAnt, populationLimit, safeRegions,
} from '../rendering/ambient.js';

const MAX_PIXEL_RATIO = 2;
const SETTLE_SECONDS = 0.12; // wait for a layout change to finish before measuring
const FRAME_TOLERANCE = 2; // CSS px: the playfield's border sits between its box and the stage
const BODY_KEYS = ['view', 'phase', 'readingReady', 'onscreenControls', 'mode', 'touch'];

/** Intersection of two rectangles, or null. */
function overlap(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/**
 * Measure the stage once: what part of it is on screen, and what on or
 * around it must stay clear. Returns host-local CSS-pixel rectangles.
 */
export function measureLayout({ host, clip, candidates, viewport }) {
  const hostBox = box(host.getBoundingClientRect());
  const frame = clip && clip !== host ? box(clip.getBoundingClientRect()) : hostBox;
  let visible = overlap(hostBox, viewport);
  if (visible) visible = overlap(visible, frame);
  const exclusions = [];
  let open = { left: false, right: false, top: false, bottom: false };
  if (visible) {
    // A side is a real border where it meets the playfield frame (inside its
    // 1 px border) or the screen edge; anywhere else it is an internal seam.
    const near = (a, b) => Math.abs(a - b) <= FRAME_TOLERANCE;
    open = {
      left: near(visible.x, frame.x) || near(visible.x, viewport.x),
      right: near(visible.x + visible.w, frame.x + frame.w) || near(visible.x + visible.w, viewport.x + viewport.w),
      top: near(visible.y, frame.y) || near(visible.y, viewport.y),
      bottom: near(visible.y + visible.h, frame.y + frame.h) || near(visible.y + visible.h, viewport.y + viewport.h),
    };
    for (const element of candidates) {
      if (element.hidden) continue;
      const r = box(element.getBoundingClientRect());
      // Collapsed and screen-reader-only (1 px) elements occupy nothing visible.
      if (r.w < 2 || r.h < 2 || !overlap(r, hostBox)) continue;
      exclusions.push({ x: r.x - hostBox.x, y: r.y - hostBox.y, w: r.w, h: r.h });
    }
    visible = { x: visible.x - hostBox.x, y: visible.y - hostBox.y, w: visible.w, h: visible.h };
  }
  return { width: hostBox.w, height: hostBox.h, visible, exclusions, open };
}

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas the decorative surface, absolutely filling its host
 * @param {() => string} [options.quality] current graphics quality ('high' | 'low')
 * @param {number} [options.seed] fixed cosmetic seed (tests and ?debug only)
 * @param {number} [options.ants] population ceiling replacing the display's own,
 *   up to AMBIENT.slots (profiling and ?debug only; region capacity still applies)
 */
export function createAmbient({ canvas, quality = () => 'high', seed, ants } = {}) {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const host = canvas.parentElement;
  const clip = host.closest('.playfield') ?? host;
  const ctx = canvas.getContext('2d');
  // Everything on the stage or in the playfield that could cover it, except
  // decorative (aria-hidden) layers such as this one and the touch ring.
  // Collected again at each measurement: a view switch moves panels between them.
  const collect = () => [...host.children, ...(clip === host ? [] : clip.children)]
    .filter((element) => element !== host && element.getAttribute('aria-hidden') !== 'true');
  let candidates = collect();
  let hiddenKey = candidates.map((element) => element.hidden);
  let childCount = -1;
  const colony = createColony({ random: createRandom(seed) });
  const override = Number.isFinite(ants) ? Math.max(0, Math.min(AMBIENT.slots, ants)) : undefined;

  let regions = [];
  let room = 0; // what the measured space and the display allow
  let space = 0; // region capacity alone
  let budget = 0; // the display's ceiling alone
  let limit = 0; // this frame's ceiling, after graphics quality
  let layout = null;
  let dirty = true;
  let settle = 0;
  let ratio = 0;
  // Where each ant was last drawn, so only those spots are cleared.
  const drawnAt = new Float64Array(AMBIENT.slots * 2);
  let drawnCount = 0;
  let drawn = false;
  let drawnQuality = null;
  let policy = 'off';
  let reduced = false;
  let focused = doc.hasFocus?.() ?? true;
  const bodyKey = new Array(BODY_KEYS.length).fill(null);

  const markDirty = () => { dirty = true; settle = SETTLE_SECONDS; };
  const listeners = [];
  const listen = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  listen(win, 'resize', markDirty);
  listen(win, 'scroll', markDirty, { passive: true });
  listen(win.visualViewport, 'resize', markDirty);
  listen(win, 'blur', () => { focused = false; });
  listen(win, 'focus', () => { focused = true; });
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  reduced = !!motion?.matches;
  listen(motion, 'change', (event) => { reduced = event.matches; });
  // Turning a phone changes the display's ceiling, even before any resize is reported.
  listen(win.matchMedia?.('(orientation: portrait)'), 'change', markDirty);
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(markDirty) : null;
  for (const element of [host, clip, doc.getElementById('game'), doc.getElementById('readingPresentation')]) {
    if (element) observer?.observe(element);
  }

  // Cheap per-frame checks for layout changes no observer reports: view,
  // phase or reveal switches, panels shown, hidden or moved, a new pixel ratio.
  function layoutChanged() {
    let changed = false;
    const count = host.children.length + (clip === host ? 0 : clip.children.length);
    if (count !== childCount) { childCount = count; changed = true; }
    const data = doc.body?.dataset ?? {};
    for (let i = 0; i < BODY_KEYS.length; i++) {
      const value = data[BODY_KEYS[i]];
      if (bodyKey[i] !== value) { bodyKey[i] = value; changed = true; }
    }
    for (let i = 0; i < candidates.length; i++) {
      const value = candidates[i].hidden;
      if (hiddenKey[i] !== value) { hiddenKey[i] = value; changed = true; }
    }
    const pixels = Math.min(MAX_PIXEL_RATIO, Math.max(1, win.devicePixelRatio || 1));
    if (pixels !== ratio) { ratio = pixels; changed = true; }
    return changed;
  }

  function measure() {
    candidates = collect();
    hiddenKey = candidates.map((element) => element.hidden);
    // All reads first, then the backing-store writes.
    layout = measureLayout({ host, clip, candidates, viewport: { x: 0, y: 0, w: win.innerWidth, h: win.innerHeight } });
    regions = safeRegions(layout.visible, layout.exclusions, { open: layout.open });
    space = capacity(regions);
    budget = displayBudget(regions, { w: win.innerWidth, h: win.innerHeight }, { override });
    room = Math.min(space, budget);
    // Only hold backing pixels while a visitor could actually appear.
    const width = room > 0 ? Math.round(layout.width * ratio) : 0;
    const height = room > 0 ? Math.round(layout.height * ratio) : 0;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    drawn = false; // resizing the backing store clears it
    drawnCount = 0;
    colony.relayout(regions);
  }

  function clear() {
    if (!drawn) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const reach = AMBIENT.footprint + 2;
    for (let i = 0; i < drawnCount; i++) {
      ctx.clearRect(drawnAt[i * 2] - reach, drawnAt[i * 2 + 1] - reach, reach * 2, reach * 2);
    }
    drawn = false;
    drawnCount = 0;
  }

  // Every old spot is cleared before any ant is drawn, so neighbours are never clipped.
  function paint(moving) {
    clear();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawnQuality = quality();
    for (let i = 0; i < colony.ants.length; i++) {
      const ant = colony.ants[i];
      if (ant.state === 'absent') continue;
      drawAnt(ctx, { x: ant.x, y: ant.y, heading: ant.heading, gait: ant.gait,
        moving: moving && ant.state !== 'paused', twitch: ant.twitch }, { quality: drawnQuality });
      drawnAt[drawnCount * 2] = ant.x;
      drawnAt[drawnCount * 2 + 1] = ant.y;
      drawnCount++;
    }
    drawn = true;
  }

  function show(on) {
    if (canvas.hidden === !on) return;
    canvas.hidden = !on;
  }

  return {
    /**
     * Advance and draw one frame. `scene` is read-only presentation context:
     * { phase, pausedFrom, offer, blocked, holding }.
     */
    update(dt, scene) {
      if (layoutChanged()) markDirty();
      policy = ambientPolicy({ ...scene, reduced, focused, hidden: doc.visibilityState === 'hidden' });
      if (policy === 'off' && colony.count > 0) colony.retire();
      if (dirty) {
        // Nothing is drawn against a layout that is still changing.
        clear();
        show(false);
        settle -= dt;
        if (settle > 0) return;
        dirty = false;
        measure();
      }
      const look = quality();
      limit = populationLimit(room, look);
      // Low graphics keeps to plain wandering: no social moments.
      if (policy === 'run') colony.step(dt, regions, limit, { social: look !== 'low' });
      const visible = colony.count > 0 && (policy === 'run' || policy === 'frozen');
      show(visible);
      if (!visible) { clear(); return; }
      // A still colony is only redrawn when uncovered or its look changes.
      if (policy === 'run' || !drawn || drawnQuality !== quality()) paint(policy === 'run');
    },

    /** Force a layout measurement on the next settled frame. */
    invalidate: markDirty,

    /** Read-only state for tests and ?debug. */
    snapshot() {
      const box = (r) => r && { x: r.x, y: r.y, w: r.w, h: r.h };
      const slot = (ant) => colony.ants.indexOf(ant);
      return {
        policy, room, space, budget, limit, count: colony.count, spell: colony.spell, reduced, focused,
        drawn, quality: drawnQuality, hidden: canvas.hidden, width: canvas.width, height: canvas.height,
        visible: layout?.visible ?? null, exclusions: layout?.exclusions ?? [], open: layout?.open ?? null,
        regions: regions.map((r) => ({ ...box(r), portals: [...r.portals] })),
        ants: colony.ants.filter((ant) => ant.state !== 'absent').map((ant) => ({
          slot: slot(ant), state: ant.state, mode: ant.mode, x: ant.x, y: ant.y, heading: ant.heading,
          partner: ant.partner ? slot(ant.partner) : null, region: box(ant.region),
        })),
      };
    },

    /** ?debug only: bring `n` visits forward. Space and policy still apply. */
    summon(n = 1) {
      colony.summon(n);
    },

    /** ?debug only: the next social moment now ('follow' | 'greet' | 'drift' | any), once ants allow. */
    socialize(kind) {
      colony.socialize(kind);
    },

    dispose() {
      for (const remove of listeners.splice(0)) remove();
      observer?.disconnect();
      clear();
      colony.retire();
      canvas.width = 0;
      canvas.height = 0;
      canvas.hidden = true;
    },
  };
}
