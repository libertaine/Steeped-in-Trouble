import { expect } from './fixtures.js';

/** Checkpoint the final cup, then let a real combat collision finish it. */
export async function toDayReading(page, { round = 10, encounter = null } = {}) {
  await page.locator('#mainBtn').click();
  await page.evaluate(([r, adventure]) => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { round: r, heat: Math.min(28, r - 1), target: 32, kills: 31,
      progress: { chapter: 2, starts: [1, 6] }, grindAfter: null, lastGrind: r,
      havocAfter: null, lastHavoc: r, shortageAfter: 1000, spawnTimer: Infinity, current: null });
    s.arcade.after.dailyPour = adventure === 'dailyPour' ? r : r + 2;
    s.arcade.after.biscuitBreakout = r + 9;
    s.modifiers = { ...s.modifiers, laneDrift: false };
    s.enemies = [{ kind: 'leaf', angle: s.angle, radius: 120, home: 40, speed: 0,
      wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 }];
    s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  }, [round, encounter]);
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    game.state.nextFortune = 'karma';
    game.update(5);
  });
  await expect(page.locator('#mainBtn')).toBeVisible();
  await page.locator('#mainBtn').click();
}

export async function expectDayButtons(page) {
  await expect(page.locator('#dayOffer')).toBeVisible();
  const offer = await page.locator('#dayOffer').boundingBox();
  const viewport = page.viewportSize();
  expect(offer.y).toBeGreaterThanOrEqual(0);
  expect(offer.y + offer.height).toBeLessThanOrEqual(viewport.height);
  for (const choice of ['fresh', 'keep']) {
    const button = page.locator(`[data-day="${choice}"]`);
    await expect(button).toBeInViewport();
    const b = await button.boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

export async function daySnapshot(page, name) {
  await page.screenshot({ path: `docs/images/days/${name}.png`, fullPage: true, scale: 'css' });
}
