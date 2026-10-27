// Entry point: wires the simulation to rendering, input, audio, and the HUD.

import { createGame } from './core/game.js';
import { createLoop } from './core/timing.js';
import { createControls } from './input/controls.js';
import { createAudio } from './audio/audio.js';
import { attachCanvasScaling } from './rendering/canvas.js';
import { createEffects } from './rendering/effects.js';
import { createRenderer } from './rendering/renderer.js';
import { createHud } from './ui/hud.js';

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
  const game = createGame({ seed: seedFromUrl(params) });
  const effects = createEffects();
  const renderer = createRenderer(canvas, { quality: initialQuality(params) });
  const hud = createHud(document);
  const audio = createAudio();

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
    },
  });

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

  const loop = createLoop((dt) => {
    effects.update(dt, game.state);
    game.update(dt, controls.held);
    for (const event of game.drainEvents()) {
      if (event.type === 'paused' || event.type === 'matchStart') controls.reset();
      effects.handle(event);
      audio.handle(event);
    }
    renderer.draw(game.state, effects.fx, dt);
    hud.update(game.state);
  });

  hud.update(game.state);
  loop.start();

  const instance = {
    game,
    stop() {
      loop.stop();
      controls.dispose();
      detachScaling();
      delete window[INSTANCE_KEY];
    },
  };
  window[INSTANCE_KEY] = instance;

  // ?debug exposes the running game for automated browser tests and tinkering.
  if (params.has('debug')) {
    window.__TEACUP__ = { game, version: __APP_VERSION__ };
  }
  return instance;
}

boot();
