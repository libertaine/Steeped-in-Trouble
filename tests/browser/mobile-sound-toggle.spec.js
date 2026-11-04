import { expect, openGame, test } from './fixtures.js';

// The speakers on a phone: big enough to tap, inside the screen, and clear of
// everything else that can be tapped or read.

const audio = (page) => page.evaluate(() => window.__TEACUP__.audio());

async function box(page, selector) {
  const b = await page.locator(selector).boundingBox();
  expect(b, selector).not.toBeNull();
  return b;
}
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function expectClear(page, speaker, others) {
  const { width, height } = page.viewportSize();
  const s = await box(page, speaker);
  expect(s.width).toBeGreaterThanOrEqual(44);
  expect(s.height).toBeGreaterThanOrEqual(44);
  expect(s.x).toBeGreaterThanOrEqual(0);
  expect(s.y).toBeGreaterThanOrEqual(0);
  expect(s.x + s.width).toBeLessThanOrEqual(width + 1);
  expect(s.y + s.height).toBeLessThanOrEqual(height + 1);
  for (const other of others) {
    if (!(await page.locator(other).isVisible())) continue;
    expect(overlaps(s, await box(page, other)), `${speaker} overlaps ${other}`).toBe(false);
  }
}

for (const [label, size] of [['portrait', null], ['landscape', { width: 915, height: 412 }]]) {
  test(`speakers are tappable and clear of the game in ${label}`, async ({ page, problems }) => {
    if (size) await page.setViewportSize(size);
    await openGame(page, '&seed=42', { onboarding: true });
    await expect(page.locator('#titleContinueBtn')).toBeEnabled();
    await expectClear(page, '#titleSoundBtn', ['#titleContinueBtn', '#titleInstructionsBtn', '#titleGraphicsBtn',
      '.splash-title', '.splash-subtitle', '.splash-tagline', '.splash-edition', '.splash-imprint']);
    await page.locator('#titleSoundBtn').tap();
    await expect.poll(async () => (await audio(page)).enabled).toBe(true);
    await expect(page.locator('#arcadeSplash')).toBeVisible();

    await page.locator('#titleContinueBtn').tap();
    await page.locator('#overlayPrimaryBtn').tap();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = 1000; });
    await expectClear(page, '#headerSoundBtn', ['.brand', '#viewBtn', '#menuBtn', '#game', '#resourceStrip',
      '.resource-secondary', '.controls-easy [data-hold="left"]', '.controls-easy [data-hold="right"]']);
    const before = await page.evaluate(() => JSON.stringify({ milk: window.__TEACUP__.game.state.milkLeft, sugar: window.__TEACUP__.game.state.sugarLeft, shots: window.__TEACUP__.game.state.shots.length }));
    await page.locator('#headerSoundBtn').tap();
    await expect.poll(async () => (await audio(page)).enabled).toBe(false);
    await expect(page.locator('#headerSoundBtn')).toHaveAttribute('aria-label', 'Unmute audio');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    expect(await page.evaluate(() => JSON.stringify({ milk: window.__TEACUP__.game.state.milkLeft, sugar: window.__TEACUP__.game.state.sugarLeft, shots: window.__TEACUP__.game.state.shots.length }))).toBe(before);

    await page.locator('#menuBtn').tap();
    await expect(page.locator('#teaBreak')).toBeVisible();
    await expectClear(page, '#breakSoundBtn', ['#closeBreak', '#teaBreakTitle', '#breakCollectionBtn']);
    await page.locator('#breakSoundBtn').tap();
    await expect.poll(async () => (await audio(page)).enabled).toBe(true);
    await expect(page.locator('#headerSoundBtn')).toHaveAttribute('aria-label', 'Mute audio');
    await page.locator('#closeBreak').tap();
    await expect(page.locator('#teaBreak')).toBeHidden();
    expect(problems).toEqual([]);
  });
}
