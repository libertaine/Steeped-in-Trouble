import { test, expect, openGame, autoplayUntilReading } from '../browser/fixtures.js';
import { checkpointRound } from '../browser/collection.js';

const keys = ['steeped-in-trouble:pot-save', 'steeped-in-trouble:mode-records', 'steeped-in-trouble:arcade-records'];
const stored = (page) => page.evaluate((keys) => keys.map((k) => localStorage.getItem(k)), keys);

for (const scenario of [
  'day=near', 'day=end', 'day=fresh', 'day=keep', 'day=max',
  'cup=healthy', 'cup=cracked', 'cup=critical', 'cup=leaf', 'cup=repair', 'cup=seams', 'cup=shatter', 'cup=migrated',
  'boss=manager', 'progress=manager', 'fortune=karma',
  'arcade=dailyPour', 'arcade=biscuitBreakout', 'arcade=crossingStreet',
]) {
  test(`DEV ${scenario} cannot change legitimate records or the saved pot`, async ({ page, problems }) => {
    await openGame(page, '&mode=arcade&seed=42');
    await checkpointRound(page);
    const before = await stored(page);
    expect(before[0]).not.toBeNull();
    await openGame(page, `&mode=arcade&seed=42&${scenario}`);
    expect(await page.evaluate(() => typeof window.__TEACUP__.practiceDay)).toBe('function');
    expect(await stored(page)).toEqual(before);
    // Drive real completion, purchase checkpoint and fatal-spill event paths.
    await page.evaluate(() => {
      const g = window.__TEACUP__.game, s = g.state;
      if (s.phase === 'ready') g.primaryAction();
      Object.assign(s, { phase: 'playing', current: null, spawnTimer: 1e6, milkLeft: 0,
        teaCash: 100, kills: s.target - 1, graceTime: 0 });
      s.modifiers.laneDrift = false;
      s.enemies = [{ angle: s.angle, radius: 180, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 }];
      s.shots = [{ angle: s.angle, radius: 180, speed: 0, sugar: false, veer: 0, golden: false }];
      g.update(1 / 120);
      s.readingTime = 10;
      g.buySupply('milk');
    });
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
    expect(await stored(page)).toEqual(before);
    await page.evaluate(() => {
      const g = window.__TEACUP__.game, s = g.state;
      Object.assign(s, { phase: 'playing', lives: 1, strainerLeft: 0, graceTime: 0, shots: [], spawnTimer: 1e6 });
      // Karma deliberately prevents a fatal spill; this fixture tests the death path.
      s.modifiers.karma = false;
      s.enemies = [{ angle: s.angle, radius: 274, speed: 1, wiggle: 0, shifted: true, size: 10, alpha: 1 }];
      g.update(1 / 120);
    });
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'gameover');
    expect(await stored(page)).toEqual(before);
    expect(problems).toEqual([]);
  });
}

test('ordinary ?debug keyboard play still records a real cup and restores its saved reading', async ({ page, problems }) => {
  await openGame(page, '&mode=chill&seed=42&autosteam=off');
  await page.keyboard.press('Enter');
  await autoplayUntilReading(page);
  await expect.poll(async () => (await stored(page))[1]).not.toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('steeped-in-trouble:mode-records')).modes.chill))
    .toMatchObject({ cups: 1, bestRound: 1, plays: 0 });
  const saved = (await stored(page))[0];
  await page.reload();
  await page.locator('#mainBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
  expect((await stored(page))[0]).toBe(saved);
  expect(problems).toEqual([]);
});

test('DEV practice and personal-best shortcuts cannot create collection records', async ({ page, problems }) => {
  await openGame(page, '&seed=42');
  expect(await page.evaluate(() => {
    window.__TEACUP__.launchPractice('dailyPour');
    return window.__TEACUP__.personalBest();
  })).toBe(true);
  expect(await stored(page)).toEqual([null, null, null]);
  expect(problems).toEqual([]);
});

test('DEV fortune, adventure and aerial console shortcuts preserve existing storage', async ({ page, problems }) => {
  await openGame(page, '&seed=42');
  await checkpointRound(page);
  const before = await stored(page);
  await page.evaluate(() => {
    const d = window.__TEACUP__;
    d.brewWithFortune('karma');
    d.launchDailyPour(); d.launchBiscuitBreakout(); d.launchCrossingStreet();
    d.launchPractice('teaRun');
    d.game.primaryAction();
    d.previewAerial('bird');
    d.game.update(60);
  });
  expect(await stored(page)).toEqual(before);
  expect(problems).toEqual([]);
});
