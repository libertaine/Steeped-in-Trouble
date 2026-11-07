import { test, expect, openGame } from './fixtures.js';
import { startTraining, hold, move, steam, milk, sugar, practice, view, layout, trainingLayoutTests, trainingClock } from './training.js';
import { checkpointRound } from './collection.js';

test('Training Cup teaches real keyboard actions, retries, pause, reference, replay and start @smoke', async ({ page, problems }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await startTraining(page);
  const capture = async (name) => {
    if (info.project.name === 'chromium') await page.screenshot({ path: `docs/images/training-cup/${name}.png` });
  };
  await capture('01-spoon'); await layout(page);
  await page.keyboard.down('ArrowLeft'); await page.clock.runFor(200);
  expect((await view(page)).stage).toBe(0);
  await page.keyboard.up('ArrowLeft'); await hold(page, 'ArrowRight', 200);
  expect((await view(page)).stage).toBe(1); await capture('02-steam');
  const radius = await page.evaluate(() => window.__TEACUP__.game.state.enemies[0].radius);
  await page.clock.runFor(8000);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.enemies[0].radius)).toBe(radius);
  await page.locator('#trainingRetry').click(); await steam(page);
  expect((await view(page)).stage).toBe(2); await capture('03-milk');
  await page.keyboard.press('KeyP'); await page.clock.runFor(50);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('KeyQ'); await page.clock.runFor(500);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.milkLeft)).toBe(2);
  await page.keyboard.press('KeyP'); await page.clock.runFor(50);
  await milk(page); expect((await view(page)).stage).toBe(3); await capture('04-sugar');
  await page.locator('#trainingGuide').click(); await expect(page.locator('#instructionOverlay')).toBeVisible();
  await page.locator('#overlayPrimaryBtn').click(); await page.locator('#closeBreak').click();
  await page.clock.runFor(50);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await sugar(page); expect((await view(page)).stage).toBe(4); await capture('05-practice');
  await practice(page); await capture('06-complete'); await layout(page);
  await expect(page.locator('#trainingHeading')).toBeFocused();
  await page.locator('#trainingAgain').click(); expect((await view(page)).stage).toBe(0);
  await move(page); await steam(page); await milk(page); await sugar(page); await practice(page);
  await page.locator('#trainingStart').click(); await page.clock.runFor(100);
  await expect(page.locator('body')).toHaveAttribute('data-training', 'false');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(problems).toEqual([]);
});

test('title and instructions offer optional training; Escape restores an existing saved pot and RNG', async ({ page, problems }) => {
  await openGame(page, '&seed=42', { onboarding: true });
  await page.locator('#titleTrainingBtn').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#trainingHeading')).toHaveText('FIRST, THE SPOON.');
  await page.keyboard.press('Escape'); await page.locator('#closeBreak').click();
  await page.evaluate(() => window.__TEACUP__.overlay.show());
  await page.locator('#overlayTrainingBtn').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#trainingHeading')).toHaveText('FIRST, THE SPOON.');
  await page.keyboard.press('Escape'); await page.locator('#closeBreak').click();
  await page.locator('#mainBtn').click(); await checkpointRound(page);
  const before = await page.evaluate(() => ({ state: structuredClone(window.__TEACUP__.game.state), rng: window.__TEACUP__.game.exportRandom(), saved: localStorage.getItem('steeped-in-trouble:pot-save') }));
  await page.locator('#menuBtn').click(); await page.locator('#breakTrainingBtn').click();
  await trainingClock(page); await move(page); await steam(page); await milk(page); await sugar(page); await practice(page);
  await page.locator('#trainingStart').click(); await page.clock.runFor(50);
  const after = await page.evaluate(() => ({ state: structuredClone(window.__TEACUP__.game.state), rng: window.__TEACUP__.game.exportRandom(), saved: localStorage.getItem('steeped-in-trouble:pot-save') }));
  // A reading's presentation clock can advance after returning, but no pot decision is made.
  after.state.readingTime = before.state.readingTime;
  expect(after).toEqual(before); expect(problems).toEqual([]);
});

test('focus loss and backgrounding pause training and discard held actions', async ({ page, problems }) => {
  await startTraining(page); await move(page);
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(80);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.clock.runFor(100);
  const before = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  await page.clock.runFor(4000);
  expect(await page.evaluate(() => structuredClone(window.__TEACUP__.game.state))).toEqual(before);
  await page.keyboard.up('ArrowRight'); await page.keyboard.press('KeyP'); await page.clock.runFor(50);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.press('Space'); await page.clock.runFor(1000);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(1000); await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('#mainBtn')).toBeVisible();
  await page.locator('#mainBtn').click(); await page.clock.runFor(100);
  expect((await view(page)).stage).toBe(1);
  await page.keyboard.press('Escape'); await expect(page.locator('#teaBreak')).toBeVisible();
  expect(problems).toEqual([]);
});

trainingLayoutTests();
