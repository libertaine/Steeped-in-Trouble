import { expect, openGame, test } from './fixtures.js';
import { ambientState, protectedOverlaps, summonAnts } from './ambient.js';

// The ant colony (0.20.0): decorative visitors in the measured gutters beside
// the cup, which never cover the game or its UI, scale with the space, and
// never take input.

test('a small colony wanders the wide gutters without touching the game, HUD or buttons', { tag: '@smoke' }, async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=full&ambientSeed=7');
  await expect.poll(async () => (await ambientState(page)).room).toBe(4);
  await summonAnts(page, 4);
  const state = await ambientState(page);
  expect(state.regions.length).toBeGreaterThan(0);
  expect(state.width).toBeGreaterThan(0);
  const { seen, most, nearest, hits } = await protectedOverlaps(page);
  expect(seen).toBeGreaterThan(10);
  expect(most).toBeLessThanOrEqual(4);
  expect(nearest).toBeGreaterThanOrEqual(14); // AMBIENT.spacing: never stacked
  expect(hits).toEqual([]);
  expect(problems).toEqual([]);
});

test('a large desktop holds up to six, in both gutters, and never more', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // Before the first cup, so an untended game can't end mid-test and send them home.
  await openGame(page, '&view=full&ambientSeed=11');
  await expect.poll(async () => ambientState(page)).toMatchObject({ budget: 6, room: 6 });
  await summonAnts(page, 6);
  const sides = new Set((await ambientState(page)).ants.map((a) => (a.region.x < 400 ? 'left' : 'right')));
  expect(sides.size).toBe(2); // spread across the gutters, not all in one
  const { most, nearest, hits } = await protectedOverlaps(page, { samples: 40 });
  expect(most).toBeLessThanOrEqual(6);
  expect(most).toBeGreaterThanOrEqual(5);
  expect(nearest).toBeGreaterThanOrEqual(14);
  expect(hits).toEqual([]);
  expect(problems).toEqual([]);
});

test('social moments play out in the real layout with a fixed cosmetic seed', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGame(page, '&view=full&ambientSeed=5');
  await summonAnts(page, 6, { settled: true });
  await page.evaluate(() => window.__TEACUP__.ambient.socialize('greet'));
  // A pair forms, partnered with each other, and later both carry on alone.
  await expect.poll(async () => (await ambientState(page)).ants.filter((a) => a.mode === 'greet').length, { timeout: 15_000 }).toBe(2);
  const pair = (await ambientState(page)).ants.filter((a) => a.mode === 'greet');
  expect(pair[0].partner).toBe(pair[1].slot);
  expect(pair[1].partner).toBe(pair[0].slot);
  await expect.poll(async () => (await ambientState(page)).ants.filter((a) => a.mode !== 'solo').length, { timeout: 20_000 }).toBe(0);
  const { hits } = await protectedOverlaps(page, { samples: 10 });
  expect(hits).toEqual([]);
  expect(problems).toEqual([]);
});

test('the ants never take input: the page beneath them answers clicks and keys', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=full&ambientSeed=7');
  await summonAnts(page, 2, { settled: true });
  const under = await page.evaluate(() => {
    const s = window.__TEACUP__.ambient.snapshot();
    const host = document.querySelector('.stage').getBoundingClientRect();
    const layer = document.getElementById('ambientLayer');
    return {
      ids: s.ants.map((a) => document.elementFromPoint(host.left + a.x, host.top + a.y)?.id),
      pointer: getComputedStyle(layer).pointerEvents, focusable: layer.tabIndex >= 0,
    };
  });
  expect(under.ids).not.toContain('ambientLayer');
  expect(under.pointer).toBe('none');
  expect(under.focusable).toBe(false);
  await page.locator('#mainBtn').click();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await page.keyboard.press('KeyP');
  await expect.poll(async () => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('paused');
  // Paused: every ant stands still where it was.
  const where = (s) => s.ants.map((a) => [a.slot, a.x, a.y]);
  const a = await ambientState(page);
  await page.waitForTimeout(400);
  const b = await ambientState(page);
  if (a.count > 0) {
    expect(b.policy).toBe('frozen');
    expect(where(b)).toEqual(where(a));
  }
  await page.keyboard.press('KeyP');
  await expect.poll(async () => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('playing');
  expect(problems).toEqual([]);
});

test('resizing to a narrow layout retires the colony and frees the surface', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=compact&ambientSeed=3');
  await summonAnts(page, 3);
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(async () => (await ambientState(page)).count).toBe(0);
  const narrow = await ambientState(page);
  expect(narrow).toMatchObject({ room: 0, hidden: true, width: 0, height: 0 });
  await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
  await page.waitForTimeout(1500);
  expect((await ambientState(page)).count).toBe(0);
  // Back to wide: the gutters return, and so can the ants.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => (await ambientState(page)).room).toBeGreaterThan(1);
  await summonAnts(page, 2);
  expect(problems).toEqual([]);
});

test('Low graphics keeps at most two ants, live; reduced motion removes them all at once', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGame(page, '&view=full&ambientSeed=5');
  await summonAnts(page, 5);
  expect((await ambientState(page)).quality).toBe('high');
  await page.locator('#graphicsBtn').evaluate((button) => button.click());
  await expect.poll(async () => ambientState(page)).toMatchObject({ quality: 'low', limit: 2 });
  // The extras walk home; nobody new comes while two are out.
  await expect.poll(async () => (await ambientState(page)).count, { timeout: 30_000 }).toBeLessThanOrEqual(2);
  await page.evaluate(() => { window.__TEACUP__.ambient.summon(6); window.__TEACUP__.ambient.socialize(); });
  const { most } = await protectedOverlaps(page, { samples: 20 });
  expect(most).toBeLessThanOrEqual(2);
  expect((await ambientState(page)).ants.every((a) => a.mode === 'solo')).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => ambientState(page)).toMatchObject({ policy: 'off', count: 0, hidden: true });
  await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
  await page.waitForTimeout(1500);
  expect((await ambientState(page)).count).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await summonAnts(page, 1);
  expect(problems).toEqual([]);
});

test('nothing shows behind the title or Tea Break', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=full&ambientSeed=7', { onboarding: true });
  await page.evaluate(() => window.__TEACUP__.ambient.summon(4));
  await page.waitForTimeout(1500);
  expect(await ambientState(page)).toMatchObject({ policy: 'hidden', hidden: true });
  await page.goto('./?debug&noOverlay&view=full&ambientSeed=7');
  await page.waitForFunction(() => window.__TEACUP__?.game);
  await summonAnts(page, 2);
  await page.locator('#menuBtn').click();
  await expect.poll(async () => ambientState(page)).toMatchObject({ policy: 'hidden', hidden: true });
  await page.locator('#closeBreak').click();
  await expect.poll(async () => (await ambientState(page)).policy).toBe('run');
  expect(problems).toEqual([]);
});
