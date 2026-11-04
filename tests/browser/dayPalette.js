import { expect } from './fixtures.js';
import { DAY_PALETTES } from '../../src/ui/dayPalette.js';

// Day palettes are read as stable theme state: the body's data-day-palette and
// the computed (registered) --day-* colours, never as whole-page screenshots.

export const POT_KEY = 'steeped-in-trouble:pot-save';

export const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

/** What the page ground is showing now. */
export const ground = (page) => page.evaluate(() => {
  const css = getComputedStyle(document.body);
  return {
    id: document.body.dataset.dayPalette, fade: document.body.dataset.dayFade ?? null,
    glow: css.getPropertyValue('--day-glow').trim(), mid: css.getPropertyValue('--day-mid').trim(),
    deep: css.getPropertyValue('--day-deep').trim(), paper: css.getPropertyValue('--day-paper').trim(),
    image: css.backgroundImage, rule: getComputedStyle(document.querySelector('header')).borderBottomColor,
  };
});

export async function expectPalette(page, day, { fade = null } = {}) {
  const p = DAY_PALETTES[(day - 1) % 7];
  await expect.poll(async () => {
    const g = await ground(page);
    return { id: g.id, glow: g.glow, mid: g.mid, deep: g.deep, paper: g.paper };
  }).toEqual({ id: p.id, glow: rgb(p.glow), mid: rgb(p.mid), deep: rgb(p.deep), paper: rgb(p.paper) });
  const g = await ground(page);
  expect(g.fade).toBe(fade);
  for (const key of ['glow', 'mid', 'deep']) expect(g.image).toContain(rgb(p[key]));
}

/** Colours the palette must never reach: arena, HUD, panels, buttons and the title label. */
export const fixedColours = (page) => page.evaluate(() => {
  const style = (selector, ...props) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const css = getComputedStyle(el);
    return props.map((p) => css[p]).join(' | ');
  };
  return {
    playfield: style('.playfield', 'backgroundImage', 'borderColor', 'boxShadow'),
    panel: style('.panel', 'backgroundImage', 'borderColor', 'color'),
    button: style('#mainBtn', 'backgroundColor', 'color', 'borderColor'),
    pill: style('#hudDay', 'color', 'borderColor', 'backgroundColor'),
    brand: style('.brand', 'color'),
    teaBreak: style('#teaBreak', 'backgroundColor', 'color'),
    splash: style('#arcadeSplash', 'backgroundColor', 'backgroundImage'),
    label: style('.splash-content', 'backgroundColor', 'borderColor', 'color'),
  };
});

/** Put the running cup on a Day without playing through it: the HUD and palette read the same round. */
export const toDay = (page, day) => page.evaluate((d) => {
  const g = window.__TEACUP__.game;
  if (g.state.phase === 'ready') g.primaryAction();
  Object.assign(g.state, { round: 1 + 10 * (d - 1), spawnTimer: Infinity, current: null });
}, day);

/**
 * Finish a real cup at `round` so the game saves a genuine checkpoint there
 * (the same finishing collision as days.js, with a consistent tea history).
 */
export async function saveAt(page, round) {
  await page.locator('#mainBtn').click();
  await page.evaluate((r) => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { round: r, heat: Math.min(28, r - 1), target: 32, kills: 31,
      progress: { chapter: 2, starts: [1, 6] }, grindAfter: null, lastGrind: r,
      havocAfter: null, lastHavoc: r, shortageAfter: 1000, spawnTimer: 1e6, current: null,
      teaServed: { [s.tea]: r } });
    for (const id of Object.keys(s.arcade.after)) s.arcade.after[id] = r + 5;
    s.modifiers = { ...s.modifiers, laneDrift: false };
    s.enemies = [{ kind: 'leaf', angle: s.angle, radius: 120, home: 40, speed: 0,
      wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 }];
    s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  }, round);
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state.round, POT_KEY)).toBe(round);
}
