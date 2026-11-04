// The ambient layer's page adapter: a decorative canvas over the stage on
// which an occasional ant wanders through the empty gutters beside the cup.
//
// It is stepped by the main loop (no animation loop of its own), never
// receives input (pointer-events: none, aria-hidden, not focusable) and only
// reads the game's phase. Layout is measured when something changes, never
// every frame: resize observers, viewport/scroll listeners and a small layout
// key mark it dirty, and the next settled frame measures once.

import { createRandom } from '../core/random.js';
import { AMBIENT, ambientPolicy, capacity, createVisitor, drawAnt, safeRegions } from '../rendering/ambient.js';

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
 */
export function createAmbient({ canvas, quality = () => 'high', seed } = {}) {
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
  const visitor = createVisitor({ random: createRandom(seed) });

  let regions = [];
  let room = 0;
  let layout = null;
  let dirty = true;
  let settle = 0;
  let ratio = 0;
  let drawn = false;
  let drawnX = 0, drawnY = 0;
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
    room = capacity(regions);
    // Only hold backing pixels while a visitor could actually appear.
    const width = room > 0 ? Math.round(layout.width * ratio) : 0;
    const height = room > 0 ? Math.round(layout.height * ratio) : 0;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    drawn = false; // resizing the backing store clears it
    visitor.relayout(regions);
  }

  function clear() {
    if (!drawn) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const reach = AMBIENT.footprint + 2;
    ctx.clearRect(drawnX - reach, drawnY - reach, reach * 2, reach * 2);
    drawn = false;
  }

  function paint(moving) {
    clear();
    const ant = visitor.ant;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawnQuality = quality();
    drawAnt(ctx, { x: ant.x, y: ant.y, heading: ant.heading, gait: ant.gait,
      moving: moving && ant.state !== 'paused', twitch: ant.twitch }, { quality: drawnQuality });
    drawn = true;
    drawnX = ant.x;
    drawnY = ant.y;
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
      if (policy === 'off' && visitor.visible) visitor.retire();
      if (dirty) {
        // Nothing is drawn against a layout that is still changing.
        clear();
        show(false);
        settle -= dt;
        if (settle > 0) return;
        dirty = false;
        measure();
      }
      if (policy === 'run') visitor.step(dt, regions, room);
      const visible = visitor.visible && (policy === 'run' || policy === 'frozen');
      show(visible);
      if (!visible) { clear(); return; }
      // A still visitor is only redrawn when uncovered or its look changes.
      if (policy === 'run' || !drawn || drawnQuality !== quality()) paint(policy === 'run');
    },

    /** Force a layout measurement on the next settled frame. */
    invalidate: markDirty,

    /** Read-only state for tests and ?debug. */
    snapshot() {
      const ant = visitor.ant;
      return {
        policy, state: ant.state, x: ant.x, y: ant.y, heading: ant.heading, room, reduced, focused,
        drawn, quality: drawnQuality, hidden: canvas.hidden, width: canvas.width, height: canvas.height,
        visible: layout?.visible ?? null, exclusions: layout?.exclusions ?? [], open: layout?.open ?? null,
        regions: regions.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, portals: [...r.portals] })),
        region: ant.region && { x: ant.region.x, y: ant.region.y, w: ant.region.w, h: ant.region.h },
      };
    },

    /** ?debug only: bring the next visit forward. Space and policy still apply. */
    summon() {
      if (visitor.ant.state === 'absent') visitor.ant.timer = 0;
    },

    dispose() {
      for (const remove of listeners.splice(0)) remove();
      observer?.disconnect();
      clear();
      visitor.retire();
      canvas.width = 0;
      canvas.height = 0;
      canvas.hidden = true;
    },
  };
}
