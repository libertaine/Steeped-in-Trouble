// Shared steps for the Tea Shortage and Tea Run browser tests.

import { expect } from './fixtures.js';

/**
 * Skip ahead to the first Tea Shortage: the round-9 reading of a pot already
 * in Chapter 2, with no bonus round or rematch waiting behind it. The round
 * is finished by a real dart hitting a real leaf, and the reading's upgrade
 * offer (if any) is declined.
 */
export async function toShortage(page, { teaCash = 45 } = {}) {
  await page.locator('#mainBtn').click();
  await page.evaluate((cash) => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, {
      round: 9, progress: { chapter: 2, starts: [1, 6] }, grindAfter: null, lastGrind: 9, havocAfter: null, lastHavoc: 9,
      teaCash: cash - window.__TEACUP__.config.teaCash.round, kills: s.target - 1, spawnTimer: Infinity, current: null,
    });
    s.enemies = [];
    s.shots.push({ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false });
    s.enemies.push({ angle: s.angle, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 });
  }, teaCash);
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    game.state.offer = null;
    game.primaryAction();
  });
  await expect(page.locator('#errandOffer')).toBeVisible();
}

/**
 * Run the errand from inside the page, pressing at the moment that centres
 * each jump or slide on its obstacle (as a steady player would), with
 * `press(action)` doing the pressing. Resolves when the run is over.
 */
export async function runErrand(page, how) {
  await page.evaluate((mode) => {
    const { game, config } = window.__TEACUP__;
    const R = config.teaRun;
    const done = new Set();
    const key = (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };
    const pad = (action) => document.querySelector(`[data-run="${action}"]`)
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 31, pointerType: 'touch' }));
    const press = (action) => (mode === 'keys' ? key(action === 'jump' ? 'Space' : 'ArrowDown') : pad(action));
    function frame() {
      const s = game.state;
      if (s.phase !== 'teaRun' && s.phase !== 'paused') return;
      const run = s.run;
      if (run?.stage === 'intro') press('jump'); // off we go
      if (run?.stage === 'run') {
        const ob = run.obstacles.find((o) => !done.has(o.id));
        if (ob) {
          const O = R.obstacles[ob.kind];
          const closing = R.speed + ob.roll;
          const left = ob.x0 - ob.roll * run.clock + O.inset;
          const until = (left - (run.distance + R.spoon.halfWidth)) / closing;
          const span = (O.width - 2 * O.inset + 2 * R.spoon.halfWidth) / closing;
          const length = O.action === 'jump' ? R.jumpTime : R.slideTime;
          if (until <= (length - span) / 2) {
            done.add(ob.id);
            press(O.action);
          }
        }
      }
      if (run?.stage === 'outro') return;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, how);
  await page.waitForFunction(() => window.__TEACUP__.game.state.run?.stage === 'outro', null, { timeout: 70_000 });
}

/** The runner uses three DOM pills; each must fit the canvas without covering another. */
export async function expectRunnerHud(page) {
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'run');
  for (const id of ['hudTea', 'hudOmen', 'hudStrainer', 'hudAuto']) await expect(page.locator('#' + id)).toBeHidden();
  const canvas = await page.locator('#game').boundingBox();
  const pills = await page.locator('#hudStatus, #hudScore, #hudLives').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  for (let i = 0; i < pills.length; i++) {
    const a = pills[i];
    expect(a.width).toBeGreaterThan(0);
    expect(a.left).toBeGreaterThanOrEqual(canvas.x);
    expect(a.right).toBeLessThanOrEqual(canvas.x + canvas.width);
    const cardTop = canvas.width < 560 ? 210 : 160; // logical y of the highest intro/result card
    expect(a.bottom).toBeLessThan(canvas.y + canvas.height * cardTop / 790);
    for (const b of pills.slice(i + 1)) expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
  }
  await expect(page.locator('#hudScore')).toContainText('COINS');
  await expect(page.locator('#hudLives')).toContainText('STUMBLES');
}
