// Helpers for The Cup Remembers (0.17.0). They work in the production build:
// only the read-only ?debug hook is used, and every outcome comes from a real
// collision or escape in the simulation.
import { expect } from './fixtures.js';

/** A screenshot: Chromium runs keep theirs in docs/images/cup-remembers (see its README), others in test results. */
export function capture(page, info, name) {
  const docs = ['chromium', 'mobile-chromium'].includes(info.project.name);
  return page.screenshot({ path: docs ? `docs/images/cup-remembers/${name}.png` : info.outputPath(`${name}.png`), scale: 'css' });
}

/** In a quiet cup (no new leaves), pour milk twice with the keyboard, then finish the cup with a real steam kill. */
export async function milkyRound(page) {
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = 1000; });
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyM');
  await finishCup(page);
}

export async function finishCup(page) {
  await page.evaluate(() => {
    const g = window.__TEACUP__.game, s = g.state;
    s.spawnTimer = 1000; s.current = null; s.modifiers.laneDrift = false; s.kills = s.target - 1;
    s.enemies.push({ angle: s.angle, radius: 180, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 });
    s.shots.push({ angle: s.angle, radius: 180, speed: 0, sugar: false, veer: 0, golden: false });
  });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
}

/** Wait until the reading has revealed the next fortune. */
export async function revealed(page) {
  await page.waitForFunction(() => {
    const { game, config } = window.__TEACUP__;
    return game.state.phase === 'reading' && game.state.readingTime >= config.fortunes.revealAt + 0.3;
  });
  return page.evaluate(() => window.__TEACUP__.game.state.nextFortune);
}

export const FORTUNE_NAMES = {
  crown: 'The Crown', veil: 'The Veil', spiral: 'The Spiral', star: 'The Star', sugarRush: 'Sugar Rush',
  doubleTrouble: 'Double Trouble', tempest: 'Tempestuous Tea', golden: 'Golden Opportunity', lie: 'The Leaves Lie', karma: 'Karma',
};

/** No new leaves for a while, so the cup can be inspected. */
export async function quiet(page) {
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { spawnTimer: 1000, current: null, enemies: [] });
    s.modifiers.laneDrift = false;
  });
}

/** A genuine damaging escape down `lane`; waits for the grace period to pass (or the pot to end). */
export async function spill(page, lane) {
  const lives = await page.evaluate((lane) => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { strainerLeft: 0, graceTime: 0 });
    const angle = -Math.PI / 2 + (lane * Math.PI * 2) / 16;
    s.enemies.push({ angle, radius: window.__TEACUP__.config.arena.rimRadius - 5, speed: 60, wiggle: 0, shifted: false,
      size: 10, alpha: 1 });
    return s.lives;
  }, lane);
  await page.waitForFunction((before) => window.__TEACUP__.game.state.lives < before, lives);
  await page.waitForFunction(() => window.__TEACUP__.game.state.graceTime === 0
    || window.__TEACUP__.game.state.phase === 'gameover');
}

/** Call up this cup's Golden Leaf now; the simulation spawns it from its own stream. */
export async function offerLeaf(page) {
  await page.evaluate(() => { window.__TEACUP__.game.state.goldenLeafTimer = 0.001; });
  await page.waitForFunction(() => window.__TEACUP__.game.state.goldenLeaf);
}

/** Turn the spoon to the Golden Leaf's lane and steam it with the keyboard. */
export async function steamLeaf(page) {
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    s.angle = s.goldenLeaf.home;
    s.shotCooldown = 0;
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !window.__TEACUP__.game.state.goldenLeaf);
}

export const fractures = (page) => page.evaluate(() => window.__TEACUP__.game.state.porcelain.fractures.map((f) => f.kind));
