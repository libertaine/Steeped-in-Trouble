// Decides whether this page may be counted, and loads the Umami tracker once if so.
// See docs/ANALYTICS.md. Removing this folder and its calls in main.js removes analytics.
import { createAnalytics } from './analytics.js';

export const WEBSITE_ID = '6f121a0f-990e-4457-8269-6f4833c81820';
export const TRACKER_SRC = 'https://cloud.umami.is/script.js';
const HOSTNAME = 'libertaine.github.io';
const PATHS = new Set(['/Steeped-in-Trouble/', '/Steeped-in-Trouble/index.html']);

// Every URL parameter that sets up a test or replays a chosen game. Player
// preferences (view, touch, autosteam, graphics) are listed in the unit test.
export const SCENARIO_PARAMS = Object.freeze(['debug', 'noOverlay', 'holdSplash', 'arcade', 'crossing', 'day', 'cup',
  'fortune', 'boss', 'visit', 'progress', 'strange', 'ambientSeed', 'ambientAnts', 'seed', 'tea']);

function doNotTrack({ navigator: nav, doNotTrack: fromWindow }) {
  const signal = fromWindow || nav.doNotTrack || nav.msDoNotTrack;
  return signal === 1 || signal === '1' || signal === 'yes';
}

export function analyticsAllowed({ win, production }) {
  if (!production) return false;
  const { hostname, pathname, search } = win.location;
  if (hostname !== HOSTNAME || !PATHS.has(pathname)) return false;
  const params = new URLSearchParams(search);
  if (params.get('analytics')?.trim().toLowerCase() === 'off') return false;
  if (SCENARIO_PARAMS.some((name) => params.has(name))) return false;
  if (win.navigator.webdriver) return false; // an automated browser is never a visitor
  return !doNotTrack(win);
}

/**
 * Add the tracker to the page: one element, no retries. Its automatic pageview
 * is the only visit count. Events raised before it arrives wait for it (the
 * contract limits them to a handful) and are dropped if it fails to load.
 */
export function loadTracker(win) {
  const script = win.document.createElement('script');
  const pending = [];
  let failed = false;
  const deliver = (name, data) => {
    try {
      win.umami.track(name, data)?.catch?.(() => {});
    } catch {
      // The tracker's trouble stays the tracker's.
    }
  };
  script.addEventListener('load', () => {
    if (typeof win.umami?.track !== 'function') failed = true;
    else for (const [name, data] of pending) deliver(name, data);
    pending.length = 0;
  });
  script.addEventListener('error', () => {
    failed = true;
    pending.length = 0;
  });
  script.defer = true;
  script.src = TRACKER_SRC;
  for (const [name, value] of [['website-id', WEBSITE_ID], ['domains', HOSTNAME], ['exclude-search', 'true'],
    ['exclude-hash', 'true'], ['do-not-track', 'true']]) script.setAttribute(`data-${name}`, value);
  win.document.head.append(script);
  return {
    send(name, data) {
      if (failed) return;
      if (typeof win.umami?.track === 'function') deliver(name, data);
      else pending.push([name, data]);
    },
  };
}

/** The game's single entry point. Returns null, and does nothing, on any untracked page. */
export function startAnalytics({ win, production }) {
  try {
    if (!analyticsAllowed({ win, production })) return null;
    const { send } = loadTracker(win);
    const analytics = createAnalytics({ send, now: () => win.performance.now(),
      foreground: () => win.document.visibilityState === 'visible' && win.document.hasFocus() });
    // Only the moment is kept: never which key or where.
    const noteInput = () => analytics.noteInput();
    const options = { capture: true, passive: true };
    win.addEventListener('keydown', noteInput, options);
    win.addEventListener('pointerdown', noteInput, options);
    return Object.assign(analytics, { dispose() {
      win.removeEventListener('keydown', noteInput, options);
      win.removeEventListener('pointerdown', noteInput, options);
    } });
  } catch {
    return null;
  }
}
