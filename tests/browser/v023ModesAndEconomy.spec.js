import { expect, openGame, test } from './fixtures.js';

test('supports Chill and Arcade modes, enforces Auto Steam rules, and displays mode records', async ({ page, problems }) => {
  await openGame(page, '&mode=arcade&seed=10');
  await expect(page.locator('#hudMode')).toHaveText('ARCADE MODE');

  // In Arcade Mode, Auto Steam is disabled in the Tea Break menu.
  await page.locator('#menuBtn').click();
  await expect(page.locator('#teaBreak')).toBeVisible();
  await page.locator('#teaBreak details').nth(3).locator('summary').click();
  await expect(page.locator('#autoSteamBtn')).toBeDisabled();
  await expect(page.locator('#autoSteamBtn')).toHaveText('Auto Steam: off (Arcade)');
  await expect(page.locator('#modeBtn')).toHaveText('Mode: Arcade');
  await page.locator('#closeBreak').click();

  // Open Chill Mode via URL preference and verify Auto Steam can be toggled.
  await openGame(page, '&mode=chill&seed=10');
  await expect(page.locator('#hudMode')).toHaveText('CHILL MODE');
  await page.locator('#menuBtn').click();
  await expect(page.locator('#teaBreak')).toBeVisible();
  await page.locator('#teaBreak details').nth(3).locator('summary').click();
  await expect(page.locator('#autoSteamBtn')).toBeEnabled();
  await expect(page.locator('#modeBtn')).toHaveText('Mode: Chill');
  await page.locator('#autoSteamBtn').click();
  await expect(page.locator('#autoSteamBtn')).toHaveText('Auto Steam: on');
  await page.locator('#closeBreak').click();

  expect(problems).toEqual([]);
});

test('fires 7-lane sugar, carries scarce supplies into reading, and purchases refills with Tea Cash', async ({ page, problems }) => {
  await openGame(page, '&mode=arcade&seed=15');
  await page.keyboard.press('Enter');

  await expect(page.locator('#milkCount')).toHaveText('2');
  await expect(page.locator('#sugarCount')).toHaveText('1');

  // Fire 7-lane sugar and pour 1 milk.
  await page.keyboard.press('q');
  await expect(page.locator('#milkCount')).toHaveText('1');
  await page.keyboard.press('s');
  await expect(page.locator('#sugarCount')).toHaveText('0');
  const sugarShots = await page.evaluate(() => window.__TEACUP__.game.state.shots.filter((s) => s.sugar).length);
  expect(sugarShots).toBe(7);

  // Finish round 1 and enter reading with 40 Tea Cash.
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    s.teaCash = 35;
    s.kills = s.target - 1;
    s.enemies.push({ angle: -Math.PI / 2, radius: 200, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 });
    s.angle = -Math.PI / 2;
    s.shotCooldown = 0;
    game.fireSteam();
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  // Before the restock bar is available, the real key handlers sell nothing. One synchronous
  // evaluation rewinds the reading clock, so no frame can open the bar in between.
  expect(await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.readingTime = 0;
    for (const code of ['KeyQ', 'KeyE', 'KeyB', 'KeyN']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    }
    return [s.teaCash, s.milkLeft, s.sugarLeft, document.getElementById('restockOffer').hidden];
  })).toEqual([40, 1, 0, true]);
  await expect(page.locator('#restockOffer')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#restockCash')).toHaveText('Cash: 40');

  // Q stays a Milk pour (nothing to pour at a reading), never a purchase.
  await page.keyboard.press('q');
  await expect(page.locator('#restockCash')).toHaveText('Cash: 40');
  await expect(page.locator('#milkCount')).toHaveText('1');

  // Buy 1 Milk (10 Tea Cash) with B and 1 Sugar (25 Tea Cash) via button click.
  await page.keyboard.press('b');
  await expect(page.locator('#restockCash')).toHaveText('Cash: 30');
  await expect(page.locator('#milkCount')).toHaveText('2');

  await page.locator('[data-supply="sugar"]').click();
  await expect(page.locator('#restockCash')).toHaveText('Cash: 5');
  await expect(page.locator('#sugarCount')).toHaveText('1');
  await expect(page.locator('[data-supply="milk"]')).toBeDisabled();
  await expect(page.locator('[data-supply="sugar"]')).toBeDisabled();

  expect(problems).toEqual([]);
});
