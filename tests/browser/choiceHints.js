import { expect, openGame, test } from './fixtures.js';
import { checkpointRound } from './collection.js';
import { toShortage } from './errand.js';

async function expectHints(page, selector, numbers) {
  const cards = page.locator(selector);
  await expect(cards.locator('kbd')).toHaveText(numbers);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    const hint = card.locator('kbd');
    await expect(hint).toBeVisible();
    await expect(hint).toBeInViewport({ ratio: 1 });
    expect(await card.evaluate((el) => {
      const k = el.querySelector('kbd').getBoundingClientRect();
      const text = el.querySelector('span').getBoundingClientRect();
      const card = el.getBoundingClientRect();
      return k.width >= 20 && k.height > 10 && k.right <= text.left
        && k.left >= card.left && text.right <= card.right
        && el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
    })).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

export function choiceHintsTests() {
  for (const [width, height] of [[1280, 720], [375, 667], [844, 390]]) {
    test(`numbered choices remain visible and selectable at ${width}x${height}`, async ({ page, problems }) => {
      await page.setViewportSize({ width, height });
      for (const [method, index] of [['1', 0], ['2', 1], ['click', 0], ['click', 1]]) {
        await openGame(page, `&seed=42`);
        await checkpointRound(page);
        await page.evaluate(() => {
          Object.assign(window.__TEACUP__.game.state, { readingTime: 3, offer: ['polished', 'strainer'] });
        });
        await expect(page.locator('#upgradeOffer')).toBeVisible();
        await expectHints(page, '.upgrade-card', ['1', '2']);
        const first = page.locator('[data-choice="0"]');
        await first.focus();
        await page.keyboard.press('Tab');
        const second = page.locator('[data-choice="1"]');
        await expect(second).toBeFocused();
        await expect(second).toHaveCSS('outline-style', 'solid');
        if (method === 'click') await page.locator(`[data-choice="${index}"]`).click();
        else {
          await page.locator('#game').focus();
          await page.keyboard.press(method);
        }
        await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
        expect(await page.evaluate(() => window.__TEACUP__.game.state.spoon)).toEqual({
          polished: index === 0 ? 1 : 0, strainer: index === 1 ? 1 : 0, quickStir: 0, sugarScoop: 0,
        });
        // Each selection is a fresh pot, independent of the checkpoint just saved.
        await page.evaluate(() => localStorage.removeItem('steeped-in-trouble:pot-save'));
      }
      await openGame(page, `&seed=42`);
      await toShortage(page);
      await expectHints(page, '#errandOffer .errand-card', ['1', '2', '3']);
      await page.locator('#game').focus();
      await page.keyboard.press('2');
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'teaRun');
      expect(problems).toEqual([]);
    });
  }
}
