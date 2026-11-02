import { test, expect, openGame } from './fixtures.js';

const sizes = [[375, 667], [800, 600], [1280, 720], [1366, 768], [1920, 1080], [844, 390], [800, 1280], [1280, 800]];

async function fits(page) {
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const b = canvas.getBoundingClientRect();
    const s = canvas.parentElement.getBoundingClientRect();
    const hud = document.querySelector('#resourceStrip').getBoundingClientRect();
    const controls = [...document.querySelectorAll('.controls-mobile button, #actionDock button')]
      .filter((e) => e.getClientRects().length && !e.hidden).map((e) => e.getBoundingClientRect());
    return Object.entries({
      visibleCanvas: b.width > 0 && b.height > 0 && b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1,
      containedCanvas: b.left >= s.left - 1 && b.right <= s.right + 1 && b.top >= s.top - 1 && b.bottom <= s.bottom + 1,
      aspectRatio: Math.abs(b.width / b.height - 920 / 790) < 0.002,
      backingWidth: Math.abs(canvas.width - Math.round(b.width * Math.min(2, devicePixelRatio))) <= 1,
      backingHeight: Math.abs(canvas.height - Math.round(b.height * Math.min(2, devicePixelRatio))) <= 1,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      visibleResources: hud.top >= 0 && hud.bottom <= b.top + 1 && hud.left >= 0 && hud.right <= innerWidth + 1,
      reachableControls: controls.every((r) => r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1),
      touchTargetSize: controls.every((r) => r.width >= 44 && r.height >= 44),
      unobscuredCanvas: controls.every((r) => r.right <= b.left + 1 || r.left >= b.right - 1 || r.bottom <= b.top + 1 || r.top >= b.bottom - 1),
    }).filter(([, pass]) => !pass).map(([name]) => name);
  })).toEqual([]);
}

export function viewportFitTests() {
  for (const [width, height] of [[1920, 1080], [1280, 800], [1366, 768]]) {
    test(`full classic controls fit at ${width}x${height}`, async ({ page, problems }) => {
      await page.setViewportSize({ width, height });
      await openGame(page, '&view=full&touch=classic&seed=42');
      await fits(page);
      await page.locator('#mainBtn').click();
      await fits(page);
      if (width === 1920) {
        expect(await page.locator('#game').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(990);
      }
      await page.locator('#menuBtn').click();
      await expect(page.locator('#teaBreak')).toBeVisible();
      expect(await page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('paused');
      expect(problems).toEqual([]);
    });
  }
  for (const [width, height] of sizes) for (const view of ['full', 'compact']) {
    test(`${view} contains the complete arena and controls at ${width}x${height}`, async ({ page, problems }, info) => {
      await page.setViewportSize({ width, height });
      await openGame(page, `&view=${view}&touch=easy&seed=42`);
      await fits(page);
      await page.locator('#mainBtn').click();
      await page.evaluate(() => { const s = window.__TEACUP__.game.state; s.spawnTimer = Infinity; s.enemies = []; });
      await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
      await fits(page); // No corrective scrolling after starting the cup.
      // During play the collection entry is hidden, so a wide desktop should
      // recover the original arena size, subject to the remaining height.
      if (view === 'full' && width === 1920 && height === 1080) {
        expect(await page.locator('#game').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(990);
      }
      await page.locator('#menuBtn').click();
      await expect(page.locator('#teaBreak')).toBeVisible();
      expect(await page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('paused');
      await page.locator('#closeBreak').click();
      await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
      await fits(page);
      const pad = page.locator('.controls-easy [data-hold="right"]');
      const angle = await page.evaluate(() => window.__TEACUP__.game.state.angle);
      await pad.dispatchEvent('pointerdown', { pointerId: 17, pointerType: 'touch' });
      await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.angle)).not.toBe(angle);
      await pad.dispatchEvent('pointerup', { pointerId: 17, pointerType: 'touch' });
      // A browser toolbar/window height change during live play must keep the
      // same cup and reachable input surface, rather than requiring a restart.
      await page.setViewportSize({ width, height: height - 40 });
      await fits(page);
      await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
      await page.setViewportSize({ width, height });
      await fits(page);
      expect(await page.evaluate(() => window.__TEACUP__.game.state.round)).toBe(1);
      await page.screenshot({ path: info.outputPath('cup.png'), scale: 'css' });
      // Enter the real boss through the reading handoff, then show a pressure attack.
      await page.evaluate(() => {
        const g = window.__TEACUP__.game;
        Object.assign(g.state, { phase: 'reading', readingTime: 10, offer: null, grindDue: true,
          havocDue: false, shortageDue: false, arcadeDue: null });
        g.primaryAction(); g.primaryAction();
        g.state.grind.attack = { kind: 'pressure', stage: 'warn', time: 0, length: 1.5,
          lanes: [0, 1, 2], pattern: 'wedge', milked: false, reach: 0 };
        g.pause();
      });
      await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.pausedFrom)).toBe('grind');
      await fits(page);
      await page.screenshot({ path: info.outputPath('boss.png'), scale: 'css' });
      for (const id of ['teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']) {
        await openGame(page, `&view=${view}&touch=easy&seed=42`);
        await page.locator('#collectionBtn').click();
        await page.locator(`[data-job="${id}"]`).click();
        await page.waitForFunction((id) => window.__TEACUP__.game.practice === id, id);
        await fits(page);
        await page.evaluate(() => { const g = window.__TEACUP__.game; g.primaryAction(); g.pause(); });
        await fits(page);
        await page.screenshot({ path: info.outputPath(`${id}.png`), scale: 'css' });
      }
      // Rotate/resize, then switch views in place without altering simulation state.
      const before = await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state));
      await page.setViewportSize({ width: height, height: width });
      await fits(page);
      await page.locator('#viewBtn').click();
      await fits(page);
      expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state))).toBe(before);
      expect(await page.evaluate(() => window.__TEACUP__.config.arena)).toMatchObject({ width: 920, height: 790 });
      expect(problems).toEqual([]);
    });
  }
}
