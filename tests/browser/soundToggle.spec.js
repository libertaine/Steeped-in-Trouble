import { finishCup } from './cup.js';
import { expect, openGame, test } from './fixtures.js';

// The quick sound switch: M, the speakers, and the saved choice. Audio is
// inspected through the read-only debug snapshot and by counting AudioContexts,
// never by listening for sound.

const SOUND_KEY = 'steeped-in-trouble:sound';
const audio = (page) => page.evaluate(() => window.__TEACUP__.audio());
const contexts = (page) => page.evaluate(() => window.__audioContexts ?? 0);
const speakers = ['#titleSoundBtn', '#headerSoundBtn', '#breakSoundBtn'];

/** Count every AudioContext the page creates. */
async function countContexts(page) {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    if (!Original) return;
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__audioContexts = (window.__audioContexts ?? 0) + 1;
      }
    };
  });
}

async function expectSound(page, on) {
  await expect.poll(async () => (await audio(page)).enabled).toBe(on);
  for (const selector of speakers) {
    await expect(page.locator(selector)).toHaveAttribute('aria-label', on ? 'Mute audio' : 'Unmute audio');
    await expect(page.locator(selector)).toHaveAttribute('data-muted', String(!on));
  }
  await expect(page.locator('#soundBtn')).toHaveText(`Sound: ${on ? 'on' : 'off'}`);
}

/** Send a synthetic M with modifiers: real Ctrl/Alt/Meta+M can be browser shortcuts. */
const modifiedM = (page) => page.evaluate(() => {
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', [modifier]: true, bubbles: true }));
  }
});

const cup = (page) => page.evaluate(() => {
  const s = window.__TEACUP__.game.state;
  return { phase: s.phase, milk: s.milkLeft, sugar: s.sugarLeft };
});

test('M mutes and unmutes once per press on the title, instructions, cup, pause and reading', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full', { onboarding: true });
  await expect(page.locator('#titleContinueBtn')).toBeEnabled();
  await expectSound(page, false);
  await page.keyboard.press('m');
  await expectSound(page, true);
  await expect(page.locator('#arcadeSplash')).toBeVisible();
  // Holding M toggles once; the auto-repeat that follows does nothing.
  await page.keyboard.down('m');
  await page.keyboard.down('m');
  await page.keyboard.down('m');
  await page.keyboard.up('m');
  await expectSound(page, false);
  await modifiedM(page);
  await page.keyboard.press('Shift+M');
  await expectSound(page, false);

  await page.keyboard.press('Enter');
  await expect(page.locator('#instructionOverlay')).toBeVisible();
  await page.keyboard.press('m');
  await expectSound(page, true);
  await expect(page.locator('#instructionOverlay')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = 1000; });

  // M is no longer milk; Q and ↑ still are, and S still sugars.
  const before = await cup(page);
  await page.keyboard.press('m');
  await expectSound(page, false);
  expect(await cup(page)).toEqual(before);
  await page.keyboard.press('q');
  await expect.poll(async () => (await cup(page)).milk).toBe(before.milk - 1);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await cup(page)).milk).toBe(before.milk - 2);
  await page.keyboard.press('s');
  await expect.poll(async () => (await cup(page)).sugar).toBe(before.sugar - 1);
  await expectSound(page, false);

  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('m');
  await expectSound(page, true);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');

  await finishCup(page);
  await page.keyboard.press('m');
  await expectSound(page, false);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'reading');
  expect(problems).toEqual([]);
});

test('speakers show the real state and answer pointer, Enter and Space without leaving the screen', async ({ page, problems }) => {
  await openGame(page, '&seed=42&view=full', { onboarding: true });
  await expect(page.locator('#titleContinueBtn')).toBeEnabled();
  const title = page.locator('#titleSoundBtn');
  await title.click();
  await expectSound(page, true);
  await title.focus();
  await page.keyboard.press('Enter');
  await expectSound(page, false);
  await page.keyboard.press('Space');
  await expectSound(page, true);
  await expect(page.locator('#arcadeSplash')).toBeVisible();
  await expect(page.locator('#instructionOverlay')).toBeHidden();
  // Holding Enter on the speaker toggles once, and never slips past the title.
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expectSound(page, false);
  await expect(page.locator('#arcadeSplash')).toBeVisible();

  await page.locator('#titleContinueBtn').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = 1000; });

  // A click on the header speaker returns the keyboard to the cup: the next Space is steam, not another toggle.
  const header = page.locator('#headerSoundBtn');
  await header.click();
  await expectSound(page, true);
  await expect(page.locator('#game')).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__TEACUP__.game.state.shots.length)).toBeGreaterThan(0);
  await expectSound(page, true);
  // Keyboard users keep focus on it, with a visible focus ring.
  await header.focus();
  await page.keyboard.press('Enter');
  await expectSound(page, false);
  await expect(header).toBeFocused();
  await page.keyboard.press('Space');
  await expectSound(page, true);

  // The Tea Break has its own speaker, in step with the Settings toggle.
  await page.locator('#menuBtn').click();
  await expect(page.locator('#teaBreak')).toBeVisible();
  const snapshot = await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state));
  await page.locator('#breakSoundBtn').click();
  await expectSound(page, false);
  await page.getByText('Controls & Settings', { exact: true }).click();
  await page.locator('#soundBtn').click();
  await expectSound(page, true);
  await page.keyboard.press('m');
  await expectSound(page, false);
  // A focused form control keeps its keys.
  await page.locator('#onScreenControls').focus();
  await page.keyboard.press('m');
  await expectSound(page, false);
  await expect(page.locator('#onScreenControls')).toHaveValue('auto');
  expect(await page.evaluate(() => JSON.stringify(window.__TEACUP__.game.state))).toBe(snapshot);
  await page.locator('#closeBreak').click();
  await expect(page.locator('#teaBreak')).toBeHidden();

  // Nor does typing in a text field (the game has none of its own; an embedder might).
  await page.evaluate(() => {
    const field = Object.assign(document.createElement('input'), { id: 'probe' });
    const editable = Object.assign(document.createElement('div'), { id: 'editable', contentEditable: 'true' });
    document.body.append(field, editable);
  });
  await page.locator('#probe').focus();
  await page.keyboard.type('mmm');
  await expect(page.locator('#probe')).toHaveValue('mmm');
  await page.locator('#editable').focus();
  await page.keyboard.type('m');
  await expectSound(page, false);
  expect(problems).toEqual([]);
});

test('the choice survives reloads, waits for a gesture, and never makes a second AudioContext', async ({ page, problems }) => {
  await countContexts(page);
  await openGame(page);
  await page.evaluate(([key]) => {
    localStorage.setItem(key, 'on');
    localStorage.setItem('steeped-in-trouble:view', 'compact');
    localStorage.setItem('steeped-in-trouble:controls', '{"touch":"classic","autoSteam":true}');
  }, [SOUND_KEY]);
  await page.reload();
  await page.waitForFunction(() => window.__TEACUP__?.game);
  // Remembered as on, but nothing starts on load.
  await expectSound(page, true);
  await page.waitForTimeout(400);
  expect(await audio(page)).toEqual({ enabled: true, unlocked: false, context: null, master: null });
  expect(await contexts(page)).toBe(0);
  // The first gesture lets it start.
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await audio(page)).context).not.toBeNull();
  expect(await audio(page)).toMatchObject({ enabled: true, unlocked: true, master: 1 });
  expect(await contexts(page)).toBe(1);

  // Muting silences the master volume at once; unmuting restores it with the same context.
  await page.keyboard.press('m');
  expect(await audio(page)).toMatchObject({ enabled: false, master: 0 });
  await page.waitForTimeout(300);
  await page.keyboard.press('m');
  expect(await audio(page)).toMatchObject({ enabled: true, master: 1 });
  await page.keyboard.press('m');
  expect(await contexts(page)).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), SOUND_KEY)).toBe('off');
  // Other preferences are untouched.
  expect(await page.evaluate(() => [localStorage.getItem('steeped-in-trouble:view'), localStorage.getItem('steeped-in-trouble:controls')]))
    .toEqual(['compact', '{"touch":"classic","autoSteam":true}']);

  // Off survives a reload, and a muted player's gestures create nothing.
  await page.reload();
  await page.waitForFunction(() => window.__TEACUP__?.game);
  await expectSound(page, false);
  await page.keyboard.press('Enter');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  expect(await audio(page)).toMatchObject({ enabled: false, context: null });
  expect(await contexts(page)).toBe(0);

  // Unreadable values are off; nothing breaks.
  await page.evaluate((key) => localStorage.setItem(key, '{"muted":false}'), SOUND_KEY);
  await page.reload();
  await page.waitForFunction(() => window.__TEACUP__?.game);
  await expectSound(page, false);
  expect(problems).toEqual([]);
});

test('losing focus or hiding the tab pauses the cup and leaves the sound choice alone', async ({ page, problems }) => {
  await openGame(page, '&seed=42');
  await page.keyboard.press('Enter');
  await page.keyboard.press('m');
  await expectSound(page, true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  expect(await audio(page)).toMatchObject({ enabled: true, master: 1 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await audio(page)).toMatchObject({ enabled: true, master: 1 });
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.keyboard.press('m');
  await expectSound(page, false);
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expectSound(page, false);
  expect(problems).toEqual([]);
});
