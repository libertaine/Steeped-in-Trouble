import { expect, openGame, test } from './fixtures.js';
import { toDayReading } from './days.js';
import { toShortage } from './errand.js';
import { expectChoiceClickable, expectChoiceText } from './choiceVisibility.js';

const FALLBACK_FONTS = `
  body, #phaseChoices small { font-family: 'DejaVu Sans', Verdana, sans-serif !important; }
  .brand, #phaseChoices strong, #phaseChoices em { font-family: 'DejaVu Serif', Verdana, serif !important; }`;

async function swipeChoices(page) {
  const pane = page.locator('#phaseChoices');
  if (!await pane.evaluate(e => e.scrollHeight > e.clientHeight + 2)) return;
  await pane.evaluate(e => { e.scrollTop = 0; });
  const box = await pane.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  try {
    const x = box.x + box.width / 2, start = box.y + box.height - 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start - i * (box.height - 24) / 8 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => pane.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  } finally { await cdp.detach(); }
}

export function responsiveChoiceTests() {
  for (const phase of ['day', 'shortage']) for (const touch of ['easy', 'classic']) {
    for (const fonts of ['system', 'fallback']) {
      test(`${phase} ${touch} ${fonts}: complete text and unobstructed choices on small windows`,
        { tag: touch === 'easy' && fonts === 'fallback' ? '@smoke' : [] }, async ({ page, problems }, info) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(() => localStorage.removeItem('steeped-in-trouble:pot-save'));
        await openGame(page);
        const sizes = phase === 'day' ? [[320, 568], [568, 320], [844, 390]] : [[568, 320], [844, 390]];
        for (const visibility of ['show', 'hide']) for (const [index, [width, height]] of sizes.entries()) {
          await page.evaluate(v => localStorage.setItem('steeped-in-trouble:onscreen-controls', v), visibility);
          await page.setViewportSize({ width, height });
          await openGame(page, `&seed=42&touch=${touch}`);
          if (fonts === 'fallback') await page.addStyleTag({ content: FALLBACK_FONTS });
          if (phase === 'day') await toDayReading(page);
          else await toShortage(page);
          await expect(page.locator('body')).toHaveAttribute('data-phase', phase);
          const selector = phase === 'day' ? '#dayOffer' : '#errandOffer';
          const offer = page.locator(selector), cards = offer.locator('.errand-card');
          if (phase === 'day') {
            await expect(cards.locator('strong')).toHaveText(['FRESH BREW', 'KEEP THE KETTLE ON']);
            await expect(cards.locator('small')).toHaveText(['New day. Fewer leaves. A little less panic.',
              'Reset Heat. Keep your chapter, teas, spoon and progress.',
              'The spoon has declined its annual leave.', 'Carry Heat forward toward the maximum.']);
            await expect(offer.locator('.offer-head em')).toBeVisible();
            await expect(page.locator('#dayCompleted')).toContainText('Day 1 complete');
            await expect(page.locator('#dayCaption')).not.toBeEmpty();
          } else {
            await expect(cards.locator('strong')).toHaveText(['Buy tea', 'Run to the store', 'Skip']);
            await expect(cards.locator('small')).toHaveText(['20 Tea Cash of your 45', 'A quick dash to the shop', 'Carry on without']);
          }
          for (const part of await offer.locator('.offer-head strong, p, .errand-card kbd, .errand-card strong, .errand-card small').all()) {
            await expect(part).toBeVisible();
          }
          await expectChoiceText(page, selector);
          for (const card of await cards.all()) await expectChoiceClickable(card);
          await cards.first().focus();
          await page.keyboard.press('Tab');
          await expect(cards.nth(1)).toBeFocused();
          await expect(cards.nth(1)).toHaveCSS('outline-style', 'solid');
          const readable = await offer.locator('small').evaluateAll(es => es.every(e => parseFloat(getComputedStyle(e).fontSize) >= 12));
          expect(readable).toBe(true);
          if (info.project.name === 'mobile-chromium') {
            await swipeChoices(page);
            await expect(page.locator('body')).toHaveAttribute('data-phase', phase);
          }
          const canvas = await page.locator('#game').boundingBox();
          expect(canvas.width).toBeGreaterThan(0); expect(canvas.height).toBeGreaterThan(0);
          expect(canvas.width / canvas.height).toBeCloseTo(920 / 790, 2);
          expect(canvas.y).toBeGreaterThanOrEqual(0);
          expect(canvas.y + canvas.height).toBeLessThanOrEqual(height + 1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
          expect(await page.evaluate(() => scrollY)).toBe(0);
          if (fonts === 'fallback' && touch === 'easy' && visibility === 'show') {
            await page.screenshot({ path: info.outputPath(`${phase}-${width}x${height}.png`), scale: 'css' });
          }
          const choice = phase === 'day' ? (index % 2 ? 'keep' : 'fresh') : ['buy', 'run', 'skip'][(index + (visibility === 'hide' ? 1 : 0)) % 3];
          const button = offer.locator(`[data-${phase === 'day' ? 'day' : 'errand'}="${choice}"]`);
          await expectChoiceClickable(button);
          if (info.project.name === 'mobile-chromium') await button.tap();
          else await button.click();
          await expect(offer).toBeHidden();
          if (phase === 'day') expect(await page.evaluate(() => window.__TEACUP__.game.state.round)).toBe(11);
          expect(await page.evaluate(() => window.__TEACUP__.settings().touch)).toBe(touch);
        }
        expect(problems).toEqual([]);
      });
    }
  }
}
