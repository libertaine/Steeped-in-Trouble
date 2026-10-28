import { expect, openGame, test } from './fixtures.js';
import { advance, capture, frozenRunner, secretAndReturn } from './aerial.js';

test('fresh keyboard presses discover flight, repeats do not roll, and failure locks the chain', async ({ page, problems }, testInfo) => {
  await openGame(page, '&seed=2&view=full');
  await frozenRunner(page);
  // Seed 2 has successive successes in the real errand RNG after course planning.
  await page.keyboard.press('ArrowUp'); await advance(page, 0.15);
  await page.keyboard.press('ArrowUp'); await advance(page, 0.15);
  const read = () => page.evaluate(() => ({ ...window.__TEACUP__.game.state.run.spoon }));
  expect((await read()).chain).toBe(2);
  await capture(page, testInfo, 'double-jump');
  const before = await read();
  await page.keyboard.down('ArrowUp');
  const pressed = await read();
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowUp');
  expect(await read()).toEqual(pressed);
  await page.keyboard.up('ArrowUp');
  if (!pressed.locked) { await advance(page, 0.15); await capture(page, testInfo, 'high-chain'); }
  for (let i = 0; i < 30 && !(await read()).locked; i++) { await page.keyboard.press('ArrowUp'); await advance(page, 0.15); }
  expect((await read()).locked).toBe(true);
  expect((await read()).chain).toBeGreaterThanOrEqual(before.chain);
  const locked = await read();
  await page.keyboard.press('ArrowUp'); expect(await read()).toEqual(locked);
  await capture(page, testInfo, 'failed-jump');
  await advance(page, 2);
  expect((await read()).locked).toBe(false);
  expect(problems).toEqual([]);
});

for (const kind of ['bird', 'power', 'orbit']) {
  test(`${kind} paints, pauses, backgrounds, and returns without losing state`, async ({ page, problems }, testInfo) => {
    await openGame(page, '&seed=7&view=full');
    await frozenRunner(page);
    await secretAndReturn(page, testInfo, kind);
    expect(problems).toEqual([]);
  });
}

test('repeated shortage uses the next real reading and keeps Buy Run Skip', async ({ page, problems }, testInfo) => {
  await openGame(page, '&seed=17');
  const { toShortage } = await import('./errand.js');
  await toShortage(page);
  await page.locator('[data-errand="skip"]').click();
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { round: 16, kills: s.target - 1, current: null, spawnTimer: Infinity,
      havocAfter: null, lastHavoc: 16, grindAfter: null, lastGrind: 16 });
    s.enemies = [{ angle: s.angle, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 }];
    s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.evaluate(() => { const { game } = window.__TEACUP__; game.state.offer = null; game.primaryAction(); });
  await expect(page.locator('[data-errand="run"]')).toBeVisible();
  await expect(page.locator('[data-errand="skip"]')).toBeVisible();
  await expect(page.locator('[data-errand="buy"]')).toBeVisible();
  expect(await page.evaluate(() => window.__TEACUP__.game.state.shortageAfter)).toBe(23);
  await capture(page, testInfo, 'recurring-shortage');
  expect(problems).toEqual([]);
});
