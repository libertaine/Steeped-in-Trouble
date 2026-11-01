import { expect, openGame, test } from './fixtures.js';

// The instruction overlay on a real touch screen (Pixel 7): it explains the
// touch layout actually in use, fits the phone, and starts with a tap.

const openTitle = async (page, query = '') => {
  await openGame(page, query, { onboarding: true });
  if (!/[&](noOverlay|arcade|day|cup|fortune)/.test(query)) {
    await page.locator('#titleContinueBtn').tap();
  }
};

async function expectOnScreen(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(box, selector).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
}

test('a phone starts on Easy Touch, and the overlay says so: pads to steer, gestures on the cup', async ({ page, problems }) => {
  await openTitle(page);
  const touch = page.locator('#overlayTouchSummary');
  await expect(touch).toBeVisible();
  await expect(touch).toContainText('Easy Touch:');
  await expect(touch).toContainText('Steam fires by itself');
  await expect(touch).toContainText('Double-tap the cup for milk');
  await expect(touch).toContainText('hold a finger on the cup for sugar');
  for (const selector of ['#instructionTitle', '#overlayTouchSummary', '#overlayPrimaryBtn', '.overlay-footer']) {
    await expectOnScreen(page, selector);
  }

  await page.locator('#overlayPrimaryBtn').tap();
  await expect(page.locator('#instructionOverlay')).toBeHidden();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  expect(problems).toEqual([]);
});

test('with Classic Touch the overlay names the TURN, STEAM, MILK, and SUGAR buttons instead', async ({ page, problems }) => {
  await openTitle(page, '&touch=classic');
  const touch = page.locator('#overlayTouchSummary');
  await expect(touch).toContainText('Classic Touch:');
  await expect(touch).toContainText('STEAM to fire');
  await expect(touch).toContainText('Tap MILK or SUGAR');
  await expect(touch).not.toContainText('Double-tap');

  await openTitle(page, '&touch=classic&autosteam=on');
  await expect(touch).toContainText('Auto Steam is on');
  expect(problems).toEqual([]);
});

test('taps on the cup and the touch pads behind the overlay do nothing', async ({ page, problems }) => {
  await openTitle(page);
  await expect(page.locator('#instructionOverlay')).toBeVisible();
  const before = await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return { phase: s.phase, angle: s.angle, milk: s.milkLeft };
  });
  await page.touchscreen.tap(8, 8);
  await page.touchscreen.tap(8, 8);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return { phase: s.phase, angle: s.angle, milk: s.milkLeft };
  });
  expect(after).toEqual(before);
  await expect(page.locator('#instructionOverlay')).toBeVisible();
  expect(problems).toEqual([]);
});
