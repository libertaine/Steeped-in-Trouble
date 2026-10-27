// Optional procedural sound effects and the adaptive soundtrack (music.js).
//
// Sound is off by default, and the toggle covers both. The AudioContext is
// created on the first sound after the player turns sound on (a user
// gesture), which satisfies browser autoplay rules. Any audio failure is
// ignored so it can never interrupt play.

import { FORTUNES } from '../gameplay/fortunes.js';
import { createMusic } from './music.js';

// [frequency Hz, duration s, waveform, gain, delay s]
const SOUNDS = {
  roundStart: [510, 0.13, 'triangle', 0.026],
  reading: [820, 0.29, 'sine', 0.04],
  gameover: [180, 0.32, 'sawtooth', 0.035],
  steam: [440, 0.045, 'triangle', 0.011],
  sugar: [820, 0.17, 'square', 0.018],
  escape: [130, 0.22, 'sawtooth', 0.04],
  toggle: [550, 0.1, 'sine', 0.026],
  sugarRegen: [1320, 0.08, 'sine', 0.012],
  recoil: [310, 0.2, 'sine', 0.026],
};

// Little tunes: lists of notes.
const TUNES = {
  good: [[660, 0.18, 'sine', 0.03], [880, 0.3, 'sine', 0.03, 0.12]],
  trouble: [[233, 0.35, 'triangle', 0.035], [220, 0.5, 'sawtooth', 0.016, 0.18]],
  rare: [[784, 0.16, 'sine', 0.03], [988, 0.16, 'sine', 0.03, 0.1], [1319, 0.4, 'sine', 0.032, 0.2]],
  retract: [[523, 0.22, 'triangle', 0.03], [392, 0.22, 'triangle', 0.03, 0.2], [311, 0.5, 'triangle', 0.03, 0.4]],
  goldenAppear: [[1568, 0.1, 'sine', 0.02], [2093, 0.14, 'sine', 0.02, 0.07], [1568, 0.1, 'sine', 0.016, 0.16]],
  goldenCatch: [[1047, 0.12, 'square', 0.014], [1319, 0.12, 'square', 0.014, 0.08], [1568, 0.3, 'sine', 0.03, 0.16]],
  jackpot: [[1047, 0.1, 'square', 0.014], [1319, 0.1, 'square', 0.014, 0.08], [1568, 0.1, 'square', 0.014, 0.16],
    [2093, 0.5, 'sine', 0.032, 0.24]],
  goldenGone: [[600, 0.25, 'sine', 0.02], [450, 0.35, 'sine', 0.02, 0.15]],
  // A pour, then the backwash rolling in.
  milk: [[260, 0.24, 'sine', 0.027], [170, 0.5, 'triangle', 0.022, 0.06]],
  // A bright metallic clink.
  strain: [[2637, 0.05, 'square', 0.01], [3136, 0.22, 'triangle', 0.026, 0.03], [2093, 0.3, 'sine', 0.018, 0.07]],
  upgrade: [[659, 0.1, 'triangle', 0.024], [988, 0.1, 'triangle', 0.024, 0.08], [1319, 0.35, 'sine', 0.03, 0.16]],
  goldenSpoon: [[1047, 0.1, 'triangle', 0.024], [1568, 0.1, 'triangle', 0.024, 0.07], [2093, 0.1, 'triangle', 0.024, 0.14],
    [2637, 0.45, 'sine', 0.03, 0.21]],
  goldenSpoonEnd: [[1319, 0.18, 'sine', 0.018], [988, 0.3, 'sine', 0.016, 0.12]],
  prismaticAppear: [[2093, 0.08, 'sine', 0.018], [2637, 0.08, 'sine', 0.018, 0.05], [3136, 0.08, 'sine', 0.018, 0.1],
    [2637, 0.12, 'sine', 0.014, 0.15]],
  // Something new: a bright, rising flourish.
  discover: [[784, 0.1, 'triangle', 0.022], [988, 0.1, 'triangle', 0.022, 0.08], [1175, 0.1, 'triangle', 0.022, 0.16],
    [1568, 0.1, 'triangle', 0.022, 0.24], [1976, 0.55, 'sine', 0.032, 0.32]],
  // A few notes from a music box.
  secret: [[1047, 0.4, 'sine', 0.026, 0.5], [1319, 0.4, 'sine', 0.024, 0.75], [1175, 0.4, 'sine', 0.024, 1],
    [1568, 0.8, 'sine', 0.03, 1.25]],
  prismaticGone: [[1568, 0.2, 'sine', 0.016], [1175, 0.3, 'sine', 0.014, 0.1]],
  // Steam Nova: a rising whoosh, then a bright chord rippling up.
  nova: [[196, 0.45, 'sawtooth', 0.02], [523, 0.12, 'square', 0.014, 0.05], [659, 0.12, 'square', 0.014, 0.1],
    [784, 0.12, 'square', 0.014, 0.15], [1047, 0.12, 'square', 0.014, 0.2], [1319, 0.6, 'sine', 0.034, 0.25],
    [1568, 0.6, 'sine', 0.02, 0.25]],
};

/** The tune for a simulation event, if it has one. */
function tuneFor(event) {
  if (event.type === 'reveal') {
    const f = FORTUNES[event.fortune];
    if (event.fortune === 'lie') return TUNES.good; // it is, for now, very convincing
    return f.rare ? TUNES.rare : f.tone === 'trouble' ? TUNES.trouble : TUNES.good;
  }
  if (event.type === 'goldenCatch') return event.reward === 'jackpot' ? TUNES.jackpot : TUNES.goldenCatch;
  return TUNES[event.type];
}

const KILL_SOUND = {
  steam: [560, 0.065, 'sine', 0.014],
  sugar: [720, 0.065, 'sine', 0.014],
  wake: [380, 0.12, 'triangle', 0.016],
  splash: [1245, 0.09, 'sine', 0.016],
};
const GOLDEN_STEAM = [660, 0.05, 'triangle', 0.012];

export function createAudio() {
  let context = null;
  let enabled = false;
  const music = createMusic();

  /** The shared AudioContext, created on first use; null if sound is off or unsupported. */
  function audioContext() {
    if (!enabled) return null;
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        context = new AudioContextClass();
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    } catch {
      return null;
    }
  }

  function beep([hz, duration, shape, gain, delay = 0]) {
    if (!audioContext()) return;
    try {
      const now = context.currentTime + delay;
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = shape;
      osc.frequency.setValueAtTime(hz, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(hz * 0.6, 30), now + duration);
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp);
      amp.connect(context.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Audio is optional.
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    /** Toggle sound; call from a user gesture such as a click. */
    toggle() {
      enabled = !enabled;
      beep(SOUNDS.toggle);
      return enabled;
    },
    /**
     * Keep the soundtrack going: call every frame.
     * @param {object} state simulation state (read only)
     * @param {number} dt seconds since the previous frame
     */
    update(state, dt) {
      try {
        music.update(audioContext(), state, dt);
      } catch {
        // Audio is optional.
      }
    },
    /** Play the sound for a simulation event, if it has one, and let the band react. */
    handle(event) {
      music.handle(event);
      if (event.type === 'kill') beep(KILL_SOUND[event.by] ?? (event.sugar ? KILL_SOUND.sugar : KILL_SOUND.steam));
      else if (event.type === 'steam' && event.golden) beep(GOLDEN_STEAM);
      else if (SOUNDS[event.type]) beep(SOUNDS[event.type]);
      else tuneFor(event)?.forEach(beep);
    },
  };
}
