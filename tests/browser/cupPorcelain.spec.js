import { readFileSync } from 'node:fs';
import { expect, openGame, test } from './fixtures.js';
import { capture, finishCup, fractures, offerLeaf, quiet, revealed, spill, steamLeaf } from './cup.js';
import { finishPractice, openCollection } from './collection.js';

const legacy = JSON.parse(readFileSync(new URL('../fixtures/pot-0.16.0.json', import.meta.url), 'utf8'));
const read = (page) => page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));
const snapshot = (page) => page.evaluate(() => ({
  state: structuredClone(window.__TEACUP__.game.state), rng: window.__TEACUP__.game.exportRandom(),
}));

test('the porcelain cracks, warns, mends with gold, and finally breaks', async ({ page, problems }, info) => {
  const shot = (name) => capture(page, info, `desktop-${name}`);
  await openGame(page, '&seed=42&view=full');
  await page.keyboard.press('Enter');
  await quiet(page);
  const lives = page.locator('#hudLives');
  await expect(lives).toHaveText('CUP STABLE');
  await expect(page.locator('#cupStatus')).toHaveText('Cup condition: Cup stable.');
  await shot('healthy');

  await spill(page, 3);
  await expect(lives).toHaveText('PORCELAIN CRACKED');
  await expect(lives).toHaveAttribute('data-condition', 'cracked');
  expect(await fractures(page)).toEqual(['crack']);
  await shot('cracked');

  await spill(page, 11);
  await expect(lives).toHaveText('STRUCTURAL FAILURE IMMINENT');
  await expect(lives).toHaveAttribute('data-condition', 'critical');
  await expect(page.locator('#cupStatus')).toContainText('one more spill breaks the cup');
  expect(await fractures(page)).toEqual(['crack', 'crack']);
  await shot('critical');

  await offerLeaf(page);
  await expect(page.locator('#hudStatus')).toContainText('GOLDEN LEAF');
  await shot('golden-leaf');
  const tally = () => page.evaluate(() => { const s = window.__TEACUP__.game.state; return { score: s.score, kills: s.kills }; });
  const before = await tally();
  await steamLeaf(page);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.lives)).toBe(2);
  expect(await tally()).toEqual(before);
  expect(await fractures(page)).toEqual(['crack', 'seam']);
  await expect(lives).toHaveText('PORCELAIN CRACKED');
  await page.waitForTimeout(400);
  await shot('gold-repair');

  await spill(page, 6);
  await spill(page, 14);
  await expect(page.locator('#hudStatus')).toHaveText('THE CUP RUNNETH OVER');
  await expect(lives).toHaveText('SHATTERED');
  // Mid-break for the screenshot: the break is cosmetic, so its clock may be set back.
  await page.evaluate(() => { window.__TEACUP__.effects.fx.shatter.age = 0.55; });
  await shot('shattering');
  await page.waitForTimeout(1500);
  await shot('shattered');

  await page.keyboard.press('Enter');
  await expect(lives).toHaveText('CUP STABLE');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.porcelain)).toEqual({ serial: 0, fractures: [] });
  expect(problems).toEqual([]);
});

test('a continued pot keeps its cracks and gold seams', async ({ page, problems }) => {
  await openGame(page, '&seed=7&view=full');
  await page.keyboard.press('Enter');
  await quiet(page);
  await spill(page, 2);
  await spill(page, 9);
  await offerLeaf(page);
  await steamLeaf(page);
  await finishCup(page);
  await page.waitForFunction(() => localStorage.getItem('steeped-in-trouble:pot-save'));
  const saved = JSON.parse(await read(page));
  expect(saved.schemaVersion).toBe(2);
  expect(saved.state.porcelain.fractures.map((f) => f.kind)).toEqual(['crack', 'seam']);
  await page.reload();
  await page.locator('#mainBtn').click();
  expect(await page.evaluate(() => window.__TEACUP__.game.state.porcelain)).toEqual(saved.state.porcelain);
  expect(await page.evaluate(() => window.__TEACUP__.game.exportRandom())).toEqual(saved.random);
  await expect(page.locator('#hudLives')).toHaveText('PORCELAIN CRACKED');
  expect(problems).toEqual([]);
});

test('an authentic 0.16.0 save continues, cracked, with its reading and upgrade intact', async ({ page, problems }, info) => {
  const v1 = legacy.checkpoints.critical;
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('steeped-in-trouble:pot-save', raw);
    }
  }, JSON.stringify(v1));
  await openGame(page, '&view=full');
  await expect(page.locator('#mainBtn')).toHaveText('CONTINUE YOUR POT');
  expect(JSON.parse(await read(page)).schemaVersion).toBe(1); // reading it changes nothing
  await page.locator('#mainBtn').click();
  const { state, rng } = await snapshot(page);
  expect(state).toMatchObject({ phase: 'reading', round: v1.state.round, lives: 1, nextFortune: v1.state.nextFortune,
    offer: v1.state.offer });
  expect(state.porcelain.fractures.map((f) => f.kind)).toEqual(['crack', 'crack']);
  for (const id of Object.keys(v1.random)) expect(rng[id]).toEqual(v1.random[id]);
  await expect(page.locator('#hudLives')).toHaveText('STRUCTURAL FAILURE IMMINENT');
  await expect(page.locator('#readingMemory')).not.toBeEmpty();
  await revealed(page);
  await expect(page.locator('#upgradeOffer')).toBeVisible({ timeout: 10_000 });
  await capture(page, info, 'desktop-migrated-0.16.0');
  await page.locator('[data-choice="0"]').click();
  // The saved schedule is kept too: this pot's hot chocolate comes before its next cup.
  expect(v1.state.havocDue).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'chocolate');
  await page.evaluate(() => {
    const g = window.__TEACUP__.game;
    g.primaryAction(); // past the prophecy
    g.state.chocolate.left = 0;
    g.update(1 / 60);
    g.state.chocolate.time = 5;
    g.primaryAction();
  });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await quiet(page);
  await finishCup(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('steeped-in-trouble:pot-save')).schemaVersion === 2);
  expect(problems).toEqual([]);
});

test('the Arcade Collection leaves a cracked cup exactly as it was', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full');
  await page.keyboard.press('Enter');
  await quiet(page);
  await spill(page, 5);
  await page.evaluate(() => window.__TEACUP__.game.pause());
  const before = await snapshot(page);
  await openCollection(page, 'menu');
  await page.locator('[data-job="biscuitBreakout"]').click();
  await finishPractice(page, 'biscuitBreakout', true);
  await expect(page.locator('#hudLives')).toHaveText(/^CUBES/); // the adventure keeps its own counter
  await page.locator('#backPotBtn').click();
  expect(await snapshot(page)).toEqual(before);
  await expect(page.locator('#hudLives')).toHaveText('PORCELAIN CRACKED');
  expect(problems).toEqual([]);
});

test('Compact View on a desktop shows the condition and the cracks', async ({ page, problems }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGame(page, '&seed=42&view=compact');
  await page.locator('#mainBtn').click();
  await quiet(page);
  await spill(page, 3);
  await spill(page, 11);
  await expect(page.locator('#hudLives')).toHaveText('STRUCTURAL FAILURE IMMINENT');
  await capture(page, info, 'desktop-compact-critical');
  expect(problems).toEqual([]);
});
