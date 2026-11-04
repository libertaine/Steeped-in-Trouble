import { test, expect, openGame, gameState } from './fixtures.js';
import { expectVisibility, fits, geometry, preference, primaryPointer, quietCup } from './onScreenControls.js';

for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [800, 600], [375, 667], [844, 390], [800, 1280], [1280, 800]]) {
  test(`desktop Auto stays hidden at ${width}x${height} in both Views`, async ({ page, problems }) => {
    await page.setViewportSize({ width, height });
    await openGame(page, '&seed=42&view=full');
    await quietCup(page);
    await expectVisibility(page, false);
    await fits(page);
    const full = await gameState(page);
    await page.locator('#viewBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'compact');
    await expectVisibility(page, false);
    await fits(page);
    expect((await gameState(page)).round).toBe(full.round);
    expect(problems).toEqual([]);
  });
}

test('Show restores the rail; Hide reclaims it and survives reload independently', async ({ page, problems }) => {
  // Near-square landscape is width-limited with the old 190px rail, making
  // the recovered canvas size measurable as well as the larger stage width.
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.addInitScript(() => {
    if (!localStorage.getItem('steeped-in-trouble:controls')) {
      localStorage.setItem('steeped-in-trouble:controls', '{"touch":"easy","autoSteam":true}');
      localStorage.setItem('steeped-in-trouble:view', 'full');
    }
  });
  await openGame(page, '&seed=42');
  await quietCup(page);
  const settings = await page.evaluate(() => window.__TEACUP__.settings());
  await preference(page, 'show');
  await expectVisibility(page, true, '.controls-easy');
  const shown = await geometry(page);
  await preference(page, 'hide');
  await expectVisibility(page, false);
  const hidden = await geometry(page);
  expect(hidden.stage.width - shown.stage.width).toBeCloseTo(190, 0);
  expect(hidden.canvas.width).toBeGreaterThan(shown.canvas.width + 100);
  expect(hidden.columns.split(' ')).toHaveLength(1);
  await fits(page);
  expect(await page.evaluate(() => window.__TEACUP__.settings())).toEqual(settings);
  await page.reload();
  await expectVisibility(page, false);
  expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:onscreen-controls'))).toBe('hide');
  await page.locator('#viewBtn').click();
  await quietCup(page);
  await preference(page, 'show');
  await expectVisibility(page, true, '.controls-easy');
  await fits(page);
  await preference(page, 'hide');
  await fits(page);
  expect(await page.evaluate(() => window.__TEACUP__.settings())).toEqual(settings);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'compact');
  await expectVisibility(page, false);
  expect(await page.evaluate(() => window.__TEACUP__.settings())).toEqual(settings);
  expect(problems).toEqual([]);
});

test('Tea Break settings reflow and scroll with enlarged text and reduced motion', async ({ page, problems }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await page.locator('#menuBtn').click();
  await page.getByText('Controls & Settings', { exact: true }).click();
  // An explicit 200% text-enlargement stress check, not a claim of browser
  // zoom or screen-reader listening qualification.
  await page.locator('#teaBreak').evaluate(dialog => {
    const sizes = [...dialog.querySelectorAll('*')].map(e => [e, parseFloat(getComputedStyle(e).fontSize)]);
    for (const [e, size] of sizes) e.style.fontSize = `${size * 2}px`;
  });
  await page.getByLabel('On-screen controls', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel('On-screen controls', { exact: true })).toBeVisible();
  const layout = await page.locator('#teaBreak').evaluate(e => ({
    overflow: e.scrollWidth - e.clientWidth, scrolls: e.scrollHeight > e.clientHeight,
  }));
  expect(layout).toEqual({ overflow: 0, scrolls: true });
  await page.getByLabel('On-screen controls', { exact: true }).selectOption('show');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game')).toBeFocused();
  expect(problems).toEqual([]);
});

test('keyboard-only gameplay, settings navigation, pause and focus work with buttons hidden', async ({ page, problems }) => {
  await openGame(page, '&touch=classic&autosteam=off');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
  await expectVisibility(page, false);
  const before = await gameState(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await gameState(page)).angle).not.toBe(before.angle);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).shots).toBeGreaterThan(0);
  await page.keyboard.press('q'); await page.keyboard.press('s');
  expect(await gameState(page)).toMatchObject({ milkLeft: before.milkLeft - 1, sugarLeft: before.sugarLeft - 1 });
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.locator('#menuBtn').focus();
  await page.keyboard.press('Enter');
  const summary = page.getByText('Controls & Settings', { exact: true });
  await summary.focus(); await page.keyboard.press('Enter');
  // Reach the new native select through the actual tab order.
  for (let i = 0; i < 10 && !await page.locator('#onScreenControls').evaluate(e => e === document.activeElement); i++) await page.keyboard.press('Tab');
  await expect(page.getByLabel('On-screen controls', { exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown'); // Auto -> Show
  await page.keyboard.press('Tab');
  await expect(page.locator('#onScreenControls')).toHaveValue('show');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game')).toBeFocused();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await preference(page, 'hide');
  await page.locator('#game').focus();
  // Tab cycles cannot reach gameplay buttons removed from layout.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.controls-mobile'))).toBe(false);
  }
  await page.locator('#game').focus(); await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(problems).toEqual([]);
});

test('touchscreen laptop uses primary fine pointer; capability changes release a held pad', async ({ page, problems }) => {
  await primaryPointer(page);
  await openGame(page, '&touch=classic&view=full');
  await quietCup(page);
  await expectVisibility(page, false);
  await page.setViewportSize({ width: 375, height: 667 });
  await expectVisibility(page, false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.__setPrimaryCoarse(true));
  await expectVisibility(page, true);
  const pad = page.locator('.controls-classic [data-hold="right"]');
  await pad.focus();
  const box = await pad.boundingBox();
  const start = (await gameState(page)).angle;
  // Mouse pointer ids differ by browser (Chromium 1, Firefox 0): record the real one.
  await pad.evaluate(e => e.addEventListener('pointerdown', d => { e.dataset.pointerId = d.pointerId; }, { once: true }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await gameState(page)).angle).not.toBe(start);
  const captured = () => pad.evaluate(e => e.hasPointerCapture(Number(e.dataset.pointerId)));
  expect(await captured()).toBe(true);
  await page.evaluate(() => window.__setPrimaryCoarse(false));
  await expectVisibility(page, false);
  expect(await captured()).toBe(false);
  await expect(page.locator('#game')).toBeFocused();
  const angle = (await gameState(page)).angle;
  await page.waitForTimeout(200);
  expect((await gameState(page)).angle).toBe(angle);
  await page.mouse.up();
  await preference(page, 'show');
  await page.evaluate(() => window.__setPrimaryCoarse(false));
  await expectVisibility(page, true);
  await preference(page, 'hide');
  await page.evaluate(() => window.__setPrimaryCoarse(true));
  await expectVisibility(page, false);
  expect(problems).toEqual([]);
});

test('malformed and unavailable storage default to Auto and permit manual overrides', async ({ page, problems }) => {
  await page.addInitScript(() => localStorage.setItem('steeped-in-trouble:onscreen-controls', '{broken'));
  await openGame(page);
  await expectVisibility(page, false);
  await preference(page, 'show');
  await expectVisibility(page, true);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw Error('denied'); } });
  });
  await page.reload();
  await expectVisibility(page, false);
  await preference(page, 'show');
  await expectVisibility(page, true);
  expect(problems).toEqual([]);
});

test('normal and special modes preserve appropriate controls and required choices', async ({ page, problems }) => {
  for (const [id, selector] of [['teaRun', '.controls-run'], ['dailyPour', '.controls-pour'], ['biscuitBreakout', '.controls-breakout'], ['crossingStreet', '.controls-crossing']]) {
    await openGame(page, '&seed=42&view=full');
    await page.locator('#collectionBtn').click();
    await page.locator(`[data-job="${id}"]`).click();
    await page.waitForFunction(id => window.__TEACUP__.game.practice === id, id);
    await expectVisibility(page, false);
    await fits(page);
    await preference(page, 'show');
    await expectVisibility(page, true, selector);
    await page.locator('#mainBtn').click();
    await preference(page, 'hide');
    await expectVisibility(page, false);
    await fits(page);
  }
  for (const phase of ['chocolate', 'grind']) {
    await openGame(page, '&seed=42');
    await page.keyboard.press('Enter');
    await page.evaluate(phase => {
      const g = window.__TEACUP__.game;
      Object.assign(g.state, { phase: 'reading', readingTime: 10, offer: null,
        havocDue: phase === 'chocolate', grindDue: phase === 'grind', shortageDue: false, arcadeDue: null });
      g.primaryAction(); g.primaryAction();
    }, phase);
    await expect(page.locator('body')).toHaveAttribute('data-phase', phase);
    await expectVisibility(page, false);
    await preference(page, 'show');
    await expectVisibility(page, true);
    await preference(page, 'hide');
    await fits(page);
  }
  // Optional adventure offers are phase choices, never gameplay pads.
  await page.evaluate(() => { Object.assign(window.__TEACUP__.game.state, { phase: 'arcadeOffer', arcadeDue: 'dailyPour' }); });
  await expect(page.locator('[data-interlude="accept"]')).toBeVisible();
  await expect(page.locator('[data-interlude="skip"]')).toBeVisible();
  expect(problems).toEqual([]);
});
