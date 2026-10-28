import { expect } from './fixtures.js';
import { expectRunnerHud, toShortage } from './errand.js';

export async function frozenRunner(page) {
  await toShortage(page);
  await page.locator('[data-errand="run"]').click();
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    game.primaryAction();
    // Keep real input/rendering live, but advance simulation explicitly for captures.
    window.__advanceRunner = game.update;
    game.update = () => {};
    game.state.run.opportunity = null;
  });
  if (await page.locator('body').getAttribute('data-view') === 'full') await expectRunnerHud(page);
  else {
    // Compact View deliberately places its HUD outside the canvas.
    const pills = page.locator('#hudStatus, #hudScore, #hudLives');
    for (const pill of await pills.all()) await expect(pill).toBeInViewport();
    const boxes = await pills.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    for (let i = 0; i < boxes.length; i++) for (const b of boxes.slice(i + 1)) {
      const a = boxes[i];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
    }
  }
  expect(await page.evaluate(() => window.__TEACUP__.previewAerial)).toBeUndefined();
}

export async function advance(page, seconds) {
  await page.evaluate((dt) => window.__advanceRunner(dt), seconds);
  // Let the real presentation loop paint the manually advanced state.
  await page.waitForTimeout(60);
}

export async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(name + '.png');
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

export async function secretAndReturn(page, testInfo, kind) {
  await page.evaluate((id) => {
    const { game, config } = window.__TEACUP__;
    const run = game.state.run;
    run.opportunity = id;
    Object.assign(run.spoon, { action: 'jump', time: 0, launchHeight: config.teaRun.aerial[id].altitude });
    window.__advanceRunner(1 / 120);
    // A nearby hazard is bypassed on return; its pickup must remain untaken.
    run.obstacles.push({ id: 900, kind: 'puddle', x0: run.distance - 40, roll: 0, hitAt: null });
    run.pickups.push({ kind: 'coin', x: run.distance, height: 20, takenAt: null });
  }, kind);
  const preserved = () => page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    const r = s.run;
    return { clock: r.clock, distance: r.distance, left: r.left, hits: r.hits, coins: r.coins,
      packets: r.packets, lives: s.lives, score: s.score, teaCash: s.teaCash,
      round: s.round, fortune: s.nextFortune, spoon: s.spoon, pickups: r.pickups };
  });
  const before = await preserved();
  await advance(page, kind === 'orbit' ? 2 : 0.8);
  expect(await preserved()).toEqual(before);
  await capture(page, testInfo, kind);
  await page.keyboard.press('KeyP');
  const paused = await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state.run));
  await advance(page, 20);
  expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state.run))).toBe(paused);
  await page.keyboard.press('KeyP');
  // Browser visibilitychange must pause the sequence as well.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advance(page, 10);
  expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state.run))).toBe(paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.press('KeyP');
  const remaining = await page.evaluate(() => {
    const { game, config } = window.__TEACUP__;
    const e = game.state.run.encounter;
    return config.teaRun.aerial[e.kind].duration - e.time;
  });
  if (kind === 'orbit') {
    await advance(page, 2);
    await capture(page, testInfo, 'reentry');
  }
  await advance(page, remaining - (kind === 'orbit' ? 2 : 0));
  expect(await preserved()).toEqual(before);
  expect(await page.evaluate(() => {
    const { run, aerialDiscoveries } = window.__TEACUP__.game.state;
    return { encounter: run.encounter, result: run.result, safe: run.obstacles.at(-1).bypassed,
      discoveries: aerialDiscoveries, action: run.spoon.action };
  })).toEqual({ encounter: null, result: null, safe: true, discoveries: [kind], action: 'run' });
  await capture(page, testInfo, 'safe-return');
  await advance(page, 0.1);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.run.hits)).toBe(before.hits);
}
