import { expect, openGame, test } from './fixtures.js';
import { ambientState, protectedOverlaps, summonAnt } from './ambient.js';

// On a phone in portrait the cup fills the width. Before the first cup the
// brew button takes the rest, leaving only slivers: no ant. In play the taller
// stage can leave a band above and below the cup; any visit stays inside it.
test('a portrait phone follows its measured space, before and during play', { tag: '@smoke' }, async ({ page, problems }) => {
  await openGame(page, '&ambientSeed=7');
  await page.evaluate(() => window.__TEACUP__.ambient.summon());
  await page.waitForTimeout(2000);
  expect(await ambientState(page)).toMatchObject({ state: 'absent', room: 0, hidden: true, width: 0, height: 0 });
  await page.locator('#mainBtn').tap();
  await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
  await page.waitForTimeout(500);
  const playing = await ambientState(page);
  for (const r of playing.regions) {
    // Never beside the cup: only full-width bands with real side borders to walk in from.
    expect(r.w).toBeCloseTo(playing.visible.w, 0);
    expect(r.portals.every((p) => p === 'left' || p === 'right')).toBe(true);
  }
  if (playing.room > 0) {
    await summonAnt(page);
    const { seen, hits } = await protectedOverlaps(page, { samples: 20 });
    expect(seen).toBeGreaterThan(0);
    expect(hits).toEqual([]);
  }
  expect(problems).toEqual([]);
});

test('a short landscape phone keeps the ant clear of the controls', async ({ page, problems }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openGame(page, '&ambientSeed=7');
  await expect.poll(async () => (await ambientState(page)).visible).not.toBeNull(); // measured
  const state = await ambientState(page);
  if (state.room === 0) {
    // Too little measured space for a corridor: nothing to see, which is correct.
    expect(state).toMatchObject({ state: 'absent', hidden: true });
  } else {
    await summonAnt(page);
    const { hits } = await protectedOverlaps(page, { samples: 20 });
    expect(hits).toEqual([]);
  }
  expect(problems).toEqual([]);
});
