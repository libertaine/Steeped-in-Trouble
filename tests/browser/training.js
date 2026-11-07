import { test, expect, openGame } from './fixtures.js';

export const view = (page) => page.evaluate(() => structuredClone(window.__TEACUP__.game.state.training));
export async function trainingClock(page) {
  const time = new Date();
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}
export async function startTraining(page, query = '') {
  const params = new URLSearchParams({ touch: 'classic', autosteam: 'off' });
  for (const [key, value] of new URLSearchParams(query.replace(/^&/, ''))) params.set(key, value);
  await openGame(page, `&${params}`);
  await trainingClock(page);
  await page.locator('#trainingBtn').click();
  await page.clock.runFor(50);
  await expect(page.locator('#trainingHeading')).toHaveText('FIRST, THE SPOON.');
}
export async function hold(page, code, ms) {
  await page.keyboard.down(code); await page.clock.runFor(ms); await page.keyboard.up(code); await page.clock.runFor(80);
}
export async function move(page) {
  await hold(page, 'ArrowLeft', 130); await hold(page, 'ArrowRight', 130);
  expect((await view(page)).stage).toBe(1);
}
export async function aim(page, angle) {
  for (let i = 0; i < 120; i++) {
    const { d, speed } = await page.evaluate((a) => {
      const b = window.__TEACUP__.game.state.angle;
      return { d: Math.atan2(Math.sin(a - b), Math.cos(a - b)), speed: window.__TEACUP__.config.player.turnSpeed };
    }, angle);
    if (Math.abs(d) < .06) return;
    // Steer with a real held key for the measured travel time, then verify the
    // result. Tiny taps with idle frames between them needlessly redraw the
    // largest DPR canvas many times on a hosted runner.
    await hold(page, d < 0 ? 'ArrowLeft' : 'ArrowRight', Math.max(16, Math.min(250, Math.abs(d) / speed * 1000)));
  }
  throw Error('could not aim');
}
export async function steam(page) { await hold(page, 'Space', 550); }
export async function milk(page) { await page.keyboard.press('KeyQ'); await page.clock.runFor(1000); }
export async function sugar(page) { await page.keyboard.press('KeyE'); await page.clock.runFor(500); }
export async function practice(page) {
  for (let i = 0; i < 20 && (await view(page)).stage === 4; i++) {
    const angle = await page.evaluate(() => window.__TEACUP__.game.state.enemies[0]?.angle);
    if (angle === undefined) { await page.clock.runFor(100); continue; }
    await aim(page, angle);
    if ((await view(page)).complete) break;
    await steam(page);
  }
  expect((await view(page)).complete).toBe(true);
}
export async function layout(page) {
  expect(await page.locator('#trainingHeading').evaluate((node) => {
    const r = node.getBoundingClientRect(), panel = document.getElementById('phaseChoices').getBoundingClientRect();
    return r.top >= panel.top && r.bottom <= panel.bottom && r.top >= 0 && r.bottom <= innerHeight;
  }), 'stage heading begins visibly inside the instruction row').toBe(true);
  const result = await page.evaluate(() => {
    const box = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const canvas = box(document.getElementById('game'));
    const panel = box(document.getElementById('phaseChoices'));
    return { canvas, panel, width: innerWidth, height: innerHeight,
      scroll: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll('#trainingPanel button:not([hidden])')].map((b) => ({ id: b.id, ...box(b) })) };
  });
  expect(result.scroll).toBeLessThanOrEqual(result.width);
  expect(result.canvas.width).toBeGreaterThan(100); expect(result.canvas.height).toBeGreaterThan(90);
  expect(result.canvas.bottom).toBeLessThanOrEqual(result.height + 1);
  expect(result.panel.x >= result.canvas.right - 1 || result.panel.y >= result.canvas.bottom - 1).toBe(true);
  for (const b of result.buttons) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    await page.locator(`#${b.id}`).scrollIntoViewIfNeeded();
    expect(await page.locator(`#${b.id}`).evaluate((node) => {
      const r = node.getBoundingClientRect();
      return r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight + 1
        && node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
  }
}

export function trainingLayoutTests() {
  for (const [width, height] of [[320, 568], [375, 667], [844, 390], [800, 600], [1280, 720], [1920, 1080]]) {
    for (const [scheme, buttons] of [['classic', 'show'], ['easy', 'hide']]) {
      test.describe(`training layout ${width}x${height} ${scheme} ${buttons}`, () => {
        test.use({ viewport: { width, height }, reducedMotion: 'reduce' });
        test('fallback fonts, every exercise, completion and exit', async ({ page, problems }, info) => {
          await page.addInitScript((value) => localStorage.setItem('steeped-in-trouble:onscreen-controls', value), buttons);
          await startTraining(page, `&touch=${scheme}`);
          await page.addStyleTag({ content: '* { font-family: monospace !important; }' });
          await layout(page);
          await move(page); await layout(page);
          if (scheme === 'easy') { await hold(page, 'ArrowRight', 16); await page.clock.runFor(600); }
          else await steam(page);
          expect((await view(page)).stage).toBe(2); await layout(page);
          await milk(page); await layout(page); await sugar(page); await layout(page); await practice(page);
          await expect(page.locator('#trainingHeading')).toBeFocused();
          if ([320, 844].includes(width)) await page.screenshot({ path: info.outputPath('completion.png') });
          await layout(page);
          await page.locator('#trainingExit').click(); await expect(page.locator('#teaBreak')).toBeVisible();
          expect(problems).toEqual([]);
        });
      });
    }
  }
}
