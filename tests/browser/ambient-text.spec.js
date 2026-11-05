import { expect, openGame, test } from './fixtures.js';
import { freezeTextClock, laneWasShown, measuredText, openTextReading, stageTextReading, stealText, textState, watchLane } from './textMischief.js';

test('text theft preserves semantic reading, focus, inputs and RNG through the entire sequence', async ({ page, problems }) => {
  await freezeTextClock(page);
  await openTextReading(page);
  await stealText(page);
  const caption = page.locator('#readingCaption');
  await expect(caption).toHaveText('Management denies the existence of ants.');
  const before = await page.evaluate(() => ({ rng: window.__TEACUP__.game.exportRandom(),
    text: document.querySelector('.reading-copy').textContent, focus: document.activeElement.id }));
  await page.clock.runFor(2100);
  expect(await textState(page)).toMatchObject({ phase: 'carry', carried: true, hidden: false });
  await expect(caption).toHaveCSS('opacity', '0');
  expect(await caption.ariaSnapshot()).toContain('Management denies');
  await expect(page.locator('#mainBtn')).toBeEnabled();
  await expect(page.locator('#readingAnts')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#readingAnts')).toHaveCSS('pointer-events', 'none');
  expect(await page.evaluate(() => {
    const lane = document.querySelector('#readingMischief').getBoundingClientRect();
    return [...document.querySelectorAll('.reading-copy > *, #mainBtn, #menuBtn')].every(e => {
      const r = e.getBoundingClientRect();
      return !r.width || !r.height || lane.right <= r.left || lane.left >= r.right || lane.bottom <= r.top || lane.top >= r.bottom;
    });
  })).toBe(true);
  await page.clock.runFor(4500);
  expect(await textState(page)).toMatchObject({ phase: 'absent', carried: true, hidden: true });
  await page.clock.runFor(7200);
  expect(await textState(page)).toMatchObject({ phase: 'restored', carried: false, hidden: true });
  await expect(caption).toHaveCSS('opacity', '1');
  const after = await page.evaluate(() => ({ rng: window.__TEACUP__.game.exportRandom(),
    text: document.querySelector('.reading-copy').textContent, focus: document.activeElement.id }));
  expect(after).toEqual(before);
  expect(problems).toEqual([]);
});

for (const [phase, ms] of [['approach', 100], ['lift', 1450], ['carry', 2400], ['absent', 6800]]) {
  test(`Enter cancels during ${phase} immediately and subsequent readings start clean`, async ({ page, problems }) => {
    await freezeTextClock(page);
    await openTextReading(page);
    await page.locator('#game').focus();
    await stealText(page);
    await page.clock.runFor(ms);
    expect((await textState(page)).phase).toBe(phase);
    await page.keyboard.press('Enter');
    await expect(page.locator('#readingCaption')).not.toHaveAttribute('data-carried');
    await page.clock.runFor(32);
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(page.locator('#readingAnts')).toBeHidden();
    await stageTextReading(page);
    await page.clock.runFor(500);
    expect(await textState(page)).toMatchObject({ phase: 'idle', tried: false, carried: false });
    await expect(page.locator('#mainBtn')).toBeEnabled();
    expect(problems).toEqual([]);
  });
}

test('final reveal and idle eligibility exclude upgrade decisions; choices retain keyboard navigation', async ({ page, problems }) => {
  await freezeTextClock(page);
  await openTextReading(page, { offer: true, fortune: 'lie' });
  await page.clock.runFor(500);
  expect(await page.evaluate(() => window.__TEACUP__.ambient.stealText())).toBe(false);
  await expect(page.locator('#readingMischief')).toBeHidden();
  await page.locator('[data-choice="0"]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-choice="1"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.clock.runFor(32);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await stageTextReading(page, { fortune: 'lie' });
  await page.locator('#game').focus();
  await page.evaluate(() => { window.__TEACUP__.game.state.readingTime = 0; });
  // Let the preceding upgrade acknowledgment expire before timing this reading.
  // Its disappearance is a real geometry change, which restarts idle dwell.
  await page.clock.runFor(3000);
  expect((await textState(page)).eligible).toBe(false);
  await page.evaluate(() => { window.__TEACUP__.game.state.readingTime = 4.1; });
  await page.clock.runFor(500);
  expect(await textState(page)).toMatchObject({ phase: 'idle', tried: false });
  await page.clock.runFor(11_000);
  expect((await textState(page)).tried).toBe(false);
  await page.clock.runFor(1000);
  expect(await textState(page)).toMatchObject({ tried: true });
  expect(problems).toEqual([]);
});

for (const interruption of ['menu', 'resize', 'low', 'motion', 'blur', 'hidden', 'pause', 'offer', 'focus', 'pointer', 'scroll']) {
  test(`${interruption} restores carried text and clears the overlay`, async ({ page, problems }) => {
    await freezeTextClock(page);
    await openTextReading(page);
    await stealText(page);
    await page.clock.runFor(2200);
    expect((await textState(page)).carried).toBe(true);
    if (interruption === 'menu') await page.locator('#menuBtn').click();
    if (interruption === 'resize') await page.setViewportSize({ width: 400, height: 850 });
    if (interruption === 'low') await page.locator('#graphicsBtn').evaluate(e => e.click());
    if (interruption === 'motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    if (interruption === 'hidden') await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    if (interruption === 'pause') await page.evaluate(() => { window.__TEACUP__.game.state.phase = 'paused'; });
    if (interruption === 'offer') await page.evaluate(() => { window.__TEACUP__.game.state.offer = ['polished', 'strainer']; });
    if (interruption === 'focus') await page.locator('.reading-copy').focus();
    if (interruption === 'pointer') await page.locator('#readingPresentation').hover();
    if (interruption === 'scroll') await page.locator('.reading-copy').dispatchEvent('scroll');
    await page.clock.runFor(500);
    expect(await textState(page)).toMatchObject({ carried: false, hidden: true });
    await expect(page.locator('#readingCaption')).not.toHaveAttribute('data-carried');
    expect(await page.evaluate(() => window.__TEACUP__.ambient.stealText())).toBe(false);
    expect(problems).toEqual([]);
  });
}

test('idle time freezes while hidden and returns without catch-up', async ({ page, problems }) => {
  await freezeTextClock(page);
  await openTextReading(page);
  await page.clock.runFor(3500);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const before = (await textState(page)).idle;
  await page.clock.runFor(30_000);
  expect((await textState(page)).idle).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(100);
  expect((await textState(page)).idle).toBeLessThan(before + 0.2);
  expect(problems).toEqual([]);
});

test('ordinary play has no debug trigger and cramped readings have no decorative overlay', async ({ page, problems }) => {
  await page.goto('./?noOverlay');
  expect(await page.evaluate(() => !!window.__TEACUP__)).toBe(false);
  await openGame(page, '&view=compact&ambientSeed=7');
  // 800x450: the reading's words run down into where the lane would sit.
  await page.setViewportSize({ width: 800, height: 450 });
  await watchLane(page);
  await stageTextReading(page);
  expect(await measuredText(page)).toMatchObject({ eligible: false, geometry: null, laneHidden: true, hidden: true });
  await expect(page.locator('#readingMischief')).toBeHidden();
  expect(await page.evaluate(() => window.__TEACUP__.ambient.stealText())).toBe(false);
  await page.waitForTimeout(500); // well past the layout settling
  expect(await textState(page)).toMatchObject({ eligible: false, laneHidden: true });
  expect(await laneWasShown(page)).toBe(false);
  // The reading itself is all still there.
  await expect(page.locator('#readingTitle')).toBeVisible();
  await expect(page.locator('#mainBtn')).toBeEnabled();
  expect(problems).toEqual([]);
});

test('eligibility follows the measured space: the overlay shows with room and goes as soon as room is lost', async ({ page, problems }) => {
  await openGame(page, '&view=compact&ambientSeed=7');
  await page.setViewportSize({ width: 800, height: 600 });
  await stageTextReading(page);
  const lane = page.locator('#readingMischief');
  // Room to spare at this size, so this is a valid layout and not a cramped one.
  await expect.poll(() => textState(page)).toMatchObject({ measured: true, eligible: true, laneHidden: false });
  await expect(lane).toBeVisible();
  expect(await page.evaluate(() => {
    const a = document.getElementById('readingMischief').getBoundingClientRect();
    return [...document.querySelectorAll('.reading-copy > *')].every((e) => e.getBoundingClientRect().bottom <= a.top);
  })).toBe(true);

  // The viewport shrinks.
  await page.setViewportSize({ width: 800, height: 450 });
  await expect(lane).toBeHidden();
  expect(await measuredText(page)).toMatchObject({ eligible: false, geometry: null, laneHidden: true });

  // Back again: a cramped moment is not a permanent verdict.
  await page.setViewportSize({ width: 800, height: 600 });
  await expect.poll(() => textState(page)).toMatchObject({ measured: true, eligible: true, laneHidden: false });

  // The words reflow inside a panel that keeps its size.
  const panel = () => page.evaluate(() => document.getElementById('readingPresentation').getBoundingClientRect().height);
  const height = await panel();
  await page.locator('#readingSecrets').evaluate((e) => { e.style.minHeight = '140px'; });
  await expect(lane).toBeHidden();
  expect(await measuredText(page)).toMatchObject({ eligible: false, laneHidden: true });
  expect(await panel()).toBe(height);
  await page.locator('#readingSecrets').evaluate((e) => { e.style.minHeight = ''; });
  await expect.poll(() => textState(page)).toMatchObject({ measured: true, eligible: true, laneHidden: false });
  expect(problems).toEqual([]);
});

test('stopping the instance restores text, releases the surface and leaves no debug request pending', async ({ page, problems }) => {
  await freezeTextClock(page);
  await openTextReading(page);
  await stealText(page);
  await page.clock.runFor(2200);
  expect((await textState(page)).carried).toBe(true);
  await page.evaluate(() => window[Symbol.for('steeped-in-trouble')].stop());
  await expect(page.locator('#readingCaption')).not.toHaveAttribute('data-carried');
  await expect(page.locator('#readingAnts')).toHaveAttribute('width', '0');
  await expect(page.locator('#readingMischief')).toBeHidden();
  expect(await page.evaluate(() => window.__TEACUP__.ambient.stealText())).toBe(false);
  expect(problems).toEqual([]);
});
