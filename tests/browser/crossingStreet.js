// Shared steps for the Crossing the Street browser tests. The production
// build has no development helpers, so a cautious route is planned here, in
// the test process, from the live road, then hopped through the real game.
import { expect } from './fixtures.js';
import { CONFIG } from '../../src/config.js';
import { planCrossing } from '../../src/gameplay/crossingStreet.js';

const C = CONFIG.crossingStreet;

/**
 * Reach a crossing offer through a real finishing dart and the existing
 * reading. The other two adventures are dated later, so this is the one due.
 */
export async function toCrossingOffer(page, { round = 27, heat } = {}) {
  await page.locator('#mainBtn').click();
  await page.evaluate(([r, h]) => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { round: r, progress: { chapter: 2, starts: [1, 6] }, grindAfter: null,
      lastGrind: r, havocAfter: null, lastHavoc: r, shortageAfter: 1000,
      kills: s.target - 1, spawnTimer: Infinity, current: null });
    if (h !== null) s.heat = h;
    Object.assign(s.arcade.after, { dailyPour: r + 3, biscuitBreakout: r + 6, crossingStreet: r });
    s.modifiers = { ...s.modifiers, laneDrift: false };
    s.enemies = [{ kind: 'leaf', angle: s.angle, radius: 120, home: 40, speed: 0,
      wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 }];
    s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  }, [round, heat ?? null]);
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.waitForFunction(() => window.__TEACUP__.game.state.readingTime > 3.5);
  await page.evaluate(() => { window.__TEACUP__.game.state.offer = null; });
  await page.locator('#mainBtn').click();
  await expect(page.locator('#arcadeOffer')).toBeVisible();
  await expect(page.locator('#arcadeTitle')).toHaveText('WHY DID THE SPOON CROSS THE ROAD?');
}

export const street = (page) => page.evaluate(() => structuredClone(window.__TEACUP__.game.state.crossingStreet));

/** Advance the mission's own clock in fixed ticks with held directions, from inside the page. */
export async function advanceStreet(page, seconds, walk = {}) {
  await page.evaluate(([s, held]) => {
    const { game } = window.__TEACUP__;
    const input = { up: false, down: false, left: false, right: false, ...held };
    for (let i = 0; i < Math.round(s * 120); i++) game.update(1 / 120, undefined, input);
  }, [seconds, walk]);
}

/**
 * A collision-free crossing from where the spoon stands: the page is paused
 * while the route is planned, then each hop is pressed on its planned tick.
 */
export async function crossSafely(page) {
  await page.evaluate(() => window.__TEACUP__.game.pause());
  const m = await street(page);
  const moves = planCrossing(m.lanes, (m.ticks + 1) / 120, { col: m.spoon.col, row: m.spoon.row });
  expect(moves).not.toBeNull();
  await page.evaluate(([list, every]) => {
    const { game } = window.__TEACUP__;
    game.resume();
    for (const move of list) {
      if (move !== 'wait') game.hop(move);
      for (let i = 0; i < every; i++) game.update(1 / 120);
    }
  }, [moves, Math.round(C.repeat * 120)]);
  return moves;
}

/** Put a car right on the spoon in its lane, so the real collision check bumps it; then let it get up. */
export async function bumpSpoon(page, { getUp = true } = {}) {
  await page.evaluate(() => {
    const { game, config } = window.__TEACUP__;
    const m = game.state.crossingStreet;
    const P = config.crossingStreet;
    if (m.spoon.row === 0) {
      for (const l of m.lanes) if (l.row === 1) l.vehicles = [];
      game.hop('up');
      for (let i = 0; i < 16; i++) game.update(1 / 120);
    }
    const lane = m.lanes.find((l) => l.row === m.spoon.row);
    const x = P.left + (m.spoon.col + 0.5) * P.column;
    const t = (m.ticks + 1) / 120;
    lane.vehicles.push({ id: 99, kind: 'car', length: 92, halfHeight: 19, paint: 0, x, offset: x - lane.dir * lane.speed * t });
    game.update(1 / 120);
  });
  if (getUp) await advanceStreet(page, C.stumble + C.respawnFreeze + 0.05);
}

/** Clear the first lane, so up and down hops on the near side are always safe. */
export async function clearFirstLane(page) {
  await page.evaluate(() => {
    for (const l of window.__TEACUP__.game.state.crossingStreet.lanes) if (l.row === 1) l.vehicles = [];
  });
}

export async function expectCrossingPad(page) {
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'crossing');
  for (const hidden of ['.controls-classic', '.controls-easy', '.controls-run', '.controls-pour', '.controls-breakout']) {
    await expect(page.locator(hidden)).toBeHidden();
  }
  for (const id of ['hudTea', 'hudOmen', 'hudStrainer', 'hudAuto']) await expect(page.locator('#' + id)).toBeHidden();
  const pads = page.locator('.controls-crossing button');
  await expect(pads).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const button = pads.nth(i);
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport();
    const b = await button.boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
