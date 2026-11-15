import { expect, openGame, test } from './fixtures.js';

async function boundary(page, mode, round = 10) {
  await openGame(page, `&mode=${mode}&seed=42`);
  await page.locator('#mainBtn').click();
  await page.evaluate(([mode, round]) => {
    const g = window.__TEACUP__.game, s = g.state;
    Object.assign(s, { round, heat: Math.min(mode === 'chill' ? 14 : 28, round - 1),
      spawnTimer: 1e6, current: null, grindAfter: null, lastGrind: round,
      havocAfter: null, lastHavoc: round, shortageAfter: round + 20 });
    s.modifiers.laneDrift = false;
    s.teaServed[s.tea] = round;
    s.kills = s.target - 1;
    s.enemies = [{ angle: s.angle, radius: 180, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 }];
    s.shots = [{ angle: s.angle, radius: 180, speed: 0, sugar: false, veer: 0, golden: false }];
    g.update(1 / 120);
  }, [mode, round]);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
  await page.waitForFunction(() => localStorage.getItem('steeped-in-trouble:pot-save'));
  await readyReading(page);
}

async function readyReading(page) {
  await page.evaluate(() => {
    const g = window.__TEACUP__.game;
    Object.assign(g.state, { offer: null, nextFortune: 'karma', readingTime: 10 });
  });
  await expect(page.locator('#mainBtn')).toBeEnabled();
}

export function progressionCloseoutTests() {
  for (const round of [10, 20, 40]) {
    test(`Arcade automatically keeps Heat after cup ${round}; keyboard and hidden controls cannot reset it`, async ({ page, isMobile, problems }, info) => {
      await boundary(page, 'arcade', round);
      const cash = await page.evaluate(() => window.__TEACUP__.game.state.teaCash);
      const button = page.locator('#mainBtn');
      if (isMobile) await button.tap(); else await button.click();
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
      const heat = Math.min(28, round);
      await expect(page.locator('#hudDay')).toHaveText(`DAY ${round / 10 + 1} · CUP 1/10 · HEAT ${heat}${heat === 28 ? ' MAX' : ''}`);
      await expect(page.locator('#dayOffer')).toBeHidden();
      expect(await page.evaluate(() => window.__TEACUP__.effects.fx.banner?.title)).toBe('ARCADE — KEEP THE KETTLE ON');
      await page.keyboard.press('1'); await page.keyboard.press('2');
      await page.locator('[data-day="fresh"]').dispatchEvent('click');
      expect(await page.evaluate(() => {
        const g = window.__TEACUP__.game;
        return { fresh: g.chooseDay('fresh'), keep: g.chooseDay('keep'), round: g.state.round,
          heat: g.state.heat, cash: g.state.teaCash, fortune: g.state.fortune };
      })).toEqual({ fresh: false, keep: false, round: round + 1, heat, cash, fortune: 'karma' });
      await page.screenshot({ path: info.outputPath('arcade-day.png') });
      expect(problems).toEqual([]);
    });
  }

  for (const choice of ['fresh', 'keep']) {
    test(`Chill retains the ${choice} Day choice by keyboard or touch`, async ({ page, isMobile, problems }) => {
      await boundary(page, 'chill');
      await page.locator('#mainBtn').click();
      await expect(page.locator('#dayOffer')).toBeVisible();
      if (isMobile) await page.locator(`[data-day="${choice}"]`).tap();
      else await page.keyboard.press(choice === 'fresh' ? '1' : '2');
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
      expect(await page.evaluate(() => {
        const { round, heat, fortune } = window.__TEACUP__.game.state;
        return { round, heat, fortune };
      })).toEqual({ round: 11, heat: choice === 'fresh' ? 0 : 10, fortune: 'karma' });
      expect(problems).toEqual([]);
    });
  }

  test('restoring an Arcade boundary checkpoint advances once and does not count another completed cup', async ({ page, problems }) => {
    await boundary(page, 'arcade');
    const cups = () => page.evaluate(() => JSON.parse(localStorage.getItem('steeped-in-trouble:mode-records')).modes.arcade.cups);
    expect(await cups()).toBe(1);
    await page.reload();
    await page.locator('#mainBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
    await readyReading(page);
    await page.locator('#mainBtn').click();
    await expect(page.locator('#hudDay')).toHaveText('DAY 2 · CUP 1/10 · HEAT 10');
    expect(await cups()).toBe(1);
    await page.locator('[data-day="fresh"]').dispatchEvent('click');
    expect(await page.evaluate(() => window.__TEACUP__.game.state.round)).toBe(11);
    expect(await cups()).toBe(1);
    expect(problems).toEqual([]);
  });
}
