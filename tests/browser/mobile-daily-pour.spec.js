import { test, expect, openGame } from './fixtures.js';
import { advancePaperRoute, bubbleShown, expectPourControls, remarkStart, toPaperOffer } from './dailyPour.js';

for (const [name, viewport] of [
  ['phone-portrait', { width: 393, height: 851 }],
  ['phone-landscape', { width: 851, height: 393 }],
  ['tablet-portrait', { width: 820, height: 1180 }],
  ['tablet-landscape', { width: 1180, height: 820 }],
]) {
  test(`Daily Pour offer, touch pads and Tea Break fit ${name}`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&touch=easy');
    await toPaperOffer(page);
    const accept = page.locator('[data-interlude="accept"]');
    await expect(accept).toBeInViewport();
    await expect(page.locator('[data-interlude="skip"]')).toBeInViewport();
    await accept.tap();
    await expectPourControls(page);
    await page.screenshot({ path: `docs/images/daily-pour/${name}-intro.png`, fullPage: true, scale: 'css' });
    // Layout checks can outlast the automatic intro. During play the primary
    // button is hidden, so tapping it can wait until the route has already ended.
    await page.waitForFunction(() => {
      const { game, config } = window.__TEACUP__;
      const pour = game.state.dailyPour;
      return game.state.phase === 'dailyPour' && pour.stage === 'play'
        && pour.clock < config.dailyPour.duration && pour.summary === null;
    });
    const aim = page.locator('[data-paper="aimPaper"]');
    await expect(aim).toBeVisible();
    await expect(aim).toBeEnabled();
    await expect(aim).toHaveText('AIM: MAILBOX');
    await aim.tap({ trial: true });
    await aim.tap();
    await expect(page.locator('#aimPaperBtn')).toHaveText('AIM: PORCH');
    const papers = await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.papers);
    expect(papers).toBe(9);
    await page.locator('[data-paper="throwPaper"]').tap();
    const thrown = await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.papers);
    expect(thrown).toBe(papers - 1);
    await page.locator('[data-paper="throwPaper"]').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.waitForTimeout(950);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour.papers)).toBe(thrown);
    for (const action of ['aimPaper', 'throwPaper']) await expect(page.locator(`[data-paper="${action}"]`)).toBeInViewport();
    await page.screenshot({ path: `docs/images/daily-pour/${name}.png`, fullPage: true, scale: 'css' });
    await page.locator('#menuBtn').tap();
    await expect(page.locator('#teaBreak')).toBeVisible();
    const frozen = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state.dailyPour));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__TEACUP__.game.state.dailyPour)).toEqual(frozen);
    await page.locator('#closeBreak').tap();
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'dailyPour');
    await page.waitForFunction((clock) => {
      const { state } = window.__TEACUP__.game;
      return state.phase === 'dailyPour' && state.dailyPour.stage === 'play'
        && state.dailyPour.clock > clock;
    }, frozen.clock);
    expect(problems).toEqual([]);
  });
}

for (const [name, viewport] of [['phone-portrait', { width: 393, height: 851 }], ['tablet-landscape', { width: 1180, height: 820 }]]) {
  test(`the bystander's remark is readable on ${name}`, async ({ page, problems }) => {
    await page.setViewportSize(viewport);
    await openGame(page, '&seed=42&touch=easy');
    await toPaperOffer(page);
    await page.locator('[data-interlude="accept"]').tap();
    await page.locator('#mainBtn').tap();
    const start = await remarkStart(page);
    await advancePaperRoute(page, start + 0.5);
    expect(await bubbleShown(page)).toBe(true);
    for (const action of ['aimPaper', 'throwPaper']) await expect(page.locator(`[data-paper="${action}"]`)).toBeInViewport();
    await page.screenshot({ path: `docs/images/daily-pour/pedestrian-${name}.png`, fullPage: true, scale: 'css' });
    await advancePaperRoute(page, start + 3.05);
    expect(await bubbleShown(page)).toBe(false);
    expect(problems).toEqual([]);
  });
}

test('touch skipping leaves progression and resources intact', async ({ page, problems }) => {
  await openGame(page, '&seed=42'); await toPaperOffer(page);
  const before = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  await page.locator('[data-interlude="skip"]').tap();
  await expect(page.locator('#resourceProgressLabel')).toContainText('Cup 13 · Leaves');
  const after = await page.evaluate(() => structuredClone(window.__TEACUP__.game.state));
  for (const key of ['lives', 'score', 'teaCash', 'spoon', 'progress', 'shortageAfter']) expect(after[key]).toEqual(before[key]);
  expect(after.fortune).toBe(before.nextFortune);
  expect(problems).toEqual([]);
});
