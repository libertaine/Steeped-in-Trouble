import { expect, openGame, test } from './fixtures.js';

async function noOverflow(page) {
  expect(await page.locator('#instructionOverlay').evaluate((dialog) => {
    const box = dialog.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1
      && dialog.scrollWidth <= dialog.clientWidth + 1
      && document.querySelector('#overlayBody').scrollWidth <= document.querySelector('#overlayBody').clientWidth + 1;
  })).toBe(true);
}

async function readEveryPart(page) {
  for (const selector of ['.overlay-controls-table tr', '.overlay-notes p', '#overlayTouchSummary p']) {
    for (const part of await page.locator(selector).all()) {
      await expect(part).toBeVisible();
      // Check every word, including paragraphs taller than the scroll area.
      // Scroll offsets round to CSS pixels, so allow the same 1px geometry
      // tolerance used by the existing onboarding layout checks.
      expect(await part.evaluate((el) => {
        const body = document.querySelector('#overlayBody');
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          for (const word of node.textContent.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, word.index);
            range.setEnd(node, word.index + word[0].length);
            const area = body.getBoundingClientRect(), before = range.getBoundingClientRect();
            body.scrollTop += before.top - area.top - (area.height - before.height) / 2;
            const b = range.getBoundingClientRect();
            if (b.top < area.top - 1 || b.bottom > area.bottom + 1 || b.left < area.left - 1 || b.right > area.right + 1) return false;
          }
        }
        return true;
      })).toBe(true);
    }
  }
}

export function fieldGuideTests() {
  for (const view of ['full', 'compact']) {
    for (const [width, height] of [[320, 568], [844, 390], [800, 1280], [1024, 768]]) {
      test(`field guide ${view} keeps controls and saved-pot actions accessible at ${width}x${height}`, async ({ page, problems }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(() => localStorage.setItem('steeped-in-trouble:onscreen-controls', 'hide'));
        await openGame(page, `&view=${view}&touch=classic`, { onboarding: true });
        await page.locator('#titleInstructionsBtn').click();
        const dialog = page.getByRole('dialog', { name: 'Before You Brew' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-describedby', 'instructionObjective');
        await expect(page.locator('.instruction-card')).toHaveCSS('background-color', 'rgb(245, 237, 214)');
        const controls = page.locator('.overlay-controls-table');
        await expect(controls.getByRole('row', { name: /Turn spoon/ }).locator('kbd')).toHaveText(['←', '→', 'A', 'D']);
        await expect(controls.getByRole('row', { name: /Fire steam/ }).locator('kbd')).toHaveText(['SPACE']);
        await expect(controls.getByRole('row', { name: /Pour milk/ }).locator('kbd')).toHaveText(['↑', 'Q']);
        await expect(controls.getByRole('row', { name: /Fire sugar/ }).locator('kbd')).toHaveText(['↓', 'E']);
        await expect(controls.getByRole('row', { name: /Pause/ }).locator('kbd')).toHaveText(['P', 'M']);
        // Exercise the taller presentation; real save/confirmation behavior is
        // covered by arcadeTitleOnboarding, without a synthetic save here.
        await page.evaluate(() => window.__TEACUP__.overlay.show({ hasSavedPot: true }));
        await expect(page.locator('#overlayNewPotBtn')).toBeVisible();
        await noOverflow(page);
        await readEveryPart(page);
        for (const selector of ['#overlayPrimaryBtn', '#overlayNewPotBtn']) {
          await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
        }
        await page.keyboard.press('Tab');
        await expect(page.locator('#overlayNewPotBtn')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#overlayPrimaryBtn')).toBeFocused();
        await expect(page.locator('#overlayPrimaryBtn')).toHaveCSS('outline-color', 'rgb(121, 54, 63)');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        await expect(page.locator('#overlayPrimaryBtn')).toHaveCSS('animation-name', 'none');
        expect(problems).toEqual([]);
      });
    }

    test(`field guide ${view} supports enlarged text and long touch descriptions`, async ({ page, problems }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.addInitScript(() => localStorage.setItem('steeped-in-trouble:onscreen-controls', 'hide'));
      await openGame(page, `&view=${view}&touch=easy`, { onboarding: true });
      await page.locator('#titleContinueBtn').click();
      await page.evaluate(() => window.__TEACUP__.overlay.show({ hasSavedPot: true }));
      // Simulate text-only enlargement, leaving the viewport and control sizes
      // alone. Read all computed sizes before setting them to avoid compounding.
      await page.locator('#instructionOverlay').evaluate((dialog) => {
        const sizes = [...dialog.querySelectorAll('*')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
        for (const [el, size] of sizes) el.style.fontSize = `${size * 1.5}px`;
      });
      await noOverflow(page);
      await readEveryPart(page);
      await expect(page.locator('#overlayPrimaryBtn')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('#overlayNewPotBtn')).toBeInViewport({ ratio: 1 });
      expect(problems).toEqual([]);
    });
  }
}
