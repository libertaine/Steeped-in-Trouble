import { test, expect, openGame } from './fixtures.js';
import { checkpointRound, finishPractice, layoutChecks, openCollection } from './collection.js';

const IDS = ['teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet'];
const read = (page, key) => page.evaluate((k) => localStorage.getItem(k), `steeped-in-trouble:${key}`);
async function shot(page, info, name) {
  if (info.project.name === 'chromium') await page.screenshot({ path: `docs/images/arcade-collection/${name}.png`, fullPage: false, scale: 'css' });
}

test('the four jobs have no prerequisites, settle records once, reload, retry, and return', async ({ page, problems }, info) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openGame(page, '&seed=42&view=full');
  await shot(page, info, 'initial-no-save');
  await openCollection(page); await layoutChecks(page);
  await shot(page, info, 'empty-collection');
  await expect(page.locator('.job-record')).toContainText(['NO RECORD YET', 'NO RECORD YET', 'NO RECORD YET', 'NO RECORD YET']);
  for (const id of IDS) {
    await page.locator(`[data-job="${id}"]`).click();
    await page.waitForFunction((id) => window.__TEACUP__.game.practice === id, id);
    const seed = await page.evaluate(() => window.__TEACUP__.game.seed);
    if (id === 'teaRun') await shot(page, info, 'tea-run-selection');
    await finishPractice(page, id, true);
    await expect(page.locator('#personalBest')).toBeVisible();
    if (id === 'crossingStreet') await shot(page, info, 'new-personal-best');
    await page.locator('#retryBtn').click();
    expect(await page.evaluate(() => window.__TEACUP__.game.seed)).toBe(seed);
    await finishPractice(page, id, true);
    await expect(page.locator('#personalBest')).toBeHidden();
    await page.locator('#playAgainBtn').click();
    expect(await page.evaluate(() => window.__TEACUP__.game.seed)).not.toBe(seed);
    await page.locator('#chooseJobBtn').click();
    await expect(page.locator('#arcadeCollection')).toBeVisible();
  }
  await shot(page, info, 'collection-with-records');
  const records = JSON.parse(await read(page, 'arcade-records'));
  for (const id of IDS) expect(records.games[id]).toMatchObject({ plays: 2, wins: 2 });
  expect(records.games.teaRun).not.toHaveProperty('perfects');
  await page.reload(); await openCollection(page);
  await expect(page.locator('.job-record')).toContainText(['Personal best:', 'Personal best:', 'Personal best:', 'Personal best:']);
  await page.locator('#closeCollectionBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'ready');
  expect(problems).toEqual([]);
});

test('practice preserves a paused main pot, all RNG cursors and its saved checkpoint', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full'); await page.locator('#mainBtn').click();
  await checkpointRound(page);
  await page.evaluate(() => { const g = window.__TEACUP__.game; g.state.readingTime = 5; g.chooseUpgrade(0); g.pause(); });
  const before = await page.evaluate(() => ({ state: structuredClone(window.__TEACUP__.game.state), rng: window.__TEACUP__.game.exportRandom() }));
  const saved = await read(page, 'pot-save');
  await openCollection(page, 'menu');
  for (const id of IDS) {
    await page.locator(`[data-job="${id}"]`).click(); await finishPractice(page, id, true);
    expect(await read(page, 'pot-save')).toBe(saved);
    await page.locator('#chooseJobBtn').click();
  }
  await page.locator('#closeCollectionBtn').click();
  const after = await page.evaluate(() => ({ state: structuredClone(window.__TEACUP__.game.state), rng: window.__TEACUP__.game.exportRandom() }));
  expect(after).toEqual(before);
  await page.keyboard.press('KeyP');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(problems).toEqual([]);
});

test('Continue restores the complete saved reading; New Pot and Clear require confirmation', async ({ page, problems }, info) => {
  await openGame(page, '&seed=42&view=full'); await checkpointRound(page);
  const saved = await read(page, 'pot-save');
  const checkpoint = JSON.parse(saved);
  await page.reload(); await expect(page.locator('#mainBtn')).toHaveText('CONTINUE YOUR POT');
  await shot(page, info, 'initial-saved-pot');
  await page.locator('#newPotBtn').click(); await page.locator('#cancelPotBtn').click();
  expect(await read(page, 'pot-save')).toBe(saved);
  await page.locator('#mainBtn').click();
  const resumed = await page.evaluate(() => ({ s: structuredClone(window.__TEACUP__.game.state), r: window.__TEACUP__.game.exportRandom() }));
  resumed.s.readingTime = checkpoint.state.readingTime;
  expect(resumed.s).toEqual(checkpoint.state); expect(resumed.r).toEqual(checkpoint.random);
  await expect(page.locator('#potNotice')).toContainText('YOUR POT IS SAVED');
  await page.reload(); await page.locator('#newPotBtn').click();
  await page.locator('#confirmPotBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(await read(page, 'pot-save')).toBeNull();
  await checkpointRound(page); await page.locator('#menuBtn').click();
  await expect(page.locator('#savedPotInfo')).toContainText('round 1 completed');
  await page.locator('#clearPotBtn').click(); await page.locator('#cancelPotBtn').click();
  expect(await read(page, 'pot-save')).not.toBeNull();
  await page.locator('#clearPotBtn').click(); await page.locator('#confirmPotBtn').click();
  expect(await read(page, 'pot-save')).toBeNull();
  await expect(page.locator('#savedPotInfo')).toHaveText('No saved pot.');
  expect(problems).toEqual([]);
});

test('storage denial and invalid saves leave the collection and cup playable', async ({ page, problems }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
  await openGame(page, '&view=compact'); await openCollection(page);
  await expect(page.locator('#recordNotice')).toContainText('will not be saved');
  await page.locator('[data-job="dailyPour"]').click(); await finishPractice(page, 'dailyPour', true);
  await page.locator('#backPotBtn').click(); await page.locator('#mainBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(problems).toEqual([]);
});

test('invalid pot data cannot enter gameplay and does not remove arcade records', async ({ page, problems }) => {
  await openGame(page); await openCollection(page);
  await page.locator('[data-job="dailyPour"]').click(); await finishPractice(page, 'dailyPour', true);
  const records = await read(page, 'arcade-records');
  await page.evaluate(() => localStorage.setItem('steeped-in-trouble:pot-save', '{"schemaVersion":1,"state":{"phase":"golf"}}'));
  await page.reload(); await expect(page.locator('#potNotice')).toContainText('could not be resumed');
  await expect(page.locator('#mainBtn')).toContainText('Brew the first cup');
  expect(await read(page, 'arcade-records')).toBe(records);
  expect(problems).toEqual([]);
});

test('clearing a saved pot from the initial Tea Break restores the first-cup choice', async ({ page, problems }) => {
  await openGame(page, '&view=compact'); await checkpointRound(page); await page.reload();
  await expect(page.locator('#mainBtn')).toHaveText('CONTINUE YOUR POT');
  await page.locator('#menuBtn').click(); await page.locator('#clearPotBtn').click();
  await page.locator('#confirmPotBtn').click(); await page.locator('#closeBreak').click();
  await expect(page.locator('#mainBtn')).toHaveText('Brew the first cup →');
  await page.locator('#mainBtn').click(); await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(problems).toEqual([]);
});

test('held input from a collection or practice never becomes steam or teacup steering', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=compact');
  await page.locator('#mainBtn').click(); await page.evaluate(() => window.__TEACUP__.game.pause());
  await openCollection(page, 'menu');
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('Space');
  await page.locator('[data-job="crossingStreet"]').click();
  await page.locator('#backPotBtn').click();
  const before = await page.evaluate(() => window.__TEACUP__.game.state.angle);
  await page.keyboard.press('KeyP');
  await page.evaluate(() => {
    for (const code of ['Space', 'ArrowLeft']) window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: true, bubbles: true }));
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.angle)).toBe(before);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBe(0);
  await page.keyboard.up('Space'); await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.roundStats.volleys)).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('Compact View supports keyboard selection and game-over access without debug shortcuts', async ({ page, problems }, info) => {
  await openGame(page, '&view=compact'); await shot(page, info, 'desktop-compact');
  await openCollection(page);
  await page.locator('[data-job="biscuitBreakout"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'breakout');
  await page.keyboard.press('KeyP'); await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('KeyP'); await page.locator('#backPotBtn').click();
  await page.evaluate(() => { window.__TEACUP__.game.state.phase = 'gameover'; });
  await openCollection(page);
  expect(await page.evaluate(() => ['openCollection', 'launchPractice', 'personalBest', 'createCheckpoint', 'restoreCheckpoint', 'saveSchema']
    .filter((id) => id in window.__TEACUP__))).toEqual([]);
  expect(problems).toEqual([]);
});
