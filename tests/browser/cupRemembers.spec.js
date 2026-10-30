import { expect, openGame, test } from './fixtures.js';
import { FORTUNE_NAMES, milkyRound, revealed } from './cup.js';

test('the reading remembers the round, then names the actual next fortune and its effect', async ({ page, problems }, info) => {
  await openGame(page, '&seed=42&view=full');
  await page.keyboard.press('Enter');
  await milkyRound(page);
  // The memory comes first: before the fortune is revealed it is already in the panel.
  await expect(page.locator('#readingMemory')).toContainText('You poured milk twice. Your defensive tactics favored The Veil.');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.readingTime)).toBeLessThan(2.1);
  await page.screenshot({ path: info.outputPath('memory-before-reveal.png') });
  const fortune = await revealed(page);
  if (fortune !== 'lie') await expect(page.locator('#fortuneName')).toHaveText(FORTUNE_NAMES[fortune]);
  await expect(page.locator('#upgradeOffer')).toBeVisible();
  await page.screenshot({ path: info.outputPath('memory-revealed.png') });
  // Brewing on, the memory is put away.
  await page.locator('[data-choice="0"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#readingMemory')).toHaveText('');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.fortune)).toBe(fortune);
  expect(problems).toEqual([]);
});

test('a continued pot shows the same memory and the same fortune, without a reroll', async ({ page, problems }) => {
  await openGame(page, '&seed=9&view=full');
  await page.keyboard.press('Enter');
  await milkyRound(page);
  const fortune = await revealed(page);
  const memory = await page.locator('#readingMemory').textContent();
  expect(memory).toContain('Your defensive tactics favored The Veil.');
  await page.reload();
  await expect(page.locator('#mainBtn')).toHaveText('CONTINUE YOUR POT');
  await page.locator('#mainBtn').click();
  await expect(page.locator('#readingMemory')).toHaveText(memory);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.nextFortune)).toBe(fortune);
  await revealed(page);
  if (fortune !== 'lie') await expect(page.locator('#fortuneName')).toHaveText(FORTUNE_NAMES[fortune]);
  expect(problems).toEqual([]);
});
