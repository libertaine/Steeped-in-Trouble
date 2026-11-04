import { expect, openGame, test } from './fixtures.js';
import { stageTextReading, textState } from './textMischief.js';

test('portrait and short landscape reading suppress text mischief and preserve touch continuation', async ({ page, problems }) => {
  await openGame(page, '&ambientSeed=7');
  for (const viewport of [{ width: 393, height: 851 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await stageTextReading(page);
    await expect(page.locator('#readingPresentation')).toBeVisible();
    await expect.poll(() => textState(page)).toMatchObject({ eligible: false, carried: false });
    expect(await page.evaluate(() => window.__TEACUP__.ambient.stealText())).toBe(false);
    await expect(page.locator('#readingMischief')).toBeHidden();
    await page.locator('#mainBtn').tap();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  }
  expect(problems).toEqual([]);
});
