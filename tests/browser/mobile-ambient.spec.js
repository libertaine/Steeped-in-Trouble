import { expect, openGame, test } from './fixtures.js';
import { ambientState, protectedOverlaps, summonAnts } from './ambient.js';

// On a phone in portrait the cup fills the width, so there are no ants at all,
// even in play when the taller stage leaves a band above and below the cup.
test('a portrait phone has no ants, before or during play, and holds no surface', { tag: '@smoke' }, async ({ page, problems }) => {
  await openGame(page, '&ambientSeed=7');
  await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
  await page.waitForTimeout(2000);
  expect(await ambientState(page)).toMatchObject({ count: 0, room: 0, budget: 0, hidden: true, width: 0, height: 0 });
  await page.locator('#mainBtn').tap();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
  await page.waitForTimeout(2000);
  const playing = await ambientState(page);
  expect(playing).toMatchObject({ count: 0, room: 0, budget: 0, hidden: true, width: 0, height: 0 });
  expect(problems).toEqual([]);
});

test('a short landscape phone keeps at most two ants, clear of the controls', async ({ page, problems }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openGame(page, '&ambientSeed=7');
  await page.locator('#mainBtn').tap();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect.poll(async () => (await ambientState(page)).visible).not.toBeNull(); // measured
  const state = await ambientState(page);
  expect(state.room).toBeLessThanOrEqual(2);
  if (state.room === 0) {
    // Too little measured space for a corridor: nothing to see, which is correct.
    expect(state).toMatchObject({ count: 0, hidden: true });
  } else {
    await summonAnts(page, state.room);
    await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
    const { most, hits } = await protectedOverlaps(page, { samples: 20 });
    expect(most).toBeLessThanOrEqual(2);
    expect(hits).toEqual([]);
  }
  expect(problems).toEqual([]);
});

test('turning the phone re-evaluates the colony: none in portrait, back in landscape', async ({ page, problems }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openGame(page, '&ambientSeed=9');
  await page.locator('#mainBtn').tap();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await expect.poll(async () => (await ambientState(page)).room).toBeGreaterThan(0);
  await summonAnts(page, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => ambientState(page)).toMatchObject({ count: 0, room: 0, hidden: true, width: 0 });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await ambientState(page)).room).toBeGreaterThan(0);
  await summonAnts(page, 1);
  expect(problems).toEqual([]);
});
