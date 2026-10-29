// Shared steps for the Biscuit Breakout and Karma browser tests.
import { expect } from './fixtures.js';

/**
 * Reach the round-19 offer through a real finishing dart and the existing
 * reading. The paper route is set as already offered at round 12, so the
 * biscuits are the adventure due.
 */
export async function toBiscuitOffer(page) {
  await page.locator('#mainBtn').click();
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { round: 19, progress: { chapter: 2, starts: [1, 6] }, grindAfter: null,
      lastGrind: 19, havocAfter: null, lastHavoc: 19, shortageAfter: 23,
      kills: s.target - 1, spawnTimer: Infinity, current: null });
    s.arcade.after.dailyPour = 26;
    s.modifiers = { ...s.modifiers, laneDrift: false };
    s.enemies = [{ kind: 'leaf', angle: s.angle, radius: 120, home: 40, speed: 0,
      wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 }];
    s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  await page.waitForFunction(() => window.__TEACUP__.game.state.readingTime > 3.5);
  await page.evaluate(() => { window.__TEACUP__.game.state.offer = null; });
  await page.locator('#mainBtn').click();
  await expect(page.locator('#arcadeOffer')).toBeVisible();
  await expect(page.locator('#arcadeTitle')).toHaveText('THE BISCUITS ARE REVOLTING!');
}

/** Advance the mission's own clock in fixed steps with a held input, from inside the page. */
export async function advanceWall(page, seconds, input = {}) {
  await page.evaluate(([s, held]) => {
    const { game } = window.__TEACUP__;
    for (let i = 0; i < Math.round(s * 120); i++) game.update(1 / 120, { left: false, right: false, fire: false, ...held });
  }, [seconds, input]);
}

/**
 * Break biscuits by genuine collisions: the cube is fired straight up from
 * just under each target (bottom row first, or a named one with the way
 * cleared beneath it), and the real simulation resolves the hit.
 */
export async function breakBiscuits(page, { count = 1, talker = false, park = false } = {}) {
  return page.evaluate(([n, face, rest]) => {
    const { game, config } = window.__TEACUP__;
    const m = game.state.biscuitBreakout;
    const H = config.biscuitBreakout.cube.half;
    const shoot = (b) => {
      Object.assign(m.cube, { held: false, x: b.x + b.w / 2, y: b.y + b.h + H + 20, vx: 0, vy: -m.speed });
      for (let i = 0; i < 240 && b.alive; i++) game.update(1 / 120);
      if (b.alive) throw new Error(`biscuit ${b.id} survived`);
    };
    // Parked: the cube waits on the spoon, so nothing else breaks while the page runs on.
    const parkCube = () => {
      const P = config.biscuitBreakout.paddle;
      if (rest) Object.assign(m.cube, { held: true, vx: 0, vy: 0, x: m.paddle.x, y: P.y - P.halfHeight - H });
    };
    if (face) {
      const t = m.biscuits.find((b) => b.face);
      for (const b of m.biscuits.filter((o) => o.col === t.col && o.row > t.row && o.alive).sort((a, b) => b.row - a.row)) shoot(b);
      shoot(t);
      parkCube();
      return t.id;
    }
    const order = m.biscuits.filter((b) => b.alive).sort((a, b) => b.row - a.row || a.col - b.col).slice(0, n);
    for (const b of order) shoot(b);
    parkCube();
    return m.broken;
  }, [count, talker, park]);
}

export async function expectBreakoutControls(page) {
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'breakout');
  for (const hidden of ['.controls-classic', '.controls-easy', '.controls-run', '.controls-pour']) {
    await expect(page.locator(hidden)).toBeHidden();
  }
  for (const id of ['hudTea', 'hudOmen', 'hudStrainer', 'hudAuto']) await expect(page.locator('#' + id)).toBeHidden();
  const pads = page.locator('.controls-breakout button');
  await expect(pads).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const button = pads.nth(i);
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport();
    const b = await button.boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** Reach a reading whose fortune is Karma, through a real finishing dart. */
export async function toKarmaReading(page) {
  await page.locator('#mainBtn').click();
  await page.evaluate(() => {
    const s = window.__TEACUP__.game.state;
    Object.assign(s, { kills: s.target - 1, spawnTimer: Infinity, current: null });
    s.enemies = [{ kind: 'leaf', angle: s.angle, radius: 120, home: 40, speed: 0,
      wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 }];
    s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  });
  await page.waitForFunction(() => window.__TEACUP__.game.state.phase === 'reading');
  // Set before the reveal: the card, the panel and the next cup all follow it.
  await page.evaluate(() => { Object.assign(window.__TEACUP__.game.state, { nextFortune: 'karma', offer: null }); });
}

/** Put leaves just short of the rim in the given lanes, rising. */
export async function leavesAtRim(page, lanes) {
  await page.evaluate((list) => {
    const { game, config } = window.__TEACUP__;
    const s = game.state;
    s.spawnTimer = Infinity;
    for (const lane of list) {
      s.enemies.push({ kind: 'leaf', angle: -Math.PI / 2 + (lane * Math.PI) / 8, radius: config.arena.rimRadius - 6,
        home: 40, speed: 60, wiggle: lane, shifted: true, size: 11, alpha: 1, backwash: 0, glide: null });
    }
  }, lanes);
}
