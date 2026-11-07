import { expect, openGame, test } from './fixtures.js';
import { checkpointRound } from './collection.js';

const VERSION = '0.21.0';

/** The first screen a visitor sees: the title, then the instruction overlay. */
const openTitle = async (page, query = '') => {
  await openGame(page, query, { onboarding: true });
  if (!/[&](noOverlay|arcade|day|cup|fortune)/.test(query)) {
    await page.locator('#titleContinueBtn').click();
  }
};

// The windows the overlay has to fit, header to footer, with nothing hidden.
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 800, height: 600 },
  { width: 420, height: 750 },
  { width: 375, height: 667 },
];

/** Where the overlay and each of its parts sit in the browser window. */
function overlayLayout(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
    };
    const dialog = document.getElementById('instructionOverlay');
    const body = document.getElementById('overlayBody');
    const primary = document.getElementById('overlayPrimaryBtn');
    const selectors = {
      title: '#instructionTitle',
      tagline: '#instructionSubtitle',
      objective: '#instructionObjective',
      controlsHeading: '.overlay-section-title',
      firstControl: '.overlay-controls-table tr:first-child',
      lastControl: '.overlay-controls-table tr:last-child',
      notes: '.overlay-notes',
      touch: '#overlayTouchSummary',
      primary: '#overlayPrimaryBtn',
      newPot: '#overlayNewPotBtn',
      training: '#overlayTrainingBtn',
      footer: '.overlay-footer',
      version: '#overlayVersion',
    };
    const parts = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const el = dialog.querySelector(selector);
      if (el && el.getClientRects().length) parts[name] = { ...box(el), inBody: body.contains(el) };
    }
    const p = box(primary);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dialog: box(dialog),
      body: box(body),
      hiddenInBody: body.scrollHeight - body.clientHeight,
      horizontalOverflow: dialog.scrollWidth - dialog.clientWidth,
      parts,
      modal: dialog.matches(':modal'),
      primaryOnTop: document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2) === primary,
    };
  });
}

function expectInside(part, area, name) {
  expect(part.top, `${name} top`).toBeGreaterThanOrEqual(area.top - 1);
  expect(part.left, `${name} left`).toBeGreaterThanOrEqual(area.left - 1);
  expect(part.bottom, `${name} bottom`).toBeLessThanOrEqual(area.bottom + 1);
  expect(part.right, `${name} right`).toBeLessThanOrEqual(area.right + 1);
}

/** Every part of the overlay is on screen: inside the window, centred, and (in the middle section) not scrolled out of view. */
function expectFits(layout, { scrollable = false } = {}) {
  const { viewport, dialog, body, parts } = layout;
  const screen = { top: 0, left: 0, bottom: viewport.height, right: viewport.width };
  expect(layout.modal).toBe(true);
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
  expectInside(dialog, screen, 'overlay');
  // Centred on the browser window, not the canvas.
  expect(Math.abs((dialog.left + dialog.right) / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((dialog.top + dialog.bottom) / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
  for (const name of ['title', 'tagline', 'objective', 'primary', 'footer', 'version']) {
    expect(parts[name], name).toBeDefined();
    expectInside(parts[name], screen, name);
  }
  expect(layout.primaryOnTop).toBe(true);
  if (!scrollable) {
    expect(layout.hiddenInBody).toBeLessThanOrEqual(1);
    for (const [name, part] of Object.entries(parts)) {
      expectInside(part, screen, name);
      if (part.inBody) expectInside(part, body, name);
    }
  }
}

test.describe('Tea packaging title and instruction overlay', () => {
  test('1 & 2: Splash and instruction overlay appear at startup with exact required text and version', { tag: '@smoke' }, async ({ page, problems }) => {
    await page.goto('./?debug');
    await expect(page.locator('#arcadeSplash')).toBeAttached();
    await expect(page.locator('.splash-title')).toHaveText('STEEPED IN TROUBLE');
    await expect(page.locator('.splash-subtitle')).toHaveText('Tiny Heroes, Big Tea Problems');

    await page.waitForFunction(() => window.__TEACUP__?.game);
    await expect(page.locator('#arcadeSplash')).toBeVisible();
    await page.locator('#titleContinueBtn').click();

    const overlay = page.locator('#instructionOverlay');
    await expect(overlay).toBeVisible();

    await expect(page.locator('#instructionTitle')).toHaveText('Before You Brew');
    await expect(page.locator('#instructionSubtitle')).toHaveText('A brief guide to preventing a tea-related catastrophe.');
    await expect(page.locator('.overlay-imprint')).toContainText("THE SILVER SPOON'S FIELD GUIDE");
    await expect(page.locator('#instructionObjective')).toHaveText('Stop the leaves before they reach the rim.');
    await expect(page.locator('.overlay-section-title')).toHaveText('CONTROLS');

    const table = page.locator('.overlay-controls-table');
    await expect(table).toContainText('Turn spoon');
    await expect(table).toContainText('Fire steam');
    await expect(table).toContainText('SPACE');
    await expect(table).toContainText('(hold to fire)');
    await expect(table).toContainText('Pour milk');
    await expect(table).toContainText('Fire sugar');
    await expect(table).toContainText('Pause');
    await expect(table.getByRole('row', { name: /Mute \/ unmute/ })).toContainText('M');

    await expect(page.locator('.overlay-notes')).toContainText('Milk pushes leaves back and slows them.');
    await expect(page.locator('.overlay-notes')).toContainText('Sugar fires a three-lane burst.');
    await expect(page.locator('#overlayPrimaryBtn')).toHaveText('PRESS ENTER OR CLICK TO START');
    await expect(page.locator('.overlay-footer')).toHaveText('You can review controls again any time in Tea Break.');
    await expect(page.locator('#overlayVersion')).toHaveText(`v${VERSION}`);

    expect(problems).toEqual([]);
  });

  test('3: Enter key dismisses the overlay and starts Cup 1 without second action', async ({ page, problems }) => {
    await openTitle(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');

    await page.keyboard.press('Enter');

    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

    // A small delay to ensure Enter did not trigger a pause
    await page.waitForTimeout(200);
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    expect(problems).toEqual([]);
  });

  test('4: Pointer click on primary button dismisses the overlay and starts Cup 1', async ({ page, problems }) => {
    await openTitle(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');

    await page.locator('#overlayPrimaryBtn').click();

    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    expect(problems).toEqual([]);
  });

  test('5: Gameplay simulation and input do not advance behind the overlay', async ({ page, problems }) => {
    await openTitle(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();

    const initialPhase = await page.evaluate(() => window.__TEACUP__.game.state.phase);
    const initialScore = await page.evaluate(() => window.__TEACUP__.game.state.score);
    const initialAngle = await page.evaluate(() => window.__TEACUP__.game.state.angle);

    await page.keyboard.down('ArrowRight');
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');

    const after = await page.evaluate(() => window.__TEACUP__.game.state);
    expect(after.phase).toBe(initialPhase);
    expect(after.score).toBe(initialScore);
    expect(after.angle).toBe(initialAngle);
    expect(after.shots).toHaveLength(0);
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#teaBreak')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('the overlay is modal: the page behind it is dimmed, inert, and cannot scroll', async ({ page, problems }) => {
    await openTitle(page, '');
    const overlay = page.locator('#instructionOverlay');
    await expect(overlay).toBeVisible();
    expect(await overlay.evaluate((d) => d.matches(':modal'))).toBe(true);

    // The cup and HUD stay in view behind a translucent backdrop.
    const backdrop = await overlay.evaluate((d) => getComputedStyle(d, '::backdrop').backgroundColor);
    const alpha = Number(backdrop.match(/[\d.]+(?=\)$)/)?.[0] ?? 1);
    expect(alpha).toBeGreaterThan(0.3);
    expect(alpha).toBeLessThan(0.85);
    await expect(page.locator('#game')).toBeVisible();

    // Probe each underlying button. A relocated action may now be completely
    // covered by the dialog's own Start button: clicking that would correctly
    // dismiss it, so use an exposed backdrop point or prove modal interception.
    const modalBox = await overlay.boundingBox();
    let backdropClicks = 0;
    for (const id of ['mainBtn', 'menuBtn']) {
      const box = await page.locator(`#${id}`).boundingBox();
      if (!box) continue;
      const points = [[box.x + box.width / 2, box.y + box.height / 2],
        [box.x + 2, box.y + 2], [box.x + box.width - 2, box.y + box.height - 2]];
      const exposed = points.find(([x, y]) => x < modalBox.x || x > modalBox.x + modalBox.width
        || y < modalBox.y || y > modalBox.y + modalBox.height);
      const [x, y] = exposed ?? points[0];
      expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#instructionOverlay'), [x, y])).toBe(true);
      if (exposed) { await page.mouse.click(x, y); backdropClicks++; }
    }
    expect(backdropClicks).toBeGreaterThan(0);
    await page.mouse.click(4, 4); // the backdrop
    await expect(overlay).toBeVisible();
    await expect(page.locator('#teaBreak')).toBeHidden();
    await expect(page.locator('#viewBtn, #breakViewBtn')).toHaveCount(0);
    await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');

    // Focus stays in the overlay, and the page does not scroll underneath it.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('instructionOverlay').contains(document.activeElement))).toBe(true);
    }
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(problems).toEqual([]);
  });

  for (const { width, height } of VIEWPORTS) {
    test(`fits and centres in a ${width} x ${height} window with every instruction and button visible`, async ({ page, problems }) => {
      await page.setViewportSize({ width, height });

      // A first visit.
      await openTitle(page);
      await expect(page.locator('#instructionOverlay')).toBeVisible();
      expectFits(await overlayLayout(page));

      // The tallest version: a saved pot (two buttons) and the touch line.
      await openTitle(page, '&touch=easy');
      await page.evaluate(() => window.__TEACUP__.overlay.show({ hasSavedPot: true }));
      await expect(page.locator('#overlayNewPotBtn')).toBeVisible();
      await expect(page.locator('#overlayTouchSummary')).toBeVisible();
      const tallest = await overlayLayout(page);
      expectFits(tallest);
      expect(tallest.parts.newPot).toBeDefined();
      expect(tallest.parts.touch).toBeDefined();

      // Nothing on the page itself overflows sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

      // The start button is reachable by pointer.
      await page.locator('#overlayPrimaryBtn').click();
      await expect(page.locator('#instructionOverlay')).toBeHidden();
      expect(problems).toEqual([]);
    });
  }

  test('in a very short landscape window the buttons stay on screen and only the middle scrolls', async ({ page, problems }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openTitle(page, '&touch=easy');
    await page.evaluate(() => window.__TEACUP__.overlay.show({ hasSavedPot: true }));
    const layout = await overlayLayout(page);
    expectFits(layout, { scrollable: true });
    expectInside(layout.parts.newPot, { top: 0, left: 0, bottom: 390, right: 844 }, 'newPot');

    // Whatever does not fit can be scrolled into view inside the overlay.
    await page.locator('#overlayBody').evaluate((body) => { body.scrollTop = body.scrollHeight; });
    const scrolled = await overlayLayout(page);
    expectInside(scrolled.parts.touch, scrolled.body, 'touch');
    expectInside(scrolled.parts.primary, { top: 0, left: 0, bottom: 390, right: 844 }, 'primary');
    expect(problems).toEqual([]);
  });

  test('6: Held keys do not leak into gameplay across overlay dismissal', async ({ page, problems }) => {
    await openTitle(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();

    await page.keyboard.down('Space');
    await page.keyboard.down('ArrowRight');

    const startAngle = await page.evaluate(() => window.__TEACUP__.game.state.angle);
    await page.locator('#overlayPrimaryBtn').click();

    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      angle: window.__TEACUP__.game.state.angle,
      shots: window.__TEACUP__.game.state.shots.length,
    }));

    const angleDiff = Math.atan2(Math.sin(state.angle - startAngle), Math.cos(state.angle - startAngle));
    expect(angleDiff).toBeCloseTo(0, 2);
    expect(state.shots).toBe(0);

    // Releasing and pressing anew works
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(async () => page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  test('7 & 8: Returning player with saved pot sees Continue Pot and Brew New Pot, preserving data', async ({ page, problems }) => {
    await openTitle(page, '&seed=42');
    await page.keyboard.press('Enter');
    await checkpointRound(page);

    const savedRaw = await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));
    expect(savedRaw).not.toBeNull();

    await page.reload();
    await page.waitForFunction(() => window.__TEACUP__?.game);
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(savedRaw);
    await expect(page.locator('#arcadeSplash')).toBeVisible();
    await page.locator('#titleContinueBtn').click();
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(savedRaw);

    const overlay = page.locator('#instructionOverlay');
    await expect(overlay).toBeVisible();

    const primary = page.locator('#overlayPrimaryBtn');
    const newPot = page.locator('#overlayNewPotBtn');
    await expect(primary).toHaveText('CONTINUE YOUR POT (ENTER)');
    await expect(newPot).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(newPot).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#overlayTrainingBtn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(primary).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#overlayTrainingBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(newPot).toBeFocused();

    // Pressing Enter on focused Brew A New Pot opens confirmation modal without data loss
    await page.keyboard.press('Enter');
    const confirmModal = page.locator('#potConfirmation');
    await expect(confirmModal).toBeVisible();
    await expect(page.locator('#confirmPotTitle')).toHaveText('Replace your saved pot?');

    await page.locator('#cancelPotBtn').click();
    await expect(confirmModal).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(savedRaw);

    // Sidebar button now cleanly continues the saved pot
    await page.locator('#mainBtn').click();
    await expect(page.locator('#hudStatus')).toHaveText('READING THE LEAVES');

    const currentSaved = await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));
    expect(currentSaved).toBe(savedRaw);
    expect(problems).toEqual([]);
  });

  test('Continue Your Pot resumes the saved pot with Enter, leaving the save untouched', async ({ page, problems }) => {
    await openTitle(page, '&seed=42');
    await page.keyboard.press('Enter');
    await checkpointRound(page);
    const savedRaw = await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));

    await page.reload();
    await page.waitForFunction(() => window.__TEACUP__?.game);
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(savedRaw);
    await expect(page.locator('#arcadeSplash')).toBeVisible();
    await page.locator('#titleContinueBtn').click();
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(savedRaw);
    await expect(page.locator('#overlayPrimaryBtn')).toHaveText('CONTINUE YOUR POT (ENTER)');
    await page.keyboard.press('Enter');
    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#hudStatus')).toHaveText('READING THE LEAVES');
    expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(savedRaw);
    expect(problems).toEqual([]);
  });

  test('10: Reopening controls from Tea Break does not reset or inadvertently resume the game', async ({ page, problems }) => {
    await openTitle(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

    await page.locator('#menuBtn').click();
    await expect(page.locator('#teaBreak')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('PAUSED');

    await page.getByText('Controls & Settings', { exact: true }).click();
    await page.locator('#breakControlsBtn').click();
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#overlayPrimaryBtn')).toHaveText('BACK TO TEA BREAK (ENTER)');
    expectFits(await overlayLayout(page));

    await page.keyboard.press('Enter');
    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#teaBreak')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('PAUSED');

    // Escape from the review also goes back to the Tea Break, still paused.
    await expect(page.locator('#breakControlsBtn')).toBeFocused();
    await page.locator('#breakControlsBtn').click();
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#teaBreak')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
    await expect(page.locator('#breakControlsBtn')).toBeFocused();

    await page.locator('#closeBreak').click();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    await expect(page.locator('#game')).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('11: Keyboard accessibility, Tab focus trap, and Escape cannot skip the first screen', async ({ page, problems }) => {
    await openTitle(page);
    const overlay = page.locator('#instructionOverlay');
    await expect(overlay).toBeVisible();

    const primaryBtn = page.locator('#overlayPrimaryBtn');
    await expect(primaryBtn).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('#overlayTrainingBtn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(primaryBtn).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#overlayTrainingBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(primaryBtn).toBeFocused();

    // Space does not dismiss the overlay (it is the steam key)
    await page.keyboard.press('Space');
    await expect(overlay).toBeVisible();

    // Escape, however often, leaves the overlay up and points at the start button.
    // The shake class is brief, so count each time it is added rather than racing it.
    await primaryBtn.evaluate((button) => {
      window.nudges = 0;
      new MutationObserver(() => { if (button.classList.contains('nudge')) window.nudges++; })
        .observe(button, { attributes: true, attributeFilter: ['class'] });
    });
    for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.nudges)).toBe(3);
    await page.waitForTimeout(150);
    await expect(overlay).toBeVisible();
    expect(await overlay.evaluate((d) => d.matches(':modal'))).toBe(true);
    await expect(primaryBtn).toBeFocused();
    await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');

    await page.keyboard.press('Enter');
    await expect(overlay).toBeHidden();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    expect(problems).toEqual([]);
  });

  test('the controls summary explains hidden buttons and the selected touch scheme', async ({ page, problems }) => {
    const touch = page.locator('#overlayTouchSummary');

    await openTitle(page);
    await expect(touch).toBeVisible();
    await expect(touch).toContainText('On-screen controls hidden:');
    await expect(touch).toContainText('Use the keyboard');

    await openTitle(page, '&touch=easy');
    await expect(touch).toBeVisible();
    await expect(touch).toContainText('On-screen controls hidden:');
    await expect(touch).toContainText('Auto Steam is on');
    await expect(touch).toContainText('double-tap for milk');
    await expect(touch).not.toContainText('Tap MILK');
    expect(problems).toEqual([]);
  });

  test('12: Reduced-motion and compact layout on narrower viewports', async ({ page, problems }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?debug');
    await page.waitForFunction(() => window.__TEACUP__?.game);
    await expect(page.locator('#arcadeSplash')).toBeVisible();
    await page.locator('#titleContinueBtn').click();
    await expect(page.locator('#arcadeSplash')).toBeHidden();

    await page.setViewportSize({ width: 375, height: 667 });
    await openTitle(page, '');
    await expect(page.locator('.instruction-card')).toBeVisible();
    expectFits(await overlayLayout(page));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });

  test('13: Direct scenario links skip the initial overlay', async ({ page, problems }) => {
    for (const query of ['&noOverlay', '&arcade=dailyPour']) {
      await openTitle(page, query);
      await expect(page.locator('#instructionOverlay')).toBeHidden();
      expect(await page.evaluate(() => window.__TEACUP__.overlay.isOpen)).toBe(false);
    }
    expect(problems).toEqual([]);
  });

  test('Visual qualification screenshots', async ({ page, problems }, testInfo) => {
    if (testInfo.project.name !== 'chromium') return;
    const dir = testInfo.outputPath('title-review');
    const holdSplash = async () => {
      await page.goto('./?debug');
      await page.waitForFunction(() => window.__TEACUP__?.game);
      await page.evaluate(() => document.querySelector('.splash-status').style.setProperty('animation', 'none'));
    };

    // 1. The tea packaging title screen, desktop and phone
    await holdSplash();
    await page.screenshot({ path: `${dir}/arcade-splash.png` });
    await page.setViewportSize({ width: 375, height: 667 });
    await holdSplash();
    await page.screenshot({ path: `${dir}/arcade-splash-narrow.png` });

    // 2. The instructions over the cup in a 1280 x 720 window
    await page.setViewportSize({ width: 1280, height: 720 });
    await openTitle(page, '');
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#arcadeSplash')).toBeHidden();
    await page.screenshot({ path: `${dir}/instruction-overlay.png` });

    // 3. The game after dismissing it
    await page.keyboard.press('Enter');
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${dir}/gameplay-after-dismiss.png` });

    // 4. A narrow phone-sized window, with a saved pot and Easy Touch
    await page.setViewportSize({ width: 375, height: 667 });
    await openTitle(page, '&touch=easy');
    await page.evaluate(() => window.__TEACUP__.overlay.show({ hasSavedPot: true }));
    await expect(page.locator('#arcadeSplash')).toBeHidden();
    await page.screenshot({ path: `${dir}/compact-narrow-overlay.png` });

    expect(problems).toEqual([]);
  });
});
