import { expect, openGame, test } from './fixtures.js';

// Deterministic presentation scenarios use real collisions for the settled
// leaves. Only the selected fortune/time is pinned; no production fixtures.
async function reading(page, fortune = 'veil', offer = true) {
  await openGame(page, '&seed=42&view=full');
  await page.keyboard.press('Enter');
  await page.evaluate(({ fortune, offer }) => {
    const { game: g } = window.__TEACUP__, s = g.state;
    s.spawnTimer = Infinity; s.current = null; s.modifiers.laneDrift = false;
    s.roundStats.milkUses = 2;
    while (s.phase === 'playing') {
      const angle = (s.kills % 16) * Math.PI / 8;
      s.enemies.push({ angle, radius: 180, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 });
      s.shots.push({ angle, radius: 180, speed: 0, sugar: false, veer: 0, golden: false });
      g.update(1 / 60);
    }
    const cards = Array.isArray(offer) ? offer : offer ? ['polished', 'strainer'] : null;
    Object.assign(s, { nextFortune: fortune, readingTime: 0, offer: cards,
      fortune: 'star', havocDue: false, grindDue: false, shortageDue: false, arcadeDue: null });
  }, { fortune, offer });
  await page.clock.runFor(32);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
}

async function time(page, value) {
  await page.evaluate(value => { window.__TEACUP__.game.state.readingTime = value; }, value);
  await page.clock.runFor(32);
}

async function freeze(page) {
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

async function capture(page, info, name) {
  // Five representative review images, only from desktop Chromium. Other
  // browser runs retain their own artifacts without rewriting these images.
  if (info.project.name === 'chromium') await page.screenshot({ path: `docs/images/reading-tea-break/${name}.png`, scale: 'css' });
}

async function fits(page) {
  const geometry = await page.evaluate(() => {
    const box = id => document.querySelector(id).getBoundingClientRect();
    const canvas = box('#game'), hud = box('.hud-top'), panel = box('#readingPresentation');
    const buttons = [...document.querySelectorAll('[data-choice], #menuBtn')].map(e => e.getBoundingClientRect());
    const visible = b => b.width > 0 && b.height > 0 && b.left >= 0 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= innerHeight + 1;
    return { cup: visible(canvas), hud: hud.bottom <= canvas.top + 1, panel: visible(panel),
      actions: buttons.every(b => visible(b) && b.width >= 44 && b.height >= 44),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      separate: canvas.right <= panel.left + 1 || canvas.bottom <= panel.top + 1 };
  });
  expect(geometry).toEqual({ cup: true, hud: true, panel: true, actions: true, overflow: false, separate: true });
}

export function readingTeaBreakTests() {
  for (const method of ['2', 'pointer']) test(`normal upgrade selection by ${method} needs no extra confirmation`, async ({ page, problems }) => {
    await freeze(page);
    await reading(page);
    await time(page, 3);
    if (method === '2') {
      await page.locator('#game').focus();
      await page.keyboard.press('2');
    } else await page.locator('[data-choice="0"]').click();
    await page.clock.runFor(32);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    const spoon = await page.evaluate(() => window.__TEACUP__.game.state.spoon);
    expect(spoon).toEqual({ polished: method === 'pointer' ? 1 : 0, strainer: method === '2' ? 1 : 0, quickStir: 0, sugarScoop: 0 });
    expect(problems).toEqual([]);
  });

  test('backgrounding controls review cancels automatic resume and retains settings', async ({ page, problems }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGame(page, '&view=compact');
    await page.keyboard.press('Enter');
    await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
    await page.locator('#menuBtn').click();
    await page.getByText('Controls & Settings', { exact: true }).click();
    await page.locator('#graphicsBtn').click();
    const graphics = await page.locator('#graphicsBtn').textContent();
    await page.locator('#breakControlsBtn').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('#breakControlsBtn')).toBeFocused();
    await page.locator('#closeBreak').click();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
    await page.reload();
    await page.locator('#menuBtn').click();
    await page.getByText('Controls & Settings', { exact: true }).click();
    await expect(page.locator('#graphicsBtn')).toHaveText(graphics);
    expect(problems).toEqual([]);
  });

  test('ceremony precedes one explanation; normal no-offer Enter continues', async ({ page, problems }, info) => {
    await freeze(page);
    await reading(page, 'veil', false);
    await expect(page.locator('#readingPresentation')).toBeHidden();
    await expect(page.locator('#mainBtn')).toBeDisabled();
    await page.locator('#game').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
    await time(page, 2.2);
    await expect(page.locator('#readingPresentation')).toBeHidden();
    await expect(page.locator('#readingAnnouncement')).toContainText('The Veil');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
    await time(page, 2.8);
    await expect(page.locator('#readingPresentation')).toBeVisible();
    await expect(page.locator('#mainBtn')).toBeEnabled();
    await expect(page.locator('#compactMemory')).toContainText('You poured milk twice.');
    await expect(page.locator('#compactEffect')).toContainText('Milk clouds last');
    await expect(page.locator('#upgradeOffer')).toBeHidden();
    await capture(page, info, 'normal-reading');
    await page.locator('#game').focus();
    await page.keyboard.press('Enter');
    await page.clock.runFor(32);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.fortune)).toBe('veil');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    expect(problems).toEqual([]);
  });

  test('The Leaves Lie without an offer holds Enter until its 4.1-second reading is ready', async ({ page, problems }) => {
    await freeze(page);
    await reading(page, 'lie', false);
    await page.locator('#game').focus();
    for (const value of [2.8, 3.5, 4.05]) {
      await time(page, value);
      await expect(page.locator('#mainBtn')).toBeDisabled();
      await page.keyboard.press('Enter');
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
    }
    await time(page, 4.1);
    await expect(page.locator('#readingPresentation')).toBeVisible();
    await expect(page.locator('#mainBtn')).toBeEnabled();
    await expect(page.locator('#compactFortune')).toHaveText('Next cup: The Leaves Lie');
    await page.keyboard.press('Enter');
    await page.clock.runFor(32);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    expect(await page.evaluate(() => window.__TEACUP__.game.state.fortune)).toBe('lie');
    expect(problems).toEqual([]);
  });

  test('The Leaves Lie protects retraction from keyboard, focused buttons and touch', async ({ page, problems }, info) => {
    await freeze(page);
    await reading(page, 'lie');
    await time(page, 2.8);
    await expect(page.locator('#readingAnnouncement')).not.toContainText('The Leaves Lie');
    await expect(page.locator('#readingPresentation')).toBeHidden();
    await expect(page.locator('#upgradeOffer')).toBeHidden();
    await capture(page, info, 'lie-false-reveal');
    for (const key of ['1', '2', 'Enter']) await page.keyboard.press(key);
    // Simulate a retained focused button at the eligibility boundary, even
    // if CSS or a stale layout exposed it: the game must still reject input.
    await page.evaluate(() => {
      document.querySelector('#readingPresentation').hidden = false;
      document.querySelector('#upgradeOffer').hidden = false;
    });
    await page.locator('[data-choice="0"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-choice="1"]').dispatchEvent('click', { pointerType: 'touch' });
    expect(await page.evaluate(() => window.__TEACUP__.game.state.spoon)).toEqual({ polished: 0, quickStir: 0, sugarScoop: 0, strainer: 0 });
    await time(page, 3.5);
    await expect(page.locator('#readingPresentation')).toBeHidden();
    await expect(page.locator('#readingAnnouncement')).toHaveText('The leaves reconsider…');
    await page.keyboard.press('2');
    await time(page, 4.15);
    await expect(page.locator('#compactFortune')).toHaveText('Next cup: The Leaves Lie');
    await expect(page.locator('#compactEffect')).not.toBeEmpty();
    await capture(page, info, 'lie-final-reading');
    const choice = page.locator('[data-choice="1"]');
    if (info.project.name === 'mobile-chromium') await choice.tap();
    else { await choice.focus(); await page.keyboard.press('Enter'); }
    // A trailing click/key from that same transition cannot select again.
    await choice.dispatchEvent('click');
    await page.keyboard.press('1');
    await page.clock.runFor(32);
    expect(await page.evaluate(() => ({ phase: window.__TEACUP__.game.state.phase, spoon: window.__TEACUP__.game.state.spoon })))
      .toEqual({ phase: 'playing', spoon: { polished: 0, quickStir: 0, sugarScoop: 0, strainer: 1 } });
    await expect(page.locator('#upgradeAcknowledgment')).toHaveText('Strainer Attachment acquired · level 1');
    expect(problems).toEqual([]);
  });

  test('both upgrade choices fit representative desktop and mobile views', async ({ page, problems }, info) => {
    await freeze(page);
    await reading(page);
    await time(page, 3);
    for (const [width, height] of [[1280, 720], [800, 600], [375, 667], [844, 390], [800, 1280]]) {
      await page.setViewportSize({ width, height });
      await page.clock.runFor(64);
      for (const view of ['full', 'compact']) {
        if (await page.locator('body').getAttribute('data-view') !== view) await page.locator('#viewBtn').click();
        await page.clock.runFor(64);
        await fits(page);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.runFor(64);
    await capture(page, info, 'upgrade-offer');
    await page.locator('#game').focus();
    await page.keyboard.press('1');
    await page.clock.runFor(32);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    expect(problems).toEqual([]);
  });

  test('a Tea Tray offer reads as one-cup treats, fits every view, and serves the next cup', async ({ page, problems }) => {
    await freeze(page);
    await reading(page, 'veil', ['trayMilk', 'traySugar']);
    await page.evaluate(() => Object.assign(window.__TEACUP__.game.state.spoon, { polished: 3, quickStir: 3, sugarScoop: 2, strainer: 2 }));
    await time(page, 3);
    await expect(page.locator('#upgradeOffer .offer-head em')).toHaveText('The Tea Tray comes round.');
    await expect(page.locator('[data-choice="0"] strong')).toHaveText('A Spare Jug');
    await expect(page.locator('[data-choice="1"] small')).toHaveText('One more sugar burst, next cup only.');
    for (const [width, height] of [[1280, 720], [375, 667], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.clock.runFor(64);
      for (const view of ['full', 'compact']) {
        if (await page.locator('body').getAttribute('data-view') !== view) await page.locator('#viewBtn').click();
        await page.clock.runFor(64);
        await fits(page);
      }
    }
    await page.locator('#game').focus();
    await page.keyboard.press('1');
    await page.clock.runFor(32);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(page.locator('#upgradeAcknowledgment')).toHaveText('A Spare Jug · next cup only');
    expect(await page.evaluate(() => window.__TEACUP__.game.state.milkLeft)).toBe(3);
    expect(problems).toEqual([]);
  });

  test('Tea Break has four complete sections and freezes a reading without leaking choices', async ({ page, problems }, info) => {
    await freeze(page);
    await reading(page, 'lie');
    await time(page, 2.8);
    await page.locator('#menuBtn').click();
    await expect(page.locator('#teaBreak summary')).toHaveText(['Current Pot', 'Tea & Fortunes', 'The Spoon', 'Controls & Settings']);
    await expect(page.locator('#activeFortune')).toContainText('The Star');
    await expect(page.locator('#fortuneName')).not.toContainText('The Leaves Lie');
    const before = await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state));
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state))).toBe(before);
    await page.keyboard.press('Escape');
    await expect(page.locator('#game')).toBeFocused();
    await time(page, 4.2);
    await page.evaluate(() => { Object.assign(window.__TEACUP__.game.state.spoon, { polished: 2, strainer: 1 }); });
    await page.clock.runFor(32);
    await page.locator('#menuBtn').click();
    await expect(page.locator('#fortuneName')).toHaveText('The Leaves Lie');
    await page.getByText('The Spoon', { exact: true }).click();
    await expect(page.locator('#spoonInventory')).toContainText('Polished Spoon · level 2/3. Steam travels 20% faster.');
    await page.getByText('Controls & Settings', { exact: true }).click();
    await expect(page.locator('#touchBtn')).toBeVisible();
    await page.getByText('Controls & Settings', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#touchBtn')).toBeHidden();
    await page.getByText('Tea & Fortunes', { exact: true }).click();
    await page.locator('#closeBreak').focus();
    await page.locator('#teaBreak').evaluate(e => { e.scrollTop = 0; });
    await capture(page, info, 'tea-break');
    await page.locator('#closeBreak').click();
    expect(await page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('reading');
    expect(problems).toEqual([]);
  });
}
