import { expect } from './fixtures.js';

/** The ambient layer's read-only debug state. */
export const ambientState = (page) => page.evaluate(() => window.__TEACUP__.ambient.snapshot());

/** Bring `n` visits forward (space and policy still apply) and wait until that many ants are out. */
export async function summonAnts(page, n = 1, { settled = false } = {}) {
  await page.evaluate((count) => window.__TEACUP__.ambient.summon(count), n);
  await expect.poll(async () => {
    const s = await ambientState(page);
    return s.ants.filter((a) => !settled || a.state === 'wandering' || a.state === 'paused').length;
  }, { timeout: 20_000 }).toBeGreaterThanOrEqual(n);
}

/**
 * Wait until the crumb is in one of `states` ('lying', 'carried'), asking
 * again through the debug hook whenever none is about (an unnoticed crumb
 * fades away) and keeping the colony topped up, since ants go home after a
 * while. Noticing a crumb is left to chance; this never waits on one try.
 */
export async function crumbIn(page, states, { timeout = 60_000 } = {}) {
  await expect.poll(() => page.evaluate((wanted) => {
    const a = window.__TEACUP__.ambient;
    const s = a.snapshot();
    if (s.count < 4) a.summon(6);
    if (!s.crumb) a.crumble();
    return wanted.includes(s.crumb?.state);
  }, states), { timeout, intervals: [250] }).toBe(true);
}

/**
 * Sample the colony for a while and return every ant (or crumb) footprint
 * that overlapped a protected element (the game canvas, the HUD, panels and
 * every button), the most ants seen at once, the nearest two ants ever came,
 * and how often a crumb was seen lying or carried.
 */
export function protectedOverlaps(page, { samples = 30, interval = 100 } = {}) {
  return page.evaluate(async ({ samples, interval }) => {
    const ambient = window.__TEACUP__.ambient;
    const stage = document.querySelector('.stage');
    const guarded = [...document.querySelectorAll('#game, .hud-top, #readingPresentation, .upgrade-offer, button, select, #upgradeAcknowledgment')];
    const hits = [];
    let seen = 0, most = 0, nearest = Infinity;
    const crumbs = { lying: 0, carried: 0 };
    for (let i = 0; i < samples; i++) {
      const s = ambient.snapshot();
      const ants = s.hidden ? [] : s.ants;
      if (ants.length) seen++;
      most = Math.max(most, ants.length);
      const host = stage.getBoundingClientRect();
      const r = 9; // AMBIENT.footprint
      // The crumb as one more footprint, of its own radius (AMBIENT.crumb.radius).
      const crumb = s.hidden || !s.crumb ? [] : [{ ...s.crumb, r: 2.4, crumb: true }];
      if (crumb.length) crumbs[s.crumb.state]++;
      for (const [k, a] of [...ants.map((ant) => ({ ...ant, r })), ...crumb].entries()) {
        if (!a.crumb) for (const b of ants.slice(k + 1)) nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y));
        const ant = { left: host.left + a.x - a.r, right: host.left + a.x + a.r, top: host.top + a.y - a.r, bottom: host.top + a.y + a.r };
        for (const element of guarded) {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          if (ant.left < box.right && box.left < ant.right && ant.top < box.bottom && box.top < ant.bottom) {
            hits.push(`${a.crumb ? 'crumb' : 'ant'} on ${element.id || element.className || element.tagName} at ${Math.round(a.x)},${Math.round(a.y)}`);
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return { seen, most, nearest, hits, crumbs };
  }, { samples, interval });
}
