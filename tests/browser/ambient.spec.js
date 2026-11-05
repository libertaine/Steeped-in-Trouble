import { expect, openGame, test } from './fixtures.js';
import { ambientState, crumbIn, cubeIn, protectedOverlaps, summonAnts } from './ambient.js';

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

test('a short desktop window follows its own geometry rather than the phone rule', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1200, height: 480 });
  await openGame(page, '&view=full&ambientSeed=13');
  await expect.poll(async () => (await ambientState(page)).visible).not.toBeNull();
  const state = await ambientState(page);
  // A desktop screen and a mouse: not a phone held sideways, however short the window.
  expect(state.shape).toBeNull();
  expect(state.budget).toBeGreaterThan(2);
  expect(state.room).toBe(Math.min(state.space, state.budget));
  await summonAnts(page, state.room);
  const { most, nearest, hits } = await protectedOverlaps(page, { samples: 20 });
  expect(most).toBeLessThanOrEqual(state.room);
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

test('a crumb is found, looked over and carried out of sight, clear of the game and its controls', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGame(page, '&view=full&ambientSeed=5');
  await summonAnts(page, 6, { settled: true });
  await crumbIn(page, ['lying']);
  // Noticed, approached and picked up by one ant; carried while sampled.
  await crumbIn(page, ['carried']);
  const carried = await ambientState(page);
  const carrier = carried.ants.find((a) => a.slot === carried.crumb.claim);
  expect(carrier.cargo).toBe(true);
  expect(carried.ants.filter((a) => a.cargo)).toHaveLength(1);
  const { hits, crumbs } = await protectedOverlaps(page, { samples: 15 });
  expect(hits).toEqual([]);
  // Home: the crumb is gone with it.
  await expect.poll(async () => {
    const s = await ambientState(page);
    return !s.crumb && !s.ants.some((a) => a.cargo);
  }, { timeout: 30_000 }).toBe(true);
  expect(crumbs.carried + crumbs.lying).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('a layout change takes a crumb away at once, with any ant after it or carrying it', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGame(page, '&view=full&ambientSeed=5');
  await summonAnts(page, 6, { settled: true });
  await crumbIn(page, ['lying', 'carried']);
  // A narrow upright window: no gutters, and no ants at all in portrait.
  await page.setViewportSize({ width: 420, height: 900 });
  await expect.poll(async () => ambientState(page)).toMatchObject({ crumb: null, count: 0, budget: 0, hidden: true });
  await page.evaluate(() => { window.__TEACUP__.ambient.summon(6); window.__TEACUP__.ambient.crumble(); });
  await page.waitForTimeout(1500);
  expect(await ambientState(page)).toMatchObject({ crumb: null, count: 0 });
  expect(problems).toEqual([]);
});

test('a sugar cube is gathered round, carried and taken out of sight, clear of the game and its controls', async ({ page, problems }) => {
  test.slow(); // a whole procession, gathering to exit, takes 30–50 s of game time
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGame(page, '&view=full&ambientSeed=5');
  await summonAnts(page, 4, { settled: true });
  await cubeIn(page, ['gather']);
  const gathering = await ambientState(page);
  expect(gathering.cube.size).toBeGreaterThanOrEqual(3);
  expect(gathering.crumb).toBeNull(); // never alongside a crumb
  // Carried by its team, all within one gutter, everyone else at the usual distance.
  await cubeIn(page, ['carry', 'turn']);
  const s = await ambientState(page);
  const team = s.ants.filter((a) => s.cube.members.includes(a.slot));
  expect(team).toHaveLength(s.cube.size);
  expect(team.every((a) => a.mode === 'haul' && a.region.x === s.cube.region.x)).toBe(true);
  const { hits, cubes, nearest } = await protectedOverlaps(page, { samples: 30 });
  expect(hits).toEqual([]);
  expect(cubes).toBeGreaterThan(10);
  expect(nearest).toBeGreaterThanOrEqual(14);
  // Home: cube and team gone together, out of sight.
  await expect.poll(async () => {
    const now = await ambientState(page);
    return !now.cube && !now.ants.some((a) => team.some((b) => b.slot === a.slot) && a.mode === 'haul');
  }, { timeout: 60_000 }).toBe(true);
  expect(problems).toEqual([]);
});

test('a layout change takes a sugar cube away at once, with the carriers it no longer has room for', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openGame(page, '&view=full&ambientSeed=5');
  await summonAnts(page, 4, { settled: true });
  await cubeIn(page, ['carry', 'turn']);
  // A narrow upright window: no gutters at all.
  await page.setViewportSize({ width: 420, height: 900 });
  await expect.poll(async () => ambientState(page)).toMatchObject({ cube: null, count: 0, hidden: true });
  await page.evaluate(() => { window.__TEACUP__.ambient.summon(6); window.__TEACUP__.ambient.sweeten(); });
  await page.waitForTimeout(1500);
  expect(await ambientState(page)).toMatchObject({ cube: null, count: 0 });
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
  await summonAnts(page, 4, { settled: true });
  await page.keyboard.press('KeyP');
  await expect.poll(async () => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('paused');
  // Pausing reflows the stage (the cup shrinks to make room below it), so wait
  // until the layer has measured the paused layout. An ant whose whole
  // footprint still fits a paused gutter stays where it stood (only one near
  // a gutter's new end is retired), and none moves while paused.
  await expect.poll(() => page.evaluate(() => {
    const s = window.__TEACUP__.ambient.snapshot();
    const game = document.getElementById('game').getBoundingClientRect();
    const host = document.querySelector('.stage').getBoundingClientRect();
    return s.exclusions.some((e) => Math.abs(e.w - game.width) < 0.5 && Math.abs(e.h - game.height) < 0.5
      && Math.abs(e.x - (game.left - host.left)) < 0.5 && Math.abs(e.y - (game.top - host.top)) < 0.5);
  })).toBe(true);
  const where = (s) => s.ants.map((a) => [a.slot, a.x, a.y]);
  const a = await ambientState(page);
  await page.waitForTimeout(400);
  const b = await ambientState(page);
  expect(b.policy).toBe('frozen');
  expect(where(b)).toEqual(where(a));
  expect(a.count).toBeGreaterThan(0); // kept through the reflow, not all retired
  const fits = (ant) => a.regions.some((r) => ant.x - 9 >= r.x - 0.01 && ant.x + 9 <= r.x + r.w + 0.01
    && ant.y - 9 >= r.y - 0.01 && ant.y + 9 <= r.y + r.h + 0.01);
  for (const ant of a.ants) if (ant.state === 'wandering' || ant.state === 'paused') expect(fits(ant)).toBe(true);
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
