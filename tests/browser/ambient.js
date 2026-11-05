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
 * Wait until a sugar-cube procession is in one of `phases` ('gather', 'lift',
 * 'carry', 'turn'), asking again through the debug hook whenever none is
 * about and keeping the colony topped up (a team needs free ants in one
 * gutter, and room for any newcomers). Never waits on a single try.
 */
export async function cubeIn(page, phases, { size = null, timeout = 90_000 } = {}) {
  await expect.poll(() => page.evaluate(({ wanted, size }) => {
    const a = window.__TEACUP__.ambient;
    const s = a.snapshot();
    if (!s.cube) {
      if (s.count < 3) a.summon(6);
      a.sweeten({ size });
    }
    return wanted.includes(s.cube?.phase);
  }, { wanted: phases, size }), { timeout, intervals: [250] }).toBe(true);
}

/**
 * Sample the colony for a while and return every ant (or crumb, or sugar
 * cube, or the whole reach of its procession) footprint that overlapped a
 * protected element (the game canvas, the HUD, panels and every button),
 * the most ants seen at once, the nearest two ants ever came (carriers of
 * one cube apart: they hold it together), how often a crumb was seen lying
 * or carried, and how often a cube was seen.
 */
export function protectedOverlaps(page, { samples = 30, interval = 100 } = {}) {
  return page.evaluate(async ({ samples, interval }) => {
    const ambient = window.__TEACUP__.ambient;
    const stage = document.querySelector('.stage');
    const guarded = [...document.querySelectorAll('#game, .hud-top, #readingPresentation, .upgrade-offer, button, select, #upgradeAcknowledgment')];
    const hits = [];
    let seen = 0, most = 0, nearest = Infinity, cubes = 0;
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
      // The cube as one more footprint (AMBIENT.cube.radius), and its procession's whole reach as another.
      const cube = s.hidden || !s.cube ? [] : [{ x: s.cube.x, y: s.cube.y, r: s.cube.radius, crumb: true, what: 'cube' },
        ...(s.cube.phase === 'fade' || s.cube.exiting ? [] : [{ x: s.cube.x, y: s.cube.y, r: s.cube.reach, crumb: true, what: 'procession' }])];
      if (cube.length) cubes++;
      const team = s.cube && s.cube.phase !== 'fade' ? s.cube.members : [];
      for (const [k, a] of [...ants.map((ant) => ({ ...ant, r })), ...crumb, ...cube].entries()) {
        if (!a.crumb) {
          for (const b of ants.slice(k + 1)) {
            if (team.includes(a.slot) && team.includes(b.slot)) continue;
            nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y));
          }
        }
        const ant = { left: host.left + a.x - a.r, right: host.left + a.x + a.r, top: host.top + a.y - a.r, bottom: host.top + a.y + a.r };
        for (const element of guarded) {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          if (ant.left < box.right && box.left < ant.right && ant.top < box.bottom && box.top < ant.bottom) {
            hits.push(`${a.what ?? (a.crumb ? 'crumb' : 'ant')} on ${element.id || element.className || element.tagName} at ${Math.round(a.x)},${Math.round(a.y)}`);
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return { seen, most, nearest, hits, crumbs, cubes };
  }, { samples, interval });
}
