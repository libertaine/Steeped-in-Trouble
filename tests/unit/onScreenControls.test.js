import { describe, expect, it } from 'vitest';
import { hasPrimaryTouch, initialOnScreenControls, ONSCREEN_KEY, saveOnScreenControls, SETTINGS_KEY, VIEW_KEY } from '../../src/input/settings.js';
import { touchSummary } from '../../src/ui/instructionOverlay.js';

describe('on-screen control preference', () => {
  it.each(['auto', 'show', 'hide'])('restores and saves %s without changing existing preferences', value => {
    const data = new Map([[VIEW_KEY, 'compact'], [SETTINGS_KEY, '{"touch":"easy","autoSteam":true}']]);
    const storage = { getItem: key => data.get(key), setItem: (key, v) => data.set(key, v) };
    const before = [...data];
    saveOnScreenControls(storage, value);
    expect(initialOnScreenControls(storage)).toBe(value);
    expect([...data].slice(0, 2)).toEqual(before);
    expect(data.get(ONSCREEN_KEY)).toBe(value);
  });

  it.each([null, '', 'SHOW', 'false', '{"value":"show"}', 'null'])('defaults safely with malformed preference %s', value => {
    expect(initialOnScreenControls({ getItem: () => value })).toBe('auto');
  });

  it('works without storage and tolerates denied reads/writes', () => {
    const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } };
    expect(initialOnScreenControls()).toBe('auto');
    expect(initialOnScreenControls(denied)).toBe('auto');
    expect(() => saveOnScreenControls(denied, 'hide')).not.toThrow();
    expect(() => saveOnScreenControls()).not.toThrow();
  });

  it.each([
    ['touch phone', ['(pointer: coarse)'], 5, true],
    ['mouse desktop', ['(pointer: fine)'], 0, false],
    ['touchscreen laptop', ['(pointer: fine)', '(any-pointer: coarse)'], 10, false],
    ['no primary pointer', ['(pointer: none)'], 10, false],
    ['older mixed-pointer browser', ['(any-pointer: fine)'], 10, false],
    ['unrecognized media query with touch fallback', [], 5, true],
    ['unrecognized media query without touch', [], 0, false],
  ])('uses primary capability for %s', (_label, queries, maxTouchPoints, expected) => {
    expect(hasPrimaryTouch({ matchMedia: q => ({ matches: queries.includes(q) }), navigator: { maxTouchPoints } })).toBe(expected);
  });

  it('uses a conservative fallback without matchMedia', () => {
    expect(hasPrimaryTouch({ navigator: { maxTouchPoints: 2 } })).toBe(true);
    expect(hasPrimaryTouch({ matchMedia() { throw Error('unsupported'); }, navigator: { maxTouchPoints: 2 } })).toBe(true);
    expect(hasPrimaryTouch({})).toBe(false);
  });

  it('explains hidden controls without claiming steering gestures exist', () => {
    const classic = touchSummary({ scheme: 'classic', autoSteam: false, visible: false });
    expect(classic.label).toContain('hidden');
    expect(classic.text).toContain('keyboard');
    expect(classic.text).toContain('choose Show');
    const easy = touchSummary({ scheme: 'easy', autoSteam: true, visible: false });
    expect(easy.text).toContain('cup gestures still work');
    expect(easy.text).toContain('Auto Steam is on');
  });
});
