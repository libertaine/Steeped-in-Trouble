// Optional procedural sound effects.
//
// Sound is off by default. The AudioContext is created on the first sound
// after the player turns sound on (a user gesture), which satisfies browser
// autoplay rules. Any audio failure is ignored so it can never interrupt play.

import { FORTUNES } from '../gameplay/fortunes.js';

// [frequency Hz, duration s, waveform, gain, delay s]
const SOUNDS = {
  roundStart: [510, 0.13, 'triangle', 0.026],
  reading: [820, 0.29, 'sine', 0.04],
  gameover: [180, 0.32, 'sawtooth', 0.035],
  steam: [440, 0.045, 'triangle', 0.011],
  milk: [260, 0.24, 'sine', 0.027],
  sugar: [820, 0.17, 'square', 0.018],
  escape: [130, 0.22, 'sawtooth', 0.04],
  toggle: [550, 0.1, 'sine', 0.026],
  sugarRegen: [1320, 0.08, 'sine', 0.012],
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

const KILL_SOUND = { steam: [560, 0.065, 'sine', 0.014], sugar: [720, 0.065, 'sine', 0.014] };

export function createAudio() {
  let context = null;
  let enabled = false;

  function beep([hz, duration, shape, gain, delay = 0]) {
    if (!enabled) return;
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        context = new AudioContextClass();
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
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
    /** Play the sound for a simulation event, if it has one. */
    handle(event) {
      if (event.type === 'kill') beep(event.sugar ? KILL_SOUND.sugar : KILL_SOUND.steam);
      else if (SOUNDS[event.type]) beep(SOUNDS[event.type]);
      else tuneFor(event)?.forEach(beep);
    },
  };
}
