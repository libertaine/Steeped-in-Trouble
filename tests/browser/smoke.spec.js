import { autoplayUntilReading, expect, gameState, openGame, test } from './fixtures.js';

// Every fortune, plus the name The Leaves Lie hides behind until it confesses.
const FORTUNE_NAMES = /^(The (Crown|Veil|Spiral|Star|Leaves Lie)|Sugar Rush|Double Trouble|Tempestuous Tea|Golden Opportunity|Something Wonderful)$/;

test('loads the game without errors or missing files', async ({ page, problems }) => {
  await openGame(page);
  await expect(page).toHaveTitle(/Steeped in Trouble/);
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
  // Without defending, the strainer catches one leaf and three more escape.
  await expect(page.locator('#hudStatus')).toHaveText('THE CUP RUNNETH OVER', { timeout: 60_000 });
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♡ ♡ ♡/);
  await expect(page.locator('#mainBtn')).toHaveText('Start a fresh pot →');

  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♥ ♥ ♥/);
  await expect(page.locator('#hudScore')).toHaveText('SCORE 0000');
  await expect(page.locator('#roundNum')).toHaveText('01');
  expect(problems).toEqual([]);
});

test('completes a round, reads the leaves, picks a spoon upgrade, and brews the next cup', async ({ page, problems }) => {
  test.setTimeout(120_000);
  await openGame(page, '&seed=20261027');
  await page.keyboard.press('Enter');
  await autoplayUntilReading(page);

  await expect(page.locator('#hudStatus')).toHaveText('READING THE LEAVES');
  await expect(page.locator('#fortuneLabel')).toHaveText('Fortune for the next cup');
  await expect(page.locator('#fortuneName')).toHaveText(FORTUNE_NAMES);
  const { nextFortune } = await gameState(page);
  // Round 1 always ends with an upgrade offer, which Enter does not skip.
  await expect(page.locator('#upgradeOffer')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#mainBtn')).toHaveText('Choose a spoon upgrade (1 / 2)');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('READING THE LEAVES');
  const picked = await page.locator('.upgrade-card').nth(1).getAttribute('data-upgrade');

  await page.keyboard.press('2');
  await expect(page.locator('#upgradeOffer')).toBeHidden();
  await expect(page.locator('#hudStatus')).toHaveText(/DEFEND THE RIM|GOLDEN SPOON|THE CUP RECOVERS/);
  expect(await page.evaluate((id) => window.__TEACUP__.game.state.spoon[id], picked)).toBe(1);
  await expect(page.locator('#spoonKit')).not.toHaveText('An ordinary silver spoon.');
  await expect(page.locator('#roundNum')).toHaveText('02');
  await expect(page.locator('#killCount')).toHaveText('0 / 20');
  await expect(page.locator('#fortuneLabel')).toHaveText('This cup’s omen');
  expect((await gameState(page)).fortune).toBe(nextFortune);
  await expect(page.locator('#fortuneName')).toHaveText(FORTUNE_NAMES);
  await expect(page.locator('#hudOmen')).toHaveText(/^✦ /);
  expect(problems).toEqual([]);
});

test('a Hot Chocolate Havoc bonus round plays through and returns to the tea', async ({ page, problems }) => {
  await openGame(page, '&seed=7');
  await page.keyboard.press('Enter');
  // Finish round 1 at once, and make a bonus round due.
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    s.kills = s.target - 1;
    s.enemies.push({ angle: -Math.PI / 2, radius: 200, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 });
    s.angle = -Math.PI / 2;
    s.shotCooldown = 0;
    game.fireSteam();
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.evaluate(() => { window.__TEACUP__.game.state.havocDue = true; });
  await expect(page.locator('#upgradeOffer')).toBeVisible({ timeout: 10_000 });
  const picked = await page.locator('.upgrade-card').nth(0).getAttribute('data-upgrade');
  await page.keyboard.press('1');
  await expect(page.locator('#hudStatus')).toHaveText('THE CHOCOLATE PROPHECY');
  await expect(page.locator('#roundNum')).toHaveText('01½');

  await page.keyboard.press('Enter'); // skip the intro
  await expect(page.locator('#hudStatus')).toHaveText(/^HOT CHOCOLATE HAVOC · \d+s$/);
  await expect(page.locator('#killLabel')).toHaveText('Marshmallows toasted');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.chocolate.flames.length)).toBeGreaterThan(0);

  await page.evaluate(() => { window.__TEACUP__.game.state.chocolate.left = 0.1; });
  await expect(page.locator('#hudStatus')).toHaveText('BACK TO TEA');
  await expect(page.locator('#mainBtn')).toHaveText('Back to the tea →');
  // Wait on the game's own clock (CONFIG.chocolate.outroMin is 0.6 s), not the wall clock.
  await page.waitForFunction(() => window.__TEACUP__.game.state.chocolate?.time >= 0.65);
  await page.locator('#mainBtn').click();

  await expect(page.locator('#hudStatus')).toHaveText(/DEFEND THE RIM|GOLDEN SPOON/);
  await expect(page.locator('#roundNum')).toHaveText('02');
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♥ ♥ ♥/);
  expect(await page.evaluate((id) => window.__TEACUP__.game.state.spoon[id], picked)).toBe(1);
  expect(problems).toEqual([]);
});

test('The Daily Grind can be met, fought with Q and E, and escaped without ending the pot', async ({ page, problems }) => {
  await openGame(page, '&seed=7');
  await page.keyboard.press('Enter');
  // Finish round 1 at once, and make the coffee boss due.
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    s.kills = s.target - 1;
    s.enemies.push({ angle: -Math.PI / 2, radius: 200, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 });
    s.angle = -Math.PI / 2;
    s.shotCooldown = 0;
    game.fireSteam();
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  const { nextFortune } = await gameState(page);
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.offer = null;
    s.havocDue = false;
    s.grindDue = true;
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('SOMEONE ORDERED TROUBLE');
  await expect(page.locator('#roundNum')).toHaveText('01½');

  await page.keyboard.press('Enter'); // skip the entrance
  await expect(page.locator('#hudStatus')).toHaveText(/^THE DAILY GRIND · \d+s$/);
  await expect(page.locator('#hudStrainer')).toHaveText(/^SCALDS/);
  await page.keyboard.press('q');
  await expect(page.locator('#milkCount')).toHaveText('1');
  await page.keyboard.press('e');
  await expect(page.locator('#sugarCount')).toHaveText('1');

  await page.evaluate(() => { window.__TEACUP__.game.state.grind.left = 0.05; });
  await expect(page.locator('#hudStatus')).toHaveText('THE MACHINE ESCAPES');
  await expect(page.locator('#mainBtn')).toHaveText('Back to the tea →');
  // Wait on the game's own clock (CONFIG.grind.outroMin is 1.6 s): a busy browser's frames can lag the wall clock.
  await page.waitForFunction(() => window.__TEACUP__.game.state.grind?.time >= 1.65);
  await page.keyboard.press('Enter');

  await expect(page.locator('#hudStatus')).toHaveText(/DEFEND THE RIM|GOLDEN SPOON/);
  await expect(page.locator('#roundNum')).toHaveText('02');
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♥ ♥ ♥/);
  expect((await gameState(page)).fortune).toBe(nextFortune);
  expect(problems).toEqual([]);
});
