import { expect, gameState, openGame, test } from './fixtures.js';
import { expectRunnerHud, runErrand, toShortage } from './errand.js';

// Easy Touch on a phone, with real touch input: taps through Playwright's
// touchscreen, and long presses through the DevTools touch protocol.

/** A point on the cup, away from the HUD pills and any overlay (scrolling the cup back into view first). */
async function cupPoint(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.locator('#game').boundingBox();
  return { x: box.x + box.width * 0.5, y: box.y + box.height * 0.45 };
}

/** Hold a finger on the page for about `ms`. Returns how long the page saw it down, in ms. */
async function touchHold(page, { x, y }, ms) {
  await page.evaluate(() => {
    window.__held = {};
    document.addEventListener('pointerdown', (e) => { window.__held.down = e.timeStamp; }, { capture: true, once: true });
    document.addEventListener('pointerup', (e) => { window.__held.up = e.timeStamp; }, { capture: true, once: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return page.evaluate(() => window.__held.up - window.__held.down);
}

const viewport = (page) => page.evaluate(() => ({
  scrollY: window.scrollY, scrollX: window.scrollX, scale: window.visualViewport?.scale ?? 1,
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}));

/** Start a cup with nothing arriving, so taps and holds are the only thing changing it. */
async function quietCup(page) {
  await page.locator('#mainBtn').tap();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await page.evaluate(() => {
    window.__TEACUP__.game.state.spawnTimer = Infinity;
  });
}

test('starts a phone on Easy Touch: two big steering pads, Auto Steam, and room to read the cup', async ({ page, problems }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openGame(page);
  expect(await page.evaluate(() => window.__TEACUP__.settings())).toEqual({ touch: 'easy', autoSteam: true });
  await expect(page.locator('.controls-easy')).toBeVisible();
  await expect(page.locator('.controls-classic')).toBeHidden();
  const pads = await page.locator('.controls-easy .steer').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  expect(pads).toHaveLength(2);
  for (const pad of pads) {
    expect(pad.height).toBeGreaterThanOrEqual(60);
    expect(pad.width).toBeGreaterThanOrEqual(90);
    expect(pad.bottom).toBeLessThanOrEqual(740); // reachable without scrolling
  }
  expect(pads[1].left - pads[0].right).toBeGreaterThan(80); // well apart, one per thumb
  await quietCup(page);
  await expect(page.locator('#hudAuto')).toHaveText('AUTO STEAM');
  expect((await viewport(page)).overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#autoSteamBtn')).toBeDisabled();
  expect(problems).toEqual([]);
});

test('steers with a held pad while Auto Steam clears whatever the spoon turns onto', async ({ page, problems }) => {
  await openGame(page);
  await quietCup(page);
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.target = 99;
    for (let lane = 0; lane < 16; lane += 2) {
      const angle = -Math.PI / 2 + (lane * Math.PI * 2) / 16;
      s.enemies.push({ angle, radius: 110, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 });
    }
  });
  const pad = page.locator('.controls-easy [data-hold="right"]');
  const start = (await gameState(page)).angle;
  await pad.dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(1600);
  await pad.dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch', isPrimary: true });
  const after = await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return { kills: s.kills, milk: s.milkLeft, sugar: s.sugarLeft, angle: s.angle, volleys: s.roundStats.volleys };
  });
  expect(after.angle).not.toBeCloseTo(start, 1);
  expect(after.kills).toBeGreaterThanOrEqual(3);
  expect(after.volleys).toBeLessThanOrEqual(after.kills + 2); // shots at leaves, not a stream
  expect([after.milk, after.sugar]).toEqual([2, 2]); // never milk or sugar by itself
  expect(problems).toEqual([]);
});

test('double-tapping the cup pours milk once, steering taps never do, and the page never zooms or scrolls', async ({ page, problems }) => {
  await openGame(page);
  await quietCup(page);
  const p = await cupPoint(page);
  const before = await viewport(page);
  // Hammer the steering pads.
  for (const side of ['left', 'right', 'left', 'right']) {
    const box = await page.locator(`.controls-easy [data-hold="${side}"]`).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(page.locator('#milkCount')).toHaveText('2');
  // A double tap a little apart, as a thumb would.
  await page.touchscreen.tap(p.x, p.y);
  await page.touchscreen.tap(p.x + 14, p.y + 10);
  await expect(page.locator('#milkCount')).toHaveText('1');
  await page.waitForTimeout(500);
  await expect(page.locator('#milkCount')).toHaveText('1');
  await expect(page.locator('#sugarCount')).toHaveText('2');
  expect(await viewport(page)).toEqual(before);
  expect(problems).toEqual([]);
});

test('a long press on the cup fires one sugar burst; a short one does nothing', async ({ page, problems }) => {
  await openGame(page);
  await quietCup(page);
  const p = await cupPoint(page);
  const before = await viewport(page);
  const longPress = await page.evaluate(() => window.__TEACUP__.config.touch.longPress);
  const short = await touchHold(page, p, 60);
  expect(short).toBeLessThan(longPress); // (if not, the machine is too busy for this test to mean anything)
  await page.waitForTimeout(400);
  await expect(page.locator('#sugarCount')).toHaveText('2');
  expect(await touchHold(page, p, 1200)).toBeGreaterThan(longPress);
  await expect(page.locator('#sugarCount')).toHaveText('1');
  await expect(page.locator('#milkCount')).toHaveText('2');
  expect(await viewport(page)).toEqual(before);
  expect(problems).toEqual([]);
});

test('gestures are left behind when the round ends: none reach the reading, the upgrade cards, or the next cup', async ({ page, problems }) => {
  await openGame(page);
  await quietCup(page);
  const p = await cupPoint(page);
  await page.touchscreen.tap(p.x, p.y); // half a double tap…
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.kills = s.target - 1;
    s.shots.push({ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false });
    s.enemies.push({ angle: s.angle, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 });
  });
  await expect(page.locator('#hudStatus')).toHaveText('READING THE LEAVES');
  await page.touchscreen.tap(p.x, p.y); // …finished during the reading
  await page.touchscreen.tap(p.x, p.y);
  await touchHold(page, p, 700);
  const reading = await page.evaluate(() => window.__TEACUP__.game.state.roundStats);
  expect([reading.milkUses, reading.sugarUses]).toEqual([0, 0]);
  await expect(page.locator('#upgradeOffer')).toBeVisible({ timeout: 10_000 });
  await page.locator('.upgrade-card').first().tap();
  await expect(page.locator('#roundNum')).toHaveText('02');
  const q = await cupPoint(page);
  await page.touchscreen.tap(q.x, q.y); // a single tap in the new cup is only a first tap
  await page.waitForTimeout(400);
  await expect(page.locator('#milkCount')).toHaveText('2');
  expect(problems).toEqual([]);
});

test('the Tea Run is playable with the JUMP and SLIDE pads alone', async ({ page, problems }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openGame(page, '&seed=31');
  const before = await viewport(page);
  await toShortage(page);
  await page.locator('[data-errand="run"]').tap();
  await expect(page.locator('.controls-run')).toBeVisible();
  await expectRunnerHud(page);
  await expect(page.locator('.controls-easy')).toBeHidden();
  const pads = await page.locator('.run-pad').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  for (const pad of pads) {
    expect(pad.height).toBeGreaterThanOrEqual(70);
    expect(pad.bottom).toBeLessThanOrEqual(740);
  }
  // A real tap on JUMP starts the run, and another one jumps.
  const jump = await page.locator('[data-run="jump"]').boundingBox();
  await page.touchscreen.tap(jump.x + jump.width / 2, jump.y + jump.height / 2);
  await expect(page.locator('#hudStatus')).toContainText('THE TEA RUN');
  await page.touchscreen.tap(jump.x + jump.width / 2, jump.y + jump.height / 2);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.run.spoon.action)).toBe('jump');
  await runErrand(page, 'pads');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.run.result)).toBe('success');
  await expectRunnerHud(page);
  await page.waitForTimeout(1700);
  await page.touchscreen.tap(jump.x + jump.width / 2, jump.y + jump.height / 2);
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect(page.locator('.controls-easy')).toBeVisible();
  expect((await viewport(page)).scale).toBe(before.scale);
  expect((await viewport(page)).overflow).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});

for (const quality of ['high', 'low']) {
  test('runner HUD fits narrow phones through pause and failure with ' + quality + ' graphics', async ({ page, problems }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await openGame(page, '&seed=24&graphics=' + quality);
    await toShortage(page);
    await page.locator('[data-errand="run"]').tap();
    await expectRunnerHud(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyP');
    await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
    await expectRunnerHud(page);
    // Keep the normal collision path, but advance fixed steps instead of waiting in real time.
    await page.evaluate(() => {
      const g = window.__TEACUP__.game;
      g.resume();
      for (let i = 0; i < 1000 && g.state.run.stage === 'run'; i++) g.update(0.04);
    });
    await expect(page.locator('#hudStatus')).toHaveText('PEAR-SHAPED');
    await expectRunnerHud(page);
    await page.waitForTimeout(1700);
    await page.locator('[data-run="jump"]').tap();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    await expect(page.locator('#hudScore')).toContainText('SCORE');
    await expect(page.locator('#hudLives')).toHaveText(/^(REINFORCED|CUP STABLE|PORCELAIN CRACKED|STRUCTURAL FAILURE IMMINENT)$/);
    expect((await viewport(page)).overflow).toBeLessThanOrEqual(0);
    expect(problems).toEqual([]);
  });
}
