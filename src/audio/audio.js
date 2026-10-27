// Optional procedural sound effects.
//
// Sound is off by default. The AudioContext is created on the first sound
// after the player turns sound on (a user gesture), which satisfies browser
// autoplay rules. Any audio failure is ignored so it can never interrupt play.

// [frequency Hz, duration s, waveform, gain]
const SOUNDS = {
  roundStart: [510, 0.13, 'triangle', 0.026],
  reading: [820, 0.29, 'sine', 0.04],
  gameover: [180, 0.32, 'sawtooth', 0.035],
  steam: [440, 0.045, 'triangle', 0.011],
  milk: [260, 0.24, 'sine', 0.027],
  sugar: [820, 0.17, 'square', 0.018],
  escape: [130, 0.22, 'sawtooth', 0.04],
  toggle: [550, 0.1, 'sine', 0.026],
};

const KILL_SOUND = { steam: [560, 0.065, 'sine', 0.014], sugar: [720, 0.065, 'sine', 0.014] };

export function createAudio() {
  let context = null;
  let enabled = false;

  function beep([hz, duration, shape, gain]) {
    if (!enabled) return;
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        context = new AudioContextClass();
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
      const now = context.currentTime;
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = shape;
      osc.frequency.setValueAtTime(hz, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(hz * 0.6, 30), now + duration);
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp);
      amp.connect(context.destination);
      osc.start();
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
    },
  };
}
