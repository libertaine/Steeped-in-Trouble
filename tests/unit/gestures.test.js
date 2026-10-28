import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGestures } from '../../src/input/gestures.js';
import { initialSettings, normalize, saveSettings, SETTINGS_KEY } from '../../src/input/settings.js';

const T = CONFIG.touch;

/** A tap: down and up `hold` ms apart, at a point. Returns what either said. */
function tap(g, id, x, y, t, hold = 60) {
  return [g.down(id, x, y, t), g.up(id, x, y, t + hold)].filter(Boolean);
}

describe('double-tap for milk', () => {
  it('pours once, as the second finger lands', () => {
    const g = createGestures();
    expect(tap(g, 1, 100, 100, 0)).toEqual([]);
    expect(g.down(2, 100, 100, 200)).toBe('milk');
    expect(g.up(2, 100, 100, 260)).toBe(null);
  });

  it('forgives a second tap a little way from the first', () => {
    const g = createGestures();
    tap(g, 1, 100, 100, 0);
    expect(g.down(2, 100 + T.tapSlop * 0.7, 100 + T.tapSlop * 0.7, 150)).toBe('milk');
  });

  it('ignores taps too far apart in space or time', () => {
    const far = createGestures();
    tap(far, 1, 100, 100, 0);
    expect(far.down(2, 100 + T.tapSlop + 5, 100, 150)).toBe(null);
    const slow = createGestures();
    tap(slow, 1, 100, 100, 0);
    expect(slow.down(2, 100, 100, 60 + T.doubleTap + 10)).toBe(null);
  });

  it('pours once for three quick taps, not twice', () => {
    const g = createGestures();
    const said = [...tap(g, 1, 50, 50, 0), ...tap(g, 2, 50, 50, 150), ...tap(g, 3, 50, 50, 300)];
    expect(said).toEqual(['milk']);
  });

  it('pours twice for two separate double taps', () => {
    const g = createGestures();
    const said = [...tap(g, 1, 50, 50, 0), ...tap(g, 2, 50, 50, 150), ...tap(g, 3, 50, 50, 800), ...tap(g, 4, 50, 50, 950)];
    expect(said).toEqual(['milk', 'milk']);
  });

  it('does not count a long press as the first tap', () => {
    const g = createGestures();
    g.down(1, 50, 50, 0);
    expect(g.tick(T.longPress)).toBe('sugar');
    g.up(1, 50, 50, T.longPress + 50);
    expect(g.down(2, 50, 50, T.longPress + 120)).toBe(null);
  });
});

describe('long-press for sugar', () => {
  it('fires once when held still long enough, however long the finger stays', () => {
    const g = createGestures();
    g.down(1, 80, 80, 0);
    expect(g.tick(T.longPress - 20)).toBe(null);
    expect(g.tick(T.longPress + 1)).toBe('sugar');
    for (let t = T.longPress + 20; t < 3000; t += 16) expect(g.tick(t)).toBe(null);
    expect(g.up(1, 80, 80, 3000)).toBe(null);
  });

  it('still fires if the finger lifts after the threshold before a frame noticed', () => {
    const g = createGestures();
    g.down(1, 80, 80, 0);
    expect(g.up(1, 80, 80, T.longPress + 5)).toBe('sugar');
  });

  it('is not set off by a tap, or by a press that is let go a little early', () => {
    const g = createGestures();
    expect(tap(g, 1, 10, 10, 0, 120)).toEqual([]);
    g.down(2, 300, 300, 2000); // somewhere else, later: a fresh press
    expect(g.tick(2000 + T.longPress - 60)).toBe(null);
    expect(g.up(2, 300, 300, 2000 + T.longPress - 50)).toBe(null);
  });

  it('is not set off by a drag', () => {
    const g = createGestures();
    g.down(1, 80, 80, 0);
    g.move(1, 80 + T.moveSlop + 4, 80);
    expect(g.tick(T.longPress + 50)).toBe(null);
  });

  it('never turns the second touch of a double tap into sugar, even if it is held', () => {
    const g = createGestures();
    tap(g, 1, 40, 40, 0);
    expect(g.down(2, 40, 40, 150)).toBe('milk');
    expect(g.tick(150 + T.longPress + 100)).toBe(null);
    expect(g.up(2, 40, 40, 150 + T.longPress + 200)).toBe(null);
  });

  it('follows one finger at a time', () => {
    const g = createGestures();
    g.down(1, 40, 40, 0);
    expect(g.down(2, 200, 200, 20)).toBe(null); // a second finger is ignored
    expect(g.up(2, 200, 200, 80)).toBe(null);
    expect(g.tick(T.longPress)).toBe('sugar');
  });

  it('forgets everything on reset, so nothing carries into another part of the game', () => {
    const g = createGestures();
    tap(g, 1, 40, 40, 0);
    g.reset();
    expect(g.down(2, 40, 40, 100)).toBe(null);
    g.reset();
    expect(g.tick(100 + T.longPress)).toBe(null);
  });
});

describe('control settings', () => {
  const memory = (value) => {
    const data = new Map(value ? [[SETTINGS_KEY, JSON.stringify(value)]] : []);
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data };
  };

  it('starts touch screens on Easy Touch with Auto Steam, and everything else Classic with manual steam', () => {
    expect(initialSettings({ touchDevice: true })).toEqual({ touch: 'easy', autoSteam: true });
    expect(initialSettings({ touchDevice: false })).toEqual({ touch: 'classic', autoSteam: false });
  });

  it('remembers a choice, and lets the address bar override it for one visit', () => {
    const storage = memory({ touch: 'classic', autoSteam: true });
    expect(initialSettings({ storage, touchDevice: true })).toEqual({ touch: 'classic', autoSteam: true });
    const params = new URLSearchParams('touch=easy');
    expect(initialSettings({ params, storage })).toEqual({ touch: 'easy', autoSteam: true });
    expect(initialSettings({ params: new URLSearchParams('touch=classic&autosteam=on') })).toEqual({ touch: 'classic', autoSteam: true });
    expect(initialSettings({ params: new URLSearchParams('autosteam=off'), touchDevice: true })).toEqual({ touch: 'easy', autoSteam: true });
  });

  it('always pairs Easy Touch with Auto Steam (it has no steam button), but lets Classic Touch have it either way', () => {
    expect(normalize({ touch: 'easy', autoSteam: false })).toEqual({ touch: 'easy', autoSteam: true });
    expect(normalize({ touch: 'classic', autoSteam: true })).toEqual({ touch: 'classic', autoSteam: true });
    expect(normalize({ touch: 'nonsense', autoSteam: 0 })).toEqual({ touch: 'classic', autoSteam: false });
  });

  it('survives storage that is missing, broken, or full', () => {
    expect(initialSettings({ storage: { getItem: () => '{not json' } })).toEqual({ touch: 'classic', autoSteam: false });
    expect(initialSettings({ storage: { getItem: () => { throw new Error('denied'); } } })).toEqual({ touch: 'classic', autoSteam: false });
    expect(() => saveSettings({ setItem: () => { throw new Error('full'); } }, { touch: 'easy' })).not.toThrow();
    const storage = memory();
    saveSettings(storage, { touch: 'easy', autoSteam: false });
    expect(JSON.parse(storage.data.get(SETTINGS_KEY))).toEqual({ touch: 'easy', autoSteam: true });
  });
});
