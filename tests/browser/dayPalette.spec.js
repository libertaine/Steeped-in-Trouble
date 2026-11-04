import { test, expect, openGame } from './fixtures.js';
import { toDayReading } from './days.js';
import { POT_KEY, expectPalette, fixedColours, ground, rgb, saveAt, toDay } from './dayPalette.js';
import { DAY_PALETTES } from '../../src/ui/dayPalette.js';

// The page ground's Day palette: decoration that follows the HUD's Day.

test('a new pot starts on Day 1 and each Day tints only the page ground', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full');
  await expectPalette(page, 1);
  await page.locator('#mainBtn').click();
  await expectPalette(page, 1);
  const day1 = await fixedColours(page);
  const grounds = new Set();
  for (let day = 1; day <= 8; day++) {
    await toDay(page, day);
    await expect(page.locator('#hudDay')).toContainText(`DAY ${day} · CUP 1/10`);
    await expectPalette(page, day); // set at once: no Day choice happened
    grounds.add((await ground(page)).image);
    expect(await fixedColours(page)).toEqual(day1);
  }
  expect(grounds.size).toBe(7); // Day 8 is Day 1 again
  const rule = (await ground(page)).rule;
  expect(rule).toMatch(/^(rgba|color)\(/); // a faint wash of the Day's paper, never solid
  expect(problems).toEqual([]);
});

test('the Day choice fades to the next palette without delaying the cup', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full');
  await toDayReading(page);
  await expect(page.locator('#dayOffer')).toBeVisible();
  await expectPalette(page, 1); // "Day 1 complete" is still Day 1
  const before = await fixedColours(page);
  await page.keyboard.press('2');
  // The cup starts straight away; the ground is still on its way.
  expect(await page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('playing');
  await expect(page.locator('#hudDay')).toHaveText('DAY 2 · CUP 1/10 · HEAT 10');
  const mid = await ground(page);
  expect(mid).toMatchObject({ id: 'sage', fade: 'on' });
  expect(mid.glow).not.toBe(rgb(DAY_PALETTES[1].glow));
  await expectPalette(page, 2, { fade: 'on' });
  const after = await fixedColours(page);
  expect(after.playfield).toBe(before.playfield);
  expect(after.brand).toBe(before.brand);
  // The fade is a CSS transition of about 0.8 s, on body only.
  expect(await page.evaluate(() => getComputedStyle(document.body).transitionDuration)).toMatch(/^0\.8s/);
  // Sound still toggles with M after the change.
  const sound = await page.evaluate(() => window.__TEACUP__.audio().enabled);
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.audio().enabled)).toBe(!sound);
  expect(problems).toEqual([]);
});

test('reduced motion, including a live change, and Low graphics apply the next Day at once', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full');
  await toDayReading(page);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // changed while the game is running
  await page.keyboard.press('1');
  const now = await ground(page);
  expect(now).toMatchObject({ id: 'sage', glow: rgb(DAY_PALETTES[1].glow), deep: rgb(DAY_PALETTES[1].deep) });
  expect(await page.evaluate(() => getComputedStyle(document.body).transitionDuration)).toBe('0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await openGame(page, '&seed=42&view=full&graphics=low');
  await toDayReading(page);
  await page.keyboard.press('2');
  await expect(page.locator('#hudDay')).toContainText('DAY 2');
  expect(await ground(page)).toMatchObject({ id: 'sage', fade: null, glow: rgb(DAY_PALETTES[1].glow) });
  // Switching graphics mid-pot keeps the palette.
  await page.evaluate(() => document.getElementById('graphicsBtn').click());
  await expectPalette(page, 2);
  expect(problems).toEqual([]);
});

test('Continue restores the saved Day, reloads are identical and a new pot returns to Day 1', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full');
  await saveAt(page, 34); // Day 4, cup 4
  await expectPalette(page, 4);
  const saved = await page.evaluate((k) => localStorage.getItem(k), POT_KEY);
  expect(saved).not.toMatch(/palette/i);
  for (let i = 0; i < 2; i++) {
    await page.reload(); await page.waitForFunction(() => window.__TEACUP__?.game);
    await expect(page.locator('#mainBtn')).toHaveText('CONTINUE YOUR POT');
    await expectPalette(page, 1); // nothing resumed yet
    await page.locator('#mainBtn').click();
    await expect(page.locator('#hudDay')).toContainText('DAY 4 · CUP 4/10');
    await expectPalette(page, 4); // at once, not faded
    expect(await page.evaluate((k) => localStorage.getItem(k), POT_KEY)).toBe(saved);
  }
  await page.reload(); await page.waitForFunction(() => window.__TEACUP__?.game);
  await page.locator('#newPotBtn').click();
  await page.locator('#confirmPotBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expectPalette(page, 1);
  expect(problems).toEqual([]);
});

test('the title keeps its Concept B colours and gameplay enters on the right Day', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full', { onboarding: true });
  await expect(page.locator('#arcadeSplash')).toBeVisible();
  const title = await fixedColours(page);
  expect(title.splash).toContain('rgb(36, 63, 51)');
  expect(title.label).toContain('rgb(245, 237, 214)');
  await toDay(page, 6); // the palette changes behind the dialog...
  await expectPalette(page, 6);
  const after = await fixedColours(page);
  expect({ splash: after.splash, label: after.label }).toEqual({ splash: title.splash, label: title.label }); // ...never on it
  await page.locator('#titleContinueBtn').click();
  await expect(page.locator('#arcadeSplash')).toBeHidden();
  await expectPalette(page, 6);
  expect(problems).toEqual([]);
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 800, height: 600 }]) {
  test(`${viewport.width}x${viewport.height}: the Day ground fills the page without overflow`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&view=full');
    await toDay(page, 3);
    await expectPalette(page, 3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The ambient ants still share the stage gutters.
    expect(await page.evaluate(() => typeof window.__TEACUP__.ambient?.snapshot())).toBe('object');
    expect(problems).toEqual([]);
  });
}
