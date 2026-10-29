import { test, expect, openGame } from './fixtures.js';
import { daySnapshot, expectDayButtons, toDayReading } from './days.js';

for (const [name, viewport] of [
  ['phone-portrait', { width: 393, height: 851 }],
  ['tablet-landscape', { width: 1180, height: 820 }],
  ['phone-landscape', { width: 851, height: 393 }],
]) {
  for (const choice of ['fresh', 'keep']) test(`${name} ${choice}: readable touch choice and next cup`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGame(page, '&seed=42&view=compact&touch=easy');
    await toDayReading(page); await expectDayButtons(page);
    await expect(page.locator('.controls-easy')).toBeHidden();
    await daySnapshot(page, `${name}-${choice}-transition`);
    await page.locator(`[data-day="${choice}"]`).tap();
    await expect(page.locator('#hudDay')).toHaveText(`DAY 2 · CUP 1/10 · HEAT ${choice === 'fresh' ? 0 : 10}`);
    await expect(page.locator('#compactRound')).toHaveText('Cup 11');
    await expect(page.locator('#dayOffer')).toBeHidden();
    await expect(page.locator('.controls-easy')).toBeVisible();
    const canvas = await page.locator('#game').boundingBox();
    expect(canvas.width).toBeGreaterThan(200); expect(canvas.height).toBeGreaterThan(160);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.fortune)).toBe('karma');
    await page.waitForTimeout(300);
    await daySnapshot(page, `${name}-${choice}-gameplay`);
    expect(problems).toEqual([]);
  });
}
