import { test, expect, openGame } from './fixtures.js';
import { advanceWall, breakBiscuits, leavesAtRim, toBiscuitOffer, toKarmaReading } from './biscuitBreakout.js';

const imagePath = (name) => `docs/images/biscuit-breakout/${name}.png`;
async function shot(page, testInfo, name) {
  if (testInfo.project.name === 'chromium') await page.screenshot({ path: imagePath(name), fullPage: true, scale: 'css' });
}
const state = (page) => page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
const wall = (page) => page.evaluate(() => structuredClone(window.__TEACUP__.game.state.biscuitBreakout));
const key = (page, code, type = 'keydown', repeat = false) => page.evaluate(([c, t, r]) => {
  window.dispatchEvent(new KeyboardEvent(t, { code: c, repeat: r, bubbles: true }));
}, [code, type, repeat]);

test('the biscuit offer can be skipped by mouse or keyboard without losing anything', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full'); await toBiscuitOffer(page);
  await expect(page.locator('#arcadePitch')).toHaveText('“Their demands are unclear. Their formation is not.”');
  await expect(page.locator('[data-interlude="accept"]')).toContainText('BREAK THE BISCUITS');
  await expect(page.locator('[data-interlude="skip"]')).toContainText('LEAVE THEM ALONE');
  const before = await state(page);
  await page.keyboard.press('Digit2');
  await expect(page.locator('#roundNum')).toHaveText('20');
  const after = await state(page);
  for (const k of ['lives', 'score', 'teaCash', 'spoon', 'progress', 'shortageAfter']) expect(after[k]).toEqual(before[k]);
  expect(after.fortune).toBe(before.nextFortune); expect(after.biscuitBreakout).toBeNull();
  expect(after.arcade.after).toEqual({ dailyPour: 26, biscuitBreakout: 33 });
  // Development helpers are compiled out of production.
  expect(await page.evaluate(() => ['launchBiscuitBreakout', 'brewWithFortune', 'launchDailyPour']
    .filter((name) => name in window.__TEACUP__))).toEqual([]);
  expect(problems).toEqual([]);
});

test('desktop wall: real keys move and launch, biscuits crumble, the biscuit talks, success pays once', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full'); await toBiscuitOffer(page);
  await shot(page, testInfo, 'offer');
  const before = await state(page);
  await page.locator('[data-interlude="accept"]').click();
  await expectBreakoutControlsHiddenOnDesktop(page);
  await shot(page, testInfo, 'introduction');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toContainText('BISCUIT BREAKOUT ·');
  await shot(page, testInfo, 'wall-and-spoon');
  // Real held keys move the spoon through the actual listeners and frame loop.
  const x0 = (await wall(page)).paddle.x;
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction((x) => window.__TEACUP__.game.state.biscuitBreakout.paddle.x > x + 60, x0, { timeout: 5000 });
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  expect((await wall(page)).launches).toBe(1);
  await page.waitForFunction(() => window.__TEACUP__.game.state.biscuitBreakout.cube.y < 560);
  await shot(page, testInfo, 'cube-in-motion');
  expect(await breakBiscuits(page, { count: 3 })).toBeGreaterThanOrEqual(3);
  await shot(page, testInfo, 'biscuit-destruction');
  await breakBiscuits(page, { talker: true, park: true });
  await expect.poll(() => page.evaluate(() => !!window.__TEACUP__.game.state.biscuitBreakout.remark)).toBe(true);
  await shot(page, testInfo, 'talking-biscuit');
  await shot(page, testInfo, 'desktop-full');
  const broken = (await wall(page)).broken;
  await breakBiscuits(page, { count: Math.max(0, 18 - broken), park: true });
  await advanceWall(page, 46);
  const done = await wall(page);
  expect(done.stage).toBe('outro');
  expect(done.summary).toMatchObject({ success: true, perfect: false, cash: 5, title: 'A CRUMBLING SUCCESS.' });
  await expect(page.locator('#roundTitle')).toHaveText('A CRUMBLING SUCCESS.');
  await shot(page, testInfo, 'result-success');
  const paid = await state(page);
  expect(paid.score).toBe(before.score + done.summary.points);
  expect(paid.teaCash).toBe(before.teaCash + 5);
  for (const k of ['lives', 'spoon', 'progress', 'shortageAfter', 'extraSugar', 'nextFortune']) expect(paid[k]).toEqual(before[k]);
  await page.keyboard.press('Space'); // nothing on the result
  await advanceWall(page, 2);
  await page.keyboard.press('Enter');
  await expect(page.locator('#roundNum')).toHaveText('20');
  const back = await state(page);
  expect(back).toMatchObject({ phase: 'playing', fortune: before.nextFortune, score: paid.score, teaCash: paid.teaCash,
    biscuitBreakout: null, shots: [] });
  expect(problems).toEqual([]);
});

test('losing every cube ends in a failed result that costs no cup', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full'); await toBiscuitOffer(page);
  const before = await state(page);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await breakBiscuits(page, { count: 4, park: true });
  // Three launches, each missed by holding the spoon hard against the far wall.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const { game } = window.__TEACUP__;
      const m = game.state.biscuitBreakout;
      const away = m.cube.x < 460 ? { right: true } : { left: true };
      game.launchCube();
      for (let t = 0; t < 600 && !m.cube.held && m.stage === 'play'; t++) game.update(1 / 120, { left: false, right: false, fire: false, ...away });
    });
  }
  const done = await wall(page);
  expect(done).toMatchObject({ stage: 'outro', cubes: 0, lost: 3 });
  expect(done.summary).toMatchObject({ reason: 'cubes', success: false, cash: 0, title: 'THE BISCUITS HAVE WON THIS ROUND.' });
  await expect(page.locator('#hudLives')).toHaveText('CUBES □ □ □');
  await shot(page, testInfo, 'result-failure');
  const after = await state(page);
  expect(after.lives).toBe(before.lives);
  expect(after.score).toBe(before.score + done.summary.points);
  expect(after.teaCash).toBe(before.teaCash);
  expect(problems).toEqual([]);
});

test('Space auto-repeat, pause, Tea Break and backgrounding never launch or leak into the cup', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGame(page, '&seed=42&view=compact'); await toBiscuitOffer(page);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Enter');
  const { milkLeft, sugarLeft } = await state(page);
  await key(page, 'Space');
  for (let i = 0; i < 10; i++) await key(page, 'Space', 'keydown', true);
  await key(page, 'ArrowUp'); await key(page, 'ArrowDown');
  await key(page, 'Space', 'keyup');
  expect((await wall(page)).launches).toBe(1);
  expect(await state(page)).toMatchObject({ milkLeft, sugarLeft, shots: [] });
  await shot(page, testInfo, 'desktop-compact');
  await page.keyboard.press('KeyP');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  const paused = await wall(page);
  await page.keyboard.press('Space'); await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowLeft');
  expect(await wall(page)).toEqual(paused);
  await page.keyboard.press('KeyP');
  expect((await wall(page)).launches).toBe(1); // resuming never launches
  await page.locator('#menuBtn').click(); await expect(page.locator('#teaBreak')).toBeVisible();
  const menu = await wall(page);
  await page.waitForTimeout(250);
  expect(await wall(page)).toEqual(menu);
  await page.locator('#closeBreak').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'biscuitBreakout');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  const hidden = await wall(page);
  await page.waitForTimeout(300);
  expect(await wall(page)).toEqual(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.press('KeyP');
  // Finish, then leave with Space still held down: its auto-repeat must not become steam.
  await advanceWall(page, 47);
  expect((await wall(page)).stage).toBe('outro');
  // Closing the Tea Break left focus on its button; Enter should reach the game, not reopen it.
  await page.evaluate(() => document.activeElement?.blur());
  await key(page, 'Space');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  for (let i = 0; i < 8; i++) await key(page, 'Space', 'keydown', true);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBe(0);
  await key(page, 'Space', 'keyup');
  await key(page, 'Space');
  await key(page, 'Space', 'keyup');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBeGreaterThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('Karma is revealed, bounces leaves once, then makes them vanish without costing a cup', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full&tea=house');
  await toKarmaReading(page);
  await page.waitForFunction(() => window.__TEACUP__.game.state.readingTime > 3.3);
  await expect(page.locator('#fortuneName')).toHaveText('Karma');
  await shot(page, testInfo, 'karma-reveal');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudOmen')).toContainText('Karma · rim rebounds');
  // Even with nothing left in the strainer to catch them.
  await page.evaluate(() => Object.assign(window.__TEACUP__.game.state, { strainerLeft: 0, spawnTimer: Infinity, enemies: [] }));
  const start = await state(page);
  await leavesAtRim(page, [2, 6, 11]);
  await page.waitForFunction(() => window.__TEACUP__.game.state.roundStats.karmaBounces === 3);
  await page.waitForTimeout(120);
  await shot(page, testInfo, 'karma-bounce');
  await page.waitForFunction(() => window.__TEACUP__.game.state.enemies.every((e) => e.backwash === 0));
  await page.evaluate(() => { for (const e of window.__TEACUP__.game.state.enemies) e.radius = window.__TEACUP__.config.arena.rimRadius - 4; });
  await page.waitForFunction(() => window.__TEACUP__.game.state.roundStats.karmaPuffs === 3);
  await page.waitForTimeout(80);
  await shot(page, testInfo, 'karma-vanish');
  const after = await state(page);
  expect(after).toMatchObject({ lives: start.lives, strainerLeft: 0, score: start.score, kills: start.kills + 3, enemies: [] });
  expect(after.roundStats).toMatchObject({ escapes: 0, nearMisses: 0, steamKills: 0, karmaBounces: 3, karmaPuffs: 3 });
  expect(after.residue).toEqual(start.residue);
  expect(problems).toEqual([]);
});

/** On a desktop the touch pads stay out of sight in Full View. */
async function expectBreakoutControlsHiddenOnDesktop(page) {
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'breakout');
  await expect(page.locator('.controls-classic')).toBeHidden();
  await expect(page.locator('.controls-easy')).toBeHidden();
}
