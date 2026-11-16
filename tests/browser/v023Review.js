import { expect, openGame, test } from './fixtures.js';
import { checkpointRound } from './collection.js';

const mode = (page) => page.evaluate(() => window.__TEACUP__.game.state.mode);
const cups = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('steeped-in-trouble:mode-records')).modes.arcade.cups);

export function modeAndSaveReviewTests() {
  test('UI mode choices persist, lock during an active pot, and respect replacement cancellation and confirmation', async ({ page, problems }) => {
    await openGame(page, '&touch=easy');
    await page.locator('#arcadeModeBtn').click();
    expect(await mode(page)).toBe('arcade');
    await page.reload();
    await expect(page.locator('#arcadeModeBtn')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#chillModeBtn').click();
    await page.reload();
    expect(await mode(page)).toBe('chill');
    await expect(page.locator('#chillModeBtn')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#arcadeModeBtn').click();
    await page.locator('#mainBtn').click();
    expect(await page.evaluate(() => window.__TEACUP__.game.setMode('chill'))).toBe(false);
    await page.locator('#menuBtn').click();
    await page.locator('#teaBreak details').nth(3).locator('summary').click();
    await expect(page.locator('#modeBtn')).toBeDisabled();
    await expect(page.locator('#autoSteamBtn')).toBeDisabled();
    await page.locator('#closeBreak').click();
    // Closing the menu leaves the cup paused; resume through the real UI.
    if (await page.evaluate(() => window.__TEACUP__.game.state.phase === 'paused')) await page.locator('#mainBtn').click();
    await checkpointRound(page);
    const saved = await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));
    await page.reload();
    await page.locator('#newPotBtn').click();
    await page.locator('#potConfirmation [data-select-mode="chill"]').click();
    await page.locator('#cancelPotBtn').click();
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(saved);
    await page.locator('#mainBtn').click();
    expect(await mode(page)).toBe('arcade');
    await page.reload();
    await page.locator('#newPotBtn').click();
    await page.locator('#potConfirmation [data-select-mode="chill"]').click();
    await page.locator('#confirmPotBtn').click();
    expect(await mode(page)).toBe('chill');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBeNull();
    expect(problems).toEqual([]);
  });

  test('supply UI persists purchases and inventory without counting extra cups across Continue Pot', async ({ page, problems }) => {
    await openGame(page, '&mode=arcade&seed=41');
    await page.locator('#mainBtn').click();
    await page.evaluate(() => {
      const g = window.__TEACUP__.game;
      g.pourMilk(); g.sugarBurst(); g.state.teaCash = 100;
    });
    await checkpointRound(page);
    await expect(page.locator('#restockOffer')).toBeVisible();
    expect(await cups(page)).toBe(1);
    for (const kind of ['milk', 'sugar', 'milk', 'sugar']) {
      await page.locator(`[data-supply="${kind}"]`).click();
      expect(await cups(page)).toBe(1);
    }
    await expect(page.locator('#restockCash')).toHaveText('Cash: 35');
    await page.reload();
    await page.locator('#mainBtn').click();
    expect(await page.evaluate(() => {
      const s = window.__TEACUP__.game.state;
      return [s.teaCash, s.milkLeft, s.sugarLeft];
    })).toEqual([35, 3, 2]);
    expect(await cups(page)).toBe(1);
    await page.evaluate(() => {
      const g = window.__TEACUP__.game;
      g.state.readingTime = 10; g.state.offer = null; g.state.nextFortune = 'star';
      g.primaryAction();
    });
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    await checkpointRound(page);
    await expect.poll(() => cups(page)).toBe(2);
    expect(problems).toEqual([]);
  });
}

async function hold(page, locators, mobile, check) {
  const points = [];
  for (const locator of locators) {
    const b = await locator.boundingBox();
    points.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, id: points.length });
  }
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await check();
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    }
  } else {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    try { await check(); } finally { await page.mouse.up(); }
  }
}

export function manualSteamReviewTest(viewport) {
  test(`Easy Touch manual Steam switches and restores safely at ${viewport.width}x${viewport.height}`, async ({ page, isMobile, problems }, info) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('steeped-in-trouble:onscreen-controls', 'show'));
    await openGame(page, '&touch=easy&mode=chill&seed=17');
    const steam = page.locator('.controls-easy [data-hold="fire"]');
    await expect(steam).toBeHidden();
    await page.locator('#arcadeModeBtn').click();
    await expect(steam).toBeVisible();
    await page.locator('#chillModeBtn').click();
    await expect(steam).toBeHidden();
    await page.locator('#arcadeModeBtn').click();
    await page.locator('#mainBtn').click();
    await page.evaluate(() => {
      const s = window.__TEACUP__.game.state;
      s.spawnTimer = 1000; s.current = null; s.modifiers.laneDrift = false;
      s.enemies = [{ angle: s.angle, radius: 180, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 }];
    });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => [window.__TEACUP__.game.state.autoSteam, window.__TEACUP__.game.state.roundStats.volleys])).toEqual([false, 0]);
    // Every pad stays inside the viewport, has a finger-sized target, and owns its centre.
    for (const pad of await page.locator('.controls-easy button').all()) {
      const b = await pad.boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
      expect(await pad.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await pad.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    await page.screenshot({ path: info.outputPath('arcade-easy-touch.png') });
    await hold(page, [steam], isMobile, async () => {
      await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.kills)).toBe(1);
      await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBeGreaterThanOrEqual(2);
    });
    expect(await page.evaluate(() => [window.__TEACUP__.game.state.milkLeft, window.__TEACUP__.game.state.sugarLeft])).toEqual([2, 1]);
    const angle = await page.evaluate(() => window.__TEACUP__.game.state.angle);
    await hold(page, isMobile ? [steam, page.locator('.controls-easy [data-hold="right"]')] : [page.locator('.controls-easy [data-hold="right"]')], isMobile, async () => {
      await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.angle)).not.toBe(angle);
    });
    if (isMobile) {
      const cup = await page.locator('#game').boundingBox();
      const p = { x: cup.x + cup.width / 2, y: cup.y + cup.height * 0.45 };
      await page.touchscreen.tap(p.x, p.y);
      await page.touchscreen.tap(p.x + 5, p.y + 5);
      await hold(page, [page.locator('#game')], true, async () => {
        await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.sugarLeft)).toBe(0);
      });
    } else {
      await page.keyboard.press('q');
      await page.keyboard.press('s');
    }
    expect(await page.evaluate(() => [window.__TEACUP__.game.state.milkLeft, window.__TEACUP__.game.state.sugarLeft])).toEqual([1, 0]);
    await checkpointRound(page);
    // Reopen with a different preference; Continue must use the saved Arcade pot.
    await page.evaluate(() => localStorage.setItem('steeped-in-trouble:mode', 'chill'));
    await openGame(page, '&touch=easy&seed=17');
    await expect(steam).toBeHidden();
    await page.locator('#mainBtn').click();
    expect(await mode(page)).toBe('arcade');
    await expect(page.locator('body')).toHaveAttribute('data-game-mode', 'arcade');
    await page.evaluate(() => {
      const g = window.__TEACUP__.game;
      g.state.readingTime = 10; g.state.offer = null; g.state.nextFortune = 'star';
      g.primaryAction(); g.state.spawnTimer = 1000;
    });
    await expect(steam).toBeVisible();
    const volleys = await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys);
    await hold(page, [steam], isMobile, async () => {
      await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBeGreaterThan(volleys);
    });
    expect(await page.evaluate(() => window.__TEACUP__.game.state.autoSteam)).toBe(false);
    expect(problems).toEqual([]);
  });
}
