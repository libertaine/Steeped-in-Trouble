import { expect } from './fixtures.js';

/** Reach the offer through a real finishing dart and the existing reading. */
export async function toPaperOffer(page) {
  await page.locator('#mainBtn').click();
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    Object.assign(s, { round: 12, progress: { chapter: 2, starts: [1, 6] }, grindAfter: null,
      lastGrind: 12, havocAfter: null, lastHavoc: 12, shortageAfter: 16,
      kills: s.target - 1, spawnTimer: Infinity, current: null });
    s.enemies = [{ kind: 'leaf', angle: s.angle, radius: 120, home: 40, speed: 0,
      wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 }];
    s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.waitForFunction(() => window.__TEACUP__.game.state.readingTime > 3.5);
  await page.locator('#mainBtn').click();
  await expect(page.locator('#arcadeOffer')).toBeVisible();
}

export async function advancePaperRoute(page, at) {
  await page.evaluate((target) => {
    const { game } = window.__TEACUP__;
    while (game.state.dailyPour.clock < target - 1e-9) game.update(Math.min(1 / 120, target - game.state.dailyPour.clock));
  }, at);
}

/** Exact input times through the actual keyboard listeners, never award data. */
export async function perfectPaperRoute(page) {
  await page.evaluate(() => {
    const { game, config } = window.__TEACUP__;
    const m = game.state.dailyPour;
    const key = (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };
    for (const h of m.houses.filter((h) => h.subscriber)) {
      const at = (h.x - config.dailyPour.targets[h.aim].ahead) / config.dailyPour.speed;
      while (m.clock < at - 1e-9) game.update(Math.min(1 / 120, at - m.clock));
      key(h.aim === 'near' ? 'ArrowDown' : 'ArrowUp'); key('Space');
    }
    for (let i = 0; i < 6000 && m.stage !== 'outro'; i++) game.update(1 / 120);
  });
  await expect(page.locator('#roundTitle')).toHaveText('DELIVERY OF THE CENTURY!');
}

export async function expectPourControls(page) {
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'pour');
  await expect(page.locator('.controls-classic')).toBeHidden();
  await expect(page.locator('.controls-easy')).toBeHidden();
  await expect(page.locator('.controls-run')).toBeHidden();
  for (const id of ['hudTea', 'hudOmen', 'hudStrainer', 'hudAuto']) await expect(page.locator('#' + id)).toBeHidden();
  for (const action of ['aimPaper', 'throwPaper']) {
    const button = page.locator(`[data-paper="${action}"]`);
    await expect(button).toBeVisible();
    const b = await button.boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** Route clock at which the bystander starts speaking, from the shipped config. */
export const remarkStart = (page) => page.evaluate(() => {
  const { pedestrian, speed } = window.__TEACUP__.config.dailyPour;
  return pedestrian.x / speed - pedestrian.notice;
});

/** Reads drawn pixels: is the speech bubble's fill above the bystander? */
export async function bubbleShown(page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.evaluate(() => {
    const { game, config } = window.__TEACUP__;
    const P = config.dailyPour;
    const canvas = document.getElementById('game');
    const sx = canvas.width / config.arena.width;
    const sy = canvas.height / config.arena.height;
    const x = Math.max(14, P.riderX + P.pedestrian.x - game.state.dailyPour.distance);
    const { data } = canvas.getContext('2d').getImageData(Math.round(x * sx), Math.round(240 * sy), 1, Math.round(165 * sy));
    for (let i = 0; i < data.length; i += 4) if (data[i] === 255 && data[i + 1] === 250 && data[i + 2] === 240) return true;
    return false;
  });
}
