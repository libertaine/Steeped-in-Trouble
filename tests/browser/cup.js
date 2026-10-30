// Helpers for The Cup Remembers (0.17.0). They work in the production build:
// only the read-only ?debug hook is used, and every outcome comes from a real
// collision or escape in the simulation.
import { expect } from './fixtures.js';

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
