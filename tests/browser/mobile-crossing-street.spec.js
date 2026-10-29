import { test, expect, openGame } from './fixtures.js';
import { clearFirstLane, crossSafely, expectCrossingPad, street, toCrossingOffer } from './crossingStreet.js';

for (const [name, viewport] of [
  ['phone-portrait', { width: 393, height: 851 }],
  ['phone-landscape', { width: 851, height: 393 }],
  ['tablet-portrait', { width: 820, height: 1180 }],
  ['tablet-landscape', { width: 1180, height: 820 }],
]) {
  test(`Crossing the Street offer, arrow pad and Tea Break fit ${name}`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&view=compact&touch=easy');
    await toCrossingOffer(page);
    const accept = page.locator('[data-interlude="accept"]');
    await expect(accept).toBeInViewport();
    await expect(page.locator('[data-interlude="skip"]')).toBeInViewport();
    await page.screenshot({ path: `docs/images/crossing-street/${name}-offer.png`, fullPage: true, scale: 'css' });
    await accept.tap();
    await expectCrossingPad(page);
    await page.screenshot({ path: `docs/images/crossing-street/${name}-intro.png`, fullPage: true, scale: 'css' });
    // A tap on the pad during the introduction does nothing; the main button starts the crossing.
    await page.locator('[data-walk="up"]').tap();
    expect((await street(page)).hops).toBe(0);
    await page.evaluate(() => window.__TEACUP__.game.confirm());
    await clearFirstLane(page);
    const pad = (dir) => page.locator(`[data-walk="${dir}"]`);
    for (const [dir, at] of [['left', { col: 5 }], ['right', { col: 6 }], ['up', { row: 1 }], ['down', { row: 0 }]]) {
      await pad(dir).tap();
      await page.waitForTimeout(220);
      expect((await street(page)).spoon).toMatchObject(at);
    }
    // A finger held on ▶ keeps hopping; lifting it, or a cancelled pointer, stops it.
    await pad('right').dispatchEvent('pointerdown', { pointerId: 7 });
    await page.waitForFunction(() => window.__TEACUP__.game.state.crossingStreet.spoon.col >= 8, null, { timeout: 3000 });
    await pad('right').dispatchEvent('pointercancel', { pointerId: 7 });
    await page.waitForTimeout(250);
    const col = (await street(page)).spoon.col;
    await page.waitForTimeout(300);
    expect((await street(page)).spoon.col).toBe(col);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBe(0);
    await page.screenshot({ path: `docs/images/crossing-street/${name}.png`, fullPage: true, scale: 'css' });
    await page.locator('#menuBtn').tap();
    await expect(page.locator('#teaBreak')).toBeVisible();
    const frozen = await street(page);
    await page.waitForTimeout(150);
    expect(await street(page)).toEqual(frozen);
    await page.locator('#closeBreak').tap();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'crossingStreet');
    expect(problems).toEqual([]);
  });
}

for (const [name, viewport] of [['phone-portrait', { width: 393, height: 851 }], ['tablet-landscape', { width: 1180, height: 820 }]]) {
  test(`the tea-shop exchange and result are readable on ${name}`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&view=compact&touch=easy');
    await toCrossingOffer(page);
    await page.locator('[data-interlude="accept"]').tap();
    await page.evaluate(() => window.__TEACUP__.game.confirm());
    await crossSafely(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/images/crossing-street/tea-shop-${name}.png`, fullPage: true, scale: 'css' });
    await page.waitForTimeout(1500);
    await expect(page.locator('#mainBtn')).toBeInViewport();
    await page.screenshot({ path: `docs/images/crossing-street/result-${name}.png`, fullPage: true, scale: 'css' });
    await page.locator('#mainBtn').tap();
    await expect(page.locator('#compactRound')).toHaveText('Cup 28');
    expect(problems).toEqual([]);
  });
}

test('touch skipping leaves progression and resources intact', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=compact'); await toCrossingOffer(page);
  const before = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  await page.locator('[data-interlude="skip"]').tap();
  await expect(page.locator('#compactRound')).toHaveText('Cup 28');
  const after = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  for (const key of ['lives', 'score', 'teaCash', 'spoon', 'progress', 'shortageAfter']) expect(after[key]).toEqual(before[key]);
  expect(after.fortune).toBe(before.nextFortune);
  expect(problems).toEqual([]);
});
