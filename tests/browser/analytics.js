// Analytics on the production build, as served from the published address. Every
// request is answered here: the site comes from the local preview server, the
// tracker is a stub, and nothing can reach the real analytics service.
import { expect, test } from './fixtures.js';
import { checkpointRound } from './collection.js';

const SITE = 'https://libertaine.github.io/Steeped-in-Trouble/';
const TRACKER = 'https://cloud.umami.is/script.js';

const STUB = `(() => {
  const script = document.currentScript;
  window.__tracker = { calls: [], identified: false,
    attributes: Object.fromEntries([...script.attributes].map((a) => [a.name, a.value])) };
  window.umami = {
    track: (name, data) => { window.__tracker.calls.push(data === undefined ? [name] : [name, data]); },
    identify: () => { window.__tracker.identified = true; },
  };
})();`;

/**
 * Serve the published address from the local build.
 * @param {{ tracker?: 'stub' | 'blocked', visitor?: boolean, init?: () => void }} options
 *   `visitor: false` leaves the browser marked as automated, as it really is.
 */
async function publish(page, baseURL, { tracker = 'stub', visitor = true, init } = {}) {
  const local = new URL(baseURL).origin;
  const seen = { tracker: [], service: [], errors: [] };
  page.on('pageerror', (error) => seen.errors.push(error.message));
  await page.route('https://libertaine.github.io/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    try {
      // A separate request, so the local server sees its own host name in every browser.
      await route.fulfill({ response: await page.request.get(`${local}${pathname}`) });
    } catch {
      await route.abort().catch(() => {}); // the page closed mid-request
    }
  });
  await page.route(/^https:\/\/([\w-]+\.)*umami\.(is|dev)\//, (route) => {
    seen.service.push(route.request().url());
    return route.abort();
  });
  await page.route(TRACKER, (route) => {
    seen.tracker.push(route.request().url());
    return tracker === 'stub' ? route.fulfill({ contentType: 'text/javascript', body: STUB }) : route.abort();
  });
  if (visitor) await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  if (init) await page.addInitScript(init);
  return seen;
}

const trackerTags = (page) => page.locator(`script[src="${TRACKER}"]`).count();
const calls = (page) => page.evaluate(() => window.__tracker?.calls ?? null);
const named = async (page, name) => (await calls(page)).filter(([n]) => n === name);

/** A visitor's path: the title, the field guide, then the cup. */
async function startGame(page) {
  await page.locator('#titleContinueBtn').click();
  await page.locator('#overlayPrimaryBtn').click();
}

/** A real saved pot on the published origin, written by an untracked debug visit. */
async function savePot(page) {
  await page.goto(`${SITE}?debug&noOverlay`);
  await page.waitForFunction(() => window.__TEACUP__?.game);
  await checkpointRound(page);
}

/** Tracker-free checks: the page is working, and nothing was requested. */
async function expectUntracked(page, seen) {
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.locator('#game').waitFor({ state: 'attached' });
  expect(await trackerTags(page)).toBe(0);
  expect(await page.evaluate(() => typeof window.umami)).toBe('undefined');
  expect(seen.tracker).toEqual([]);
  expect(seen.service).toEqual([]);
}

export function analyticsTests() {
  test.use({ allowTrackerStub: true });

  test.describe('the gate', () => {
    test('the published page loads one configured tracker, with no game needed', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL);
      await page.goto(SITE);
      await page.waitForFunction(() => window.__tracker);
      expect(await page.evaluate(() => window.__tracker.attributes)).toEqual({
        src: TRACKER,
        defer: '',
        'data-website-id': '6f121a0f-990e-4457-8269-6f4833c81820',
        'data-domains': 'libertaine.github.io',
        'data-exclude-search': 'true',
        'data-exclude-hash': 'true',
        'data-do-not-track': 'true',
      });
      expect(await trackerTags(page)).toBe(1);
      expect(seen.tracker).toHaveLength(1);
      await page.locator('#titleContinueBtn').waitFor();
      // The tracker's own pageview is the visit. On the title, no custom event has been sent.
      expect(await calls(page)).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    test('the index.html address is the same page', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL);
      await page.goto(`${SITE}index.html`);
      await page.waitForFunction(() => window.__tracker);
      expect(seen.tracker).toHaveLength(1);
    });

    test('other paths on the host stay untracked', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL);
      await page.route('https://libertaine.github.io/Steeped-in-Trouble/preview/', async (route) => {
        await route.fulfill({ response: await page.request.get(baseURL) });
      });
      await page.goto(`${SITE}preview/`);
      await page.waitForFunction(() => document.readyState === 'complete');
      expect(seen.tracker).toEqual([]);
    });

    test('the local preview build stays untracked', async ({ page }) => {
      const seen = await publish(page, 'http://localhost/');
      await page.goto('./');
      await expectUntracked(page, seen);
    });

    test('?analytics=off prevents the tracker and every request', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL);
      await page.goto(`${SITE}?analytics=off`);
      await expectUntracked(page, seen);
      await startGame(page);
      await page.waitForFunction(() => document.body.dataset.phase === 'playing');
      await page.waitForTimeout(500);
      await expectUntracked(page, seen);
      expect(seen.errors).toEqual([]);
    });

    for (const query of ['?debug', '?noOverlay', '?seed=7', '?tea=mushroom']) {
      test(`the ${query} scenario stays untracked`, async ({ page, baseURL }) => {
        const seen = await publish(page, baseURL);
        await page.goto(`${SITE}${query}`);
        await expectUntracked(page, seen);
      });
    }

    test('an automated browser stays untracked even on the published page', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL, { visitor: false });
      await page.goto(SITE);
      await expectUntracked(page, seen);
    });

    test('Do Not Track prevents the tracker', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL, {
        init: () => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }),
      });
      await page.goto(SITE);
      await expectUntracked(page, seen);
    });
  });

  test.describe('the events', () => {
    test('a new game counts once, through pause and Tea Break', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL);
      await page.goto(SITE);
      await page.locator('#titleContinueBtn').click();
      await expect(page.locator('#overlayPrimaryBtn')).toBeVisible();
      expect(await calls(page)).toEqual([]); // the instructions are not a start
      await page.locator('#overlayPrimaryBtn').click();
      await page.waitForFunction(() => document.body.dataset.phase === 'playing');
      await expect.poll(() => calls(page)).toEqual([['game_start'], ['round_milestone', { round: 1 }]]);

      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => document.body.dataset.phase === 'paused');
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => document.body.dataset.phase === 'playing');
      await page.locator('#menuBtn').click();
      await expect(page.locator('#teaBreak')).toBeVisible();
      await page.locator('#closeBreak').click();
      await page.waitForFunction(() => document.body.dataset.phase === 'playing');
      expect(await calls(page)).toEqual([['game_start'], ['round_milestone', { round: 1 }]]);
      expect(await page.evaluate(() => window.__tracker.identified)).toBe(false);
      expect(seen.errors).toEqual([]);
    });

    test('continuing a saved pot counts once, with no earlier milestones', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL);
      await savePot(page);
      const saved = await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'));
      const keys = await page.evaluate(() => Object.keys(localStorage).sort());
      await page.goto(SITE);
      await page.waitForFunction(() => window.__tracker);
      await page.locator('#titleContinueBtn').click();
      await expect(page.locator('#overlayPrimaryBtn')).toHaveText(/CONTINUE YOUR POT/);
      expect(await calls(page)).toEqual([]);
      await page.locator('#overlayPrimaryBtn').click();
      await page.waitForFunction(() => document.body.dataset.phase === 'reading');
      await expect.poll(() => calls(page)).toEqual([['game_start']]);
      // The save, and everything else this browser keeps, is exactly as the game left it.
      expect(await page.evaluate(() => localStorage.getItem('steeped-in-trouble:pot-save'))).toBe(saved);
      expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(keys);
      expect(seen.errors).toEqual([]);
    });

    test('replacing a saved pot starts one game at round 1', async ({ page, baseURL }) => {
      await publish(page, baseURL);
      await savePot(page);
      await page.goto(SITE);
      await page.waitForFunction(() => window.__tracker);
      await page.locator('#titleContinueBtn').click();
      await page.locator('#overlayNewPotBtn').click();
      expect(await calls(page)).toEqual([]); // the question is not an answer
      await page.locator('#confirmPotBtn').click();
      await page.waitForFunction(() => document.body.dataset.phase === 'playing');
      await expect.poll(() => calls(page)).toEqual([['game_start'], ['round_milestone', { round: 1 }]]);
    });

    test('practice sessions add no events', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL);
      await page.goto(SITE);
      await startGame(page);
      await expect.poll(() => calls(page)).toHaveLength(2);
      await page.locator('#menuBtn').click();
      await page.locator('#breakCollectionBtn').click();
      await page.locator('[data-job="teaRun"]').click();
      await expect(page.locator('#practiceBar')).toBeVisible();
      await page.waitForTimeout(500);
      await page.locator('#backPotBtn').click();
      await page.waitForTimeout(250);
      expect(await calls(page)).toEqual([['game_start'], ['round_milestone', { round: 1 }]]);
      expect(seen.errors).toEqual([]);
    });
  });

  test.describe('engagement', () => {
    // The tracked clock runs five times as fast, so this takes seconds, not minutes.
    const fastClock = () => {
      const real = performance.now.bind(performance);
      performance.now = () => real() * 5;
      window.__focused = true;
      document.hasFocus = () => window.__focused;
    };

    /** Keep a player's hands on the keys, without any of the debug hooks. Losing just means brewing again. */
    async function playFor(page, ms) {
      const end = Date.now() + ms;
      await page.keyboard.down('Space');
      while (Date.now() < end) {
        const phase = await page.evaluate(() => document.body.dataset.phase);
        if (phase === 'gameover') await page.keyboard.press('Enter');
        else if (phase === 'reading') await page.keyboard.press('Digit1');
        await page.keyboard.press('ArrowRight', { delay: 150 });
        await page.waitForTimeout(250);
      }
    }

    test('foreground play counts, unfocused time does not, and nothing catches up', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL, { init: fastClock });
      await page.goto(`${SITE}?graphics=low`);
      await startGame(page);
      await expect.poll(() => calls(page)).toHaveLength(2);

      await page.evaluate(() => { window.__focused = false; });
      await playFor(page, 8_000); // 40 tracked seconds, past the first threshold
      expect(await named(page, 'engaged_30s')).toEqual([]);

      await page.evaluate(() => { window.__focused = true; });
      await playFor(page, 2_000);
      expect(await named(page, 'engaged_30s')).toEqual([]); // not 40 + 10

      await expect(async () => {
        await playFor(page, 1_000);
        expect(await named(page, 'engaged_30s')).toEqual([['engaged_30s']]);
      }).toPass({ timeout: 45_000 });
      expect(seen.errors).toEqual([]);
    });
  });

  test.describe('a blocked tracker', () => {
    test('the game starts, plays and saves anyway, with no second attempt', async ({ page, baseURL }) => {
      const seen = await publish(page, baseURL, { tracker: 'blocked' });
      await page.goto(SITE);
      await startGame(page);
      await page.waitForFunction(() => document.body.dataset.phase === 'playing');
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => document.body.dataset.phase === 'paused');
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => document.body.dataset.phase === 'playing');
      await page.keyboard.down('Space');
      await page.waitForTimeout(1_500);
      await page.keyboard.up('Space');
      expect(seen.tracker).toHaveLength(1);
      expect(await trackerTags(page)).toBe(1);
      expect(await page.evaluate(() => typeof window.umami)).toBe('undefined');
      expect(seen.service).toEqual([]);
      expect(seen.errors).toEqual([]);
      expect(await page.evaluate(() => {
        localStorage.setItem('steeped-in-trouble:graphics', 'high');
        return localStorage.getItem('steeped-in-trouble:graphics');
      })).toBe('high');
    });
  });

  test.describe('the disclosure', () => {
    test('the Tea Break explains the analytics and how to turn them off', async ({ page, baseURL }) => {
      await publish(page, baseURL);
      await page.goto(SITE);
      await startGame(page);
      await page.locator('#menuBtn').click();
      const notice = page.locator('#analyticsNotice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('cookie-free Umami analytics');
      await expect(notice).toContainText('?analytics=off');
      expect(await page.locator('#teaBreak').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    });
  });
}
