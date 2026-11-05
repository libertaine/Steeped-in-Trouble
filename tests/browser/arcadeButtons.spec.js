import { expect, openGame, test } from './fixtures.js';
import { checkpointRound } from './collection.js';

for (const width of [1280, 375]) {
  test(`tea-label buttons retain their palette through hover, focus and press at ${width}px`, async ({ page, problems }, testInfo) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 720 });
    await openGame(page, '', { onboarding: true });

    const checkStates = async (selector, background, border) => {
      const button = page.locator(selector);
      await page.mouse.move(0, 0);
      await expect(button).toHaveCSS('background-color', background);
      await expect(button).toHaveCSS('border-top-color', border);
      await button.hover();
      await expect(button).toHaveCSS('background-color', background);
      await expect(button).toHaveCSS('border-top-color', border);
      await expect(button).toHaveCSS('filter', 'brightness(1.1)');
      // Tab away and back gives actual keyboard focus, including after hover.
      await button.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(button).toBeFocused();
      await expect(button).toHaveCSS('outline-style', 'solid');
      // Compare with a 3px reference: headed Windows can quantize CSS borders
      // using host scaling even when the emulated devicePixelRatio is 1.
      const outlineWidth = await page.evaluate(() => {
        const reference = document.createElement('div');
        reference.style.outline = '3px solid red';
        document.body.append(reference);
        const width = getComputedStyle(reference).outlineWidth;
        reference.remove();
        return width;
      });
      await expect(button).toHaveCSS('outline-width', outlineWidth);
      await expect(button).toHaveCSS('outline-color', 'rgb(121, 54, 63)');
      await expect(button).toHaveCSS('background-color', background);
      await button.hover();
      await page.mouse.down();
      await expect(button).toHaveCSS('background-color', background);
      await expect(button).toHaveCSS('box-shadow', 'none');
      await expect(button).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 3)');
      // Release outside the button so checking its press does not activate it.
      await page.mouse.move(0, 0);
      await page.mouse.up();
    };

    await checkStates('#titleContinueBtn', 'rgb(41, 76, 59)', 'rgb(41, 76, 59)');
    await page.locator('#titleContinueBtn').hover();
    await page.screenshot({ path: testInfo.outputPath('title-hover-focus.png'), animations: 'disabled' });
    await page.locator('#titleContinueBtn').click();
    await checkStates('#overlayPrimaryBtn', 'rgb(41, 76, 59)', 'rgb(41, 76, 59)');
    await page.locator('#overlayPrimaryBtn').click();
    await checkpointRound(page);
    await page.reload();
    await expect(page.locator('#titleContinueBtn')).toBeEnabled();
    await page.locator('#titleContinueBtn').click();
    await expect(page.locator('#overlayPrimaryBtn')).toContainText('CONTINUE YOUR POT');
    await checkStates('#overlayPrimaryBtn', 'rgb(41, 76, 59)', 'rgb(41, 76, 59)');
    await checkStates('#overlayNewPotBtn', 'rgba(0, 0, 0, 0)', 'rgb(164, 134, 71)');
    await page.locator('#overlayPrimaryBtn').hover();
    await page.screenshot({ path: testInfo.outputPath('instructions-hover-focus.png'), animations: 'disabled' });
    await page.locator('#overlayPrimaryBtn').click();
    await page.locator('#menuBtn').click();
    await page.locator('#closeBreak').hover();
    await expect(page.locator('#closeBreak')).toHaveCSS('background-color', 'rgb(53, 97, 74)');
    await expect(page.locator('#closeBreak')).toHaveCSS('border-top-color', 'rgb(165, 218, 187)');
    expect(problems).toEqual([]);
  });
}
