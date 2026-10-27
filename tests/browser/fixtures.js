import { test as base, expect } from '@playwright/test';

/**
 * A page that records JavaScript errors, console errors, and failed or 4xx/5xx
 * requests. Tests call `expectNoProblems()` at the end.
 */
export const test = base.extend({
  problems: async ({ page }, use) => {
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));
    page.on('response', (response) => {
      if (response.status() >= 400) problems.push(`${response.status()}: ${response.url()}`);
    });
    await use(problems);
  },
});

export { expect };

/** Open the game with the read-only debug hook enabled. */
export async function openGame(page, query = '') {
  await page.goto(`./?debug${query}`);
  await page.waitForFunction(() => window.__TEACUP__?.game);
}

export const gameState = (page) => page.evaluate(() => {
  const s = window.__TEACUP__.game.state;
  return {
    phase: s.phase, round: s.round, score: s.score, lives: s.lives, kills: s.kills, angle: s.angle,
    shots: s.shots.length, milkLeft: s.milkLeft, sugarLeft: s.sugarLeft, fortune: s.fortune, nextFortune: s.nextFortune,
  };
});

/**
 * Play automatically through the game's normal keyboard listeners until the
 * current round ends in a fortune reading. Restarts if the autopilot loses.
 */
export async function autoplayUntilReading(page) {
  await page.evaluate(() => {
    const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const held = new Set();
    const hold = (code, on) => {
      if (on && !held.has(code)) { held.add(code); send('keydown', code); }
      if (!on && held.has(code)) { held.delete(code); send('keyup', code); }
    };
    const TAU = Math.PI * 2;
    const step = TAU / 16;
    const laneAngle = (a) => -Math.PI / 2 + Math.round((((a % TAU) + TAU) % TAU + Math.PI / 2) / step) * step;
    const diff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    function frame() {
      const s = window.__TEACUP__.game.state;
      if (s.phase === 'reading') {
        for (const code of [...held]) hold(code, false);
        return;
      }
      if (s.phase === 'gameover') send('keydown', 'Enter');
      if (s.phase === 'playing') {
        hold('Space', true);
        const target = s.enemies.reduce((best, e) => (!best || e.radius > best.radius ? e : best), null);
        const d = target ? diff(laneAngle(target.angle), s.angle) : 0;
        hold('ArrowRight', d > 0.04);
        hold('ArrowLeft', d < -0.04);
        if (target?.radius > 215) send('keydown', 'KeyM');
        if (s.enemies.filter((e) => e.radius > 150).length > 2) send('keydown', 'KeyS');
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading', null, { timeout: 75_000 });
}
