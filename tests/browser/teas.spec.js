import { expect, openGame, test } from './fixtures.js';

const TEA_NAMES = /^(Green Tea|Earl Grey|Chai|Black Tea|Herbal Tea)$/;

/** Finish the current round at once with a real steam shot. */
async function finishRound(page) {
  await page.evaluate(() => {
    const { game } = window.__TEACUP__;
    const s = game.state;
    s.current = null; // keep a spice current from carrying the last leaf away
    s.kills = s.target - 1;
    s.enemies.push({ kind: 'leaf', angle: -Math.PI / 2, radius: 200, home: 40, speed: 0, wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 });
    s.angle = -Math.PI / 2;
    s.shotCooldown = 0;
    game.fireSteam();
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
}

test('the second cup brews a new tea, and the HUD and cup announce it', async ({ page, problems }) => {
  await openGame(page, '&seed=7');
  await page.keyboard.press('Enter');
  await expect(page.locator('#roundTitle')).toHaveText('Cup 1: the storm stirs');
  await expect(page.locator('#teaName')).toHaveText('House Blend');
  await finishRound(page);
  await expect(page.locator('#upgradeOffer')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('1');

  await expect(page.locator('#roundNum')).toHaveText('02');
  await expect(page.locator('#teaName')).toHaveText(TEA_NAMES);
  const name = await page.locator('#teaName').textContent();
  await expect(page.locator('#roundTitle')).toHaveText(`Cup 2: ${name}`);
  await expect(page.locator('#hudTea')).toBeVisible();
  await expect(page.locator('#hudTea')).toHaveText(new RegExp(`^☕ ${name} · `));
  const { tea, card } = await page.evaluate(() => ({
    tea: window.__TEACUP__.game.state.tea, card: window.__TEACUP__.effects.fx.teaCard?.tea,
  }));
  expect(card).toBe(tea);
  await expect(page.locator('#hudTea')).toHaveAttribute('data-tea', tea);
  expect(problems).toEqual([]);
});

test('Chai warns before its current, then carries the leaves one lane', async ({ page, problems }) => {
  await openGame(page, '&seed=7&tea=chai');
  await page.keyboard.press('Enter');
  await expect(page.locator('#teaName')).toHaveText('Chai');
  await expect(page.locator('#hudTea')).toHaveText('☕ Chai · spice currents');
  const start = await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.spawnTimer = Infinity;
    s.enemies = [{ kind: 'leaf', angle: -Math.PI / 2 + (Math.PI / 8) * 3, radius: 120, home: 40, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1, backwash: 0, glide: null }];
    s.current.time = s.current.wait - 0.3; // bring the first current forward
    return { angle: s.enemies[0].angle, dir: s.current.dir };
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.current.stage === 'warning');
  expect(await page.evaluate(() => window.__TEACUP__.game.state.enemies[0].angle)).toBeCloseTo(start.angle, 6);
  await page.waitForFunction(() => window.__TEACUP__.game.state.current.stage === 'calm', null, { timeout: 10_000 });
  const moved = await page.evaluate(() => window.__TEACUP__.game.state.enemies[0].angle);
  expect(moved - start.angle).toBeCloseTo(start.dir * (Math.PI / 8), 6);
  expect(problems).toEqual([]);
});

test('the up and down arrows pour milk and fire sugar without scrolling the page', async ({ page, problems }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await openGame(page);
  await page.keyboard.press('Enter');
  const scrolled = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
  expect(scrolled).toBe(true); // the page could scroll, so the test means something
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#milkCount')).toHaveText('1');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#sugarCount')).toHaveText('1');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(problems).toEqual([]);
});

for (const graphics of ['high', 'low']) {
  test(`every tea draws cleanly with ${graphics} graphics`, async ({ page, problems }) => {
    for (const tea of ['house', 'green', 'earlGrey', 'chai', 'black', 'herbal']) {
      await openGame(page, `&seed=3&tea=${tea}&graphics=${graphics}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(700);
      const painted = await page.locator('#game').evaluate((c) => {
        const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let lit = 0;
        for (let i = 3; i < pixels.length; i += 400) if (pixels[i] > 0) lit++;
        return lit;
      });
      expect(painted).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.__TEACUP__.game.state.tea)).toBe(tea);
    }
    expect(problems).toEqual([]);
  });
}
