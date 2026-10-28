import { expect, openGame, test } from './fixtures.js';

/** Jump to the end of a round: make it round `round`, then finish it with a real steam shot. */
async function finishRound(page, round) {
  await page.evaluate((r) => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    if (r) s.round = r;
    s.current = null; // keep a spice current from carrying the last leaf away
    s.kills = s.target - 1;
    s.enemies.push({ kind: 'leaf', angle: -Math.PI / 2, radius: 200, home: 40, speed: 0, wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 });
    s.angle = -Math.PI / 2;
    s.shotCooldown = 0;
    game.fireSteam();
  }, round);
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
}

/** From a reading with The Daily Grind due: decline any upgrade and walk into the fight. */
async function enterFight(page) {
  await page.evaluate(() => { window.__TEACUP__.game.state.offer = null; });
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('SOMEONE ORDERED TROUBLE');
  await page.keyboard.press('Enter'); // skip the entrance
  await expect(page.locator('#hudStatus')).toHaveText(/^THE DAILY GRIND · \d+s$/);
}

/** Leave the result card once the game's own clock allows it. */
async function leaveFight(page) {
  await page.waitForFunction(() => window.__TEACUP__.game.state.grind?.time >= 1.65);
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText(/DEFEND THE RIM|GOLDEN SPOON/);
}

test('the first Daily Grind follows round 5, and when it escapes it is back two cups later', async ({ page, problems }) => {
  await openGame(page, '&seed=11');
  await page.keyboard.press('Enter');
  // Skipping straight to round 5 leaves the first hot chocolate (due after round 3 or 4) wanting this reading too.
  await finishRound(page, 5);
  expect(await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    return { grind: s.grindDue, havoc: s.havocDue, havocAfter: s.havocAfter };
  })).toEqual({ grind: true, havoc: false, havocAfter: 6 }); // the boss goes first; the hot chocolate waits a cup
  await enterFight(page);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.grind.milestone)).toBe(true);

  await page.evaluate(() => { window.__TEACUP__.game.state.grind.left = 0.05; });
  await expect(page.locator('#hudStatus')).toHaveText('THE MACHINE ESCAPES');
  await expect(page.locator('#gameTip')).toHaveText(/^It will be back after 2 more cups/);
  await leaveFight(page);
  await expect(page.locator('#roundNum')).toHaveText('06');
  await expect(page.locator('#hudLives')).toHaveText(/CUPS ♥ ♥ ♥/);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.progress.chapter)).toBe(1);

  await finishRound(page);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.grindDue)).toBe(false); // not after round 6…
  expect(await page.evaluate(() => window.__TEACUP__.game.state.havocDue)).toBe(true); // (the hot chocolate's turn)
  await page.evaluate(() => { window.__TEACUP__.game.state.offer = null; });
  await page.keyboard.press('Enter');
  await expect(page.locator('#hudStatus')).toHaveText('THE CHOCOLATE PROPHECY');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { window.__TEACUP__.game.state.chocolate.left = 0.05; });
  await page.waitForFunction(() => window.__TEACUP__.game.state.chocolate?.time >= 0.65);
  await page.keyboard.press('Enter');
  await expect(page.locator('#roundNum')).toHaveText('07');
  await finishRound(page);
  expect(await page.evaluate(() => window.__TEACUP__.game.state.grindDue)).toBe(true); // …but after round 7
  expect(problems).toEqual([]);
});

test('beating it opens Chapter 2: a celebration, then Chai, new on the shelf', async ({ page, problems }) => {
  await openGame(page, '&seed=11');
  await page.keyboard.press('Enter');
  await finishRound(page, 5);
  await enterFight(page);
  // Land the last hit down the open valve with a real steam dart.
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    const g = s.grind;
    g.attack = null;
    g.attackTimer = Infinity;
    g.beans = [];
    g.health = 1;
    s.angle = -Math.PI / 2;
    Object.assign(g.valve, { lane: 0, from: 0, stage: 'open', time: 0, length: Infinity });
    s.shotCooldown = 0;
    game.fireSteam();
  });
  await expect(page.locator('#hudStatus')).toHaveText('ORDER UP');
  await expect(page.locator('#gameTip')).toHaveText(/^The next brew awaits/);
  await leaveFight(page);

  await expect(page.locator('#roundNum')).toHaveText('06');
  await expect(page.locator('#teaName')).toHaveText('Chai');
  await expect(page.locator('#gameTip')).toHaveText(/^New on the shelf! Chai: /);
  const shown = await page.evaluate(() => {
    const { game, effects } = window.__TEACUP__;
    return { chapter: game.state.progress.chapter, card: effects.fx.chapterCard?.chapter, tea: effects.fx.teaCard };
  });
  expect(shown.chapter).toBe(2);
  expect(shown.card).toBe(2);
  expect(shown.tea).toMatchObject({ tea: 'chai', debut: true });
  // The tea's own card follows once the chapter's has gone.
  await page.waitForFunction(() => !window.__TEACUP__.effects.fx.chapterCard, null, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__TEACUP__.effects.fx.teaCard?.tea)).toBe('chai');
  expect(problems).toEqual([]);
});

for (const graphics of ['high', 'low']) {
  for (const motion of ['no-preference', 'reduce']) {
    test(`milk sends a recovery pulse through the whole cup (${graphics} graphics, ${motion} motion)`, async ({ page, problems }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await openGame(page, `&seed=3&graphics=${graphics}`);
      await page.keyboard.press('Enter');
      await page.evaluate(() => {
        const { game, effects } = window.__TEACUP__;
        const s = game.state;
        s.spawnTimer = Infinity;
        // Two leaves on the far side of the cup from the spoon, well clear of its cloud.
        for (const lane of [7, 9]) {
          s.enemies.push({ kind: 'leaf', angle: -Math.PI / 2 + (Math.PI / 8) * lane, radius: 200, home: 40, speed: 0, wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0, glide: null });
        }
        // Note what the pulse looks like the moment its event is shown (a busy browser may be slow to ask later).
        const handle = effects.handle;
        effects.handle = (event) => {
          handle(event);
          if (event.type !== 'milkPulse') return;
          window.__poured = {
            pulse: s.pulse, surge: effects.fx.tea.surges.some((sg) => sg.full), glows: effects.fx.tea.glows.length,
          };
        };
      });
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('#milkCount')).toHaveText('1');
      await page.waitForFunction(() => window.__poured);
      const poured = await page.evaluate(() => window.__poured);
      expect(poured.pulse).toBeGreaterThan(0);
      if (motion === 'reduce') {
        expect(poured.surge).toBe(false);
        expect(poured.glows).toBeGreaterThan(0);
      } else {
        expect(poured.surge).toBe(true);
      }
      // The far leaves are pushed back, and the pulse wears off after a moment.
      await page.waitForFunction(() => window.__TEACUP__.game.state.pulse === 0, null, { timeout: 10_000 });
      const radii = await page.evaluate(() => window.__TEACUP__.game.state.enemies.map((e) => e.radius));
      for (const r of radii) expect(r).toBeLessThan(165);
      expect(problems).toEqual([]);
    });
  }
}
