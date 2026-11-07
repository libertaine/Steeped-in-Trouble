import { describe, expect, it } from 'vitest';
import { isTouchDevice } from '../../src/input/settings.js';

describe('touch control capabilities', () => {
  it.each([
    ['coarse primary', ['(pointer: coarse)'], 0, true],
    ['mixed pointers', ['(any-pointer: coarse)'], 0, true],
    ['desktop-site tablet', [], 5, true],
    ['mouse desktop', [], 0, false],
  ])('detects %s without a user agent or width cutoff', (_label, queries, maxTouchPoints, expected) => {
    expect(isTouchDevice({ matchMedia: (query) => ({ matches: queries.includes(query) }), navigator: { maxTouchPoints } })).toBe(expected);
  });
});
