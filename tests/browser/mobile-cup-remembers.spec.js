import { expect, openGame, test } from './fixtures.js';
import { milkyRound, revealed } from './cup.js';

async function inView(page, selectors) {
  const boxes = await page.evaluate((list) => list.map((selector) => {
    const b = document.querySelector(selector).getBoundingClientRect();
    return { selector, top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: innerWidth, view: innerHeight };
  }), selectors);
  for (const b of boxes) {
    expect(b.height, b.selector).toBeGreaterThan(0);
    expect(b.top, b.selector).toBeGreaterThanOrEqual(0);
    expect(b.bottom, b.selector).toBeLessThanOrEqual(b.view + 1);
    expect(b.right, b.selector).toBeLessThanOrEqual(b.width + 1);
  }
}

for (const [width, height] of [[390, 844], [360, 740], [844, 390], [915, 412]]) {
  test(`Compact View reads the memory and the next cup's effect at ${width}×${height}`, async ({ page, problems }, info) => {
    await page.setViewportSize({ width, height });
    await openGame(page, '&seed=42&view=compact');
    await page.locator('#mainBtn').click();
    await milkyRound(page);
    await expect(page.locator('#compactMemory')).toHaveText(/Your defensive tactics favored The Veil\./);
    await inView(page, ['#game', '#compactMemory']);
    await page.screenshot({ path: info.outputPath('compact-memory.png') });
    const fortune = await revealed(page);
    await expect(page.locator('#compactFortune')).toContainText('Next cup:');
    if (fortune !== 'lie') await expect(page.locator('#compactEffect')).not.toBeEmpty();
    await expect(page.locator('#upgradeOffer')).toBeVisible();
    await inView(page, ['#game', '#upgradeOffer', '[data-choice="0"]', '[data-choice="1"]']);
    await page.screenshot({ path: info.outputPath('compact-upgrade.png') });
    expect(problems).toEqual([]);
  });
}
