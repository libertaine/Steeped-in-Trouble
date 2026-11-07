import { test, expect } from './fixtures.js';
import { startTraining, layout, view, practice, trainingLayoutTests } from './training.js';

for (const scheme of ['classic', 'easy']) {
  test(`Training Cup pointer controls and ${scheme} instructions @smoke`, async ({ page, problems }) => {
    await startTraining(page, `&touch=${scheme}&autosteam=on`);
    await layout(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.clock.runFor(50);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
    await expect(page.locator('#mainBtn')).toBeVisible();
    await page.locator('#mainBtn').tap(); await page.clock.runFor(50);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    async function pad(hold, time = 130) {
      const b = page.locator(`.controls-${scheme} [data-hold="${hold}"]`);
      const r = await b.boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down(); await page.clock.runFor(time); await page.mouse.up(); await page.clock.runFor(100);
    }
    await pad('left'); await pad('right'); expect((await view(page)).stage).toBe(1);
    await expect(page.locator('#trainingInstruction')).toContainText('automatically');
    await page.clock.runFor(4000); expect((await view(page)).stage).toBe(1);
    await pad('right', 16); await page.clock.runFor(800); expect((await view(page)).stage).toBe(2);
    if (scheme === 'easy') {
      await expect(page.locator('#trainingInstruction')).toContainText('Double-tap');
      await page.locator('#game').tap(); await page.clock.runFor(100); await page.locator('#game').tap();
    } else {
      await expect(page.locator('#trainingInstruction')).toContainText('MILK');
      await page.locator('#milkBtn').tap();
    }
    await page.clock.runFor(1100); expect((await view(page)).stage).toBe(3);
    await page.locator('#trainingGuide').tap();
    await page.locator('#overlayPrimaryBtn').tap(); await page.locator('#closeBreak').tap();
    await page.clock.runFor(50);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    if (scheme === 'easy') {
      await expect(page.locator('#trainingInstruction')).toContainText('Hold the cup');
      const r = await page.locator('#game').boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down(); await page.clock.runFor(800); await page.mouse.up();
    } else await page.locator('#sugarBtn').tap();
    await page.clock.runFor(600); expect((await view(page)).stage).toBe(4);
    await practice(page); await layout(page);
    await page.locator('#trainingAgain').tap(); expect((await view(page)).stage).toBe(0);
    await page.locator('#trainingExit').tap();
    await expect(page.locator('body')).toHaveAttribute('data-training', 'false');
    expect(problems).toEqual([]);
  });
}

trainingLayoutTests();
