import { autoplayUntilReading, expect, gameState, openGame, test } from './fixtures.js';

test('loads the game without errors or missing files', async ({ page, problems }) => {
  await openGame(page);
  await expect(page).toHaveTitle(/Storm in a Teacup/);
  await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');
  await expect(page.locator('#hudScore')).toHaveText('SCORE 0000');
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♥ ♥ ♥/);
  await expect(page.locator('#version')).toHaveText(/^VERSION \d+\.\d+\.\d+$/);

  const canvas = await page.locator('#game').evaluate((c) => {
    const box = c.getBoundingClientRect();
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < pixels.length; i += 400) if (pixels[i] > 0) painted++;
    return { width: c.width, height: c.height, cssWidth: box.width, cssHeight: box.height, painted };
  });
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.cssWidth / canvas.cssHeight).toBeCloseTo(920 / 790, 1);
  expect(canvas.painted).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('starts, steers, fires, pauses, and resumes from the keyboard', async ({ page, problems }) => {
  await openGame(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect(page.locator('#roundTitle')).toHaveText('Cup 1: the storm stirs');

  const start = (await gameState(page)).angle;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect((await gameState(page)).angle).not.toBeCloseTo(start, 2);

  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).shots).toBeGreaterThan(0);

  await page.keyboard.press('m');
  await expect(page.locator('#milkCount')).toHaveText('1');
  await page.keyboard.press('s');
  await expect(page.locator('#sugarCount')).toHaveText('1');

  await page.keyboard.press('p');
  await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
  const paused = await gameState(page);
  await page.waitForTimeout(300);
  expect((await gameState(page)).angle).toBe(paused.angle);
  await page.keyboard.press('p');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

  // Losing window focus pauses the game and releases held keys.
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
  await page.keyboard.up('ArrowLeft');

  // Resizing keeps the match going.
  const before = await gameState(page);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(200);
  const after = await gameState(page);
  expect([after.phase, after.round, after.score, after.lives]).toEqual([before.phase, before.round, before.score, before.lives]);
  expect(problems).toEqual([]);
});

test('the main button starts and pauses the game', async ({ page, problems }) => {
  await openGame(page);
  await page.locator('#mainBtn').click();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect(page.locator('#mainBtn')).toHaveText('Pause / resume (P)');
  await page.locator('#mainBtn').click();
  await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
  await expect(page.locator('#mainBtn')).toHaveText('Resume cup →');
  expect(problems).toEqual([]);
});

test('Enter on a focused main button acts once, not twice', async ({ page, problems }) => {
  await openGame(page);
  await page.locator('#mainBtn').focus();
  // The Enter shortcut starts the game; the button must not also receive a
  // click that would immediately pause it.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  expect(problems).toEqual([]);
});

test('reaches game over and restarts a fresh match', async ({ page, problems }) => {
  await openGame(page);
  await page.keyboard.press('Enter');
  // Without defending, three leaves escape.
  await expect(page.locator('#hudStatus')).toHaveText('THE CUP RUNNETH OVER', { timeout: 30_000 });
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♡ ♡ ♡/);
  await expect(page.locator('#mainBtn')).toHaveText('Start a fresh pot →');

  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♥ ♥ ♥/);
  await expect(page.locator('#hudScore')).toHaveText('SCORE 0000');
  await expect(page.locator('#roundNum')).toHaveText('01');
  expect(problems).toEqual([]);
});

test('completes a round, reads the leaves, and brews the next cup', async ({ page, problems }) => {
  test.setTimeout(120_000);
  await openGame(page, '&seed=20261027');
  await page.keyboard.press('Enter');
  await autoplayUntilReading(page);

  await expect(page.locator('#hudStatus')).toHaveText('READING THE LEAVES');
  await expect(page.locator('#fortuneLabel')).toHaveText('Fortune for the next cup');
  await expect(page.locator('#fortuneName')).toHaveText(/^The (Crown|Veil|Spiral|Star)$/);
  const fortuneName = await page.locator('#fortuneName').textContent();
  await page.waitForTimeout(500); // let the reading animation run

  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect(page.locator('#roundNum')).toHaveText('02');
  await expect(page.locator('#killCount')).toHaveText('0 / 20');
  await expect(page.locator('#fortuneLabel')).toHaveText('This cup’s omen');
  await expect(page.locator('#fortuneName')).toHaveText(fortuneName);
  expect(problems).toEqual([]);
});
