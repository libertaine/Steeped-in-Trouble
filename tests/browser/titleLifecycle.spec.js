import { expect, openGame, test } from './fixtures.js';

test('D1 reproduction: Pause Menu, resume, Space fires instead of reopening Tea Break', async ({ page, problems }) => {
  await openGame(page);
  await page.keyboard.press('Enter');
  await page.locator('#menuBtn').click();
  await page.locator('#closeBreak').click();
  await page.keyboard.press('Space');
  await expect(page.locator('#teaBreak')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('production title waits for an explicit gesture and each Enter advances one screen', async ({ page, problems }) => {
  await page.goto('./');
  const title = page.locator('#arcadeSplash');
  const instructions = page.locator('#instructionOverlay');
  await expect(page.locator('#titleContinueBtn')).toBeEnabled();
  await expect(title).toBeVisible();
  await expect(instructions).toBeHidden();
  await page.waitForTimeout(3200);
  await expect(title).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#titleContinueBtn')).toBeFocused();
  await page.keyboard.down('Enter');
  await expect(title).toBeHidden();
  await expect(instructions).toBeVisible();
  for (let i = 0; i < 3; i++) await page.keyboard.down('Enter');
  await expect(instructions).toBeVisible();
  await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');
  await page.keyboard.up('Enter');
  await page.keyboard.press('Enter');
  await expect(instructions).toBeHidden();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  expect(problems).toEqual([]);
});

test('title and instructions isolate held steam and steering until release', async ({ page, problems }) => {
  await openGame(page, '', { onboarding: true });
  const snapshot = () => page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return { phase: s.phase, angle: s.angle, time: s.time, shots: s.shots.length };
  });
  const before = await snapshot();
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  expect(await snapshot()).toEqual(before);
  await page.locator('#titleContinueBtn').click();
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await page.locator('#overlayPrimaryBtn').click();
  // Starting Cup 1 initializes the spoon's angle; compare after that action.
  const cupAngle = (await snapshot()).angle;
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBe(0);
  expect((await snapshot()).angle).toBe(cupAngle);
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

for (const exit of ['click', 'Enter', 'Escape', 'controls', 'view']) {
  test(`D1: Tea Break ${exit} restores cup focus and fresh steam`, async ({ page, problems }) => {
    await openGame(page, '&view=compact');
    await page.keyboard.press('Enter');
    await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
    await page.locator('#menuBtn').click();
    if (exit === 'controls') {
      await page.locator('#breakControlsBtn').click();
      await page.keyboard.press('Enter');
      await expect(page.locator('#teaBreak')).toBeVisible();
      await expect(page.locator('#breakControlsBtn')).toBeFocused();
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
    }
    if (exit === 'view') await page.getByText('Settings and controls', { exact: true }).click();
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    if (exit === 'Escape') await page.keyboard.press('Escape');
    else if (exit === 'Enter') {
      await page.locator('#closeBreak').focus();
      await page.keyboard.press('Enter');
    } else await page.locator(exit === 'view' ? '#breakViewBtn' : '#closeBreak').click();
    await expect(page.locator('#game')).toBeFocused();
    const angle = await page.evaluate(() => window.__TEACUP__.game.state.angle);
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.angle)).toBe(angle);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBe(0);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Space');
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBeGreaterThan(0);
    await expect(page.locator('#teaBreak')).toBeHidden();
    await page.keyboard.press('p');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
    await page.keyboard.press('p');
    await page.keyboard.press('Space');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    for (const key of ['ArrowLeft', 'ArrowRight', 'a', 'd']) {
      const start = await page.evaluate(() => window.__TEACUP__.game.state.angle);
      await page.keyboard.down(key);
      await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.angle)).not.toBe(start);
      await page.keyboard.up(key);
    }
    // Deliberate keyboard navigation still gives a button native activation.
    await page.locator('#game').focus();
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      if (await page.locator('#menuBtn').evaluate((button) => button === document.activeElement)) break;
    }
    await expect(page.locator('#menuBtn')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#teaBreak')).toBeVisible();
    expect(problems).toEqual([]);
  });
}

test('Back to cup restores Enter in ready and gameover phases', async ({ page, problems }) => {
  await openGame(page);
  for (const phase of ['ready', 'gameover']) {
    await page.evaluate((phase) => { window.__TEACUP__.game.state.phase = phase; }, phase);
    await page.locator('#menuBtn').click();
    await expect(page.locator('#closeBreak')).toHaveText('Back to cup');
    await page.locator('#closeBreak').click();
    await expect(page.locator('#game')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(page.locator('#teaBreak')).toBeHidden();
  }
  expect(problems).toEqual([]);
});
