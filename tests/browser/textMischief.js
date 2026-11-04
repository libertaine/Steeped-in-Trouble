import { expect, openGame } from './fixtures.js';

export const textState = page => page.evaluate(() => window.__TEACUP__.ambient.snapshot().text);

/** Deterministic completed-cup presentation; no random waiting for a rare gag. */
export async function stageTextReading(page, { offer = false, fortune = 'veil' } = {}) {
  await page.evaluate(({ offer, fortune }) => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { phase: 'reading', nextFortune: fortune, readingTime: 5,
      offer: offer ? ['polished', 'strainer'] : null,
      havocDue: false, grindDue: false, shortageDue: false, arcadeDue: null });
  }, { offer, fortune });
}

export async function openTextReading(page, options = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGame(page, '&view=full&seed=42&ambientSeed=7');
  await page.mouse.move(0, 0);
  await stageTextReading(page, options);
}

export async function stealText(page, { clock = true } = {}) {
  if (clock) await page.clock.runFor(500);
  await expect.poll(() => textState(page)).toMatchObject({ eligible: true });
  expect(await page.evaluate(() => window.__TEACUP__.ambient.stealText())).toBe(true);
  if (clock) await page.clock.runFor(32);
}

export async function freezeTextClock(page) {
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}
