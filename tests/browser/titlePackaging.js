import { expect, openGame, test } from './fixtures.js';

export function titlePackagingTests() {
  for (const [width, height] of [[1920, 1080], [1280, 720], [800, 600], [844, 390], [390, 844], [320, 568]]) {
    test(`tea label and native menu fit ${width}x${height}`, async ({ page, problems }) => {
      await page.setViewportSize({ width, height });
      await openGame(page, '', { onboarding: true });
      await expect(page.getByRole('heading', { name: 'STEEPED IN TROUBLE' })).toBeVisible();
      await expect(page.locator('.splash-tagline')).toHaveText('Now with More Bugs!');
      await expect(page.locator('.splash-subtitle')).toHaveText('Tiny Heroes, Big Tea Problems');
      for (const selector of ['.splash-title', '.splash-subtitle', '.splash-tagline', '#titleContinueBtn', '#titleInstructionsBtn', '#titleGraphicsBtn', '#titleSoundBtn']) {
        const box = await page.locator(selector).boundingBox();
        expect(box, selector).not.toBeNull();
        expect(box.x, selector).toBeGreaterThanOrEqual(0);
        expect(box.y, selector).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, selector).toBeLessThanOrEqual(width + 1);
        expect(box.y + box.height, selector).toBeLessThanOrEqual(height + 1);
      }
      expect(await page.locator('#arcadeSplash').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('#instructionOverlay')).toBeHidden();
      // Both title actions retain the established controls-before-play ceremony.
      await page.locator('#titleInstructionsBtn').click();
      await expect(page.locator('#arcadeSplash')).toBeHidden();
      await expect(page.locator('#instructionOverlay')).toBeVisible();
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'ready');
      expect(problems).toEqual([]);
    });
  }

  test('title focus wraps and graphics activation never advances onboarding', async ({ page, problems }) => {
    await openGame(page, '&graphics=high', { onboarding: true });
    await expect(page.locator('#titleContinueBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#titleSoundBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#titleGraphicsBtn')).toBeFocused();
    await page.keyboard.down('Enter');
    await expect(page.locator('#titleGraphicsBtn')).toHaveText('Graphics: low');
    await page.keyboard.down('Enter');
    await expect(page.locator('#titleGraphicsBtn')).toHaveText('Graphics: low');
    await expect(page.locator('#arcadeSplash')).toBeVisible();
    await page.keyboard.up('Enter');
    await page.keyboard.press('Tab');
    await expect(page.locator('#titleSoundBtn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#titleContinueBtn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#titleInstructionsBtn')).toBeFocused();
    await page.keyboard.down('Enter');
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await page.keyboard.down('Enter');
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await page.keyboard.up('Enter');
    expect(problems).toEqual([]);
  });

  test('steam follows quality and live reduced-motion preferences without advancing the cup', async ({ page, problems }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openGame(page, '&graphics=high', { onboarding: true });
    const cup = () => page.evaluate(() => {
      const s = window.__TEACUP__.game.state;
      return { phase: s.phase, angle: s.angle, shots: s.shots.length, spawnTimer: s.spawnTimer };
    });
    const initialCup = await cup();
    const steam = () => page.locator('#arcadeSplash').evaluate((el) => el.style.getPropertyValue('--title-steam-y'));
    await expect.poll(steam).not.toBe('');
    const before = await steam();
    await expect.poll(steam).not.toBe(before);
    await page.locator('#titleGraphicsBtn').click();
    await expect.poll(steam).toBe('');
    await expect(page.locator('#graphicsBtn')).toHaveText('Graphics: low');
    await page.locator('#titleGraphicsBtn').click();
    await expect.poll(steam).not.toBe('');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(steam).toBe('');
    await expect(page.locator('.splash-steam')).toHaveCSS('transform', 'none');
    expect(await cup()).toEqual(initialCup);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(steam).not.toBe('');
    await page.locator('#titleContinueBtn').click();
    await expect.poll(steam).toBe('');
    expect(problems).toEqual([]);
  });

  test('saved low graphics is reflected at startup and title decoration cannot intercept input', async ({ page, problems }) => {
    await page.addInitScript(() => localStorage.setItem('steeped-in-trouble:graphics', 'low'));
    await openGame(page, '', { onboarding: true });
    await expect(page.locator('#titleGraphicsBtn')).toHaveText('Graphics: low');
    await expect(page.locator('.splash-screen')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('.splash-screen')).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#titleContinueBtn').click();
    await page.locator('#overlayPrimaryBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    await page.locator('#menuBtn').click();
    await page.getByText('Controls & Settings', { exact: true }).click();
    await expect(page.locator('#graphicsBtn')).toHaveText('Graphics: low');
    expect(problems).toEqual([]);
  });
}
