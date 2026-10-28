import { expect, openGame, test } from './fixtures.js';
import { advance, capture, frozenRunner, secretAndReturn } from './aerial.js';

for (const [label, width, height, kind] of [
  ['phone-portrait', 390, 844, 'bird'], ['phone-landscape', 844, 390, 'power'],
  ['tablet-portrait', 800, 1280, 'power'], ['tablet-landscape', 1280, 800, 'orbit'],
  ['desktop-compact', 1440, 900, 'orbit'],
]) {
  test(`${label}: separate taps, a held Jump, ${kind} and safe return`, async ({ page, problems }, testInfo) => {
    await page.setViewportSize({ width, height });
    await openGame(page, '&seed=2&view=compact');
    await frozenRunner(page);
    const jump = page.locator('[data-run="jump"]');
    await jump.tap(); await advance(page, 0.15);
    const first = await page.evaluate(() => window.__TEACUP__.game.state.run.spoon.chain);
    expect(first).toBe(1);
    await jump.tap(); await advance(page, 0.15);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.run.spoon.chain)).toBe(2);
    await capture(page, testInfo, label + '-jump');
    const box = await jump.boundingBox();
    // A single touchstart, held across updates, makes only one further attempt.
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    const chain = await page.evaluate(() => window.__TEACUP__.game.state.run.spoon.chain);
    await advance(page, 0.15);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.run.spoon.chain)).toBe(chain);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    await advance(page, 2);
    await secretAndReturn(page, testInfo, kind);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Pause / Menu', exact: true })).toBeInViewport();
    expect(problems).toEqual([]);
  });
}

test('reduced-motion orbit remains readable and freezes while paused', async ({ page, problems }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page, '&seed=7');
  await frozenRunner(page);
  await secretAndReturn(page, testInfo, 'orbit');
  expect(problems).toEqual([]);
});
