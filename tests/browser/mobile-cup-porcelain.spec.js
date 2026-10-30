import { expect, openGame, test } from './fixtures.js';
import { capture, offerLeaf, quiet, spill, steamLeaf } from './cup.js';

const sizes = {
  'phone-portrait': [390, 844], 'phone-landscape': [844, 390], 'tablet-portrait': [800, 1280], 'tablet-landscape': [1280, 800],
};

for (const [name, [width, height]] of Object.entries(sizes)) {
  test(`the cup's condition stays readable on ${name}`, async ({ page, problems }, info) => {
    await page.setViewportSize({ width, height });
    await openGame(page, '&seed=42&view=compact');
    await page.locator('#mainBtn').click();
    await quiet(page);
    await spill(page, 3);
    await spill(page, 11);
    const pill = page.locator('#hudLives');
    await expect(pill).toHaveText('STRUCTURAL FAILURE IMMINENT');
    const fit = await page.evaluate(() => {
      const b = document.querySelector('#hudLives').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, left: b.left, right: b.right, width: innerWidth };
    });
    expect(fit.overflow).toBeLessThanOrEqual(0);
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.width);
    await capture(page, info, `${name}-critical`);
    await offerLeaf(page);
    await steamLeaf(page);
    await expect(pill).toHaveText('PORCELAIN CRACKED');
    await page.waitForTimeout(300);
    await capture(page, info, `${name}-gold-repair`);
    await spill(page, 7);
    await spill(page, 14);
    await expect(pill).toHaveText('SHATTERED');
    await page.waitForTimeout(1800);
    await capture(page, info, `${name}-shattered`);
    await page.locator('#mainBtn').click();
    await expect(pill).toHaveText('CUP STABLE');
    expect(problems).toEqual([]);
  });
}

test('with reduced motion the warning holds steady and the cup breaks at once', async ({ page, problems }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page, '&seed=42&view=compact');
  await page.locator('#mainBtn').click();
  await quiet(page);
  for (const lane of [3, 11]) await spill(page, lane);
  await expect(page.locator('#hudLives')).toHaveCSS('animation-name', 'none');
  await spill(page, 7);
  await page.waitForTimeout(150);
  await capture(page, info, 'reduced-motion-shattered');
  await expect(page.locator('#hudLives')).toHaveText('SHATTERED');
  expect(problems).toEqual([]);
});
