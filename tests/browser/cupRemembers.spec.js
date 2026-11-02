import { expect, openGame, test } from './fixtures.js';
import { FORTUNE_NAMES, capture, milkyRound, revealed } from './cup.js';

test('the reading remembers the round, then names the actual next fortune and its effect', async ({ page, problems }, info) => {
  await openGame(page, '&seed=42&view=full');
  await page.keyboard.press('Enter');
  await milkyRound(page);
  // The cup has the stage until its reveal; the explanation follows it.
  await expect(page.locator('#readingPresentation')).toBeHidden();
  await capture(page, info, 'desktop-ceremony');
  const fortune = await revealed(page);
  if (fortune !== 'lie') await expect(page.locator('#fortuneName')).toHaveText(FORTUNE_NAMES[fortune]);
  await expect(page.locator('#upgradeOffer')).toBeVisible();
  await expect(page.locator('#compactMemory')).toContainText('You poured milk twice. Your defensive tactics favored The Veil.');
  await capture(page, info, 'desktop-memory-revealed');
  // Brewing on, the memory is put away.
  await page.locator('[data-choice="0"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#readingMemory')).toHaveText('');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.fortune)).toBe(fortune);
  expect(problems).toEqual([]);
});

test('a continued pot shows the same memory and the same fortune, without a reroll', { tag: '@smoke' }, async ({ page, problems }) => {
  await openGame(page, '&seed=9&view=full');
  await page.keyboard.press('Enter');
  await milkyRound(page);
  const fortune = await revealed(page);
  await expect(page.locator('#readingPresentation')).toBeVisible();
  const memory = await page.locator('#readingMemory').textContent();
  expect(memory).toContain('Your defensive tactics favored The Veil.');
  await page.reload();
  await expect(page.locator('#mainBtn')).toHaveText('CONTINUE YOUR POT');
  await page.locator('#mainBtn').click();
  await expect(page.locator('#readingPresentation')).toBeVisible();
  await expect(page.locator('#readingMemory')).toHaveText(memory);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.nextFortune)).toBe(fortune);
  await revealed(page);
  if (fortune !== 'lie') await expect(page.locator('#fortuneName')).toHaveText(FORTUNE_NAMES[fortune]);
  expect(problems).toEqual([]);
});
