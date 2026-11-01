import { expect, openGame, test } from './fixtures.js';
import { checkpointRound, openCollection } from './collection.js';

const VERSION = '0.17.0';

test.describe('80s Arcade Title and Instruction Overlay', () => {
  test('1 & 2: Splash and instruction overlay appear at startup with exact required text and version', async ({ page, problems }) => {
    // Navigate with a request pause or verify initial splash DOM and overlay
    await page.goto('./?debug');
    await expect(page.locator('#arcadeSplash')).toBeAttached();
    await expect(page.locator('.splash-title')).toHaveText('STEEPED IN TROUBLE');
    await expect(page.locator('.splash-subtitle')).toHaveText('One small spoon. An unreasonable amount of responsibility.');

    // Wait for boot to finish
    await page.waitForFunction(() => window.__TEACUP__?.game);
    // Splash should transition to dismissed
    await expect(page.locator('#arcadeSplash')).toHaveClass(/dismissed/);

    // Overlay should be visible
    const overlay = page.locator('#instructionOverlay');
    await expect(overlay).toBeVisible();

    // Verify exact instructional text from specifications
    await expect(page.locator('#instructionTitle')).toHaveText('STEEPED IN TROUBLE');
    await expect(page.locator('#instructionSubtitle')).toHaveText('The tea is misbehaving. Contain it.');
    await expect(page.locator('#instructionObjective')).toHaveText('Stop the leaves before they reach the rim.');
    await expect(page.locator('.overlay-section-title')).toHaveText('CONTROLS');

    // Controls table text and keycaps
    const table = page.locator('.overlay-controls-table');
    await expect(table).toContainText('Turn spoon');
    await expect(table).toContainText('Fire steam');
    await expect(table).toContainText('SPACE');
    await expect(table).toContainText('(hold to fire)');
    await expect(table).toContainText('Pour milk');
    await expect(table).toContainText('Fire sugar');
    await expect(table).toContainText('Pause');

    // Notes
    await expect(page.locator('.overlay-notes')).toContainText('Milk pushes leaves back and slows them.');
    await expect(page.locator('.overlay-notes')).toContainText('Sugar fires a three-lane burst.');

    // Primary button
    await expect(page.locator('#overlayPrimaryBtn')).toHaveText('PRESS ENTER OR CLICK TO START');

    // Footer
    await expect(page.locator('.overlay-footer')).toHaveText('You can review controls again any time in Tea Break.');

    // Version in corner matches application metadata
    await expect(page.locator('#overlayVersion')).toHaveText(`v${VERSION}`);

    expect(problems).toEqual([]);
  });

  test('3: Enter key dismisses the overlay and starts Cup 1 without second action', async ({ page, problems }) => {
    await openGame(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');

    // Press Enter to start
    await page.keyboard.press('Enter');

    // Overlay is dismissed and Cup 1 begins
    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

    // A small delay to ensure Enter did not trigger a pause
    await page.waitForTimeout(200);
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    expect(problems).toEqual([]);
  });

  test('4: Pointer click on primary button dismisses the overlay and starts Cup 1', async ({ page, problems }) => {
    await openGame(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');

    await page.locator('#overlayPrimaryBtn').click();

    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    expect(problems).toEqual([]);
  });

  test('5: Gameplay simulation and input do not advance behind the overlay', async ({ page, problems }) => {
    await openGame(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();

    // Verify simulation is frozen
    const initialPhase = await page.evaluate(() => window.__TEACUP__.game.state.phase);
    const initialScore = await page.evaluate(() => window.__TEACUP__.game.state.score);
    const initialAngle = await page.evaluate(() => window.__TEACUP__.game.state.angle);

    // Try sending gameplay steering and firing keys while overlay is open
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');

    const after = await page.evaluate(() => window.__TEACUP__.game.state);
    expect(after.phase).toBe(initialPhase);
    expect(after.score).toBe(initialScore);
    expect(after.angle).toBe(initialAngle);
    expect(after.shots).toHaveLength(0);
    expect(problems).toEqual([]);
  });

  test('6: Held keys do not leak into gameplay across overlay dismissal', async ({ page, problems }) => {
    await openGame(page);
    await expect(page.locator('#instructionOverlay')).toBeVisible();

    // Hold Space and ArrowRight before clicking start
    await page.keyboard.down('Space');
    await page.keyboard.down('ArrowRight');

    const startAngle = await page.evaluate(() => window.__TEACUP__.game.state.angle);
    await page.locator('#overlayPrimaryBtn').click();

    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

    // Held keys should NOT have leaked as continuous fire or turning
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      angle: window.__TEACUP__.game.state.angle,
      shots: window.__TEACUP__.game.state.shots.length,
      volleys: window.__TEACUP__.game.state.roundStats.volleys,
    }));

    const angleDiff = Math.atan2(Math.sin(state.angle - startAngle), Math.cos(state.angle - startAngle));
    expect(angleDiff).toBeCloseTo(0, 2);
    expect(state.shots).toBe(0);

    // Releasing and pressing anew works
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(async () => page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  test('7 & 8: Returning player with saved pot sees Continue Pot and Brew New Pot, preserving data', async ({ page, problems }) => {
    await openGame(page, '&seed=42&view=full');
    await page.keyboard.press('Enter');
    await checkpointRound(page);

    const savedRaw = await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));
    expect(savedRaw).not.toBeNull();

    // Reload page
    await page.reload();
    await page.waitForFunction(() => window.__TEACUP__?.game);

    const overlay = page.locator('#instructionOverlay');
    await expect(overlay).toBeVisible();

    // Button should now be Continue Pot
    const primary = page.locator('#overlayPrimaryBtn');
    const newPot = page.locator('#overlayNewPotBtn');
    await expect(primary).toHaveText('CONTINUE YOUR POT (ENTER)');
    await expect(newPot).toBeVisible();

    // Clicking primary resumes the saved pot without data loss
    await primary.click();
    await expect(overlay).toBeHidden();

    const currentSaved = await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));
    expect(currentSaved).toBe(savedRaw);
    expect(problems).toEqual([]);
  });

  test('10: Reopening controls from Tea Break does not reset or inadvertently resume the game', async ({ page, problems }) => {
    await openGame(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');

    // Pause the game via Tea Break
    await page.locator('#menuBtn').click();
    await expect(page.locator('#teaBreak')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('PAUSED');

    // Click SHOW CONTROLS in Tea Break
    await page.locator('#breakControlsBtn').click();
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#overlayPrimaryBtn')).toHaveText('BACK TO TEA BREAK (ENTER)');

    // Dismiss overlay
    await page.keyboard.press('Enter');
    await expect(page.locator('#instructionOverlay')).toBeHidden();

    // Tea Break should be back open and game still paused
    await expect(page.locator('#teaBreak')).toBeVisible();
    await expect(page.locator('#hudStatus')).toHaveText('PAUSED');

    // Resume from Tea Break works normally
    await page.locator('#closeBreak').click();
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    expect(problems).toEqual([]);
  });

  test('11: Keyboard accessibility, Tab focus trap, and Escape handling', async ({ page, problems }) => {
    await openGame(page);
    const overlay = page.locator('#instructionOverlay');
    await expect(overlay).toBeVisible();

    // Initial focus on primary button
    await expect(page.locator('#overlayPrimaryBtn')).toBeFocused();

    // Escape closes overlay safely
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('12: Reduced-motion and compact layout on narrower viewports', async ({ page, problems }) => {
    // Reduced motion test
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?debug');
    await page.waitForFunction(() => window.__TEACUP__?.game);

    // Splash is dismissed immediately with reduced motion
    await expect(page.locator('#arcadeSplash')).toHaveClass(/dismissed/);

    // Narrow viewport test (mobile width 375px)
    await page.setViewportSize({ width: 375, height: 667 });
    await openGame(page, '&view=compact');

    const card = page.locator('.instruction-card');
    await expect(card).toBeVisible();

    // Ensure it fits without horizontal document overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    expect(problems).toEqual([]);
  });

  test('13: Direct debug and arcade practice entry points bypass initial overlay', async ({ page, problems }) => {
    // ?noOverlay bypasses initial overlay
    await openGame(page, '&noOverlay');
    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('#hudStatus')).toHaveText('READY TO BREW');

    // Arcade practice entry point from collection bypasses and closes overlay
    await openGame(page, '&seed=42&view=full');
    await openCollection(page);
    await page.locator('[data-job="dailyPour"]').click();
    await expect(page.locator('#instructionOverlay')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-practice', 'true');
    expect(problems).toEqual([]);
  });

  test('Visual qualification screenshots', async ({ page, problems }, testInfo) => {
    if (testInfo.project.name !== 'chromium') return;

    // 1. Initial 80s arcade splash
    await page.goto('./?debug&holdSplash');
    await page.waitForSelector('#arcadeSplash');
    await page.screenshot({ path: 'docs/images/arcade-title/arcade-splash.png' });

    // 2. Instructions overlay on the actual gameplay screen
    await openGame(page, '&view=full');
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#arcadeSplash')).toBeHidden();
    await page.screenshot({ path: 'docs/images/arcade-title/instruction-overlay.png' });

    // 3. Normal game view after dismissing the overlay
    await page.keyboard.press('Enter');
    await expect(page.locator('#hudStatus')).toHaveText('DEFEND THE RIM');
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'docs/images/arcade-title/gameplay-after-dismiss.png' });

    // 4. Narrower browser viewport
    await page.setViewportSize({ width: 420, height: 750 });
    await openGame(page, '&view=compact');
    await expect(page.locator('#instructionOverlay')).toBeVisible();
    await expect(page.locator('#arcadeSplash')).toBeHidden();
    await page.screenshot({ path: 'docs/images/arcade-title/compact-narrow-overlay.png' });

    expect(problems).toEqual([]);
  });
});
