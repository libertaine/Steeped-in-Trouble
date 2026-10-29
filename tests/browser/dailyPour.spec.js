import { test, expect, openGame } from './fixtures.js';
import {
  advancePaperRoute, bubbleShown, expectPourControls, perfectPaperRoute, remarkStart, toPaperOffer,
} from './dailyPour.js';
import { toShortage } from './errand.js';

const imagePath = (name) => `docs/images/daily-pour/${name}.png`;
async function shot(page, testInfo, name) {
  if (testInfo.project.name === 'chromium') await page.screenshot({ path: imagePath(name), fullPage: true, scale: 'css' });
}

test('optional paper offer can be skipped by mouse or keyboard without losing anything', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full'); await toPaperOffer(page);
  const before = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  await page.locator('[data-interlude="skip"]').click();
  await expect(page.locator('#roundNum')).toHaveText('13');
  const after = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  for (const key of ['lives', 'score', 'teaCash', 'spoon', 'progress', 'shortageAfter']) expect(after[key]).toEqual(before[key]);
  expect(after.fortune).toBe(before.nextFortune); expect(after.dailyPour).toBeNull();
  expect(after.arcade.after.dailyPour).toBe(26);
  expect(await page.evaluate(() => window.__TEACUP__.launchDailyPour)).toBeUndefined();
  expect(problems).toEqual([]);
});

test('desktop route shows real misses, deliveries, the angry neighbor and a result', async ({ page, problems }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full'); await toPaperOffer(page);
  await page.keyboard.press('Digit1');
  await expectPourControls(page);
  await shot(page, testInfo, 'introduction');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space'); // First house is still far away: a real miss.
  await advancePaperRoute(page, 1.1);
  await expect(page.locator('#gameTip')).toContainText('Space throws');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.misses)).toBe(1);
  await shot(page, testInfo, 'missed-delivery');
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    while (game.state.dailyPour.clock < 4 - 1e-9) game.update(1 / 120);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    for (let i = 0; i < 80; i++) game.update(1 / 120);
  });
  await expect(page.locator('#hudScore')).toHaveText('DELIVERED 1/7');
  await shot(page, testInfo, 'successful-delivery');
  await shot(page, testInfo, 'desktop-full');
  await page.evaluate(() => {
    const { game, config } = window.__TEACUP__;
    const h = game.state.dailyPour.houses.find((h) => h.dog);
    const at = (h.x - config.dailyPour.targets.far.ahead) / config.dailyPour.speed;
    while (game.state.dailyPour.clock < at - 1e-9) game.update(Math.min(1 / 120, at - game.state.dailyPour.clock));
    for (const code of ['ArrowUp', 'Space']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    }
    for (let i = 0; i < 120; i++) game.update(1 / 120);
  });
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.windows)).toBe(1);
  await shot(page, testInfo, 'angry-neighbor');
  await advancePaperRoute(page, 30);
  await expect(page.locator('#roundTitle')).toHaveText('YOUR CONTRACT HAS BEEN REVIEWED.');
  await shot(page, testInfo, 'result');
  expect(problems).toEqual([]);
});

test('perfect route rewards once and returns to the pending fortune and next normal cup', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full'); await toPaperOffer(page);
  const before = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  await page.locator('[data-interlude="accept"]').click();
  await page.keyboard.press('KeyP');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.stage)).toBe('intro');
  await page.keyboard.press('KeyP'); await page.keyboard.press('Enter');
  await perfectPaperRoute(page);
  const result = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  expect(result.dailyPour.summary).toMatchObject({ perfect: true, points: 225, cash: 5 });
  expect(result.score).toBe(before.score + 225); expect(result.teaCash).toBe(before.teaCash + 5);
  for (const key of ['lives', 'spoon', 'progress', 'shortageAfter', 'extraSugar', 'target']) expect(result[key]).toEqual(before[key]);
  await page.keyboard.press('KeyP');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.stage)).toBe('outro');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => { window.__TEACUP__.game.update(2); });
  await page.keyboard.press('Enter');
  await expect(page.locator('#roundNum')).toHaveText('13');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.fortune)).toBe(before.nextFortune);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour)).toBeNull();
  expect(problems).toEqual([]);
});

test('paper keys, auto-repeat, pause, Tea Break and backgrounding cannot leak gameplay', async ({ page, problems }, testInfo) => {
  await openGame(page, '&seed=42&view=compact'); await toPaperOffer(page);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await expectPourControls(page);
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#aimPaperBtn')).toHaveText('AIM: PORCH');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#aimPaperBtn')).toHaveText('AIM: MAILBOX');
  const before = await page.evaluate(() => ({ milk: window.__TEACUP__.game.state.milkLeft, sugar: window.__TEACUP__.game.state.sugarLeft }));
  await page.keyboard.down('Space');
  await page.evaluate(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true })); });
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.papers)).toBe(8);
  await page.keyboard.press('KeyP');
  const paused = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state.dailyPour));
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour)).toEqual(paused);
  await page.keyboard.press('KeyP');
  await page.locator('#menuBtn').click(); await expect(page.locator('#teaBreak')).toBeVisible();
  await page.locator('#closeBreak').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'dailyPour');
  await shot(page, testInfo, 'desktop-compact');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  const frozen = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state.dailyPour));
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour)).toEqual(frozen);
  expect(await page.evaluate(() => ({ milk: window.__TEACUP__.game.state.milkLeft, sugar: window.__TEACUP__.game.state.sugarLeft }))).toEqual(before);
  expect(problems).toEqual([]);
});

for (const [view, viewport] of [['full', { width: 1440, height: 1080 }], ['compact', { width: 1280, height: 800 }]]) {
  test(`the bystander's remark appears, pauses and leaves the route untouched in ${view} view`, async ({ page, problems }, testInfo) => {
    await page.setViewportSize(viewport);
    await openGame(page, `&seed=42&view=${view}`); await toPaperOffer(page);
    await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
    const start = await remarkStart(page);
    await advancePaperRoute(page, start - 0.25);
    expect(await bubbleShown(page)).toBe(false);
    await advancePaperRoute(page, start + 0.5);
    expect(await bubbleShown(page)).toBe(true);
    await shot(page, testInfo, `pedestrian-${view}`);
    // Paused mid-sentence: route, bubble timing and pixels all hold still.
    await page.keyboard.press('KeyP');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
    const frozen = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state.dailyPour));
    const pixels = () => page.evaluate(() => document.getElementById('game').toDataURL());
    const still = await pixels();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour)).toEqual(frozen);
    expect(await pixels()).toBe(still);
    await page.keyboard.press('KeyP');
    expect(await bubbleShown(page)).toBe(true);
    // Backgrounded for longer than the remark lasts: it is still there on return.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
    await page.waitForTimeout(3200);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.keyboard.press('KeyP');
    expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.clock)).toBeLessThan(start + 1);
    expect(await bubbleShown(page)).toBe(true);
    await advancePaperRoute(page, start + 3.05);
    expect(await bubbleShown(page)).toBe(false);
    expect(await page.evaluate(() => {
      const m = window.__TEACUP__.game.state.dailyPour;
      return { delivered: m.delivered, misses: m.misses, windows: m.windows, dogs: m.dogs, papers: m.papers, stage: m.stage };
    })).toEqual({ delivered: 0, misses: 0, windows: 0, dogs: 0, papers: 9, stage: 'play' });
    expect(problems).toEqual([]);
  });
}

test('a successful aerial jump clears the actual coffee body in the existing Tea Run', async ({ page, problems }, testInfo) => {
  await openGame(page, '&seed=42&view=full'); await toShortage(page);
  await page.locator('[data-errand="run"]').click(); await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const { game, config } = window.__TEACUP__;
    const r = game.state.run, R = config.teaRun;
    Object.assign(r, { clock: 0, distance: 0, accumulator: 0, opportunity: null, pickups: [] });
    r.obstacles = [{ id: 0, kind: 'coffeeCup', x0: R.speed + R.spoon.halfWidth - R.obstacles.coffeeCup.inset, roll: 0, hitAt: null }];
    Object.assign(r.spoon, { action: 'run', time: 0, launchHeight: 0, chain: 0, recover: 0, tumble: 0, safe: 0 });
    game.update(0.55); game.jump();
    game.update(0.2);
    // Seed 42's first real airborne roll succeeds; use the actual impulse.
    if (!game.jump()) throw new Error('Expected seeded aerial success');
    game.update(0.35);
    game.pause();
  });
  expect(await page.evaluate(() => window.__TEACUP__.game.state.run.hits)).toBe(0);
  await shot(page, testInfo, 'coffee-cup-clearance');
  await page.evaluate(() => { const g = window.__TEACUP__.game; g.resume(); g.update(0.3); });
  expect(await page.evaluate(() => window.__TEACUP__.game.state.run.hits)).toBe(0);
  expect(problems).toEqual([]);
});
