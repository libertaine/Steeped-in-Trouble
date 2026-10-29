import { test, expect, openGame } from './fixtures.js';
import { advanceStreet, bumpSpoon, clearFirstLane, crossSafely, street, toCrossingOffer } from './crossingStreet.js';

const imagePath = (name) => `docs/images/crossing-street/${name}.png`;
async function shot(page, testInfo, name) {
  if (testInfo.project.name === 'chromium') await page.screenshot({ path: imagePath(name), fullPage: true, scale: 'css' });
}
const state = (page) => page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
const key = (page, code, type = 'keydown', repeat = false) => page.evaluate(([c, t, r]) => {
  window.dispatchEvent(new KeyboardEvent(t, { code: c, repeat: r, bubbles: true }));
}, [code, type, repeat]);
/** A real key press through the page's listeners, then time for the hop to land. */
async function hop(page, code) {
  await page.keyboard.press(code);
  await page.waitForTimeout(220);
}

test('the crossing offer can be skipped by keyboard without losing anything', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full'); await toCrossingOffer(page);
  await expect(page.locator('#arcadePitch')).toHaveText('“Nobody knows. But apparently, it’s our problem now.”');
  await expect(page.locator('[data-interlude="accept"]')).toContainText('CROSS THE ROAD');
  await expect(page.locator('[data-interlude="skip"]')).toContainText('STAY RIGHT HERE');
  const before = await state(page);
  await page.keyboard.press('Digit2');
  await expect(page.locator('#roundNum')).toHaveText('28');
  const after = await state(page);
  for (const k of ['lives', 'score', 'teaCash', 'spoon', 'progress', 'shortageAfter']) expect(after[k]).toEqual(before[k]);
  expect(after.fortune).toBe(before.nextFortune); expect(after.crossingStreet).toBeNull();
  expect(after.arcade.after).toEqual({ dailyPour: 30, biscuitBreakout: 33, crossingStreet: 41 });
  expect(await page.evaluate(() => ['launchCrossingStreet', 'crossForMe', 'launchBiscuitBreakout']
    .filter((name) => name in window.__TEACUP__))).toEqual([]);
  expect(problems).toEqual([]);
});

test('desktop: real keys hop four ways, a cautious crossing is perfect, pays once, and steam still fires', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full'); await toCrossingOffer(page);
  await page.waitForTimeout(600);
  await shot(page, testInfo, 'offer');
  const before = await state(page);
  await page.locator('[data-interlude="accept"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'crossing');
  await page.waitForTimeout(500);
  await shot(page, testInfo, 'introduction');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toContainText('CROSSING THE STREET ·');
  // Along the curb, which is always safe: A, ←, D, →.
  await hop(page, 'KeyA'); expect((await street(page)).spoon.col).toBe(5);
  await hop(page, 'ArrowRight'); await hop(page, 'KeyD'); expect((await street(page)).spoon.col).toBe(7);
  await hop(page, 'ArrowLeft'); expect((await street(page)).spoon.col).toBe(6);
  await shot(page, testInfo, 'traffic');
  // Into the first lane and back, with it held clear: W, S, ↑, ↓.
  await clearFirstLane(page);
  await hop(page, 'KeyW'); expect((await street(page)).spoon.row).toBe(1);
  await hop(page, 'KeyS'); expect((await street(page)).spoon.row).toBe(0);
  await hop(page, 'ArrowUp'); await hop(page, 'ArrowDown');
  const walked = await street(page);
  expect(walked).toMatchObject({ hops: 8, hits: 0, spoon: { row: 0, col: 6 } });
  // Holding a direction keeps hopping at the street's pace.
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__TEACUP__.game.state.crossingStreet.spoon.col <= 3, null, { timeout: 3000 });
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(300);
  const stopped = (await street(page)).spoon.col;
  await page.waitForTimeout(300);
  expect((await street(page)).spoon.col).toBe(stopped);
  expect(await state(page)).toMatchObject({ milkLeft: before.milkLeft, sugarLeft: before.sugarLeft, shots: [] });
  await crossSafely(page);
  const done = await street(page);
  expect(done.summary).toMatchObject({ success: true, perfect: true, hits: 0, lanes: 5, points: 140, cash: 5,
    title: 'NOT A SCRATCH ON THE SILVER!' });
  await page.waitForTimeout(450);
  await shot(page, testInfo, 'tea-shop-exchange');
  await page.waitForTimeout(1300);
  await expect(page.locator('#roundTitle')).toHaveText('NOT A SCRATCH ON THE SILVER!');
  await shot(page, testInfo, 'result-perfect');
  await shot(page, testInfo, 'desktop-full');
  const paid = await state(page);
  expect(paid).toMatchObject({ score: before.score + 140, teaCash: before.teaCash + 5, lives: before.lives,
    round: before.round, heat: before.heat, nextFortune: before.nextFortune, progress: before.progress, spoon: before.spoon });
  await page.keyboard.press('Space'); // nothing on the result
  await page.keyboard.press('Enter');
  await expect(page.locator('#roundNum')).toHaveText('28');
  expect(await state(page)).toMatchObject({ phase: 'playing', fortune: before.nextFortune, score: paid.score,
    teaCash: paid.teaCash, crossingStreet: null, shots: [] });
  // Back in the cup, held Space is continuous steam again.
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBeGreaterThanOrEqual(3);
  expect(problems).toEqual([]);
});

test('bumps cost an attempt, never a cup: one bump still crosses; three end the attempt', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full'); await toCrossingOffer(page);
  const before = await state(page);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await bumpSpoon(page, { getUp: false });
  await page.waitForTimeout(150);
  await shot(page, testInfo, 'collision');
  await advanceStreet(page, 1.3);
  expect(await street(page)).toMatchObject({ hits: 1, attempts: 2, spoon: { row: 0, col: 6, fallen: null } });
  await expect(page.locator('#hudLives')).toHaveText('ATTEMPTS ● ● ○');
  await crossSafely(page);
  await advanceStreet(page, 1.6);
  const made = await street(page);
  expect(made.summary).toMatchObject({ success: true, perfect: false, hits: 1, points: 100, cash: 5, title: 'THE SPOON MADE IT!' });
  await shot(page, testInfo, 'result-success');
  await page.keyboard.press('Enter');
  await expect(page.locator('#roundNum')).toHaveText('28');
  expect((await state(page)).lives).toBe(before.lives);

  await openGame(page, '&seed=42&view=full'); await toCrossingOffer(page);
  const again = await state(page);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  for (let i = 0; i < 3; i++) await bumpSpoon(page);
  const failed = await street(page);
  expect(failed).toMatchObject({ stage: 'outro', hits: 3, attempts: 0 });
  expect(failed.summary).toMatchObject({ reason: 'attempts', success: false, cash: 0, title: 'THE TRAFFIC HAS SPOKEN.' });
  await expect(page.locator('#hudLives')).toHaveText('ATTEMPTS ○ ○ ○');
  await shot(page, testInfo, 'result-failure');
  const after = await state(page);
  expect(after).toMatchObject({ lives: again.lives, teaCash: again.teaCash, score: again.score + failed.summary.points });
  expect(problems).toEqual([]);
});

test('the clock runs out into a failure that costs nothing', async ({ page, problems }) => {
  await openGame(page, '&seed=7&view=full'); await toCrossingOffer(page);
  const before = await state(page);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await advanceStreet(page, 42); // the result guards itself for its first moments
  expect((await street(page)).summary).toMatchObject({ reason: 'time', success: false, points: 0, cash: 0 });
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(await state(page)).toMatchObject({ lives: before.lives, score: before.score, teaCash: before.teaCash });
  expect(problems).toEqual([]);
});

test('pause, Tea Break and backgrounding freeze the street; held keys never leak into the cup', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGame(page, '&seed=42&view=compact'); await toCrossingOffer(page);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Enter');
  const { milkLeft, sugarLeft } = await state(page);
  await key(page, 'Space');
  for (let i = 0; i < 10; i++) await key(page, 'Space', 'keydown', true);
  await key(page, 'Space', 'keyup');
  await key(page, 'KeyM'); await key(page, 'KeyQ'); await key(page, 'KeyE');
  expect(await state(page)).toMatchObject({ milkLeft, sugarLeft, shots: [] });
  expect((await street(page)).hops).toBe(0);
  await shot(page, testInfo, 'desktop-compact');
  await page.keyboard.press('KeyP');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  const paused = await street(page);
  await page.keyboard.down('ArrowLeft'); await page.keyboard.press('KeyA');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowLeft');
  expect(await street(page)).toEqual(paused);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(250);
  expect((await street(page)).hops).toBe(0); // resuming never hops
  await page.locator('#menuBtn').click(); await expect(page.locator('#teaBreak')).toBeVisible();
  const menu = await street(page);
  await page.waitForTimeout(250);
  expect(await street(page)).toEqual(menu);
  await page.locator('#closeBreak').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'crossingStreet');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  const hidden = await street(page);
  await page.waitForTimeout(300);
  expect(await street(page)).toEqual(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.press('KeyP');
  await advanceStreet(page, 41);
  expect((await street(page)).stage).toBe('outro');
  // Leave with an arrow and Space still held: neither may turn or steam in the next cup.
  await page.evaluate(() => document.activeElement?.blur());
  await key(page, 'ArrowLeft'); await key(page, 'Space');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  const angle = (await state(page)).angle;
  for (let i = 0; i < 8; i++) { await key(page, 'ArrowLeft', 'keydown', true); await key(page, 'Space', 'keydown', true); }
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBe(0);
  expect((await state(page)).angle).toBe(angle);
  await key(page, 'Space', 'keyup'); await key(page, 'ArrowLeft', 'keyup');
  await key(page, 'Space');
  await page.waitForTimeout(400);
  await key(page, 'Space', 'keyup');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBeGreaterThanOrEqual(2);
  expect(problems).toEqual([]);
});

test('after round 30, the Day choice waits for the crossing and is applied exactly once', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full'); await toCrossingOffer(page, { round: 30, heat: 20 });
  const before = await state(page);
  expect(before).toMatchObject({ dayPending: true, phase: 'arcadeOffer' });
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await crossSafely(page);
  await advanceStreet(page, 1.6);
  expect(await state(page)).toMatchObject({ round: 30, heat: 20, dayPending: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('#dayOffer')).toBeVisible();
  await shot(page, testInfo, 'day-after-crossing');
  await page.locator('[data-day="fresh"]').click();
  await expect(page.locator('#roundNum')).toHaveText('31');
  expect(await state(page)).toMatchObject({ phase: 'playing', round: 31, heat: 0, dayPending: false, fortune: before.nextFortune });
  expect(problems).toEqual([]);
});

test('after round 40, skipping the crossing still leads to the Day choice', async ({ page, problems }) => {
  await openGame(page, '&seed=9&view=full'); await toCrossingOffer(page, { round: 40, heat: 25 });
  await page.keyboard.press('Digit2');
  await expect(page.locator('#dayOffer')).toBeVisible();
  await page.locator('[data-day="keep"]').click();
  await expect(page.locator('#roundNum')).toHaveText('41');
  expect(await state(page)).toMatchObject({ round: 41, heat: 26, dayPending: false, crossingStreet: null });
  expect(problems).toEqual([]);
});
