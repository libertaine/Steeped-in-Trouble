import { expect, gameState, openGame, test } from './fixtures.js';

// Mushroom Tea's Strange Happenings (rendering/strange.js), forced through the
// ?debug hook. They are presentation only: these tests check that play is
// untouched by them, that a rewind holds the simulation and the spoon's
// actions still and then gives them back, and that every graphics and motion
// setting draws them without errors.

/** A quiet Mushroom Tea cup: no new leaves, three slow ones well away from the rim (and the lanes the spoon visits). */
async function quietCup(page, query = '') {
  await openGame(page, `&seed=7&tea=mushroom${query}`);
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    const at = (lane) => -Math.PI / 2 + lane * (Math.PI / 8);
    s.spawnTimer = 1e6;
    s.enemies = [3, 13, 14].map((lane, i) => ({
      kind: i === 1 ? 'puffball' : 'leaf', angle: at(lane), radius: 90 + 25 * i, home: 40, speed: 4, wiggle: lane, shifted: true,
      size: i === 1 ? 13 : 10, alpha: 1, backwash: 0, glide: null,
      ...(i === 1 ? { puff: { stage: 'waiting', at: 1e6, time: 0, warn: 1 } } : {}),
    }));
  });
}

/** A leaf straight up the spoon's lane. */
const leafAhead = (page) => page.evaluate(() => {
  const s = window.__TEACUP__.game.state;
  const step = Math.PI / 8;
  const lane = -Math.PI / 2 + Math.round((s.angle + Math.PI / 2) / step) * step; // the lane the steam takes
  s.enemies.push({ kind: 'leaf', angle: lane, radius: 190, home: 40, speed: 0, wiggle: 0, shifted: true, size: 10, alpha: 1,
    backwash: 0, glide: null });
});

const strange = (page) => page.evaluate(() => {
  const h = window.__TEACUP__.strange;
  return { active: h.active, holding: h.holding, view: JSON.parse(JSON.stringify(h.view)) };
});

const keep = (page) => page.evaluate(() => {
  const s = window.__TEACUP__.game.state;
  return { score: s.score, kills: s.kills, lives: s.lives, milkLeft: s.milkLeft, sugarLeft: s.sugarLeft, phase: s.phase,
    shots: s.shots.length, enemies: s.enemies.map((e) => [e.angle, e.radius]) };
});

const canvasShot = (page) => page.locator('#game').screenshot();

test('Time Rewind winds the cup back and returns it untouched, swallowing presses on the way', { tag: '@smoke' }, async ({ page, problems }, info) => {
  await quietCup(page);
  // Something to see wound back: the spoon turning, and a leaf steamed away.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await leafAhead(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__TEACUP__.game.state.kills === 1);
  await page.waitForFunction(() => window.__TEACUP__.strange.recorded >= 66); // over three seconds recorded
  const scored = (await gameState(page)).score;
  expect(scored).toBeGreaterThan(0);

  await page.evaluate(() => window.__TEACUP__.strange.force('rewind'));
  await page.waitForFunction(() => window.__TEACUP__.strange.holding);
  const held = await keep(page);
  // Steam, milk and sugar wait while time stands still.
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyS');
  await page.waitForFunction(() => window.__TEACUP__.strange.view.rewind.icon === 'pause');
  expect(await keep(page)).toEqual(held);
  // Three seconds back the leaf had not yet fallen, and the score had not yet risen.
  await expect(page.locator('#hudScore')).toHaveText('SCORE 0000');
  await info.attach('rewind-hold.png', { body: await canvasShot(page), contentType: 'image/png' });

  await page.waitForFunction(() => !window.__TEACUP__.strange.holding);
  // Play has resumed (the leaves move on), with nothing gained or lost.
  const after = await keep(page);
  expect(after.enemies.length).toBe(held.enemies.length);
  for (const key of ['score', 'kills', 'lives', 'milkLeft', 'sugarLeft', 'phase', 'shots']) expect(after[key]).toBe(held[key]);
  await expect(page.locator('#hudScore')).toHaveText(`SCORE ${String(scored).padStart(4, '0')}`);
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.effects.fx.whisper?.text)).toBe('That wasn’t in the patch notes.');
  // And the spoon answers at once afterwards.
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBeGreaterThan(0);
  await page.waitForFunction(() => window.__TEACUP__.strange.active === null);
  expect(problems).toEqual([]);
});

test('pausing during a rewind ends it, and play resumes where it was', async ({ page, problems }) => {
  await quietCup(page);
  await page.waitForFunction(() => window.__TEACUP__.strange.recorded >= 66);
  await page.evaluate(() => window.__TEACUP__.strange.force('rewind'));
  await page.waitForFunction(() => window.__TEACUP__.strange.holding);
  const held = await keep(page);
  await page.keyboard.press('KeyP');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('paused');
  expect(await strange(page)).toMatchObject({ active: null, holding: false, view: { kind: null } });
  await page.keyboard.press('KeyP');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('playing');
  // The leaves were exactly where they were left, and now move on.
  await expect.poll(async () => (await keep(page)).enemies[0][1]).toBeGreaterThan(held.enemies[0][1]);
  expect(problems).toEqual([]);
});

test('the breathing cup leaves every leaf, hitbox and the aim exactly where they are', async ({ page, problems }, info) => {
  await quietCup(page);
  await page.evaluate(() => {
    for (const e of window.__TEACUP__.game.state.enemies) e.speed = 0;
  });
  await page.evaluate(() => window.__TEACUP__.strange.force('breathing'));
  await page.waitForFunction(() => {
    const b = window.__TEACUP__.strange.view.breathing;
    return b.intensity > 0.95 && b.breath > 0.85;
  });
  const before = await keep(page);
  await info.attach('breathing-high.png', { body: await canvasShot(page), contentType: 'image/png' });
  await page.waitForTimeout(600);
  expect((await keep(page)).enemies).toEqual(before.enemies);
  // Steam still lands where it is aimed.
  await leafAhead(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__TEACUP__.game.state.kills === 1);
  expect((await strange(page)).active.kind).toBe('breathing');
  // Switching graphics mid-breath is fine too.
  await page.locator('#graphicsBtn').evaluate((button) => button.click());
  await page.waitForTimeout(300);
  await info.attach('breathing-low.png', { body: await canvasShot(page), contentType: 'image/png' });
  expect(problems).toEqual([]);
});

test('with reduced motion and Low graphics, the cup breathes without rings or swelling', async ({ page, problems }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await quietCup(page, '&graphics=low');
  await page.evaluate(() => window.__TEACUP__.strange.force('breathing'));
  await page.waitForFunction(() => window.__TEACUP__.strange.view.breathing.intensity > 0.9);
  await page.waitForTimeout(2500); // past an exhale
  const { view } = await strange(page);
  expect(view.breathing.rings).toEqual([]);
  expect(await page.evaluate(() => window.__TEACUP__.effects.fx.tea.reduced)).toBe(true);
  await info.attach('breathing-reduced-low.png', { body: await canvasShot(page), contentType: 'image/png' });

  // A reduced-motion rewind steps through still frames.
  await page.waitForFunction(() => window.__TEACUP__.strange.active === null, null, { timeout: 15_000 });
  await page.evaluate(() => window.__TEACUP__.strange.force('rewind'));
  await page.waitForFunction(() => window.__TEACUP__.strange.active?.stage === 'stills');
  await info.attach('rewind-reduced-low.png', { body: await canvasShot(page), contentType: 'image/png' });
  await page.waitForFunction(() => !window.__TEACUP__.strange.holding);
  expect(problems).toEqual([]);
});

test('the impostor spoon follows along, puffs pretend steam, and never scores or hits a thing', async ({ page, problems }, info) => {
  await quietCup(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__TEACUP__.strange.force('impostor'));
  await page.waitForFunction(() => window.__TEACUP__.strange.view.impostor.opacity > 0.3);
  await page.keyboard.up('ArrowRight');
  // Steam where there is nothing to hit (the leaves wait across the cup); a second later, the impostor copies it.
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.enemies.forEach((e, i) => { e.angle = s.angle + Math.PI + (i - 1) * (Math.PI / 8); });
  });
  const before = await keep(page);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.strange.view.impostor.puffs.some((p) => p.live)), { timeout: 3000 }).toBe(true);
  await info.attach('impostor.png', { body: await canvasShot(page), contentType: 'image/png' });
  const after = await keep(page);
  expect(after.kills).toBe(before.kills);
  expect(after.score).toBe(before.score);
  expect(after.enemies.length).toBe(before.enemies.length);
  await page.waitForFunction(() => window.__TEACUP__.strange.active === null, null, { timeout: 15_000 });
  expect(problems).toEqual([]);
});

test('?strange= brings one in the first cup, and the cup ending clears it', async ({ page, problems }) => {
  await quietCup(page, '&strange=impostor');
  await page.waitForFunction(() => window.__TEACUP__.strange.active?.kind === 'impostor', null, { timeout: 10_000 });
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.target = s.kills + 1;
  });
  await leafAhead(page);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.phase)).toBe('reading');
  expect(await strange(page)).toMatchObject({ active: null, holding: false, view: { kind: null } });
  expect(problems).toEqual([]);
});
