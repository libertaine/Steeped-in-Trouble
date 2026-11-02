import { test, expect, openGame } from './fixtures.js';
import { quiet, offerLeaf, steamLeaf, spill } from './cup.js';

async function start(page, query = '') {
  await page.clock.install({ time: new Date('2026-11-02T12:00:00Z') });
  await openGame(page, `&seed=42${query}`);
  await page.keyboard.press('Enter');
  await quiet(page);
}

async function visibleStrip(page) {
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector('#game').getBoundingClientRect();
    const strip = document.querySelector('#resourceStrip').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('.resource-item, .resource-condition, .resource-progress')]
      .map((e) => e.getBoundingClientRect());
    return strip.top >= 0 && strip.bottom <= canvas.top + 1 && strip.right <= innerWidth
      && boxes.every((b) => b.left >= strip.left && b.right <= strip.right + 1)
      && document.documentElement.scrollWidth <= innerWidth;
  })).toBe(true);
}

export function resourceHudTests() {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    test(`consecutive Milk, Sugar and Strainer events each notify with motion ${reducedMotion}`, async ({ page, problems }) => {
      await page.emulateMedia({ reducedMotion });
      await start(page, '&view=compact&touch=classic');
      await expect(page.locator('#resourceAnnouncement')).toHaveAttribute('role', 'status');
      await expect(page.locator('#resourceAnnouncement')).toHaveAttribute('aria-live', 'polite');
      await page.evaluate(() => {
        const region = document.querySelector('#resourceAnnouncement');
        window.__resourceNotifications = [];
        new MutationObserver(() => {
          if (region.textContent) window.__resourceNotifications.push(region.textContent);
        }).observe(region, { subtree: true, childList: true, characterData: true });
        const g = window.__TEACUP__.game;
        // Both successful uses enter the real event queue before the next frame.
        g.pourMilk(); g.pourMilk();
      });
      await expect(page.locator('#resource0 b')).toHaveText('0/2');
      await expect.poll(() => page.evaluate(() => window.__resourceNotifications)).toEqual(['Milk used', 'Milk used']);
      await page.evaluate(() => { const g = window.__TEACUP__.game; g.sugarBurst(); g.sugarBurst(); });
      await expect(page.locator('#resource1 b')).toHaveText('0/2');
      await expect.poll(() => page.evaluate(() => window.__resourceNotifications)).toEqual(['Milk used', 'Milk used', 'Sugar used', 'Sugar used']);
      await page.evaluate(() => {
        const { game: g, config } = window.__TEACUP__;
        g.state.spoon.strainer = 1; g.state.strainerLeft = 2;
        for (const angle of [g.state.angle + Math.PI / 2, g.state.angle + Math.PI]) {
          g.state.enemies.push({ angle, radius: config.arena.rimRadius - 1, speed: 100, wiggle: 0, shifted: false, size: 10, alpha: 1 });
        }
      });
      await expect(page.locator('#resource2 b')).toHaveText('0/2');
      const notifications = ['Milk used', 'Milk used', 'Sugar used', 'Sugar used', 'Leaf caught', 'Leaf caught'];
      await expect.poll(() => page.evaluate(() => window.__resourceNotifications)).toEqual(notifications);
      // Empty-resource input must not create a notification, including after
      // the pending announcement's display interval has finished.
      expect(await page.evaluate(() => {
        const g = window.__TEACUP__.game;
        return [g.pourMilk(), g.sugarBurst()];
      })).toEqual([false, false]);
      await page.clock.runFor(1000);
      expect(await page.evaluate(() => window.__resourceNotifications)).toEqual(notifications);
      expect(problems).toEqual([]);
    });
  }

  for (const view of ['full', 'compact']) {
    test(`${view} resource illustrations follow real use, catches, spills and repairs`, { tag: '@smoke' }, async ({ page, problems }, info) => {
      await start(page, `&view=${view}&touch=classic`);
      await expect(page.locator('#resource0 b')).toHaveText('2/2');
      await expect(page.locator('#resource0')).toHaveAccessibleName('Milk: 2 available, 2 normal capacity');
      await expect(page.locator('#resource1 b')).toHaveText('2/2');
      await expect(page.locator('.resource-cubes svg')).toHaveCount(2);
      await expect(page.locator('.catch-pips i')).toHaveCount(1);
      await page.keyboard.press('KeyM');
      await expect(page.locator('#resource0 b')).toHaveText('1/2');
      await expect(page.locator('#resourceAnnouncement')).toHaveText('Milk used');
      await page.keyboard.press('KeyM');
      await expect(page.locator('#resource0 b')).toHaveText('0/2');
      await expect(page.locator('#resource0 rect')).toHaveAttribute('height', '0');
      await page.keyboard.press('KeyE');
      await expect(page.locator('.resource-cubes svg')).toHaveCount(1);
      await expect(page.locator('#resource1 b')).toHaveText('1/2');
      await page.keyboard.press('KeyE');
      await expect(page.locator('#resource1 b')).toHaveText('0/2');
      await expect(page.locator('.resource-cubes svg path').first()).toHaveAttribute('fill', 'none');
      await page.evaluate(() => {
        const { game: g, config } = window.__TEACUP__;
        g.state.enemies.push({ angle: g.state.angle + Math.PI, radius: config.arena.rimRadius - 1, speed: 100, wiggle: 0, shifted: false, size: 10, alpha: 1 });
      });
      await expect(page.locator('#resource2 b')).toHaveText('0/1');
      await expect(page.locator('.catch-pips i')).toHaveCount(0);
      await expect(page.locator('#resource2')).toContainText('exhausted');
      await expect(page.locator('#resourceAnnouncement')).toHaveText('Leaf caught');
      await spill(page, 4); await spill(page, 9);
      await expect(page.locator('#spillMargin')).toHaveText('Next spill breaks');
      await expect(page.locator('#resourceStrip')).toHaveAttribute('data-condition', 'critical');
      await offerLeaf(page); await steamLeaf(page);
      await expect(page.locator('#spillMargin')).toHaveText('2 spills to break');
      await visibleStrip(page);
      await page.screenshot({ path: info.outputPath('depleted-and-repaired.png') });
      expect(problems).toEqual([]);
    });
  }

  test('bonus sugar stays unclamped, large counts stay compact, and regeneration updates immediately', async ({ page, problems }, info) => {
    await start(page, '&view=compact');
    await page.evaluate(() => { window.__TEACUP__.game.state.sugarLeft = 3; });
    await expect(page.locator('#resource1 b')).toHaveText('3/2');
    await expect(page.locator('#resource1')).toHaveAccessibleName('Sugar: 3 available, 2 normal capacity, + bonus');
    await expect(page.locator('.resource-cubes svg')).toHaveCount(3);
    await expect(page.locator('#resource1')).toContainText('+ bonus');
    await page.screenshot({ path: info.outputPath('bonus-sugar.png') });
    await page.evaluate(() => { window.__TEACUP__.game.state.sugarLeft = 17; });
    await expect(page.locator('.resource-cubes svg')).toHaveCount(1);
    await expect(page.locator('.resource-cubes')).toHaveText('×17');
    await expect(page.locator('#resource1 b')).toHaveText('17/2');
    await page.evaluate(() => {
      const s = window.__TEACUP__.game.state;
      s.spoon.sugarScoop = 2; s.sugarLeft = 3; s.modifiers.sugarRegenInterval = 1; s.sugarRegenTimer = 0.2;
    });
    await expect(page.locator('#resource1 b')).toHaveText('4/4');
    await visibleStrip(page);
    expect(problems).toEqual([]);
  });

  test('boss and Havoc substitute their own fight status through pause, resume and return', { tag: '@smoke' }, async ({ page, problems }, info) => {
    await start(page, '&view=full');
    for (const mode of ['grind', 'chocolate']) {
      await page.evaluate((mode) => {
        const g = window.__TEACUP__.game;
        Object.assign(g.state, { phase: 'reading', readingTime: 10, offer: null, grindDue: mode === 'grind', havocDue: mode === 'chocolate', shortageDue: false, arcadeDue: null });
        g.primaryAction(); g.primaryAction();
      }, mode);
      await expect(page.locator('#resourceStrip')).toHaveAttribute('data-normal', 'false');
      await expect(page.locator('#resourceScore')).toBeHidden();
      await expect(page.locator('.resource-strainer')).toHaveCount(0);
      if (mode === 'grind') {
        await page.evaluate(() => { window.__TEACUP__.game.state.grind.scalds = 2; });
        await expect(page.locator('#resource2')).toContainText('Scalds2/3');
        await expect(page.locator('#resourceProgressLabel')).toContainText('Machine health');
        await expect(page.locator('#resource0 b')).toHaveText('2/2');
      } else {
        await expect(page.locator('.resource-cubes')).toHaveCount(0);
        await expect(page.locator('#resource0')).toContainText('Perfect');
        await expect(page.locator('#resourceGuidance')).toContainText('flames');
      }
      await page.locator('#menuBtn').click();
      expect(await page.evaluate(() => window.__TEACUP__.game.state.pausedFrom)).toBe(mode);
      await expect(page.locator('#resourceScore')).toBeHidden();
      await expect(page.locator('#referenceResources')).toContainText('suspended');
      await page.locator('#closeBreak').click();
      await expect(page.locator('#game')).toBeFocused();
      await expect(page.locator('#resourceStrip')).toHaveAttribute('data-normal', 'false');
      await page.evaluate(() => {
        const g = window.__TEACUP__.game, encounter = g.state.grind ?? g.state.chocolate;
        encounter.left = 0;
        for (let i = 0; i < 600; i++) g.update(1 / 60);
        g.primaryAction();
      });
      await expect(page.locator('#resourceStrip')).toHaveAttribute('data-normal', 'true');
      await expect(page.locator('#resourceScore')).toHaveText(/^Score \d+$/);
      await expect(page.locator('#resourceScore')).toBeVisible();
      await expect(page.locator('.resource-strainer')).toHaveCount(1);
      await page.screenshot({ path: info.outputPath(`returned-from-${mode}.png`) });
    }
    expect(problems).toEqual([]);
  });

  test('all four adventures hide suspended inventory, preserve pause mode and return the main HUD', async ({ page, problems }, info) => {
    const labels = { teaRun: 'Stumbles left', dailyPour: 'Deliveries', biscuitBreakout: 'Cubes', crossingStreet: 'Attempts' };
    for (const [mode, label] of Object.entries(labels)) {
      await openGame(page, '&view=compact&seed=42');
      await page.locator('#collectionBtn').click();
      await page.locator(`[data-job="${mode}"]`).click();
      await expect(page.locator('#resourceStrip')).toHaveAttribute('data-normal', 'false');
      await expect(page.locator('#resource0')).toContainText(label);
      await expect(page.locator('#resourceScore')).toBeHidden();
      await expect(page.locator('#resourceStrip svg')).toHaveCount(0);
      await page.evaluate(() => { const g = window.__TEACUP__.game; g.primaryAction(); g.pause(); });
      await expect(page.locator('#resourceScore')).toBeHidden();
      await expect(page.locator('#resource0')).toContainText(label);
      await visibleStrip(page);
      await page.screenshot({ path: info.outputPath(`${mode}.png`) });
      await page.locator('#backPotBtn').click();
      await expect(page.locator('#resourceStrip')).toHaveAttribute('data-normal', 'true');
      await expect(page.locator('#resourceScore')).toHaveText(/^Score \d+$/);
      await expect(page.locator('#resourceScore')).toBeVisible();
      await expect(page.locator('#resource2')).toContainText('Leaf catches');
    }
    expect(problems).toEqual([]);
  });

  test('narrow zoom reflow, long labels, reduced motion, keyboard focus and DPR keep resources readable', async ({ page, problems }) => {
    // 1920x1080 at 200% browser zoom exposes 960x540 CSS pixels. Exercise
    // that reflow plus the separate DPR backing-store check below.
    await page.setViewportSize({ width: 960, height: 540 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, '&view=full&touch=classic');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#resourceAnnouncement')).toHaveText('Milk used');
    expect(await page.locator('#resource0').evaluate((el) => el.getAnimations().length)).toBe(0);
    await page.locator('#menuBtn').click();
    await expect(page.locator('#teaBreak')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#game')).toBeFocused();
    await visibleStrip(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.locator('#resource2 .resource-label').evaluate((el) => { el.textContent = 'Leaf catches with reinforced silver mesh'; });
    await visibleStrip(page);
    const result = await page.locator('#game').evaluate((el) => ({ actual: el.width, expected: Math.round(el.getBoundingClientRect().width * Math.min(2, devicePixelRatio)) }));
    expect(Math.abs(result.actual - result.expected)).toBeLessThanOrEqual(1);
    expect(await page.locator('#resource1 b').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
    expect(problems).toEqual([]);
  });
}
