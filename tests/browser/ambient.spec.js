import { expect, openGame, test } from './fixtures.js';
import { ambientState, protectedOverlaps, summonAnt } from './ambient.js';

// The first wandering ant (0.20.0, increment 1): a decorative visitor in the
// measured gutters beside the cup, which never covers the game or its UI.

test('an ant wanders the wide gutters without touching the game, HUD or buttons', { tag: '@smoke' }, async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=full&ambientSeed=7');
  await summonAnt(page);
  const state = await ambientState(page);
  expect(state.room).toBe(1);
  expect(state.regions.length).toBeGreaterThan(0);
  expect(state.width).toBeGreaterThan(0);
  const { seen, hits } = await protectedOverlaps(page);
  expect(seen).toBeGreaterThan(10);
  expect(hits).toEqual([]);
  expect(problems).toEqual([]);
});

test('the ant never takes input: the page beneath it answers clicks and keys', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=full&ambientSeed=7');
  await summonAnt(page, /wandering|paused/);
  const under = await page.evaluate(() => {
    const s = window.__TEACUP__.ambient.snapshot();
    const host = document.querySelector('.stage').getBoundingClientRect();
    const element = document.elementFromPoint(host.left + s.x, host.top + s.y);
    const layer = document.getElementById('ambientLayer');
    return { id: element?.id, pointer: getComputedStyle(layer).pointerEvents, focusable: layer.tabIndex >= 0 };
  });
  expect(under.id).not.toBe('ambientLayer');
  expect(under.pointer).toBe('none');
  expect(under.focusable).toBe(false);
  await page.locator('#mainBtn').click();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await page.keyboard.press('KeyP');
  await expect.poll(async () => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('paused');
  // Paused: the ant stands still where it was.
  const a = await ambientState(page);
  await page.waitForTimeout(400);
  const b = await ambientState(page);
  if (a.state !== 'absent') {
    expect(b.policy).toBe('frozen');
    expect([b.x, b.y]).toEqual([a.x, a.y]);
  }
  await page.keyboard.press('KeyP');
  await expect.poll(async () => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('playing');
  expect(problems).toEqual([]);
});

test('resizing to a narrow layout retires the ant and frees the surface', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=compact&ambientSeed=3');
  await summonAnt(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(async () => (await ambientState(page)).state).toBe('absent');
  const narrow = await ambientState(page);
  expect(narrow).toMatchObject({ room: 0, hidden: true, width: 0, height: 0 });
  await page.evaluate(() => window.__TEACUP__.ambient.summon());
  await page.waitForTimeout(1500);
  expect((await ambientState(page)).state).toBe('absent');
  // Back to wide: the gutters return, and so can the ant.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => (await ambientState(page)).room).toBe(1);
  await summonAnt(page);
  expect(problems).toEqual([]);
});

test('reduced motion removes the ant at once, live; graphics quality applies live', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openGame(page, '&view=full&ambientSeed=5');
  await summonAnt(page);
  expect((await ambientState(page)).quality).toBe('high');
  await page.locator('#graphicsBtn').evaluate((button) => button.click());
  await expect.poll(async () => (await ambientState(page)).quality).toBe('low');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => ambientState(page)).toMatchObject({ policy: 'off', state: 'absent', hidden: true });
  await page.evaluate(() => window.__TEACUP__.ambient.summon());
  await page.waitForTimeout(1500);
  expect((await ambientState(page)).state).toBe('absent');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await summonAnt(page);
  expect(problems).toEqual([]);
});

test('nothing shows behind the title or Tea Break', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page, '&view=full&ambientSeed=7', { onboarding: true });
  await page.evaluate(() => window.__TEACUP__.ambient.summon());
  await page.waitForTimeout(1500);
  expect(await ambientState(page)).toMatchObject({ policy: 'hidden', hidden: true });
  await page.goto('./?debug&noOverlay&view=full&ambientSeed=7');
  await page.waitForFunction(() => window.__TEACUP__?.game);
  await summonAnt(page);
  await page.locator('#menuBtn').click();
  await expect.poll(async () => ambientState(page)).toMatchObject({ policy: 'hidden', hidden: true });
  await page.locator('#closeBreak').click();
  await expect.poll(async () => (await ambientState(page)).policy).toBe('run');
  expect(problems).toEqual([]);
});
