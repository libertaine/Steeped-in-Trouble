import { expect, openGame, test } from './fixtures.js';
import { expectDayButtons, toDayReading } from './days.js';

async function expectLayout(page) {
  await expect(page.locator('#viewBtn, #breakViewBtn, body[data-view]')).toHaveCount(0);
  await expect(page.locator('main')).toHaveCSS('display', 'flex');
  await expect(page.locator('main > aside')).toBeHidden();
  for (const id of ['errandOffer', 'arcadeOffer', 'dayOffer']) {
    await expect(page.locator(`#phaseChoices > #${id}`)).toHaveCount(1);
  }
  const canvas = await page.locator('#game').boundingBox();
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);
  expect(canvas.width / canvas.height).toBeCloseTo(920 / 790, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

export function layoutTests() {
  test('Day choices hide both control schemes with Show in portrait and landscape', { tag: '@smoke' }, async ({ page, problems }) => {
    await page.addInitScript(() => {
      localStorage.setItem('steeped-in-trouble:onscreen-controls', 'show');
      localStorage.removeItem('steeped-in-trouble:pot-save');
    });
    for (const touch of ['easy', 'classic']) {
      for (const [width, height] of [[375, 667], [844, 390]]) {
        await openGame(page, `&seed=42&touch=${touch}`);
        await page.setViewportSize({ width, height });
        await expect(page.locator(`.controls-${touch}`)).toBeVisible();
        await toDayReading(page);
        await expectDayButtons(page);
        for (const group of await page.locator('.controls-mobile').all()) await expect(group).toBeHidden();
        await page.keyboard.press('1');
        await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
        await expect(page.locator(`.controls-${touch}`)).toBeVisible();
        expect(await page.evaluate(() => window.__TEACUP__.game.state.round)).toBe(11);
      }
    }
    expect(problems).toEqual([]);
  });

  for (const stored of ['full', 'compact', 'broken']) {
    for (const query of ['', '&view=full', '&view=compact']) {
      test(`retired preference ${stored} and URL ${query || '(none)'} use the sole layout`, async ({ page, problems }) => {
        await page.addInitScript((stored) => {
          localStorage.setItem('steeped-in-trouble:view', stored);
          localStorage.setItem('steeped-in-trouble:controls', '{"touch":"classic","autoSteam":false}');
        }, stored);
        await openGame(page, `&seed=42${query}`);
        await expectLayout(page);
        await page.keyboard.press('Enter');
        await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
        await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
        await page.locator('#menuBtn').click();
        await expect(page.locator('#teaBreak aside')).toBeVisible();
        await expect(page.locator('#viewBtn, #breakViewBtn')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.locator('#game')).toBeFocused();
        await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
        await page.reload();
        await expectLayout(page);
        // Retiring this key neither reads nor rewrites the old preference or the controls.
        expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:view'))).toBe(stored);
        expect(await page.evaluate(() => window.__TEACUP__.settings())).toEqual({ touch: 'classic', autoSteam: false });
        expect(problems).toEqual([]);
      });
    }
  }

  test('legacy URL loads with denied view storage and never accesses that key', async ({ page, problems }) => {
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      window.__viewAccesses = [];
      Storage.prototype.getItem = function (key) {
        if (key === 'steeped-in-trouble:view') { window.__viewAccesses.push('read'); throw Error('denied'); }
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === 'steeped-in-trouble:view') { window.__viewAccesses.push('write'); throw Error('denied'); }
        return set.call(this, key, value);
      };
    });
    await openGame(page, '&view=full');
    await expectLayout(page);
    await page.locator('#menuBtn').click();
    await page.keyboard.press('Escape');
    await expectLayout(page);
    expect(await page.evaluate(() => window.__viewAccesses)).toEqual([]);
    expect(problems).toEqual([]);
  });
}
