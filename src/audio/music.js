// The adaptive soundtrack: a small procedural synth band that follows the cup.
//
// Tempo drifts slowly with the round and the fortune. Moment to moment, the
// tension (how close the leaves are to the rim) brings layers in and out:
// a driving bass, hats, a snare, an arpeggio, and finally an alarm pulse. When
// the leaves are cleared it all relaxes again. Notes are synthesized and
// scheduled a moment ahead on the Web Audio clock, so the tempo can change
// without changing pitch.
//
// Like the rest of the presentation, music reads game state and never changes
// it, and it uses its own random source.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';

const RIM = CONFIG.arena.rimRadius;
const STEPS_PER_BAR = 16; // sixteenth notes
const BARS_PER_CHORD = 2;
const LOOKAHEAD = 0.12; // seconds of music scheduled ahead of the audio clock
const VOLUME = 0.5; // the whole band, kept under the sound effects

// i – VI – III – VII in D minor: a bass root and three chord tones (MIDI notes).
export const CHORDS = Object.freeze([
  { root: 38, tones: [62, 65, 69] }, // D minor
  { root: 46, tones: [58, 62, 65] }, // B♭
  { root: 41, tones: [65, 69, 72] }, // F
  { root: 36, tones: [60, 64, 67] }, // C
]);

// Hot Chocolate Havoc: I – vi – IV – V in F major, a chord a bar, bouncier.
const CHOCO_CHORDS = Object.freeze([
  { root: 41, tones: [65, 69, 72] }, // F
  { root: 38, tones: [62, 65, 69] }, // D minor
  { root: 46, tones: [62, 65, 70] }, // B♭
  { root: 36, tones: [64, 67, 72] }, // C
]);
const CHOCO_MELODY = [65, 67, 69, 72, 74, 77, 79]; // F major pentatonic
const CHOCO_MELODY_STEPS = [0, 2, 4, 7, 8, 10, 12, 14];
const CHOCO_BASS = { 0: 0, 3: 12, 6: 7, 8: 0, 11: 12, 14: 7 }; // step → interval above the root

// The music-box melody wanders over D minor pentatonic on these sixteenths,
// landing on chord tones on the strong ones.
const MELODY = [62, 65, 67, 69, 72, 74, 77];
const MELODY_STEPS = [0, 3, 6, 10, 12];
const ARP = [0, 1, 2, 3, 2, 1, 3, 1]; // indices into the chord tones plus the octave

// How loud each voice is, before the note's own gain.
const MIX = {
  pad: 0.011,
  bell: 0.02,
  bass: 0.032,
  kick: 0.05,
  snare: 0.022,
  hat: 0.009,
  arp: 0.009,
  alarm: 0.012,
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * How dangerous the cup is right now, 0–1: mostly the leaf nearest the rim,
 * plus how many are close. One leaf at the rim is already near the top.
 */
export function rawTension(enemies) {
  let peak = 0;
  let crowd = 0;
  for (const enemy of enemies) {
    const near = clamp((enemy.radius / RIM - 0.45) / 0.5, 0, 1);
    peak = Math.max(peak, near);
    crowd += near * near;
  }
  return Math.min(1, 0.65 * peak * peak + 0.35 * Math.min(1, crowd / 3));
}

/**
 * What the band should be playing: a section, a target tempo, and flavour.
 * `tension` is the smoothed value, so the tempo push lags behind the danger.
 */
export function musicMood(state, tension = 0) {
  switch (state.phase) {
    case PHASE.READY:
      return { section: 'ready', tempo: 76, tension: 0, golden: false, stormy: false };
    case PHASE.READING:
      return { section: 'reading', tempo: 66, tension: 0, golden: false, stormy: false };
    case PHASE.CHOCOLATE: {
      // Playful, with a quicker beat as the toasting time runs out.
      const c = state.chocolate;
      if (c.stage !== 'play') return { section: 'reading', tempo: 72, tension: 0, golden: false, stormy: false, chocolate: true };
      const hurry = c.left < 6 ? 1 - c.left / 6 : 0;
      return {
        section: 'havoc', tempo: 112 + 14 * hurry, tension: hurry, golden: state.goldenSpoon > 0, stormy: false, chocolate: true,
      };
    }
    case PHASE.PLAYING: {
      const stormy = state.fortune === 'tempest';
      const base = Math.min(120, 92 + 3 * (state.round - 1));
      return {
        section: 'play',
        tempo: base + 12 * tension + (stormy ? 8 : 0),
        tension,
        golden: state.goldenSpoon > 0,
        stormy,
      };
    }
    default: // paused or game over: the band rests
      return { section: 'silent', tempo: 76, tension: 0, golden: false, stormy: false };
  }
}

/** The chord for a given step of the song (in hot chocolate, a sweeter progression). */
export function chordAt(step, chocolate = false) {
  if (chocolate) return CHOCO_CHORDS[Math.floor(step / STEPS_PER_BAR) % CHOCO_CHORDS.length];
  return CHORDS[Math.floor(step / (STEPS_PER_BAR * BARS_PER_CHORD)) % CHORDS.length];
}

/** Hot Chocolate Havoc: a bouncy bass, light percussion, and a busier melody. */
function arrangeHavoc(step, mood, random, add) {
  const beat = step % STEPS_PER_BAR;
  const chord = chordAt(step, true);
  const { tension: hurry, golden } = mood;
  if (beat === 0) for (const tone of chord.tones) add('pad', tone - 12, STEPS_PER_BAR, 0.55);
  if (beat in CHOCO_BASS) add('bass', chord.root + CHOCO_BASS[beat], 1, 0.9);
  if (beat === 0 || beat === 8) add('kick', 0, 1, 0.55);
  if (beat === 4 || beat === 12) add('snare', 0, 1, 0.35);
  if (beat % 4 === 2 || (hurry > 0.5 && beat % 2 === 1)) add('hat', 0, 1, 0.7);
  if (CHOCO_MELODY_STEPS.includes(beat) && random() < 0.55) {
    const pool = beat % 8 === 0 ? chord.tones : CHOCO_MELODY;
    add('bell', pool[Math.floor(random() * pool.length) % pool.length] + 12, 2, 0.8);
  }
  if ((hurry > 0 || golden) && beat % 2 === 0) {
    const tones = [...chord.tones, chord.tones[0] + 12];
    add('arp', tones[ARP[(beat >> 1) % ARP.length]] + 12, 1, 0.35 + 0.4 * hurry);
  }
  if (golden && beat % 2 === 1) add('bell', chord.tones[(beat >> 1) % 3] + 24, 2, 0.4);
}

/**
 * The notes to start on one sixteenth-note step: { voice, midi, len (steps), gain }.
 * Pure apart from `random`, which only decides the melody.
 */
export function arrange(step, mood, random = Math.random) {
  const notes = [];
  if (mood.section === 'silent') return notes;
  const add = (voice, midi, len, gain) => notes.push({ voice, midi, len, gain });
  if (mood.section === 'havoc') {
    arrangeHavoc(step, mood, random, add);
    return notes;
  }
  const beat = step % STEPS_PER_BAR;
  const chord = chordAt(step, mood.chocolate);
  const { tension, golden, stormy } = mood;
  const calm = mood.section !== 'play';

  // The pad holds the chord through each bar, thinning as things heat up.
  if (beat === 0) for (const tone of chord.tones) add('pad', tone - 12, STEPS_PER_BAR, calm ? 0.8 : 1 - 0.4 * tension);

  // A wandering music-box melody: the cup's own voice. It steps aside under pressure.
  if (MELODY_STEPS.includes(beat) && (calm || tension < 0.5) && random() < (calm ? 0.6 : 0.45)) {
    const pool = beat % 6 === 0 ? chord.tones : MELODY; // chord tones on the strong steps
    add('bell', pool[Math.floor(random() * pool.length) % pool.length] + 12, 6, calm ? 0.9 : 0.8 * (1 - tension));
  }
  if (calm) return notes;

  // Bass: half notes when calm, quarters with octave hops, then driving eighths.
  const bassSteps = tension > 0.6 ? 2 : tension > 0.25 ? 4 : 8;
  if (beat % bassSteps === 0) add('bass', chord.root + (beat % 8 === 4 || beat % 4 === 2 ? 12 : 0), 2, 0.8 + 0.2 * tension);

  // Drums.
  if (beat % 8 === 0 || (tension > 0.45 && beat % 4 === 0)) add('kick', 0, 1, 1);
  if (tension > 0.35 && beat % 8 === 4) add('snare', 0, 1, 0.5 + 0.5 * tension);
  const hatEvery = tension > 0.65 ? 1 : tension > 0.12 ? 2 : 0;
  if (hatEvery && beat % hatEvery === 0) add('hat', 0, 1, beat % 4 === 2 ? 1 : 0.55);

  // The arpeggio arrives with rising tension, or straight away in stormy tea.
  const arpEvery = tension > 0.55 ? 1 : 2;
  if ((tension > 0.25 || stormy) && beat % arpEvery === 0) {
    const tones = [...chord.tones, chord.tones[0] + 12];
    add('arp', tones[ARP[beat % ARP.length]] + (stormy ? 12 : 0), 1, 0.5 + 0.5 * tension);
  }

  // Leaves at the rim: a pulsing two-note alarm, a semitone apart.
  if (tension > 0.72 && beat % 4 === 0) add('alarm', beat % 8 === 0 ? 81 : 82, 1, tension);

  // The Golden Spoon adds a high, glittering layer.
  if (golden && beat % 2 === 1) add('bell', chord.tones[(beat >> 1) % 3] + 24, 2, 0.4);

  return notes;
}

/** Play one synthesized note. `at` is in audio-clock seconds; `step` is a sixteenth's length. */
function voice(ctx, out, noise, note, at, step) {
  const env = (node, gain, attack, hold, release) => {
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(gain, at + attack);
    node.gain.setValueAtTime(gain, at + attack + hold);
    node.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    return at + attack + hold + release + 0.02;
  };
  const osc = (type, frequency, gain, attack, hold, release, dest = out) => {
    const o = ctx.createOscillator();
    const a = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(frequency, at);
    o.connect(a);
    a.connect(dest);
    const end = env(a, gain, attack, hold, release);
    o.start(at);
    o.stop(end);
    return o;
  };
  const hiss = (type, frequency, gain, release) => {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const a = ctx.createGain();
    src.buffer = noise;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, at);
    src.connect(filter);
    filter.connect(a);
    a.connect(out);
    src.start(at);
    src.stop(env(a, gain, 0.002, 0, release));
  };

  const gain = MIX[note.voice] * note.gain;
  const f = hz(note.midi);
  const length = note.len * step;
  switch (note.voice) {
    case 'pad': {
      osc('triangle', f, gain, 0.25, Math.max(0, length - 0.4), 0.6);
      osc('sine', f * 1.003, gain * 0.7, 0.3, Math.max(0, length - 0.4), 0.6); // a slow, gentle beat
      break;
    }
    case 'bell': {
      osc('sine', f, gain, 0.004, 0, 0.9);
      osc('sine', f * 2, gain * 0.25, 0.004, 0, 0.35);
      break;
    }
    case 'bass': {
      osc('triangle', f, gain, 0.01, length * 0.6, 0.12);
      osc('sine', f / 2, gain * 0.6, 0.01, length * 0.6, 0.12);
      break;
    }
    case 'kick': {
      const o = osc('sine', 150, gain, 0.002, 0.02, 0.18);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
      break;
    }
    case 'snare':
      hiss('bandpass', 1800, gain, 0.12);
      break;
    case 'hat':
      hiss('highpass', 7000, gain, 0.035);
      break;
    case 'arp': {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, at);
      filter.connect(out);
      osc('square', f, gain, 0.004, step * 0.4, 0.08, filter);
      break;
    }
    case 'alarm':
      osc('sine', f, gain, 0.003, 0.05, 0.06);
      break;
    default:
      break;
  }
}

/**
 * The band. Call update() every frame with the shared AudioContext, or with
 * null while sound is off; it fades out and stops scheduling.
 */
export function createMusic({ random = Math.random } = {}) {
  let ctx = null;
  let bus = null; // music volume
  let tone = null; // a lowpass that opens up with the tension
  let noise = null; // one second of white noise for the drums
  let step = 0;
  let nextTime = 0; // audio-clock time of the next step, or 0 to resync
  let tempo = 76;
  let tension = 0;
  let pending = []; // one-off phrases (a Steam Nova flourish): { notes, steps }

  function connect(context) {
    ctx = context;
    bus = ctx.createGain();
    tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    tone.Q.value = 0.6;
    bus.gain.value = 0;
    tone.connect(bus);
    bus.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  }

  return {
    /** Read only, for tests and tinkering. */
    get tempo() {
      return tempo;
    },
    get tension() {
      return tension;
    },

    /**
     * @param {AudioContext | null} context the shared context, or null while sound is off
     * @param {object} state simulation state (read only)
     * @param {number} dt seconds since the previous frame
     */
    update(context, state, dt) {
      const playing = state.phase === PHASE.PLAYING;
      // Tension rises quickly and lets go slowly.
      const target = playing ? rawTension(state.enemies) : 0;
      const rate = target > tension ? 2.5 : 0.6;
      tension += (target - tension) * Math.min(1, dt * rate);
      const mood = musicMood(state, tension);
      tempo += (mood.tempo - tempo) * Math.min(1, dt * 0.5);

      if (!context) {
        if (bus) bus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        nextTime = 0;
        return;
      }
      if (context !== ctx) connect(context);
      const now = ctx.currentTime;
      // The band swells a little with the tension, on top of the layers it adds.
      const level = VOLUME * (mood.section === 'silent' ? 0 : mood.section === 'play' ? 0.7 + 0.3 * tension : 0.8);
      bus.gain.setTargetAtTime(level, now, mood.section === 'silent' ? 0.25 : 0.6);
      const brightness = mood.section === 'play' ? 1400 + 5600 * tension : mood.section === 'havoc' ? 3000 + 2000 * tension : 1100;
      tone.frequency.setTargetAtTime(brightness, now, 0.3);
      if (mood.section === 'silent') {
        nextTime = 0;
        pending = [];
        return;
      }

      if (nextTime < now) nextTime = now + 0.05; // after a pause or a hidden tab, pick up the beat afresh
      while (nextTime < now + LOOKAHEAD) {
        const sixteenth = 60 / tempo / 4;
        const notes = arrange(step, mood, random);
        const phrase = pending.shift();
        if (phrase) notes.push(...phrase);
        try {
          for (const note of notes) voice(ctx, tone, noise, note, nextTime, sixteenth);
        } catch {
          // Audio is optional.
        }
        step++;
        nextTime += sixteenth;
      }
    },

    /** React to simulation events. */
    handle(event) {
      if (event.type === 'matchStart' || event.type === 'roundStart' || event.type === 'chocolateStart') {
        step = 0; // start each cup on the downbeat
      } else if (event.type === 'havocStart') {
        // A little announcement: up the F major chord, a note a sixteenth.
        step = 0;
        pending = [65, 69, 72, 77, 81, 84].map((midi) => [{ voice: 'bell', midi, len: 3, gain: 1.1 }]);
      } else if (event.type === 'catastrophe') {
        // A flourish: tumbling down from on high, landing with a thump.
        pending = [96, 93, 89, 86, 84, 81, 77, 72].map((midi, i) => [
          { voice: 'bell', midi, len: 3, gain: 1 },
          ...(i === 7 ? [{ voice: 'kick', midi: 0, len: 1, gain: 1 }] : []),
        ]);
      } else if (event.type === 'escape') {
        tension = 1;
      } else if (event.type === 'nova') {
        // A Steam Nova: the chord tumbles up three octaves, one note per sixteenth.
        const tones = chordAt(step).tones;
        pending = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [{ voice: 'bell', midi: tones[i % 3] + 12 * Math.floor(i / 3), len: 4, gain: 1 }]);
      }
    },
  };
}
