import { expect, gameState, openGame, test } from './fixtures.js';
import { expectRunnerHud, runErrand, toShortage } from './errand.js';

/** Sugar bursts a cup starts with before any restock: the usual, plus whatever its fortune adds. */
const usualSugar = (page) => page.evaluate(() => {
  const s = window.__TEACUP__.game.state;
  return window.__TEACUP__.config.sugar.perRound + s.modifiers.bonusSugar + s.spoon.sugarScoop;
});

const canvasPainted = (page) => page.locator('#game').evaluate((c) => {
  const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < pixels.length; i += 400) if (pixels[i] > 0) lit++;
  return lit;
});

test('the tea tin runs out after round 9, and buying tea restocks the next cup', async ({ page, problems }) => {
  await openGame(page, '&seed=21');
  await toShortage(page, { teaCash: 45 });
  await expect(page.locator('#hudStatus')).toHaveText('THE TEA SHORTAGE');
  await expect(page.locator('#teaCash')).toHaveText('45');
  await expect(page.locator('[data-errand="buy"]')).toBeEnabled();
  await page.keyboard.press('Digit1');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect(page.locator('#errandOffer')).toBeHidden();
  await expect(page.locator('#teaCash')).toHaveText('25');
  await expect(page.locator('#roundNum')).toHaveText('10');
  await expect(page.locator('#sugarCount')).toHaveText(String((await usualSugar(page)) + 1));
  expect(problems).toEqual([]);
});

test('without enough Tea Cash, buying is unavailable but the game carries on', async ({ page, problems }) => {
  await openGame(page, '&seed=22');
  await toShortage(page, { teaCash: 15 });
  await expect(page.locator('[data-errand="buy"]')).toBeDisabled();
  await expect(page.locator('[data-errand="buy"] small')).toContainText('Needs 20');
  await page.keyboard.press('Digit1');
  expect((await gameState(page)).phase).toBe('shortage');
  await page.locator('[data-errand="skip"]').click();
  await expect(page.locator('#roundNum')).toHaveText('10');
  await expect(page.locator('#sugarCount')).toHaveText(String(await usualSugar(page)));
  expect(problems).toEqual([]);
});

test('the Tea Run plays with the keyboard, pauses, and comes back to the tea', async ({ page, problems }) => {
  await openGame(page, '&seed=23');
  await toShortage(page);
  const before = await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return { lives: s.lives, nextFortune: s.nextFortune, round: s.round };
  });
  await page.keyboard.press('Digit2');
  await expect(page.locator('#hudStatus')).toHaveText('ON YOUR MARKS');
  await expectRunnerHud(page);
  expect(await canvasPainted(page)).toBeGreaterThan(1000);

  // Pause and resume mid-run.
  await page.keyboard.press('Space'); // straight off the starting line
  await expect(page.locator('#hudStatus')).toContainText('THE TEA RUN');
  await page.keyboard.press('KeyP');
  await expectRunnerHud(page);
  await expect(page.locator('#mainBtn')).toHaveText('Resume errand →');
  const paused = await page.evaluate(() => window.__TEACUP__.game.state.run.clock);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.run.clock)).toBe(paused);
  await page.keyboard.press('KeyP');

  await runErrand(page, 'keys');
  const run = await page.evaluate(() => window.__TEACUP__.game.state.run);
  expect(run.result).toBe('success');
  expect(run.hits).toBeLessThan(3);
  await expect(page.locator('#hudStatus')).toHaveText('MISSION ACCOMPLISHED');
  await expectRunnerHud(page);
  await page.waitForTimeout(1700);
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  const after = await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return { lives: s.lives, fortune: s.fortune, round: s.round, sugarLeft: s.sugarLeft, run: s.run };
  });
  expect(after).toMatchObject({ lives: before.lives, fortune: before.nextFortune, round: before.round + 1, run: null });
  expect(after.sugarLeft).toBe((await usualSugar(page)) + 1);
  await expect(page.locator('#hudScore')).toContainText('SCORE');
  await expect(page.locator('#hudLives')).toContainText('CUPS');
  // Jump and slide keys are milk and sugar again.
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#milkCount')).toHaveText('1');
  expect(problems).toEqual([]);
});

test('three stumbles end the errand without costing a cup', async ({ page, problems }) => {
  await openGame(page, '&seed=24');
  await toShortage(page);
  const lives = (await gameState(page)).lives;
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Enter'); // skip the announcement, then just stand there
  await page.waitForFunction(() => window.__TEACUP__.game.state.run?.stage === 'outro', null, { timeout: 40_000 });
  await expect(page.locator('#hudStatus')).toHaveText('PEAR-SHAPED');
  await expectRunnerHud(page);
  await page.waitForTimeout(1700);
  await page.keyboard.down('Space'); // JUMP goes home; it must not fire into the new cup
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await page.waitForTimeout(250); // include the first simulation frames after the handoff
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBe(0);
  await page.keyboard.up('Space');
  expect((await gameState(page)).lives).toBe(lives);
  await expect(page.locator('#sugarCount')).toHaveText(String(await usualSugar(page)));
  expect(problems).toEqual([]);
});

test('Auto Steam can be switched on with a keyboard, and says so', async ({ page, problems }) => {
  await openGame(page);
  await expect(page.locator('#autoSteamBtn')).toHaveText('Auto Steam: off');
  await page.locator('#autoSteamBtn').click();
  await expect(page.locator('#autoSteamBtn')).toHaveText('Auto Steam: on');
  await page.locator('#mainBtn').click();
  await expect(page.locator('#hudAuto')).toHaveText('AUTO STEAM');
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.spawnTimer = Infinity;
    s.enemies.push({ angle: s.angle, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0 });
  });
  await expect.poll(async () => (await gameState(page)).kills).toBe(1);
  // The choice is remembered.
  await page.reload();
  await page.waitForFunction(() => window.__TEACUP__?.game);
  await expect(page.locator('#autoSteamBtn')).toHaveText('Auto Steam: on');
  expect(problems).toEqual([]);
});
