import { expect, openGame, test } from './fixtures.js';
import { advanceAmbientUntil, ambientState, protectedOverlaps } from './ambient.js';
import { freezeTextClock, stageTextReading } from './textMischief.js';

async function openReading(page, { width = 1920, height = 1080, offer = true } = {}) {
  await freezeTextClock(page);
  await page.setViewportSize({ width, height });
  await openGame(page, '&seed=42&ambientSeed=7&mode=arcade');
  await stageTextReading(page, { offer });
  await page.evaluate(() => Object.assign(window.__TEACUP__.game.state, { teaCash: 100, milkLeft: 0, sugarLeft: 0 }));
  await page.clock.runFor(500);
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1200, height: 480 }]) {
  test(`reading decisions stay clear of ants at ${viewport.width} × ${viewport.height}`, async ({ page, problems }) => {
    await openReading(page, viewport);
    await expect(page.locator('#upgradeOffer')).toBeVisible();
    await expect(page.locator('#restockOffer')).toBeVisible();
    const initial = await ambientState(page);
    expect(initial).toMatchObject({ policy: 'run', scheduling: { activity: 'between-cups' } });
    const before = await page.evaluate(() => ({ rng: window.__TEACUP__.game.exportRandom(),
      cash: window.__TEACUP__.game.state.teaCash, milk: window.__TEACUP__.game.state.milkLeft,
      sugar: window.__TEACUP__.game.state.sugarLeft, score: window.__TEACUP__.game.state.score }));
    if (initial.room > 0) {
      await advanceAmbientUntil(page, (s) => s.count > 0, { maxMs: 4000 });
      await page.evaluate(() => window.__TEACUP__.ambient.summon(3));
    }
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      const sample = await protectedOverlaps(page, { samples: 1, interval: 0 });
      expect(sample.hits).toEqual([]);
      expect(sample.most).toBeLessThanOrEqual(initial.limit);
      seen += sample.seen;
      await page.clock.runFor(200);
    }
    if (initial.room > 0) expect(seen).toBeGreaterThan(0);
    else expect(await ambientState(page)).toMatchObject({ count: 0, hidden: true });
    const after = await page.evaluate(() => ({ rng: window.__TEACUP__.game.exportRandom(),
      cash: window.__TEACUP__.game.state.teaCash, milk: window.__TEACUP__.game.state.milkLeft,
      sugar: window.__TEACUP__.game.state.sugarLeft, score: window.__TEACUP__.game.state.score }));
    expect(after).toEqual(before);

    // A real purchase can change button copy and wrap the dock. It still
    // answers pointer input immediately, including with upgrade cards open.
    await page.locator('[data-supply="milk"]').click();
    await page.clock.runFor(500);
    await expect(page.locator('#restockCash')).toHaveText('Cash: 90');
    expect((await protectedOverlaps(page, { samples: 1, interval: 0 })).hits).toEqual([]);
    await page.locator('.upgrade-card').first().focus();
    await page.keyboard.press('1');
    await page.clock.runFor(500);
    await expect(page.locator('#upgradeOffer')).toBeHidden();
    // Choosing an upgrade already brews the next cup.
    expect(await ambientState(page)).toMatchObject({ policy: 'run', scheduling: { activity: 'ordinary' } });
    expect((await protectedOverlaps(page, { samples: 1, interval: 0 })).hits).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('a reading remeasures an expanding panel and keeps decisions usable with fallback fonts', async ({ page, problems }) => {
  await page.route('**/fonts/**', (route) => route.abort());
  await openReading(page);
  await page.evaluate(() => window.__TEACUP__.ambient.summon(3));
  await page.locator('#readingPresentation').evaluate((panel) => { panel.style.height = '70%'; });
  await page.clock.runFor(4000);
  const previous = await ambientState(page);
  await page.locator('#readingPresentation').evaluate((panel) => {
    panel.style.height = '95%';
    panel.style.fontFamily = 'monospace';
  });
  await page.clock.runFor(500);
  const changed = await ambientState(page);
  expect(changed.exclusions).not.toEqual(previous.exclusions);
  expect((await protectedOverlaps(page, { samples: 1, interval: 0 })).hits).toEqual([]);
  await page.setViewportSize({ width: 420, height: 900 });
  await page.clock.runFor(500);
  expect(await ambientState(page)).toMatchObject({ count: 0, room: 0, hidden: true });
  await expect(page.locator('.upgrade-card').first()).toBeEnabled();
  await page.locator('[data-supply="sugar"]').click();
  await page.clock.runFor(100);
  await expect(page.locator('#restockCash')).toHaveText('Cash: 75');
  expect(problems.filter((p) => !p.includes('/fonts/'))).toEqual([]);
});

test('reading activity stays hidden under a modal and simple in Low graphics', async ({ page, problems }) => {
  await openReading(page, { offer: false });
  await page.evaluate(() => window.__TEACUP__.ambient.summon(2));
  await advanceAmbientUntil(page, (s) => s.count === 2);
  await page.locator('#menuBtn').click();
  await page.clock.runFor(100);
  const hidden = await ambientState(page);
  expect(hidden).toMatchObject({ policy: 'hidden', hidden: true });
  await page.clock.runFor(10_000);
  expect((await ambientState(page)).ants).toEqual(hidden.ants);
  expect((await ambientState(page)).scheduling).toEqual(hidden.scheduling);
  await page.locator('#graphicsBtn').evaluate((button) => button.click());
  await page.locator('#closeBreak').click();
  await page.clock.runFor(500);
  await page.evaluate(() => { window.__TEACUP__.ambient.summon(6); window.__TEACUP__.ambient.socialize(); });
  await page.clock.runFor(8000);
  expect(await ambientState(page)).toMatchObject({ limit: 2, quality: 'low' });
  expect((await ambientState(page)).count).toBeLessThanOrEqual(2);
  expect((await ambientState(page)).ants.every((a) => ['solo', 'forage'].includes(a.mode))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(500);
  expect(await ambientState(page)).toMatchObject({ count: 0, policy: 'off', hidden: true });
  expect(problems).toEqual([]);
});
