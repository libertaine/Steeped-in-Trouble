import { test, expect, openGame } from './fixtures.js';
import { daySnapshot, expectDayButtons, toDayReading } from './days.js';

for (const [choice, key, heat, target] of [['fresh', '1', 0, 16], ['keep', '2', 10, 32]]) {
  test(`Day 2 ${choice}: deliberate keyboard choice, Karma and exactly one advance`, async ({ page, problems }, info) => {
    await openGame(page, '&seed=42&view=full');
    if (info.project.name === 'chromium') {
      await page.locator('#mainBtn').click();
      await daySnapshot(page, 'day-1-gameplay');
      await page.reload(); await page.waitForFunction(() => window.__TEACUP__?.game);
    }
    await toDayReading(page);
    await expectDayButtons(page);
    await expect(page.locator('#dayCompleted')).toContainText('Day 1 complete');
    await expect(page.locator('#fortuneName')).toHaveText('Karma');
    if (info.project.name === 'chromium') await daySnapshot(page, 'desktop-full-transition');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('p');
    await page.evaluate(() => window.__TEACUP__.game.update(1000));
    expect(await page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('day');
    // Menus, visibility changes and key repeats cannot choose tomorrow.
    await page.locator('#viewBtn').click(); // the Tea Break is the Compact View menu
    await page.locator('#menuBtn').click();
    await page.keyboard.press(key);
    await page.locator('#closeBreak').click();
    await page.locator('#viewBtn').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', repeat: true, bubbles: true }));
    });
    expect(await page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('day');
    await page.keyboard.press(key);
    await expect(page.locator('#dayOffer')).toBeHidden();
    await expect(page.locator('#hudDay')).toHaveText(`DAY 2 · CUP 1/10 · HEAT ${heat}`);
    expect(await page.evaluate(() => {
      const { round, heat, target, fortune, phase } = window.__TEACUP__.game.state;
      return { round, heat, target, fortune, phase };
    })).toEqual({ round: 11, heat, target, fortune: 'karma', phase: 'playing' });
    await page.locator(`[data-day="${choice}"]`).dispatchEvent('click');
    await page.keyboard.press(key);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.round)).toBe(11);
    await page.waitForTimeout(300);
    if (info.project.name === 'chromium') await daySnapshot(page, `${choice}-selection`);
    await page.waitForTimeout(2700);
    if (info.project.name === 'chromium') await daySnapshot(page, `day-2-${choice}`);
    // Development-only shortcuts must not be available in this production build.
    expect(await page.evaluate(() => typeof window.__TEACUP__.practiceDay)).toBe('undefined');
    expect(problems).toEqual([]);
  });
}

test('a scheduled paper route finishes before the Day 2 choice, then mouse selection works', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=compact');
  await toDayReading(page, { round: 20, encounter: 'dailyPour' });
  await expect(page.locator('#arcadeOffer')).toBeVisible();
  await expect(page.locator('#dayOffer')).toBeHidden();
  await page.locator('[data-interlude="accept"]').click();
  await page.locator('#mainBtn').click();
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    for (let i = 0; i < 35 * 120; i++) game.update(1 / 120);
  });
  await page.locator('#mainBtn').click();
  await expectDayButtons(page);
  expect(await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return [s.round, s.dayPending, s.nextFortune, s.arcade.after.dailyPour];
  })).toEqual([20, true, 'karma', 34]);
  await page.locator('[data-day="fresh"]').dblclick();
  await expect(page.locator('#hudDay')).toHaveText('DAY 3 · CUP 1/10 · HEAT 0');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.fortune)).toBe('karma');
  expect(problems).toEqual([]);
});

test('desktop Compact View keeps Day choices and global progression readable', async ({ page, problems }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openGame(page, '&seed=42&view=compact');
  await toDayReading(page); await expectDayButtons(page);
  if (info.project.name === 'chromium') await daySnapshot(page, 'desktop-compact-transition');
  await page.locator('[data-day="keep"]').click();
  await expect(page.locator('#compactRound')).toHaveText('Cup 11');
  await expect(page.locator('#hudDay')).toContainText('DAY 2');
  expect(problems).toEqual([]);
});
