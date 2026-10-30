import { expect } from './fixtures.js';

export async function checkpointRound(page) {
  await page.evaluate(() => {
    const g = window.__TEACUP__.game, s = g.state;
    if (s.phase === 'ready') g.primaryAction();
    s.spawnTimer = 1000; s.current = null; s.modifiers.laneDrift = false; s.kills = s.target - 1;
    s.enemies = [{ angle: s.angle, radius: 180, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 }];
    s.shots = [{ angle: s.angle, radius: 180, speed: 0, sugar: false, veer: 0, golden: false }];
    g.update(1 / 120);
  });
  await page.waitForFunction(() => localStorage.getItem('steeped-in-trouble:pot-save'));
}

export async function finishPractice(page, id, success = false) {
  await page.evaluate(([id, success]) => {
    const g = window.__TEACUP__.game;
    g.primaryAction();
    const m = g.practiceMission();
    if (success) {
      if (id === 'teaRun') { m.obstacles = []; m.pickups = []; m.distance = m.finish - 1; m.coins = 3; }
      else if (id === 'dailyPour') m.delivered = m.scheduled;
      else if (id === 'biscuitBreakout') m.broken = m.total;
      else { m.lanes.forEach((l) => { l.vehicles = []; }); m.spoon.row = 6; g.hop('up'); }
    }
    for (let i = 0; i < 60 * 60; i++) g.update(1 / 60);
  }, [id, success]);
  await expect(page.locator('#playAgainBtn')).toBeVisible();
}

export async function openCollection(page, from = 'start') {
  if (from === 'menu') {
    await page.locator('#menuBtn').click();
    await page.locator('#breakCollectionBtn').click();
  } else await page.locator('#collectionBtn').click();
  await expect(page.locator('#arcadeCollection')).toBeVisible();
  await expect(page.locator('[data-job]')).toHaveCount(4);
}

export async function layoutChecks(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const button of await page.locator('#arcadeCollection button:visible').all()) {
    const box = await button.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate((b) => b.scrollWidth <= b.clientWidth + 1)).toBe(true);
  }
}
