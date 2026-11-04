import { expect } from './fixtures.js';

/** The ambient layer's read-only debug state. */
export const ambientState = (page) => page.evaluate(() => window.__TEACUP__.ambient.snapshot());

/** Bring the next visit forward (space and policy still apply) and wait for the ant. */
export async function summonAnt(page, state = /entering|wandering|paused/) {
  await page.evaluate(() => window.__TEACUP__.ambient.summon());
  await expect.poll(async () => (await ambientState(page)).state, { timeout: 15_000 }).toMatch(state);
}

/**
 * Sample the visitor for a while and return every footprint that overlapped
 * a protected element: the game canvas, the HUD, panels and every button.
 */
export function protectedOverlaps(page, { samples = 30, interval = 100 } = {}) {
  return page.evaluate(async ({ samples, interval }) => {
    const ambient = window.__TEACUP__.ambient;
    const stage = document.querySelector('.stage');
    const guarded = [...document.querySelectorAll('#game, .hud-top, #readingPresentation, .upgrade-offer, button, select, #upgradeAcknowledgment')];
    const hits = [];
    let seen = 0;
    for (let i = 0; i < samples; i++) {
      const s = ambient.snapshot();
      if (s.state !== 'absent' && !s.hidden) {
        seen++;
        const host = stage.getBoundingClientRect();
        const r = 9; // AMBIENT.footprint
        const ant = { left: host.left + s.x - r, right: host.left + s.x + r, top: host.top + s.y - r, bottom: host.top + s.y + r };
        for (const element of guarded) {
          const b = element.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          if (ant.left < b.right && b.left < ant.right && ant.top < b.bottom && b.top < ant.bottom) {
            hits.push(`${element.id || element.className || element.tagName} at ${Math.round(s.x)},${Math.round(s.y)}`);
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return { seen, hits };
  }, { samples, interval });
}
