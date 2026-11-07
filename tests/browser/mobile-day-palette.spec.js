import { test, expect, openGame } from './fixtures.js';
import { toDayReading } from './days.js';
import { expectPalette, fixedColours, toDay } from './dayPalette.js';

// Phones and tablets: the same Day ground in both orientations.

for (const [name, viewport] of [['portrait', { width: 390, height: 844 }],
  ['landscape', { width: 844, height: 390 }], ['tablet landscape', { width: 1180, height: 820 }]]) {
  test(`${name}: each Day tints the page ground and leaves the cup and controls alone`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, `&seed=42`);
    await page.locator('#mainBtn').click();
    await expectPalette(page, 1);
    const day1 = await fixedColours(page);
    for (const day of [2, 5, 8]) {
      await toDay(page, day);
      await expectPalette(page, day);
      expect(await fixedColours(page)).toEqual(day1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(problems).toEqual([]);
  });
}

test('a tapped Day choice fades on a phone', async ({ page, problems }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page, '&seed=42');
  await toDayReading(page);
  await page.locator('[data-day="keep"]').tap();
  await expect(page.locator('#hudDay')).toContainText('DAY 2');
  await expectPalette(page, 2, { fade: 'on' });
  expect(problems).toEqual([]);
});
