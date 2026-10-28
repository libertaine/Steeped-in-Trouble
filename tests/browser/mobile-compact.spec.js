import { expect, openGame, test } from './fixtures.js';
import { toShortage } from './errand.js';

const sizes = [[360, 740], [390, 844], [800, 1280], [1280, 800], [844, 390], [1440, 900]];

async function quietCup(page) {
  await page.locator('#mainBtn').click();
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
}

async function finishCup(page) {
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.kills = s.target - 1;
    s.shots.push({ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false });
    s.enemies.push({ angle: s.angle, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 });
  });
  await expect(page.locator('#hudStatus')).toHaveText('READING THE LEAVES');
}

async function fits(page, selectors) {
  const result = await page.evaluate((selectors) => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    boxes: selectors.map((selector) => {
      const el = document.querySelector(selector);
      const b = el.getBoundingClientRect();
      return { selector, left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    }), width: innerWidth, height: innerHeight,
  }), selectors);
  expect(result.overflow).toBeLessThanOrEqual(0);
  for (const b of result.boxes) {
    expect(b.width, b.selector).toBeGreaterThan(0);
    expect(b.height, b.selector).toBeGreaterThan(0);
    expect(b.left, b.selector).toBeGreaterThanOrEqual(0);
    expect(b.right, b.selector).toBeLessThanOrEqual(result.width + 1);
    expect(b.top, b.selector).toBeGreaterThanOrEqual(0);
    expect(b.bottom, b.selector).toBeLessThanOrEqual(result.height + 1);
  }
}

for (const [width, height] of sizes) {
  test(`Compact View fits ${width} x ${height}, including reading and required choices`, async ({ page, problems }, info) => {
    await page.setViewportSize({ width, height });
    await openGame(page, '&view=compact&seed=31');
    await quietCup(page);
    await fits(page, ['#game', '#menuBtn', '#compactMilk', '#compactSugar', '.controls-easy']);
    const boxes = await page.evaluate(() => ['#game', '.hud-top'].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()));
    expect(boxes[1].bottom).toBeLessThanOrEqual(boxes[0].top);
    expect(boxes[0].width / boxes[0].height).toBeCloseTo(920 / 790, 2);
    await page.evaluate(() => {
      const s = window.__TEACUP__.game.state;
      for (const [angle, radius] of [[-0.8, 235], [0.9, 170], [2.4, 110]]) {
        s.enemies.push({ angle, radius, home: 40, speed: 0, wiggle: 0, shifted: false,
          size: 12, alpha: 1, backwash: 0 });
      }
    });
    await page.waitForTimeout(60);
    await page.screenshot({ scale: 'css', path: info.outputPath(`gameplay-${width}x${height}.png`) });
    await finishCup(page);
    await expect(page.locator('#menuBtn')).toBeDisabled();
    await page.waitForFunction(() => {
      const { game, config } = window.__TEACUP__;
      return game.state.readingTime >= config.fortunes.revealAt;
    });
    await page.screenshot({ scale: 'css', path: info.outputPath('reading.png') });
    await expect(page.locator('#upgradeOffer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#compactFortune')).toContainText('Next cup:');
    await fits(page, ['#game', '#upgradeOffer', '[data-choice="0"]', '[data-choice="1"]']);
    await page.screenshot({ scale: 'css', path: info.outputPath('upgrade.png') });
    await page.locator('#menuBtn').click();
    await expect(page.locator('#fortuneDetail')).toBeVisible();
    await page.locator('#closeBreak').click();
    await expect(page.locator('#upgradeOffer')).toBeVisible();
    await page.locator('[data-choice="0"]').click();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    expect(await page.evaluate(() => window.__TEACUP__.game.state.round)).toBe(2);
    expect(problems).toEqual([]);
  });
}

for (const [label, coarse, anyCoarse, points, expected] of [
  ['coarse phone', true, true, 1, 'compact'],
  ['wide tablet', true, true, 5, 'compact'],
  ['mixed mouse and touch', false, true, 10, 'compact'],
  ['desktop-style touch viewport', false, false, 5, 'compact'],
  ['mouse desktop', false, false, 0, 'full'],
]) {
  test(`capabilities: ${label}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL });
    await context.addInitScript(({ coarse, anyCoarse, points }) => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => query === '(pointer: coarse)' ? { matches: coarse }
        : query === '(any-pointer: coarse)' ? { matches: anyCoarse } : original(query);
      Object.defineProperty(navigator, 'maxTouchPoints', { value: points });
    }, { coarse, anyCoarse, points });
    const page = await context.newPage();
    await openGame(page);
    await expect(page.locator('body')).toHaveAttribute('data-view', expected);
    await page.locator('#viewBtn').click();
    const other = expected === 'full' ? 'compact' : 'full';
    await expect(page.locator('body')).toHaveAttribute('data-view', other);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-view', other);
    await context.close();
  });
}

for (const touch of ['easy', 'classic']) {
  for (const view of ['compact', 'full']) {
    test(`${touch} controls work independently of explicit ${view} presentation`, async ({ page }) => {
      await openGame(page, `&touch=${touch}&view=${view}&autosteam=on`);
      await expect(page.locator('body')).toHaveAttribute('data-view', view);
      await expect(page.locator(`.controls-${touch}`)).toBeVisible();
      expect(await page.evaluate(() => window.__TEACUP__.settings())).toEqual({ touch, autoSteam: true });
    });
  }
}

test('Tea Break pauses time, traps focus, changes settings, and dismisses without gameplay input', async ({ page, problems }, info) => {
  await openGame(page);
  await quietCup(page);
  const pad = page.locator('.controls-easy [data-hold="right"]');
  await pad.dispatchEvent('pointerdown', { pointerId: 4 });
  await page.locator('#menuBtn').click();
  await expect(page.locator('#teaBreak')).toBeVisible();
  const snapshot = await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state));
  for (const code of ['KeyP', 'Space', 'KeyM', 'KeyS', 'Digit1', 'Enter']) {
    // Put focus on a non-button before shortcut injection: keys must never reach the game.
    await page.locator('#roundTitle').evaluate((el) => { el.tabIndex = -1; el.focus(); });
    await expect(page.locator('#roundTitle')).toBeFocused();
    await page.keyboard.press(code);
    await expect(page.locator('#teaBreak')).toBeVisible();
  }
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state))).toBe(snapshot);
  await page.getByText('Settings and controls', { exact: true }).click();
  await page.locator('#touchBtn').click();
  await page.locator('#autoSteamBtn').click();
  await page.locator('#graphicsBtn').click();
  await page.locator('#soundBtn').click();
  await expect(page.locator('#activeControls')).toContainText('Classic Touch');
  await page.locator('#teaBreak').evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ scale: 'css', path: info.outputPath('pause-menu.png') });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#teaBreak'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  const angle = await page.evaluate(() => window.__TEACUP__.game.state.angle);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.angle)).toBe(angle);
  expect(await page.evaluate(() => [window.__TEACUP__.game.state.milkLeft, window.__TEACUP__.game.state.sugarLeft])).toEqual([2, 2]);
  expect(problems).toEqual([]);
});

test('an existing pause or a backgrounded menu never resumes on dismissal', async ({ page }) => {
  await openGame(page);
  await quietCup(page);
  await page.keyboard.press('KeyP');
  await page.locator('#menuBtn').click();
  await page.locator('#closeBreak').click();
  await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
  await page.locator('#mainBtn').click();
  await page.locator('#menuBtn').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.locator('#closeBreak').click();
  await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
});

test('reading details remain accessible without duplicate rewards or starting the next cup', async ({ page }) => {
  await openGame(page);
  await quietCup(page);
  await finishCup(page);
  await page.locator('[data-choice="0"]').click();
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
  await finishCup(page);
  await expect(page.locator('#menuBtn')).toBeEnabled({ timeout: 10000 });
  const cash = await page.evaluate(() => window.__TEACUP__.game.state.teaCash);
  for (let i = 0; i < 2; i++) {
    await page.locator('#menuBtn').click();
    await expect(page.locator('#fortuneDetail')).toBeVisible();
    await expect(page.locator('#teaDetail')).toBeVisible();
    await page.locator('#closeBreak').click();
  }
  expect(await page.evaluate(() => window.__TEACUP__.game.state.teaCash)).toBe(cash);
  await page.locator('#mainBtn').click();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.round)).toBe(3);
});

for (const [width, height] of [[360, 740], [844, 390]]) {
  test(`Tea Shortage and Tea Run remain reachable at ${width} x ${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openGame(page, '&seed=31');
    await toShortage(page);
    await fits(page, ['[data-errand="buy"]', '[data-errand="run"]', '[data-errand="skip"]']);
    await page.locator('[data-errand="run"]').click();
    await fits(page, ['#game', '[data-run="jump"]', '[data-run="slide"]', '#menuBtn']);
    await page.locator('[data-run="jump"]').tap();
    await page.screenshot({ scale: 'css', path: info.outputPath('tea-run.png') });
    await page.locator('#menuBtn').click();
    const clock = await page.evaluate(() => window.__TEACUP__.game.state.run.clock);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.run.clock)).toBe(clock);
    await page.locator('#closeBreak').click();
    await expect(page.locator('#hudStatus')).toContainText('THE TEA RUN');
  });
}

for (const scheme of ['easy', 'classic']) {
  test(`callouts and selection are scoped to the game in ${scheme} controls`, async ({ page }) => {
    await openGame(page, `&touch=${scheme}`);
    const result = await page.evaluate(() => {
      const send = (el, type) => !el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
      return {
        gameMenu: send(document.querySelector('#game'), 'contextmenu'),
        padMenu: send(document.querySelector('[data-run]'), 'contextmenu'),
        gameSelect: send(document.querySelector('#hudLives'), 'selectstart'),
        headerMenu: send(document.querySelector('.brand'), 'contextmenu'),
        headerSelect: send(document.querySelector('.brand'), 'selectstart'),
        touchAction: getComputedStyle(document.querySelector('#game')).touchAction,
      };
    });
    expect(result).toEqual({ gameMenu: true, padMenu: true, gameSelect: true, headerMenu: false, headerSelect: false, touchAction: 'none' });
  });
}

for (const [width, height] of [[390, 844], [844, 390]]) {
  for (const phase of ['grind', 'chocolate']) {
    test(`${phase} stays readable and pauses at ${width} x ${height}`, async ({ page, problems }, info) => {
      await page.setViewportSize({ width, height });
      await openGame(page, '&seed=7');
      await quietCup(page);
      await finishCup(page);
      await page.evaluate((phase) => {
        const s = window.__TEACUP__.game.state;
        s.havocDue = phase === 'chocolate';
        s.grindDue = phase === 'grind';
      }, phase);
      await page.locator('[data-choice="0"]').click();
      await page.locator('#mainBtn').click();
      await expect(page.locator('#hudStatus')).toContainText(phase === 'grind' ? 'THE DAILY GRIND' : 'HOT CHOCOLATE HAVOC');
      await fits(page, ['#game', '#hudStatus', '#compactProgress', '#menuBtn', '.controls-easy']);
      if (phase === 'grind') {
        await expect(page.locator('#compactProgress')).toContainText('Boss');
        // Force a genuine pressure-warning frame without changing any boss rules.
        await page.evaluate(() => {
          window.__TEACUP__.game.state.grind.attack = {
            kind: 'pressure', stage: 'warn', time: 0, length: 1.5,
            lanes: [0, 1, 2], pattern: 'wedge', milked: false, reach: 0,
          };
        });
      } else {
        await expect(page.locator('#easyHint')).toHaveText('Hold cup: flames');
        const box = await page.locator('#game').boundingBox();
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => window.__TEACUP__.game.state.chocolate.flames.length)).toBeGreaterThan(0);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      }
      await page.screenshot({ scale: 'css', path: info.outputPath(`${phase}-${width}x${height}.png`) });
      await page.locator('#menuBtn').click();
      const snapshot = await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state));
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state))).toBe(snapshot);
      await page.locator('#closeBreak').click();
      expect(problems).toEqual([]);
    });
  }
}

test('rotation, short viewport changes, low graphics, and keyboard pads preserve input and DPR scaling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page, '&graphics=low&touch=classic&autosteam=off');
  await quietCup(page);
  const pad = page.locator('.controls-classic [data-hold="right"]');
  await pad.focus();
  const start = await page.evaluate(() => window.__TEACUP__.game.state.angle);
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab'); // release must still reach the pad after focus moves
  await page.keyboard.up('Space');
  const angle = await page.evaluate(() => window.__TEACUP__.game.state.angle);
  expect(angle).not.toBe(start);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.angle)).toBe(angle);
  for (const [width, height] of [[844, 390], [390, 680], [800, 1280]]) {
    await page.setViewportSize({ width, height });
    await fits(page, ['#game', '#menuBtn', '.controls-classic']);
    await expect.poll(() => page.locator('#game').evaluate((c) => Math.abs(c.width - Math.round(c.clientWidth * Math.min(2, devicePixelRatio))))).toBeLessThanOrEqual(1);
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  }
});

test('game over and restart stay in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openGame(page);
  await page.locator('#mainBtn').click();
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.lives = 1; s.strainerLeft = 0; s.graceTime = 0;
    s.enemies.push({ angle: 0, radius: 280, speed: 1, home: 40, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 });
  });
  await expect(page.locator('#hudStatus')).toHaveText('THE CUP RUNNETH OVER');
  await fits(page, ['#mainBtn', '#menuBtn']);
  await page.locator('#mainBtn').click();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.lives)).toBe(3);
});

test('desktop Full View preserves its sidebar and canvas proportions', async ({ browser, baseURL }, info) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: false, baseURL });
  await openGame(page);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'full');
  await expect(page.locator('main > aside')).toBeVisible();
  await quietCup(page);
  await page.screenshot({ scale: 'css', path: info.outputPath('desktop-full.png') });
  await page.close();
});
