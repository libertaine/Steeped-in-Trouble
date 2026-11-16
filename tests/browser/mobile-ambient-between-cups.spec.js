import { expect, openGame, test } from './fixtures.js';
import { ambientState, protectedOverlaps } from './ambient.js';
import { freezeTextClock, stageTextReading } from './textMischief.js';

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`mobile reading choices retain safe space restrictions at ${viewport.width} × ${viewport.height}`, async ({ page, problems }) => {
    await freezeTextClock(page);
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&ambientSeed=7');
    await stageTextReading(page, { offer: true });
    await page.evaluate(() => Object.assign(window.__TEACUP__.game.state, { teaCash: 100, milkLeft: 0, sugarLeft: 0 }));
    await page.clock.runFor(500);
    await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
    for (let i = 0; i < 20; i++) {
      await page.clock.runFor(250);
      const state = await ambientState(page);
      expect(state.policy).toBe('run');
      expect(state.count).toBeLessThanOrEqual(2);
      if (viewport.width < viewport.height) expect(state).toMatchObject({ count: 0, room: 0, hidden: true });
      expect((await protectedOverlaps(page, { samples: 1, interval: 0 })).hits).toEqual([]);
    }
    await page.locator('[data-supply="milk"]').tap();
    await page.clock.runFor(100);
    await expect(page.locator('#restockCash')).toHaveText('Cash: 90');
    await page.locator('.upgrade-card').first().tap();
    await page.clock.runFor(500);
    await expect(page.locator('#upgradeOffer')).toBeHidden();
    expect(problems).toEqual([]);
  });
}
