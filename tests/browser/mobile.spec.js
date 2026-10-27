import { expect, gameState, openGame, test } from './fixtures.js';

test('is playable with touch controls on a phone-sized screen', async ({ page, problems }) => {
  await openGame(page);

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    canvasWidth: document.getElementById('game').getBoundingClientRect().width,
  }));
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.canvasWidth).toBeGreaterThan(250);
  await expect(page.locator('.controls-mobile')).toBeVisible();

  await page.locator('#mainBtn').tap();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

  // Hold TURN ▶ with a pointer, then release it.
  const turn = page.locator('[data-hold="right"]');
  const start = (await gameState(page)).angle;
  await turn.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(300);
  await turn.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  const turned = (await gameState(page)).angle;
  expect(turned).not.toBeCloseTo(start, 2);
  await page.waitForTimeout(200);
  expect((await gameState(page)).angle).toBeCloseTo(turned, 5); // released

  // A cancelled pointer also releases the hold.
  await turn.dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch', isPrimary: true });
  await turn.dispatchEvent('pointercancel', { pointerId: 8, pointerType: 'touch', isPrimary: true });
  const cancelled = (await gameState(page)).angle;
  await page.waitForTimeout(200);
  expect((await gameState(page)).angle).toBeCloseTo(cancelled, 5);

  const steam = page.locator('[data-hold="fire"]');
  await steam.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true });
  await steam.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true });
  await expect.poll(async () => (await gameState(page)).shots).toBeGreaterThan(0);

  await page.locator('#milkBtn').tap();
  await expect(page.locator('#milkCount')).toHaveText('1');
  await page.locator('#sugarBtn').tap();
  await expect(page.locator('#sugarCount')).toHaveText('1');

  // Finish the round on the spot and pick an upgrade with a tap.
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    s.kills = s.target - 1;
    s.shots.push({ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false });
    s.enemies.push({ angle: s.angle, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 });
  });
  await expect(page.locator('#upgradeOffer')).toBeVisible({ timeout: 10_000 });
  await page.locator('.upgrade-card').first().tap();
  await expect(page.locator('#roundNum')).toHaveText('02');
  await expect(page.locator('#spoonKit')).not.toHaveText('An ordinary silver spoon.');
  expect(problems).toEqual([]);
});
