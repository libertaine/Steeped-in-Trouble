import { test, expect, openGame } from './fixtures.js';
import { checkpointRound, finishPractice, layoutChecks, openCollection } from './collection.js';

for (const [name, viewport] of [['phone-portrait', { width: 393, height: 851 }],
  ['phone-landscape', { width: 851, height: 393 }], ['tablet-landscape', { width: 1180, height: 820 }]]) {
  test(`${name}: collection cards, touch play, records and Continue Pot fit`, async ({ page, problems }) => {
    await page.setViewportSize(viewport); await openGame(page, '&view=compact');
    await page.screenshot({ path: `docs/images/arcade-collection/${name}-initial.png`, fullPage: false, scale: 'css' });
    await openCollection(page); await layoutChecks(page);
    await page.screenshot({ path: `docs/images/arcade-collection/${name}-collection.png`, fullPage: false, scale: 'css' });
    for (const id of ['teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']) {
      await page.locator(`[data-job="${id}"]`).tap();
      await expect(page.locator('#backPotBtn')).toBeVisible();
      if (id === 'crossingStreet') {
        await page.evaluate(() => window.__TEACUP__.game.primaryAction());
        await page.locator('[data-walk="left"]').tap();
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => window.__TEACUP__.game.state.crossingStreet.hops)).toBeGreaterThan(0);
        await page.locator('#chooseJobBtn').tap(); await page.locator(`[data-job="${id}"]`).tap();
      }
      await finishPractice(page, id, true);
      if (id === 'crossingStreet') await page.screenshot({ path: `docs/images/arcade-collection/${name}-result.png`, fullPage: false, scale: 'css' });
      for (const button of await page.locator('#practiceBar button:visible').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await page.locator('#chooseJobBtn').tap();
    }
    await page.locator('#closeCollectionBtn').tap();
    await checkpointRound(page); await page.reload();
    await expect(page.locator('#mainBtn')).toHaveText('CONTINUE YOUR POT');
    await page.screenshot({ path: `docs/images/arcade-collection/${name}-continue.png`, fullPage: false, scale: 'css' });
    await page.locator('#mainBtn').tap(); await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
    expect(problems).toEqual([]);
  });
}
