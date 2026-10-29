import { test, expect, openGame } from './fixtures.js';
import { breakBiscuits, expectBreakoutControls, toBiscuitOffer } from './biscuitBreakout.js';

for (const [name, viewport] of [
  ['phone-portrait', { width: 393, height: 851 }],
  ['phone-landscape', { width: 851, height: 393 }],
  ['tablet-portrait', { width: 820, height: 1180 }],
  ['tablet-landscape', { width: 1180, height: 820 }],
]) {
  test(`Biscuit Breakout offer, LEFT / LAUNCH / RIGHT and Tea Break fit ${name}`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&view=compact&touch=easy');
    await toBiscuitOffer(page);
    const accept = page.locator('[data-interlude="accept"]');
    await expect(accept).toBeInViewport();
    await expect(page.locator('[data-interlude="skip"]')).toBeInViewport();
    await accept.tap();
    await expectBreakoutControls(page);
    await page.screenshot({ path: `docs/images/biscuit-breakout/${name}-intro.png`, fullPage: true, scale: 'css' });
    // LAUNCH starts the mission from its introduction, then launches the waiting cube.
    const launch = page.locator('[data-biscuit="launchCube"]');
    await launch.tap();
    await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.biscuitBreakout.stage)).toBe('play');
    // Holding ▶ moves the spoon for as long as the finger stays down.
    const right = page.locator('.controls-breakout [data-hold="right"]');
    const x0 = await page.evaluate(() => window.__TEACUP__.game.state.biscuitBreakout.paddle.x);
    await right.dispatchEvent('pointerdown', { pointerId: 7 });
    await page.waitForFunction((x) => window.__TEACUP__.game.state.biscuitBreakout.paddle.x > x + 40, x0);
    await right.dispatchEvent('pointerup', { pointerId: 7 });
    const x1 = await page.evaluate(() => window.__TEACUP__.game.state.biscuitBreakout.paddle.x);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.biscuitBreakout.paddle.x)).toBe(x1);
    await launch.tap();
    expect(await page.evaluate(() => window.__TEACUP__.game.state.biscuitBreakout.launches)).toBe(1);
    await launch.dispatchEvent('pointercancel', { pointerId: 1 });
    expect(await page.evaluate(() => window.__TEACUP__.game.state.biscuitBreakout.launches)).toBe(1);
    await breakBiscuits(page, { count: 2 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `docs/images/biscuit-breakout/${name}.png`, fullPage: true, scale: 'css' });
    await page.locator('#menuBtn').tap();
    await expect(page.locator('#teaBreak')).toBeVisible();
    const frozen = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state.biscuitBreakout));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.biscuitBreakout)).toEqual(frozen);
    await page.locator('#closeBreak').tap();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'biscuitBreakout');
    expect(problems).toEqual([]);
  });
}

for (const [name, viewport] of [['phone-portrait', { width: 393, height: 851 }], ['tablet-landscape', { width: 1180, height: 820 }]]) {
  test(`the talking biscuit is readable on ${name}`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&view=compact&touch=easy');
    await toBiscuitOffer(page);
    await page.locator('[data-interlude="accept"]').tap();
    await page.locator('[data-biscuit="launchCube"]').tap();
    await breakBiscuits(page, { talker: true, park: true });
    await expect.poll(() => page.evaluate(() => !!window.__TEACUP__.game.state.biscuitBreakout.remark)).toBe(true);
    for (const pad of await page.locator('.controls-breakout button').all()) await expect(pad).toBeInViewport();
    await page.screenshot({ path: `docs/images/biscuit-breakout/talking-biscuit-${name}.png`, fullPage: true, scale: 'css' });
    expect(problems).toEqual([]);
  });
}

test('touch skipping leaves progression and resources intact', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=compact'); await toBiscuitOffer(page);
  const before = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  await page.locator('[data-interlude="skip"]').tap();
  await expect(page.locator('#compactRound')).toHaveText('Cup 20');
  const after = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  for (const key of ['lives', 'score', 'teaCash', 'spoon', 'progress', 'shortageAfter']) expect(after[key]).toEqual(before[key]);
  expect(after.fortune).toBe(before.nextFortune);
  expect(problems).toEqual([]);
});
