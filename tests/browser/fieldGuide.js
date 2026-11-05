import { checkpointRound } from './collection.js';
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

// What Georgia becomes where it is not installed. Verdana stands in on Windows, so a
// machine that has Georgia still sees the wider, taller text an Ubuntu player sees.
const WITHOUT_GEORGIA = `
  .instruction-card, .overlay-title, .arcade-secondary-btn, .overlay-footer {
    font-family: 'DejaVu Serif', Verdana, serif !important;
  }`;

/** The tallest guide a player can really meet: a saved pot, from the title, with the touch line. */
async function openSavedPotGuide(page) {
  await openGame(page);
  await checkpointRound(page);
  await openGame(page, '&touch=easy', { onboarding: true });
  await page.locator('#titleContinueBtn').click();
  await expect(page.locator('#overlayPrimaryBtn')).toHaveText(/CONTINUE YOUR POT/);
  await expect(page.locator('#overlayNewPotBtn')).toBeVisible();
  // Its wording depends on whether on-screen buttons show; on a desktop it is the longer one.
  await expect(page.locator('#overlayTouchSummary')).toBeVisible();
  await expect(page.locator('#overlayTouchSummary')).toContainText('Easy Touch');
}

async function fixedPartsInView(page) {
  for (const selector of ['#instructionTitle', '#instructionObjective', '#overlayVersion', '#overlayPrimaryBtn',
    '#overlayNewPotBtn', '.overlay-footer']) {
    await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
  }
}

export function fieldGuideTests() {
  for (const [width, height] of [[1280, 720], [375, 667]]) {
    for (const [fonts, css] of [['system', ''], ['Georgia-free', WITHOUT_GEORGIA]]) {
      test(`the saved-pot guide with touch instructions fits at ${width}x${height} with ${fonts} fonts`, async ({ page, problems }) => {
        await page.setViewportSize({ width, height });
        await openSavedPotGuide(page);
        if (css) await page.addStyleTag({ content: css });

        // Everything is on screen at once: nothing to scroll, nothing cut off, nothing sideways.
        const fit = await page.locator('#overlayBody').evaluate((body) => ({
          hidden: body.scrollHeight - body.clientHeight,
          sideways: Math.max(body.scrollWidth - body.clientWidth,
            document.documentElement.scrollWidth - innerWidth,
            ...[...document.querySelectorAll('.instruction-card > *')].map((el) => el.scrollWidth - el.clientWidth)),
        }));
        expect(fit.hidden).toBeLessThanOrEqual(1);
        expect(fit.sideways).toBeLessThanOrEqual(1);
        await fixedPartsInView(page);
        await readEveryPart(page);
        await noOverflow(page);

        // Still readable and easy to press, and still the title screen's label.
        const sizes = await page.locator('#instructionOverlay').evaluate((dialog) => {
          const size = (selector) => parseFloat(getComputedStyle(dialog.querySelector(selector)).fontSize);
          return { title: size('#instructionTitle'), control: size('.overlay-controls-table th'), key: size('.keycap'),
            note: size('.overlay-notes'), touch: size('#overlayTouchSummary'), button: size('#overlayPrimaryBtn') };
        });
        expect(sizes.title).toBeGreaterThanOrEqual(28);
        expect(Math.min(sizes.control, sizes.note, sizes.touch, sizes.button)).toBeGreaterThanOrEqual(12);
        expect(sizes.key).toBeGreaterThanOrEqual(11);
        for (const selector of ['#overlayPrimaryBtn', '#overlayNewPotBtn']) {
          expect((await page.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
        await expect(page.locator('.instruction-card')).toHaveCSS('background-color', 'rgb(245, 237, 214)');

        // The keyboard still moves between the two actions, with the visible focus ring.
        await expect(page.locator('#overlayPrimaryBtn')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#overlayNewPotBtn')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#overlayPrimaryBtn')).toBeFocused();
        await expect(page.locator('#overlayPrimaryBtn')).toHaveCSS('outline-color', 'rgb(121, 54, 63)');

        await page.keyboard.press('Enter');
        await expect(page.locator('#instructionOverlay')).toBeHidden();
        await page.waitForFunction(() => document.body.dataset.phase === 'reading');
        expect(problems).toEqual([]);
      });
    }
  }

  test('in a window too short for it all, only the middle of the saved-pot guide scrolls', async ({ page, problems }) => {
    await page.setViewportSize({ width: 375, height: 500 });
    await openSavedPotGuide(page);
    await page.addStyleTag({ content: WITHOUT_GEORGIA });
    expect(await page.locator('#overlayBody').evaluate((body) => body.scrollHeight - body.clientHeight)).toBeGreaterThan(1);
    await fixedPartsInView(page);
    await readEveryPart(page);
    await fixedPartsInView(page); // scrolling the middle moved nothing else
    await noOverflow(page);
    expect(problems).toEqual([]);
  });

  test('the guide grows smoothly with the window, with no height where it suddenly stops fitting', async ({ page, problems }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await openSavedPotGuide(page);
    await page.addStyleTag({ content: WITHOUT_GEORGIA });
    const measure = async (height) => {
      await page.setViewportSize({ width: 1280, height });
      return page.locator('#overlayBody').evaluate((body) => ({
        hidden: body.scrollHeight - body.clientHeight, card: body.parentElement.getBoundingClientRect().height }));
    };
    let previous = await measure(640);
    for (let height = 641; height <= 760; height += 7) {
      const now = await measure(height);
      expect(now.hidden, `hidden at ${height}`).toBeLessThanOrEqual(1);
      // A line of text may wrap as the padding grows. The switch this replaced jumped about 90px.
      expect(Math.abs(now.card - previous.card), `jump at ${height}`).toBeLessThan(40);
      previous = now;
    }
    expect(problems).toEqual([]);
  });

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
