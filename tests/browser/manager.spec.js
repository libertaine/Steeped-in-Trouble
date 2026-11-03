import { expect, gameState, openGame, test } from './fixtures.js';

// The Mycelium Manager, met from a real reading hand-off in the production
// build: the debug hook only finishes the cup and makes the Manager due.

/** Finish cup 1 at once, then make the Manager the encounter after its reading. */
async function toManager(page, { visit = 1 } = {}) {
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    s.kills = s.target - 1;
    s.enemies.push({ angle: -Math.PI / 2, radius: 200, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 });
    s.angle = -Math.PI / 2;
    s.shotCooldown = 0;
    game.fireSteam();
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.evaluate((visit) => {
    const s = window.__TEACUP__.game.state;
    const milestone = visit === 1;
    Object.assign(s, {
      offer: null, havocDue: false, grindDue: false, shortageDue: false, arcadeDue: null, managerDue: true, grindAfter: null,
      progress: { chapter: 2, starts: [1, 1] }, // rematch twists follow managerVisits alone
      managerAfter: milestone ? 1 : null, managerVisits: milestone ? 0 : visit - 2,
    });
  }, visit);
  await expect(page.locator('#mainBtn')).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('A MEETING HAS BEEN SCHEDULED');
}

/** Hold everything still, then lay out one of each thing the Manager uses. */
async function busyMoment(page) {
  await page.evaluate(() => {
    const m = window.__TEACUP__.game.state.manager;
    const at = (lane) => -Math.PI / 2 + lane * Math.PI / 8;
    Object.assign(m, { rootTimer: 1e6, memoTimer: 1e6, meetingTimer: 1e6 });
    m.roots = [{ lane: 3, stage: 'grow', time: 0, tip: 240, frozen: false }, { lane: 12, stage: 'sprout', time: 0, tip: 84, frozen: false }];
    m.memos = [{ id: 99, lane: 0, angle: at(0), radius: 170, speed: 0 }];
    m.notes = [8];
  });
}

test('The Mycelium Manager can be met, fought with the usual keys, and escaped without ending the pot', { tag: '@smoke' }, async ({ page, problems }) => {
  await openGame(page, '&seed=7');
  await toManager(page);
  const { nextFortune } = await gameState(page);
  await expect(page.locator('#roundNum')).toHaveText('01½');
  await page.keyboard.press('Enter'); // skip the entrance
  await expect(page.locator('#hudStatus')).toHaveText(/^THE MYCELIUM MANAGER · \d+s$/);
  await expect(page.locator('#resourceProgressLabel')).toContainText('Manager patience');
  await expect(page.locator('#resource2')).toContainText('Scalds');

  // A memo straight up the spoon's lane, popped with Space: its spores are the only thing that hurts.
  await busyMoment(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__TEACUP__.game.state.manager.health < window.__TEACUP__.config.manager.health);
  await page.keyboard.press('q');
  await expect(page.locator('#milkCount')).toHaveText('1');
  await page.keyboard.press('e');
  await expect(page.locator('#sugarCount')).toHaveText('1');

  // A meeting the spoon cannot avoid in time (forced for the test), and its scald.
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.manager.meeting = { stage: 'warn', wave: 1, time: 0, length: 0.4, lanes: [0], reach: 84, struck: false };
    s.manager.notes = [0];
  });
  await expect(page.locator('#resourceGuidance')).toHaveText('Leave invited lanes');
  await page.waitForFunction(() => window.__TEACUP__.game.state.manager.scalds === 1);
  await expect(page.locator('#resource2')).toContainText('1/3');

  await page.evaluate(() => { window.__TEACUP__.game.state.manager.left = 0.05; });
  await expect(page.locator('#hudStatus')).toHaveText('TAKEN OFFLINE');
  await expect(page.locator('#mainBtn')).toHaveText('Back to the tea →');
  await page.waitForFunction(() => window.__TEACUP__.game.state.manager?.time >= 1.65);
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText(/DEFEND THE RIM|GOLDEN SPOON/);
  await expect(page.locator('#roundNum')).toHaveText('02');
  expect((await gameState(page)).fortune).toBe(nextFortune);
  expect(problems).toEqual([]);
});

test('the Manager pauses with P and keeps everything still', async ({ page, problems }) => {
  await openGame(page, '&seed=7');
  await toManager(page);
  await page.keyboard.press('Enter');
  await busyMoment(page);
  await page.keyboard.press('p');
  await expect(page.locator('#hudStatus')).toHaveText('PAUSED');
  const snapshot = await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state.manager));
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state.manager))).toBe(snapshot);
  await page.keyboard.press('p');
  await expect(page.locator('#hudStatus')).toHaveText(/^THE MYCELIUM MANAGER/);
  expect(problems).toEqual([]);
});

for (const [name, query, motion] of [['Low graphics', '&graphics=low', 'no-preference'], ['reduced motion', '', 'reduce']]) {
  test(`a rematch with twists draws without problems in ${name}`, async ({ page, problems }, info) => {
    await page.emulateMedia({ reducedMotion: motion });
    await openGame(page, `&seed=7${query}`);
    await toManager(page, { visit: 5 });
    expect(await page.evaluate(() => window.__TEACUP__.game.state.manager.twists)).toEqual(['reorg', 'backToBack']);
    await page.keyboard.press('Enter');
    await busyMoment(page);
    await page.evaluate(() => {
      window.__TEACUP__.game.state.manager.meeting = { stage: 'warn', wave: 2, time: 0, length: 1e6, lanes: [3, 8], reach: 84, struck: false };
    });
    await page.waitForTimeout(200);
    await page.locator('#game').screenshot({ path: info.outputPath('manager.png') });
    expect(problems).toEqual([]);
  });
}

test('beating the Manager opens Chapter 3 with a cup of Mushroom Tea', async ({ page, problems }) => {
  await openGame(page, '&seed=7');
  await toManager(page);
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const { game, config } = window.__TEACUP__;
    const m = game.state.manager;
    Object.assign(m, { health: config.manager.memoDamage, rootTimer: 1e6, memoTimer: 1e6, meetingTimer: 1e6 });
    m.memos = [{ id: 99, lane: 0, angle: -Math.PI / 2, radius: 170, speed: 0 }];
  });
  await page.keyboard.press('Space');
  await expect(page.locator('#hudStatus')).toHaveText('MEETING ADJOURNED');
  await expect(page.locator('#gameTip')).toContainText('Chapter 3 begins with a cup of Mushroom Tea');
  await page.waitForFunction(() => window.__TEACUP__.game.state.manager?.time >= 1.65);
  await page.keyboard.press('Enter');
  await expect(page.locator('#teaName')).toHaveText('Mushroom Tea');
  await expect(page.locator('#chapterNum')).toHaveText('3');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.progress.chapter)).toBe(3);
  expect(problems).toEqual([]);
});
