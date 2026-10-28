import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { TEA_MUSIC, arrange, chordAt, createMusic, musicMood, rawTension } from '../../src/audio/music.js';
import { placeEnemy, playingGame } from './helpers.js';

const RIM = CONFIG.arena.rimRadius;
const leaves = (...radii) => radii.map((radius) => ({ radius, angle: 0 }));
const play = (tension, extra = {}) => ({ section: 'play', tempo: 100, tension, golden: false, stormy: false, ...extra });

/** Every note started over one bar, grouped by voice: { voice: [steps] }. */
function bar(mood, first = 0) {
  const voices = {};
  for (let step = first; step < first + 16; step++) {
    for (const note of arrange(step, mood, () => 0.1)) (voices[note.voice] ??= []).push(step % 16);
  }
  return voices;
}

/** Just enough of an AudioContext to schedule against; records when sources start. */
function fakeContext() {
  const param = () => ({
    value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(v) { this.value = v; },
  });
  const starts = [];
  const source = (extra) => ({ connect() {}, start(t) { starts.push(t); }, stop() {}, ...extra });
  return {
    starts,
    currentTime: 0,
    sampleRate: 8000,
    destination: { connect() {} },
    createGain: () => ({ connect() {}, gain: param() }),
    createBiquadFilter: () => ({ connect() {}, type: '', frequency: param(), Q: param() }),
    createOscillator: () => source({ type: '', frequency: param() }),
    createBufferSource: () => source({ buffer: null }),
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
}

/** Run the band for a number of seconds of frames, advancing the audio clock alongside. */
function run(music, ctx, state, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    ctx.currentTime += 1 / 60;
    music.update(ctx, state, 1 / 60);
  }
}

describe('tension', () => {
  it('is nothing with the leaves far from the rim, and rises as they close in', () => {
    expect(rawTension([])).toBe(0);
    expect(rawTension(leaves(60, 100))).toBe(0);
    const one = rawTension(leaves(RIM * 0.8));
    expect(one).toBeGreaterThan(0);
    expect(rawTension(leaves(RIM - 5))).toBeGreaterThan(one);
    expect(rawTension(leaves(RIM - 5, RIM - 10, RIM - 20, RIM - 30))).toBeGreaterThan(rawTension(leaves(RIM - 5)));
    expect(rawTension(leaves(...new Array(18).fill(RIM)))).toBeLessThanOrEqual(1);
  });

  it('puts a single leaf at the rim into alarm territory', () => {
    expect(rawTension(leaves(RIM - 3))).toBeGreaterThan(0.72);
  });
});

describe('the mood', () => {
  it('follows the phase', () => {
    const game = playingGame();
    expect(musicMood(game.state).section).toBe('play');
    game.pause();
    expect(musicMood(game.state).section).toBe('silent');
    expect(musicMood({ ...game.state, phase: 'ready' }).section).toBe('ready');
    expect(musicMood({ ...game.state, phase: 'reading' }).section).toBe('reading');
    expect(musicMood({ ...game.state, phase: 'gameover' }).section).toBe('silent');
  });

  it('quickens with later rounds, stormy tea, and tension, within reason', () => {
    const game = playingGame();
    const first = musicMood(game.state).tempo;
    expect(musicMood({ ...game.state, round: 5 }).tempo).toBeGreaterThan(first);
    expect(musicMood({ ...game.state, round: 50 }).tempo).toBeLessThanOrEqual(120);
    expect(musicMood({ ...game.state, fortune: 'tempest' })).toMatchObject({ stormy: true });
    expect(musicMood({ ...game.state, fortune: 'tempest' }).tempo).toBeGreaterThan(first);
    expect(musicMood(game.state, 1).tempo).toBeGreaterThan(first);
    expect(musicMood({ ...game.state, goldenSpoon: 3 }).golden).toBe(true);
  });
});

describe('the arrangement', () => {
  it('rests when silent, and keeps drums out of calm sections', () => {
    expect(arrange(0, { section: 'silent' })).toEqual([]);
    const calm = bar({ section: 'reading', tension: 0 });
    expect(calm.pad).toEqual([0, 0, 0]);
    expect(calm.kick).toBeUndefined();
    expect(calm.bell?.length).toBeGreaterThan(0);
  });

  it('starts gently: pad, a half-note bass, and a kick on the strong beats', () => {
    const v = bar(play(0));
    expect(v.bass).toEqual([0, 8]);
    expect(v.kick).toEqual([0, 8]);
    expect(v.hat).toBeUndefined();
    expect(v.snare).toBeUndefined();
    expect(v.arp).toBeUndefined();
    expect(v.alarm).toBeUndefined();
  });

  it('adds hats, snare, and an arpeggio as tension builds', () => {
    const v = bar(play(0.5));
    expect(v.hat).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(v.snare).toEqual([4, 12]);
    expect(v.kick).toEqual([0, 4, 8, 12]);
    expect(v.arp).toHaveLength(8);
    expect(v.alarm).toBeUndefined();
  });

  it('drives hard with leaves at the rim, alarm and all', () => {
    const v = bar(play(0.9));
    expect(v.hat).toHaveLength(16);
    expect(v.bass).toHaveLength(8);
    expect(v.arp).toHaveLength(16);
    expect(v.alarm).toEqual([0, 4, 8, 12]);
    expect(v.bell).toBeUndefined(); // the melody steps aside
  });

  it('brings the arpeggio straight in for stormy tea, and sparkles for the Golden Spoon', () => {
    expect(bar(play(0, { stormy: true })).arp).toHaveLength(8);
    const golden = arrange(1, play(0, { golden: true }), () => 0.9);
    expect(golden.some((n) => n.voice === 'bell' && n.midi > 80)).toBe(true);
  });

  it('cycles through four chords, two bars each', () => {
    expect([0, 32, 64, 96, 128].map((step) => chordAt(step).root)).toEqual([38, 46, 41, 36, 38]);
  });
});

describe('the band', () => {
  it('schedules a little ahead of the audio clock, never far', () => {
    const music = createMusic({ random: () => 0.3 });
    const ctx = fakeContext();
    const game = playingGame();
    run(music, ctx, game.state, 2);
    expect(ctx.starts.length).toBeGreaterThan(10);
    expect(Math.max(...ctx.starts)).toBeLessThan(ctx.currentTime + 0.3);
  });

  it('rests while paused and picks up again afterwards', () => {
    const music = createMusic({ random: () => 0.3 });
    const ctx = fakeContext();
    const game = playingGame();
    run(music, ctx, game.state, 0.5);
    game.pause();
    run(music, ctx, game.state, 0.2);
    const count = ctx.starts.length;
    run(music, ctx, game.state, 2);
    expect(ctx.starts.length).toBe(count);
    game.resume();
    run(music, ctx, game.state, 0.5);
    expect(ctx.starts.length).toBeGreaterThan(count);
  });

  it('feels the tension rise quickly and ease off slowly', () => {
    const music = createMusic();
    const ctx = fakeContext();
    const game = playingGame();
    run(music, ctx, game.state, 10); // settle into the round's tempo
    const calm = music.tempo;
    const leaf = placeEnemy(game.state, { radius: RIM - 5 });
    run(music, ctx, game.state, 1);
    expect(music.tension).toBeGreaterThan(0.6);
    run(music, ctx, game.state, 3);
    const urgent = music.tempo;
    expect(urgent).toBeGreaterThan(calm + 3);
    game.state.enemies.splice(game.state.enemies.indexOf(leaf), 1);
    run(music, ctx, game.state, 0.5);
    expect(music.tension).toBeGreaterThan(0.3); // still settling
    run(music, ctx, game.state, 8);
    expect(music.tension).toBeLessThan(0.1);
    expect(music.tempo).toBeLessThan(urgent);
  });

  it('keeps quiet without an audio context, and plays a flourish for a Steam Nova', () => {
    const music = createMusic();
    const game = playingGame();
    expect(() => music.update(null, game.state, 1 / 60)).not.toThrow();
    const plain = createMusic({ random: () => 0.3 });
    const nova = createMusic({ random: () => 0.3 });
    const [a, b] = [fakeContext(), fakeContext()];
    nova.handle({ type: 'nova' });
    run(plain, a, game.state, 2);
    run(nova, b, game.state, 2);
    expect(b.starts.length - a.starts.length).toBe(16); // eight bell notes, two oscillators each
  });
});

describe('tea flavours in the band', () => {
  it('nudges the tempo by tea during play only', () => {
    const at = (tea) => musicMood({ ...playingGame({ tea }).state }, 0).tempo;
    expect(at('green')).toBe(at('house') + TEA_MUSIC.green.tempo);
    expect(at('herbal')).toBe(at('house') + TEA_MUSIC.herbal.tempo);
    const reading = playingGame({ tea: 'black' }).state;
    expect(musicMood({ ...reading, phase: 'reading' }).tea).toBeUndefined();
  });

  it('gives each tea a different groove', () => {
    // Every note of two bars, pitch included: Earl Grey differs in harmony rather than rhythm.
    const notes = (mood) => JSON.stringify(Array.from({ length: 32 }, (_, step) => arrange(step, mood, () => 0.1)));
    const grooves = new Set(['house', 'green', 'earlGrey', 'chai', 'black', 'herbal'].map((tea) => notes(play(0.2, { tea }))));
    expect(grooves.size).toBe(6);
    expect(bar(play(0.2, { tea: 'chai' })).kick).toEqual([0, 6, 10]);
    expect(bar(play(0.2, { tea: 'herbal' })).kick).toBeUndefined();
    expect(bar(play(0.6, { tea: 'herbal' })).kick).toBeDefined(); // the drums come back when it matters
  });

  it('leaves the hot chocolate and the coffee boss alone', () => {
    const havoc = { section: 'havoc', tempo: 112, tension: 0, golden: false, stormy: false, chocolate: true };
    expect(bar({ ...havoc, tea: 'chai' })).toEqual(bar(havoc));
    const grind = { section: 'grind', tempo: 104, tension: 0.3, pressure: 0, golden: false, stormy: false };
    expect(bar({ ...grind, tea: 'black' })).toEqual(bar(grind));
  });
});
