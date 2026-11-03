import { expect, openGame, test } from './fixtures.js';

// Mushroom Tea (prototype): brewed only with ?tea=mushroom.

/**
 * A still scene with every Mushroom Tea element at once: a waiting puffball,
 * a swelling one with its sprout marks, a spore cloud holding a giggling leaf,
 * and a sprout. Long clocks keep it still while it is drawn.
 */
async function stage(page) {
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    const step = Math.PI / 8;
    const at = (lane) => -Math.PI / 2 + lane * step;
    const leaf = (kind, lane, radius, extra = {}) => ({
      kind, angle: at(lane), radius, home: 40, speed: 0, wiggle: lane, shifted: true, size: 10, alpha: 1, backwash: 0, glide: null, ...extra,
    });
    s.spawnTimer = 1e6;
    s.current = null;
    s.enemies = [
      leaf('puffball', 3, 110, { size: 13, puff: { stage: 'waiting', at: 1e6, time: 0, warn: 1 } }),
      leaf('puffball', 7, 150, { size: 13, puff: { stage: 'swelling', at: 140, time: 700, warn: 1000 } }),
      leaf('leaf', 12, 160),
      leaf('sprout', 14, 200, { size: 7 }),
    ];
    s.spores = [{ angle: at(12), radius: 150, time: 1000, duration: 1001 }];
  });
}

const canvasShot = (page) => page.locator('#game').screenshot();

test('Mushroom Tea brews puffballs that pop into spores with the ordinary steam key', { tag: '@smoke' }, async ({ page, problems }, info) => {
  await openGame(page, '&seed=7&tea=mushroom&view=full');
  await page.keyboard.press('Enter');
  await expect(page.locator('#teaName')).toHaveText('Mushroom Tea');
  await expect(page.locator('#hudTea')).toHaveText('☕ Mushroom Tea · puffballs');
  await expect(page.locator('#hudTea')).toHaveAttribute('data-tea', 'mushroom');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.modifiers.puffballChance)).toBeGreaterThan(0);

  // A puffball straight up the spoon's lane, popped with Space.
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.spawnTimer = 1e6;
    s.enemies = [{ kind: 'puffball', angle: s.angle, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: true, size: 13,
      alpha: 1, backwash: 0, glide: null, puff: { stage: 'waiting', at: 1e6, time: 0, warn: 1 } }];
  });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__TEACUP__.game.state.spores.length === 1);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.kills)).toBe(1);

  await stage(page);
  await page.waitForTimeout(300);
  await info.attach('mushroom-high.png', { body: await canvasShot(page), contentType: 'image/png' });
  expect(problems).toEqual([]);
});

test('a swelling puffball splits into sprouts on screen, within the leaf limit', async ({ page, problems }) => {
  await openGame(page, '&seed=7&tea=mushroom');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.spawnTimer = 1e6;
    s.enemies = [{ kind: 'puffball', angle: s.angle + Math.PI, radius: 140, home: 40, speed: 20, wiggle: 0, shifted: true, size: 13,
      alpha: 1, backwash: 0, glide: null, puff: { stage: 'waiting', at: 140, time: 0, warn: 0.6 } }];
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.enemies.filter((e) => e.kind === 'sprout').length === 2);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.enemies.some((e) => e.kind === 'puffball'))).toBe(false);
  expect(problems).toEqual([]);
});

test('Mushroom Tea stays readable in Low graphics and with reduced motion', async ({ page, problems }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page, '&seed=7&tea=mushroom&graphics=low&view=full');
  await page.keyboard.press('Enter');
  await stage(page);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__TEACUP__.effects.fx.tea.reduced)).toBe(true);
  // Drawing never moves anything in play: the staged leaves stay exactly where they were put.
  const before = await page.evaluate(() => window.__TEACUP__.game.state.enemies.map((e) => [e.angle, e.radius]));
  await info.attach('mushroom-low-reduced.png', { body: await canvasShot(page), contentType: 'image/png' });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.enemies.map((e) => [e.angle, e.radius]))).toEqual(before);
  // Switching to High mid-cup is as safe as ever.
  await page.locator('#graphicsBtn').evaluate((button) => button.click());
  await page.waitForTimeout(300);
  await info.attach('mushroom-high-reduced.png', { body: await canvasShot(page), contentType: 'image/png' });
  expect(problems).toEqual([]);
});

test('a pinned Mushroom Tea pot saves under schema 5, keeping its pinned tea', async ({ page, problems }) => {
  await openGame(page, '&seed=7&tea=mushroom');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    s.kills = s.target - 1;
    s.spawnTimer = 5;
    s.enemies = [{ kind: 'puffball', angle: s.angle, radius: 200, home: 40, speed: 0, wiggle: 0, shifted: true, size: 13,
      alpha: 1, backwash: 0, glide: null, puff: { stage: 'waiting', at: 1e6, time: 0, warn: 1 } }];
    s.shotCooldown = 0;
    game.fireSteam();
  });
  await page.waitForFunction(() => localStorage.getItem('steeped-in-trouble:pot-save'));
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save')));
  expect(saved).toMatchObject({ schemaVersion: 5, pinnedTea: 'mushroom', state: { tea: 'mushroom', spores: [], tray: null, manager: null } });
  expect(problems).toEqual([]);
});
