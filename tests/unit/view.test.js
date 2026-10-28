import { describe, expect, it } from 'vitest';
import { initialView, isTouchDevice, saveView, VIEW_KEY } from '../../src/input/settings.js';

describe('presentation preferences independent of controls', () => {
  it.each([
    [true, 'compact'], [false, 'full'],
  ])('defaults by touch capability %s', (touchDevice, expected) => {
    expect(initialView({ touchDevice })).toBe(expected);
  });

  it.each(['compact', 'full'])('restores %s and accepts a visit override', (view) => {
    const storage = { getItem: (key) => key === VIEW_KEY ? view : null };
    expect(initialView({ storage, touchDevice: view === 'full' })).toBe(view);
    const other = view === 'full' ? 'compact' : 'full';
    expect(initialView({ storage, params: new URLSearchParams(`view=${other}`) })).toBe(other);
  });

  it('survives corrupt, denied, or full storage without touching control preferences', () => {
    expect(initialView({ storage: { getItem: () => 'broken' }, touchDevice: true })).toBe('compact');
    const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } };
    expect(initialView({ storage: denied })).toBe('full');
    expect(() => saveView(denied, 'compact')).not.toThrow();
    const writes = [];
    saveView({ setItem: (...args) => writes.push(args) }, 'compact');
    saveView({ setItem: (...args) => writes.push(args) }, 'invalid');
    expect(writes).toEqual([[VIEW_KEY, 'compact']]);
  });

  it.each([
    ['coarse primary', ['(pointer: coarse)'], 0, true],
    ['mixed pointers', ['(any-pointer: coarse)'], 0, true],
    ['desktop-site tablet', [], 5, true],
    ['mouse desktop', [], 0, false],
  ])('detects %s without a user agent or width cutoff', (_label, queries, maxTouchPoints, expected) => {
    expect(isTouchDevice({ matchMedia: (query) => ({ matches: queries.includes(query) }), navigator: { maxTouchPoints } })).toBe(expected);
  });
});
