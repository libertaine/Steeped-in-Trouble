import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCanvasScaling } from '../../src/rendering/canvas.js';

/** A canvas, window and ResizeObserver stand-in that record the order of events. */
function stage({ width = 800, height = 600, ratio = 1 } = {}) {
  const log = [];
  const backing = { width: 300, height: 150 };
  const box = { width, height };
  const listeners = new Set();
  const observers = [];
  const canvas = {
    get width() { return backing.width; },
    set width(value) { backing.width = value; log.push(`width=${value}`); },
    get height() { return backing.height; },
    set height(value) { backing.height = value; log.push(`height=${value}`); },
    getBoundingClientRect: () => ({ ...box }),
  };
  vi.stubGlobal('window', {
    devicePixelRatio: ratio,
    addEventListener: (type, listener) => { if (type === 'resize') listeners.add(listener); },
    removeEventListener: (type, listener) => { if (type === 'resize') listeners.delete(listener); },
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback; this.observed = []; observers.push(this); }
    observe(target) { this.observed.push(target); }
    disconnect() { this.observed = []; }
  });
  const requestFrame = vi.fn();
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  return {
    canvas,
    box,
    log,
    listeners,
    observers,
    requestFrame,
    redraw: vi.fn(() => log.push('redraw')),
    observe() { observers[0].callback([]); },
    windowResize() { for (const listener of [...listeners]) listener(); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('canvas backing-store scaling', () => {
  it('sizes the canvas on attachment without redrawing before anything is ready to draw', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    expect([s.canvas.width, s.canvas.height]).toEqual([800, 600]);
    expect(s.redraw).not.toHaveBeenCalled();
  });

  it('redraws after both dimensions are written when the observed size changes', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    s.log.length = 0;
    Object.assign(s.box, { width: 700, height: 500 });
    s.observe();
    expect(s.log).toEqual(['width=700', 'height=500', 'redraw']);
  });

  it('redraws in the resize callback itself, without waiting for another frame', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    Object.assign(s.box, { width: 700, height: 500 });
    s.observe();
    expect(s.redraw).toHaveBeenCalledTimes(1);
    expect(s.requestFrame).not.toHaveBeenCalled();
  });

  it('redraws once when only one dimension changes', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    s.log.length = 0;
    s.box.height = 500;
    s.observe();
    expect(s.log).toEqual(['height=500', 'redraw']);
  });

  it('also redraws when a window resize changes the backing store', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    s.box.width = 640;
    s.windowResize();
    expect(s.redraw).toHaveBeenCalledTimes(1);
  });

  it('neither clears nor redraws when the size has not changed', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    s.log.length = 0;
    s.observe();
    s.windowResize();
    expect(s.log).toEqual([]);
    expect(s.redraw).not.toHaveBeenCalled();
  });

  it('does not redraw a second time when the observer follows a window resize', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    s.box.width = 640;
    s.windowResize();
    s.observe();
    expect(s.redraw).toHaveBeenCalledTimes(1);
  });

  it('ignores a canvas that has no layout width', () => {
    const s = stage();
    attachCanvasScaling(s.canvas, s.redraw);
    s.log.length = 0;
    s.box.width = 0;
    s.observe();
    expect(s.log).toEqual([]);
    expect(s.redraw).not.toHaveBeenCalled();
  });

  it('keeps the device pixel ratio limits', () => {
    const high = stage({ ratio: 3 });
    attachCanvasScaling(high.canvas);
    expect([high.canvas.width, high.canvas.height]).toEqual([1600, 1200]);
    const low = stage({ ratio: 0.5 });
    attachCanvasScaling(low.canvas);
    expect([low.canvas.width, low.canvas.height]).toEqual([800, 600]);
  });

  it('still resizes when no redraw callback is supplied', () => {
    const s = stage();
    attachCanvasScaling(s.canvas);
    s.box.width = 640;
    expect(() => s.observe()).not.toThrow();
    expect(s.canvas.width).toBe(640);
  });

  it('stops listening and redrawing once detached', () => {
    const s = stage();
    const detach = attachCanvasScaling(s.canvas, s.redraw);
    detach();
    expect(s.listeners.size).toBe(0);
    expect(s.observers[0].observed).toEqual([]);
    s.box.width = 640;
    s.windowResize();
    expect(s.redraw).not.toHaveBeenCalled();
  });
});
