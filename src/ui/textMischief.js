// Panel-local decorative surface; stepped only by the existing ambient update.
import { CONFIG } from '../config.js';
import { createTextMischief, drawTextMischief } from '../rendering/textMischief.js';

/** Empty space below every reading line, with no scrolling or decision UI. */
export function readingTextSpace({ panel, copy, last, viewport, width, textWidth }, tuning = CONFIG.textMischief) {
  const top = panel.bottom - 12 - tuning.laneHeight;
  return [panel.left, panel.top, panel.right, panel.bottom, last.bottom, width, textWidth].every(Number.isFinite)
    && width >= tuning.minWidth && textWidth > 0 && textWidth + 48 <= width
    && copy.scrollHeight <= copy.clientHeight + 1 && last.bottom + 12 <= top
    && panel.left >= 0 && panel.top >= 0 && panel.right <= viewport.w && panel.bottom <= viewport.h
    && !(viewport.w <= 500 && viewport.h > viewport.w);
}

export function createReadingMischief({ doc, random }) {
  const lane = doc.getElementById('readingMischief');
  const canvas = doc.getElementById('readingAnts');
  const caption = doc.getElementById('readingCaption');
  const panel = doc.getElementById('readingPresentation');
  if (!lane || !canvas || !caption || !panel) return null;
  const win = doc.defaultView, ctx = canvas.getContext('2d');
  const copy = panel.querySelector('.reading-copy');
  const controller = createTextMischief({ random });
  const listeners = [];
  let geometry = null, dirty = true, key = null, eligible = false, suspended = false;
  let pointerInside = false, painted = false, disposed = false;
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  function clearOverlay() {
    if (painted) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!canvas.hidden) canvas.hidden = true;
    painted = false;
  }
  function restore() {
    if (caption.hasAttribute('data-carried')) caption.removeAttribute('data-carried');
    clearOverlay();
  }
  function interrupt() { controller.cancel(); restore(); }
  function suspend() { controller.suspend(); restore(); }
  function invalidate() { dirty = true; geometry = null; interrupt(); lane.hidden = true; }
  function engaged() {
    return pointerInside || panel.contains(doc.activeElement) || !!doc.getSelection()?.toString();
  }
  listen(panel, 'pointerenter', () => { pointerInside = true; interrupt(); });
  listen(panel, 'pointerleave', () => { pointerInside = false; });
  listen(win, 'keydown', interrupt, { passive: true });
  listen(win, 'pointerdown', interrupt, { passive: true });
  listen(panel, 'focusin', interrupt);
  listen(panel, 'wheel', interrupt, { passive: true });
  listen(copy, 'scroll', invalidate, { passive: true });
  listen(doc, 'selectionchange', () => { if (doc.getSelection()?.toString()) interrupt(); });
  listen(win, 'blur', suspend);
  listen(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') suspend(); });
  // Font readiness can change both the reading's height and the caption's width.
  doc.fonts?.ready.then(() => { if (!disposed) invalidate(); });

  function measure() {
    const p = panel.getBoundingClientRect();
    const last = copy.lastElementChild.getBoundingClientRect();
    const style = win.getComputedStyle(caption);
    const font = style.font || `${style.fontStyle} ${style.fontSize} ${style.fontFamily}`;
    ctx.font = font;
    const textWidth = ctx.measureText(caption.textContent).width;
    const width = p.width - 24;
    if (!readingTextSpace({ panel: p, copy, last, width, textWidth, viewport: { w: win.innerWidth, h: win.innerHeight } })) {
      geometry = null;
      lane.hidden = true;
      return;
    }
    const ratio = Math.max(1, Math.min(2, win.devicePixelRatio || 1));
    geometry = { width, textWidth, font, color: style.color, ratio };
    canvas.width = Math.round(width * ratio);
    canvas.height = CONFIG.textMischief.laneHeight * ratio;
    lane.hidden = false;
  }

  return {
    invalidate,
    update(dt, scene, { quality, reduced, focused, hidden, settling }) {
      if (disposed) return;
      const nextKey = scene.phase === 'reading' ? `${scene.readingKey}:${scene.readingReady}:${scene.offer}` : null;
      if (key !== nextKey) {
        controller.reset(); restore(); key = nextKey; dirty = true;
      }
      const screen = scene.phase === 'reading' && scene.readingReady && !scene.offer;
      suspended = hidden || !focused;
      const allowed = screen && quality === 'high' && !reduced && !scene.blocked && !scene.holding;
      if (!allowed || settling) {
        interrupt(); lane.hidden = true; eligible = false; dirty = true; return;
      }
      // Do not measure hidden tabs. Their clocks and geometry wait until visible again.
      if (dirty && !suspended) { measure(); dirty = false; }
      eligible = allowed && !!geometry && !settling;
      controller.step(dt, { eligible, suspended, engaged: engaged() });
      const state = controller.snapshot();
      const carried = ['lift', 'carry', 'absent'].includes(state.phase);
      // Only change visual text at pickup/restoration, including throughout absence.
      if (carried !== caption.hasAttribute('data-carried')) {
        if (carried) caption.setAttribute('data-carried', '');
        else caption.removeAttribute('data-carried');
      }
      if (!eligible || suspended || !['approach', 'lift', 'carry'].includes(state.phase)) {
        clearOverlay();
        return;
      }
      ctx.setTransform(geometry.ratio, 0, 0, geometry.ratio, 0, 0);
      ctx.clearRect(0, 0, geometry.width, CONFIG.textMischief.laneHeight);
      drawTextMischief(ctx, state, geometry, caption.textContent);
      canvas.hidden = false; painted = true;
    },
    trigger() {
      if (disposed || !eligible || suspended || engaged() || dirty) return false;
      return controller.trigger();
    },
    snapshot: () => ({ ...controller.snapshot(), eligible, geometry, hidden: canvas.hidden,
      carried: caption.hasAttribute('data-carried'), text: caption.textContent }),
    dispose() {
      disposed = true;
      eligible = false;
      interrupt(); lane.hidden = true;
      for (const remove of listeners.splice(0)) remove();
      canvas.width = 0; canvas.height = 0;
    },
  };
}
