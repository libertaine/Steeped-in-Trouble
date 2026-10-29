// Entry point: wires the simulation to rendering, input, audio, and the HUD.

import { CONFIG } from './config.js';
import { createGame } from './core/game.js';
import { createLoop } from './core/timing.js';
import { ERRANDS } from './gameplay/shortage.js';
import { FORTUNES } from './gameplay/fortunes.js';
import { createDailyPour } from './gameplay/dailyPour.js';
import { BREAKOUT_SALT, createBreakout } from './gameplay/biscuitBreakout.js';
import { createRandom, toSeed } from './core/random.js';
import { createControls } from './input/controls.js';
import { initialSettings, isTouchDevice, normalize, saveSettings } from './input/settings.js';
import { createAudio } from './audio/audio.js';
import { attachCanvasScaling } from './rendering/canvas.js';
import { createEffects } from './rendering/effects.js';
import { createRenderer } from './rendering/renderer.js';
import { createHud } from './ui/hud.js';
import { createPresentation } from './ui/presentation.js';

const INSTANCE_KEY = Symbol.for('steeped-in-trouble');
const QUALITY_KEY = 'steeped-in-trouble:graphics';

/** Graphics quality: ?graphics=low|high, else the last choice, else high. */
function initialQuality(params) {
  const fromUrl = params.get('graphics');
  if (fromUrl === 'low' || fromUrl === 'high') return fromUrl;
  try {
    return localStorage.getItem(QUALITY_KEY) === 'low' ? 'low' : 'high';
  } catch {
    return 'high';
  }
}

/** Read an optional ?seed=<number> to replay a gameplay sequence. */
function seedFromUrl(params) {
  const raw = params.get('seed');
  if (raw === null || raw.trim() === '') return undefined;
  const seed = Number(raw);
  return Number.isFinite(seed) ? seed : undefined;
}

function boot() {
  // Guard against a second initialization creating duplicate loops/listeners.
  if (window[INSTANCE_KEY]) return window[INSTANCE_KEY];

  const params = new URLSearchParams(window.location.search);
  const canvas = document.getElementById('game');
  // ?tea=<id> brews only one variety (see gameplay/teas.js); unknown ids are ignored.
  const game = createGame({ seed: seedFromUrl(params), tea: params.get('tea') ?? undefined });
  const effects = createEffects();
  const renderer = createRenderer(canvas, { quality: initialQuality(params),
    compact: () => document.body.dataset.view === 'compact' });
  const hud = createHud(document);
  const audio = createAudio();

  // Control settings: Easy or Classic Touch, and Auto Steam (see input/settings.js).
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    // Storage may be unavailable; the defaults will do.
  }
  let settings = initialSettings({ params, storage, touchDevice: isTouchDevice(window) });
  const touchButton = document.getElementById('touchBtn');
  const autoButton = document.getElementById('autoSteamBtn');
  function applySettings(next, { save = false } = {}) {
    settings = normalize(next);
    document.body.dataset.touch = settings.touch;
    game.setAutoSteam(settings.autoSteam);
    if (touchButton) touchButton.textContent = `Touch: ${settings.touch}`;
    if (autoButton) {
      autoButton.textContent = `Auto Steam: ${settings.autoSteam ? 'on' : 'off'}${settings.touch === 'easy' ? ' (Easy Touch)' : ''}`;
      autoButton.disabled = settings.touch === 'easy';
    }
    if (save) saveSettings(storage, settings);
    document.getElementById('activeControls').textContent = settings.touch === 'easy'
      ? 'Easy Touch: hold ◀ / ▶ to steer; double-tap the cup for milk; hold the cup for sugar. In hot chocolate, hold the cup for flames. On the Tea Run use Jump / Slide; in Biscuit Breakout, hold ◀ / ▶ and tap LAUNCH. Keyboard controls work too.'
      : 'Classic Touch: hold Turn to steer and Steam to fire; tap Milk or Sugar. On the Tea Run use Jump / Slide; in Biscuit Breakout, hold ◀ / ▶ and tap LAUNCH. Keyboard controls work too.';
  }
  applySettings(settings);
  touchButton?.addEventListener('click', () => {
    const touch = settings.touch === 'easy' ? 'classic' : 'easy';
    // Leaving Easy Touch keeps Auto Steam on until it is turned off, so nothing changes mid-cup but the buttons.
    applySettings({ touch, autoSteam: settings.autoSteam }, { save: true });
  });
  autoButton?.addEventListener('click', () => {
    applySettings({ ...settings, autoSteam: !settings.autoSteam }, { save: true });
  });

  // A ring under the finger for Easy Touch gestures.
  const ring = document.getElementById('touchRing');
  const stage = ring?.parentElement;
  ring?.style.setProperty('--press', `${CONFIG.touch.longPress}ms`);
  function showRing(kind, point) {
    if (!ring || !stage) return;
    if (kind === 'release') {
      if (ring.classList.contains('charging')) ring.hidden = true;
      return;
    }
    if (point) {
      const box = stage.getBoundingClientRect();
      ring.style.left = `${point.x - box.left}px`;
      ring.style.top = `${point.y - box.top}px`;
    }
    ring.className = 'touch-ring';
    ring.hidden = false;
    void ring.offsetWidth; // restart the animation
    ring.classList.add(kind === 'press' ? 'charging' : kind);
  }

  let presentation;
  const controls = createControls({
    doc: document,
    commands: {
      fire: game.fireSteam,
      milk: game.pourMilk,
      sugar: game.sugarBurst,
      confirm: game.confirm,
      togglePause: game.togglePause,
      restart: game.restart,
      pause: game.pause,
      // 1 and 2 pick an upgrade; during the Tea Shortage, 1 / 2 / 3 answer it.
      choose: (index) => game.chooseUpgrade(index) || game.chooseErrand(ERRANDS[index])
        || (index < 2 && game.chooseInterlude(index === 0)),
      interlude: game.chooseInterlude,
      paperControls: game.paperControls,
      aimPaper: game.aimPaper,
      throwPaper: game.throwPaper,
      breakoutControls: game.breakoutControls,
      launchCube: game.launchCube,
      errand: game.chooseErrand,
      jump: game.jump,
      slide: game.slide,
    },
    gestureMode: game.touchGestures,
    scheme: () => settings.touch,
    onGesture: showRing,
    enabled: () => !presentation?.blocked,
  });
  presentation = createPresentation({ doc: document, game, params, storage, resetInput: controls.reset });

  const soundButton = document.getElementById('soundBtn');
  document.getElementById('mainBtn').addEventListener('click', () => game.primaryAction());
  soundButton.addEventListener('click', () => {
    soundButton.textContent = `Sound: ${audio.toggle() ? 'on' : 'off'}`;
  });

  const graphicsButton = document.getElementById('graphicsBtn');
  const showQuality = () => {
    if (graphicsButton) graphicsButton.textContent = `Graphics: ${renderer.quality}`;
  };
  graphicsButton?.addEventListener('click', () => {
    renderer.quality = renderer.quality === 'high' ? 'low' : 'high';
    showQuality();
    try {
      localStorage.setItem(QUALITY_KEY, renderer.quality);
    } catch {
      // Storage may be unavailable (private mode); the choice just won't persist.
    }
  });
  showQuality();

  const version = document.getElementById('version');
  if (version) version.textContent = `VERSION ${__APP_VERSION__}`;

  const detachScaling = attachCanvasScaling(canvas);

  // Holds and half-made gestures never cross into (or out of) the shortage or the errand.
  const RESETS = new Set(['paused', 'resumed', 'matchStart', 'roundStart', 'reading', 'shortage',
    'arcadeOffer', 'arcadeSkipped', 'pourStart', 'pourGo', 'pourFinish', 'pourEnd',
    // Not breakoutGo: a direction held through the introduction keeps steering the spoon.
    'breakoutStart', 'breakoutFinish', 'breakoutEnd',
    'runBird', 'runZap', 'runOrbit', 'runReturn',
    'runStart', 'runGo', 'runFinish', 'runFail', 'runEnd', 'chocolateStart', 'havocStart', 'havocEnd',
    'grindStart', 'grindFight', 'grindDefeat', 'grindEscape', 'gameover']);

  function handleEvents() {
    for (const event of game.drainEvents()) {
      // Leaving an adventure, a Space still held from it must not become steam in the cup.
      if (event.type === 'pourEnd' || event.type === 'breakoutEnd') controls.settle();
      else if (RESETS.has(event.type)) controls.reset();
      effects.handle(event);
      audio.handle(event);
    }
  }

  const loop = createLoop((dt) => {
    effects.update(dt, game.state);
    controls.update();
    // Input can leave the runner between frames. Clear its holds before the
    // next cup advances, so the Space used to go home cannot also fire steam.
    handleEvents();
    if (!presentation.blocked) game.update(dt, controls.held);
    handleEvents();
    audio.update(game.state, dt);
    renderer.draw(game.state, effects.fx, dt);
    hud.update(game.state);
    presentation.update();
  });

  hud.update(game.state);
  presentation.update();
  loop.start();

  const instance = {
    game,
    stop() {
      loop.stop();
      controls.dispose();
      presentation.dispose();
      detachScaling();
      delete window[INSTANCE_KEY];
    },
  };
  window[INSTANCE_KEY] = instance;

  // ?debug exposes the running game for automated browser tests and tinkering.
  if (params.has('debug')) {
    window.__TEACUP__ = { game, effects, version: __APP_VERSION__, config: CONFIG, settings: () => ({ ...settings }) };
    if (import.meta.env.DEV) {
      let routeSeed = game.seed;
      // Console-only practice, compiled out of production. Call again without
      // an argument to replay the exact course, starting a fresh practice pot.
      window.__TEACUP__.launchDailyPour = (seed = routeSeed) => {
        routeSeed = seed;
        game.state.phase = 'gameover';
        game.restart();
        Object.assign(game.state, { round: 12, progress: { chapter: 2, starts: [1, 6] },
          phase: 'arcadeOffer', grindAfter: null, havocDue: false, grindDue: false, shortageDue: false });
        game.chooseInterlude(true);
        game.state.dailyPour = createDailyPour(createRandom(toSeed(seed) ^ 0xda11b007));
        controls.reset();
      };
      if (params.get('arcade') === 'dailyPour') window.__TEACUP__.launchDailyPour();
      let wallSeed = game.seed;
      // The same for Biscuit Breakout: call again without an argument to rebuild the same wall.
      window.__TEACUP__.launchBiscuitBreakout = (seed = wallSeed) => {
        wallSeed = seed;
        game.state.phase = 'gameover';
        game.restart();
        Object.assign(game.state, { round: 19, progress: { chapter: 2, starts: [1, 6] },
          phase: 'arcadeOffer', interlude: { id: 'biscuitBreakout' },
          grindAfter: null, havocDue: false, grindDue: false, shortageDue: false });
        game.chooseInterlude(true);
        game.state.biscuitBreakout = createBreakout(createRandom(toSeed(seed) ^ BREAKOUT_SALT));
        controls.reset();
      };
      if (params.get('arcade') === 'biscuitBreakout') window.__TEACUP__.launchBiscuitBreakout();
      // A fresh pot brewed straight into a cup (cup 2 by default) under a chosen fortune, through the real reading
      // hand-off (so it lasts exactly that one cup). ?fortune=karma does this on load.
      window.__TEACUP__.brewWithFortune = (id = 'karma', { cup = 2 } = {}) => {
        if (!Object.hasOwn(FORTUNES, id)) return false;
        game.state.phase = 'gameover';
        game.restart();
        Object.assign(game.state, { round: Math.max(1, cup - 1), phase: 'reading', readingTime: 10, nextFortune: id, offer: null,
          grindAfter: null, havocDue: false, grindDue: false, shortageDue: false, arcadeDue: null });
        game.primaryAction();
        controls.reset();
        return game.state.fortune === id;
      };
      if (params.has('fortune')) window.__TEACUP__.brewWithFortune(params.get('fortune'));
    }
    // Vite removes this helper from production. No player-facing secret menu.
    if (import.meta.env.DEV) window.__TEACUP__.previewAerial = (kind) => {
      const run = game.state.run;
      if (game.state.phase !== 'teaRun' || run?.stage !== 'run' || !CONFIG.teaRun.aerial[kind]) return false;
      run.opportunity = kind;
      run.encountered = null;
      run.encounter = null;
      Object.assign(run.spoon, { action: 'jump', time: 0, launchHeight: CONFIG.teaRun.aerial[kind].altitude, queued: null });
      return true;
    };
  }
  return instance;
}

boot();
