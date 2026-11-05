import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIVE_IDLE_MS, createAnalytics, ENGAGEMENT_THRESHOLDS, MAX_FRAME_GAP_MS, PASSIVE_IDLE_MS, ROUND_MILESTONES }
  from '../../src/analytics/analytics.js';
import { analyticsAllowed, loadTracker, SCENARIO_PARAMS, startAnalytics, TRACKER_SRC, WEBSITE_ID }
  from '../../src/analytics/tracker.js';
import { createGame } from '../../src/core/game.js';
import { createSessions } from '../../src/core/sessions.js';
import { createLocalProgress } from '../../src/storage/localProgress.js';
import { checkpointAfter, leaveReading } from '../support/checkpoints.js';

const SITE = 'https://libertaine.github.io/Steeped-in-Trouble/';

/** Just enough of a browser for the gate and the loader, with no network at all. */
function fakeWindow(url = SITE, { nav = {}, win = {} } = {}) {
  const { hostname, pathname, search } = new URL(url);
  const appended = [], listeners = new Map();
  return {
    location: { hostname, pathname, search },
    navigator: { webdriver: false, ...nav },
    performance: { now: () => 0 },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    listeners,
    appended,
    document: {
      visibilityState: 'visible',
      hasFocus: () => true,
      createElement: () => {
        const handlers = {}, attributes = {};
        return { attributes, addEventListener: (type, fn) => { handlers[type] = fn; }, fire: (type) => handlers[type]?.(),
          setAttribute: (name, value) => { attributes[name] = value; } };
      },
      head: { append: (element) => appended.push(element) },
    },
    ...win,
  };
}
const allowed = (url, options) => analyticsAllowed({ win: fakeWindow(url, options), production: true });

/** An adapter on a controllable monotonic clock, with its sent events recorded. */
function harness({ foreground = () => true } = {}) {
  const sent = [], clock = { time: 1000 };
  const analytics = createAnalytics({ send: (name, data) => sent.push(data ? [name, data] : [name]),
    now: () => clock.time, foreground: () => foreground() });
  /** Advance by whole frames, reporting the same phase on each. */
  const play = (ms, phase = 'playing', { open = true, frameMs = 50, input = false } = {}) => {
    for (let t = 0; t < ms; t += frameMs) {
      clock.time += frameMs;
      if (input) analytics.noteInput();
      analytics.frame(phase, open);
    }
  };
  const names = () => sent.map(([name]) => name);
  return { analytics, sent, clock, play, names };
}

describe('analytics gate', () => {
  it('allows only the production build on the exact published pages', () => {
    expect(allowed(SITE)).toBe(true);
    expect(allowed(`${SITE}index.html`)).toBe(true);
    expect(analyticsAllowed({ win: fakeWindow(SITE), production: false })).toBe(false);
    for (const url of ['https://libertaine.github.io/', 'https://libertaine.github.io/Steeped-in-Trouble',
      'https://libertaine.github.io/Steeped-in-Trouble/other.html', 'https://libertaine.github.io/steeped-in-trouble/',
      'https://libertaine.github.io.example.com/Steeped-in-Trouble/', 'https://example.github.io/Steeped-in-Trouble/']) {
      expect(allowed(url), url).toBe(false);
    }
  });

  it('keeps localhost and preview hosts untracked', () => {
    for (const host of ['http://localhost:4173', 'http://127.0.0.1:4173', 'http://192.168.1.5:5173']) {
      expect(allowed(`${host}/Steeped-in-Trouble/`), host).toBe(false);
    }
  });

  it('honors ?analytics=off and only that', () => {
    expect(allowed(`${SITE}?analytics=off`)).toBe(false);
    expect(allowed(`${SITE}?analytics=OFF`)).toBe(false);
    expect(allowed(`${SITE}?view=compact&analytics=off`)).toBe(false);
    expect(allowed(`${SITE}?analytics=on`)).toBe(true);
    expect(allowed(`${SITE}?view=compact&touch=easy&autosteam=on&graphics=low&utm_source=forum`)).toBe(true);
  });

  it('keeps every debug and test scenario untracked', () => {
    for (const name of SCENARIO_PARAMS) expect(allowed(`${SITE}?${name}=1`), name).toBe(false);
    expect(allowed(`${SITE}?debug&noOverlay`)).toBe(false);
  });

  it('knows every URL parameter the game reads: a new one must choose a side', () => {
    const preferences = ['analytics', 'view', 'touch', 'autosteam', 'graphics'];
    const files = readdirSync('src', { recursive: true }).filter((file) => file.endsWith('.js'));
    const read = new Set();
    for (const file of files) {
      const text = readFileSync(join('src', file), 'utf8');
      for (const [, name] of text.matchAll(/params\??\.(?:get|has)\('(\w+)'\)/g)) read.add(name);
      if (/seedFromUrl\(params\)/.test(text)) read.add('seed');
      for (const [, name] of text.matchAll(/seedFromUrl\(params, '(\w+)'\)/g)) read.add(name);
    }
    expect(read.size).toBeGreaterThan(10);
    for (const name of read) expect([...SCENARIO_PARAMS, ...preferences], name).toContain(name);
  });

  it('keeps automated browsers untracked', () => {
    expect(allowed(SITE, { nav: { webdriver: true } })).toBe(false);
  });

  it('respects Do Not Track wherever the browser reports it', () => {
    expect(allowed(SITE, { nav: { doNotTrack: '1' } })).toBe(false);
    expect(allowed(SITE, { nav: { doNotTrack: 'yes' } })).toBe(false);
    expect(allowed(SITE, { nav: { msDoNotTrack: '1' } })).toBe(false);
    expect(allowed(SITE, { win: { doNotTrack: '1' } })).toBe(false);
    expect(allowed(SITE, { nav: { doNotTrack: '0' } })).toBe(true);
    expect(allowed(SITE, { nav: { doNotTrack: null } })).toBe(true);
  });
});

describe('tracker loading', () => {
  it('adds one correctly configured script on a tracked page', () => {
    const win = fakeWindow();
    const analytics = startAnalytics({ win, production: true });
    expect(analytics).not.toBeNull();
    expect(win.appended).toHaveLength(1);
    const [script] = win.appended;
    expect(script.src).toBe(TRACKER_SRC);
    expect(script.defer).toBe(true);
    expect(script.attributes).toEqual({
      'data-website-id': WEBSITE_ID,
      'data-domains': 'libertaine.github.io',
      'data-exclude-search': 'true',
      'data-exclude-hash': 'true',
      'data-do-not-track': 'true',
    });
    expect(WEBSITE_ID).toBe('6f121a0f-990e-4457-8269-6f4833c81820');
    analytics.dispose();
    expect(win.listeners.size).toBe(0);
  });

  it('touches nothing at all on an untracked page', () => {
    for (const [url, production] of [[SITE, false], [`${SITE}?analytics=off`, true], [`${SITE}?debug`, true],
      ['http://localhost:4173/Steeped-in-Trouble/', true]]) {
      const win = fakeWindow(url);
      expect(startAnalytics({ win, production }), url).toBeNull();
      expect(win.appended, url).toHaveLength(0);
      expect(win.listeners.size, url).toBe(0);
    }
  });

  it('holds early events for the script and delivers them once', () => {
    const win = fakeWindow();
    const sink = loadTracker(win);
    sink.send('game_start');
    sink.send('round_milestone', { round: 1 });
    const calls = [];
    win.umami = { track: (...args) => calls.push(args) };
    win.appended[0].fire('load');
    sink.send('engaged_30s');
    expect(calls).toEqual([['game_start', undefined], ['round_milestone', { round: 1 }], ['engaged_30s', undefined]]);
  });

  it('fails harmlessly when the script is blocked, and never retries', () => {
    const win = fakeWindow();
    const sink = loadTracker(win);
    sink.send('game_start');
    win.appended[0].fire('error');
    expect(() => { for (let i = 0; i < 100; i++) sink.send('game_start'); }).not.toThrow();
    expect(win.appended).toHaveLength(1);
  });

  it('survives a script that loads without a tracker, throws or rejects', async () => {
    const win = fakeWindow();
    const sink = loadTracker(win);
    win.appended[0].fire('load'); // Loaded, yet no umami object: nothing to wait for.
    expect(() => sink.send('game_start')).not.toThrow();

    const throwing = fakeWindow(SITE, { win: { umami: { track() { throw new Error('tracker'); } } } });
    expect(() => loadTracker(throwing).send('game_start')).not.toThrow();

    let rejection;
    const rejecting = fakeWindow(SITE, { win: { umami: { track: () => { rejection = Promise.reject(new Error('net')); return rejection; } } } });
    loadTracker(rejecting).send('game_start');
    await rejection.catch(() => {});
  });

  it('returns null rather than throwing if the page cannot take a script', () => {
    const win = fakeWindow();
    win.document.createElement = () => { throw new Error('no'); };
    expect(startAnalytics({ win, production: true })).toBeNull();
  });

  it('keeps a throwing sink out of the frame loop', () => {
    const clock = { time: 0 };
    const analytics = createAnalytics({ send() { throw new Error('tracker'); }, now: () => clock.time, foreground: () => true });
    expect(() => {
      analytics.gameStarted();
      analytics.handle({ type: 'roundStart', round: 1 }, true);
      for (let i = 0; i < 1000; i++) { clock.time += 50; analytics.noteInput(); analytics.frame('playing', true); }
    }).not.toThrow();
    expect(analytics.engagedMs).toBeGreaterThan(30_000);
  });
});

describe('game_start', () => {
  /** Runs what main.js runs for each event, on the real session objects. */
  function visit(storage = new Map()) {
    const store = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
    const progress = createLocalProgress(store);
    const sessions = createSessions(createGame({ seed: 7 }), progress);
    const h = harness();
    const drain = () => {
      for (const event of sessions.game.drainEvents()) {
        h.analytics.handle(event, !sessions.practice && !sessions.collection);
        sessions.handle(event);
      }
      sessions.settle();
    };
    return { ...h, sessions, progress, drain, storage };
  }

  /** A previous visit that left a real pot saved after the given round. */
  function savedPot(round) {
    const storage = new Map();
    const earlier = visit(storage);
    earlier.progress.saveCheckpoint(checkpointAfter(round).checkpoint);
    expect(earlier.progress.pot).toBeTruthy();
    return storage;
  }

  it('does not fire for a page visit, a title screen or instructions', () => {
    const { names, play, drain } = visit();
    drain();
    play(10_000, 'ready');
    expect(names()).toEqual([]);
  });

  it('fires once for a new pot, including its first round', () => {
    const { sessions, drain, sent } = visit();
    sessions.game.primaryAction();
    drain();
    expect(sent).toEqual([['game_start'], ['round_milestone', { round: 1 }]]);
    expect(sent[0]).toHaveLength(1); // no properties
  });

  it('does not count repeated handlers, pauses or a new pot in the same visit', () => {
    const { sessions, drain, names, analytics } = visit();
    const { game } = sessions;
    game.primaryAction();
    game.primaryAction(); // pause
    game.primaryAction(); // resume
    drain();
    analytics.gameStarted();
    game.state.phase = 'gameover';
    game.restart();
    drain();
    sessions.newPot(true);
    analytics.gameStarted();
    drain();
    expect(names().filter((n) => n === 'game_start')).toHaveLength(1);
    expect(names().filter((n) => n === 'round_milestone')).toHaveLength(1);
  });

  it('fires once when a saved pot is continued, without any round event from the restore', () => {
    const { sessions, drain, sent, analytics } = visit(savedPot(4));
    drain();
    expect(sent).toEqual([]);
    expect(sessions.continuePot()).toBe(true);
    analytics.gameStarted(); // what collectionUI's onActivate does
    drain();
    expect(sessions.game.state.phase).toBe('reading');
    expect(sent).toEqual([['game_start']]);
  });

  it('sends only milestones actually reached in this visit after continuing', () => {
    const storage = savedPot(4);
    const { sessions, drain, sent, analytics } = visit(storage);
    sessions.continuePot();
    analytics.gameStarted();
    drain();
    expect(sent.filter(([n]) => n === 'round_milestone')).toEqual([]); // 1 is never backfilled
    leaveReading(sessions.game);
    drain();
    expect(sessions.game.state.round).toBe(5);
    expect(sent).toEqual([['game_start'], ['round_milestone', { round: 5 }]]);
  });

  it('continuing a pot beyond every earlier milestone sends only the later ones', () => {
    const { analytics, sent } = harness();
    analytics.gameStarted();
    for (const round of [33, 34, 49, 50, 51]) analytics.handle({ type: 'roundStart', round }, true);
    expect(sent).toEqual([['game_start'], ['round_milestone', { round: 50 }]]);
  });

  it('practice sessions send nothing and add no time', () => {
    const { sessions, drain, sent, play, analytics } = visit();
    sessions.open();
    sessions.launch('teaRun', 11);
    drain();
    for (let i = 0; i < 600; i++) sessions.game.update(1 / 60);
    drain();
    play(120_000, sessions.game.state.phase, { open: !sessions.practice, input: true });
    expect(sent).toEqual([]);
    expect(analytics.engagedMs).toBe(0);
    // Even a full simulated match inside practice would be ignored.
    analytics.handle({ type: 'matchStart' }, false);
    analytics.handle({ type: 'roundStart', round: 1 }, false);
    expect(sent).toEqual([]);
  });
});

describe('round_milestone', () => {
  it('sends each milestone at most once, with only a numeric round', () => {
    const { analytics, sent } = harness();
    for (let pass = 0; pass < 2; pass++) {
      for (let round = 1; round <= 60; round++) {
        analytics.handle({ type: 'roundStart', round, fortune: 'karma', tea: 'mushroom', chapter: 3, score: 900 }, true);
      }
    }
    expect(sent).toEqual(ROUND_MILESTONES.map((round) => ['round_milestone', { round }]));
    expect(ROUND_MILESTONES).toEqual([1, 5, 10, 20, 30, 50]);
  });

  it('ignores every other event, including those carrying a round', () => {
    const { analytics, sent } = harness();
    for (const type of ['reading', 'paused', 'resumed', 'gameover', 'shortage', 'grindStart', 'chocolateStart']) {
      analytics.handle({ type, round: 5, score: 100 }, true);
    }
    expect(sent).toEqual([]);
  });
});

describe('engagement time', () => {
  /** Started, with input arriving as it does in real play. */
  function started(options) {
    const h = harness(options);
    h.analytics.gameStarted();
    h.sent.length = 0;
    return h;
  }

  it('reaches every threshold exactly once under continuous play', () => {
    const { play, names } = started();
    play(3_700_000, 'playing', { input: true, frameMs: 100 });
    expect(names()).toEqual(['engaged_30s', 'engaged_1m', 'engaged_3m', 'engaged_5m', 'engaged_10m',
      'engaged_20m', 'engaged_30m', 'engaged_60m']);
    play(3_700_000, 'playing', { input: true, frameMs: 100 });
    expect(names()).toHaveLength(ENGAGEMENT_THRESHOLDS.length);
  });

  it('fires a threshold when it is crossed, not before', () => {
    const { play, names } = started();
    play(29_000, 'playing', { input: true });
    expect(names()).toEqual([]);
    play(2_000, 'playing', { input: true });
    expect(names()).toEqual(['engaged_30s']);
  });

  it('counts bosses and side adventures', () => {
    for (const phase of ['grind', 'manager', 'chocolate', 'teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']) {
      const { play, names } = started();
      play(31_000, phase, { input: true });
      expect(names(), phase).toEqual(['engaged_30s']);
    }
  });

  it('accumulates across phases and interruptions', () => {
    const { play, names, analytics } = started();
    play(20_000, 'playing', { input: true });
    play(5_000, 'paused', { input: true });
    play(12_000, 'teaRun', { input: true });
    expect(names()).toEqual(['engaged_30s']);
    expect(analytics.engagedMs).toBeGreaterThan(31_000);
    expect(analytics.engagedMs).toBeLessThan(32_500);
  });

  it('never counts before a game has started', () => {
    const { play, analytics } = harness();
    play(60_000, 'playing', { input: true });
    expect(analytics.engagedMs).toBe(0);
  });

  it.each(['ready', 'paused', 'gameover'])('adds nothing during %s, even with input', (phase) => {
    const { play, analytics, names } = started();
    play(120_000, phase, { input: true });
    expect(analytics.engagedMs).toBe(0);
    expect(names()).toEqual([]);
  });

  it('adds nothing behind a modal such as the Tea Break', () => {
    const { play, analytics } = started();
    play(120_000, 'playing', { open: false, input: true });
    play(120_000, 'reading', { open: false, input: true });
    expect(analytics.engagedMs).toBe(0);
  });

  it('adds nothing while the page is hidden or unfocused', () => {
    let foreground = true;
    const { play, analytics } = started({ foreground: () => foreground });
    play(10_000, 'playing', { input: true });
    const before = analytics.engagedMs;
    foreground = false;
    play(120_000, 'playing', { input: true });
    expect(analytics.engagedMs).toBe(before);
    foreground = true;
    play(5_000, 'playing', { input: true });
    expect(analytics.engagedMs).toBeGreaterThan(before);
    expect(analytics.engagedMs).toBeLessThanOrEqual(before + 5_000);
  });

  it('caps an unattended reading at the passive limit', () => {
    const { play, analytics, names } = started();
    play(4 * 3_600_000, 'reading');
    expect(analytics.engagedMs).toBeLessThanOrEqual(PASSIVE_IDLE_MS);
    expect(analytics.engagedMs).toBeGreaterThan(PASSIVE_IDLE_MS - 1_000);
    expect(names().length).toBeLessThanOrEqual(1);
  });

  it.each(['day', 'shortage', 'arcadeOffer'])('caps an unattended %s the same way', (phase) => {
    const { play, analytics } = started();
    play(3_600_000, phase);
    expect(analytics.engagedMs).toBeLessThanOrEqual(PASSIVE_IDLE_MS);
  });

  it('caps an unattended adventure screen at the active limit', () => {
    const { play, analytics } = started();
    play(3_600_000, 'biscuitBreakout');
    expect(analytics.engagedMs).toBeLessThanOrEqual(ACTIVE_IDLE_MS);
    expect(analytics.engagedMs).toBeGreaterThan(ACTIVE_IDLE_MS - 1_000);
  });

  it('resumes counting on the next input after idling', () => {
    const { play, analytics } = started();
    play(120_000, 'reading');
    const before = analytics.engagedMs;
    play(10_000, 'reading', { input: true });
    expect(analytics.engagedMs).toBeGreaterThan(before + 9_000);
  });

  it('never catches up after tab suspension or sleep', () => {
    const { play, clock, analytics, names } = started();
    play(10_000, 'playing', { input: true });
    const before = analytics.engagedMs;
    clock.time += 6 * 3_600_000; // the machine slept; no frames ran
    analytics.noteInput();
    analytics.frame('playing', true);
    expect(analytics.engagedMs).toBe(before);
    expect(names()).toEqual([]);
    // Nor does a gap only just over the limit.
    clock.time += MAX_FRAME_GAP_MS + 1;
    analytics.frame('playing', true);
    expect(analytics.engagedMs).toBe(before);
  });

  it('discards the frame on either side of a hidden stretch', () => {
    let foreground = true;
    const { play, clock, analytics } = started({ foreground: () => foreground });
    play(10_000, 'playing', { input: true });
    const before = analytics.engagedMs;
    foreground = false;
    clock.time += 900;
    analytics.frame('playing', true);
    foreground = true;
    clock.time += 900;
    analytics.frame('playing', true); // the first frame back has no time of its own
    expect(analytics.engagedMs).toBe(before);
  });

  it('ignores a clock that runs backward', () => {
    const { play, clock, analytics } = started();
    play(5_000, 'playing', { input: true });
    const before = analytics.engagedMs;
    clock.time -= 500;
    analytics.frame('playing', true);
    expect(analytics.engagedMs).toBe(before);
  });

  it('does a small, fixed amount of work per frame', () => {
    let nowCalls = 0, foregroundCalls = 0, sends = 0;
    let time = 0;
    const analytics = createAnalytics({ send: () => sends++, foreground: () => { foregroundCalls++; return true; },
      now: () => { nowCalls++; return time; } });
    analytics.gameStarted();
    sends = 0;
    const baseNow = nowCalls;
    const frames = 60 * 60 * 90; // ninety minutes at 60 frames a second
    for (let i = 0; i < frames; i++) {
      time += 1000 / 60;
      if (i % 30 === 0) analytics.noteInput();
      analytics.frame('playing', true);
    }
    expect(sends).toBe(ENGAGEMENT_THRESHOLDS.length);
    expect(foregroundCalls).toBe(frames);
    expect(nowCalls - baseNow).toBe(frames + Math.ceil(frames / 30));
    // Screens that cannot count do not even ask about the page.
    foregroundCalls = 0;
    for (let i = 0; i < 1000; i++) { time += 16; analytics.frame('paused', true); analytics.frame('playing', false); }
    expect(foregroundCalls).toBe(0);
  });
});

describe('independence from the game', () => {
  /** A scripted seeded match, optionally observed the way main.js observes it. */
  function scriptedRun(seed, analytics) {
    const game = createGame({ seed });
    const log = [];
    game.primaryAction();
    for (let i = 0; i < 5 * 60 * 60; i++) {
      const sweepRight = Math.floor(i / 90) % 2 === 0;
      if (i % 400 === 100) game.pourMilk();
      if (i % 500 === 250) game.sugarBurst();
      game.update(1 / 60, { left: !sweepRight, right: sweepRight, fire: true });
      if (game.offerOpen()) game.chooseUpgrade(i % 2);
      else if (game.state.phase === 'reading' && game.state.readingTime > 1) game.primaryAction();
      if (game.state.phase === 'gameover') game.primaryAction();
      for (const event of game.drainEvents()) {
        analytics?.handle(Object.freeze(event), true); // it may not alter what it is given
        log.push(event.type === 'checkpoint' ? JSON.stringify(event) : `${i}:${event.type}`);
      }
      analytics?.frame(game.state.phase, true);
    }
    return { state: JSON.stringify(game.state), log };
  }

  it('leaves seeded outcomes, game state and saved checkpoints unchanged', () => {
    const clock = { time: 0 };
    const sent = [];
    const analytics = createAnalytics({ send: (...args) => sent.push(args), now: () => (clock.time += 16), foreground: () => true });
    const observed = scriptedRun(1234, analytics);
    const plain = scriptedRun(1234);
    expect(observed.state).toBe(plain.state);
    expect(observed.log).toEqual(plain.log);
    expect(observed.log.some((line) => line.includes('checkpoint'))).toBe(true);
    expect(sent.length).toBeGreaterThan(1);
  });

  it('never sends anything but the agreed names and the numeric round', () => {
    const names = ['game_start', 'round_milestone', ...ENGAGEMENT_THRESHOLDS.map(([name]) => name)];
    const clock = { time: 0 };
    const sent = [];
    const analytics = createAnalytics({ send: (...args) => sent.push(args), now: () => (clock.time += 16), foreground: () => true });
    scriptedRun(99, analytics);
    for (const [name, data] of sent) {
      expect(names).toContain(name);
      if (name === 'round_milestone') {
        expect(Object.keys(data)).toEqual(['round']);
        expect(typeof data.round).toBe('number');
      } else expect(data).toBeUndefined();
    }
  });

  it('keeps analytics out of the simulation, and storage and identity out of analytics', () => {
    for (const folder of ['src/core', 'src/gameplay']) {
      for (const file of readdirSync(folder)) {
        expect(readFileSync(join(folder, file), 'utf8'), file).not.toMatch(/analytics|umami/i);
      }
    }
    const adapter = readFileSync('src/analytics/analytics.js', 'utf8');
    const tracker = readFileSync('src/analytics/tracker.js', 'utf8');
    for (const source of [adapter, tracker]) {
      expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|Math\.random|fingerprint/);
      expect(source).not.toMatch(/\.identify\s*\(/);
    }
    expect(adapter).not.toMatch(/document|window\b(?!\.)|fetch\(|XMLHttpRequest|sendBeacon/);
    expect(tracker).not.toMatch(/data-(errors|performance|distinct-id|tag|auto-track)|'(errors|performance|distinct-id)'/);
  });

  it('leaves the page with no unconditional tracker and no tracked buttons', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/umami\.is|data-website-id/);
    expect(html).not.toMatch(/data-umami-event/);
    expect(html).toContain('?analytics=off');
  });
});
