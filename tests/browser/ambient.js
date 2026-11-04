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
 * Sample the colony for a while and return every ant footprint that
 * overlapped a protected element (the game canvas, the HUD, panels and every
 * button), the most ants seen at once, and the nearest two ants ever came.
 */
export function protectedOverlaps(page, { samples = 30, interval = 100 } = {}) {
  return page.evaluate(async ({ samples, interval }) => {
    const ambient = window.__TEACUP__.ambient;
    const stage = document.querySelector('.stage');
    const guarded = [...document.querySelectorAll('#game, .hud-top, #readingPresentation, .upgrade-offer, button, select, #upgradeAcknowledgment')];
    const hits = [];
    let seen = 0, most = 0, nearest = Infinity;
    for (let i = 0; i < samples; i++) {
      const s = ambient.snapshot();
      const ants = s.hidden ? [] : s.ants;
      if (ants.length) seen++;
      most = Math.max(most, ants.length);
      const host = stage.getBoundingClientRect();
      const r = 9; // AMBIENT.footprint
      for (const [k, a] of ants.entries()) {
        for (const b of ants.slice(k + 1)) nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y));
        const ant = { left: host.left + a.x - r, right: host.left + a.x + r, top: host.top + a.y - r, bottom: host.top + a.y + r };
        for (const element of guarded) {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          if (ant.left < box.right && box.left < ant.right && ant.top < box.bottom && box.top < ant.bottom) {
            hits.push(`${element.id || element.className || element.tagName} at ${Math.round(a.x)},${Math.round(a.y)}`);
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return { seen, most, nearest, hits };
  }, { samples, interval });
}
