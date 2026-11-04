import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/audio/audio.js';
import { createGame } from '../../src/core/game.js';
import { playingGame } from './helpers.js';

/** A recording stand-in for the Web Audio API: what was created, and where each node connects. */
function fakeAudioWindow({ startState = 'suspended' } = {}) {
  const contexts = [];
  function param(value = 0) {
    const p = { value, targets: [] };
    p.setValueAtTime = (v) => { p.value = v; };
    p.cancelScheduledValues = () => {};
    p.setTargetAtTime = (v) => { p.targets.push(v); };
    p.exponentialRampToValueAtTime = () => {};
    p.linearRampToValueAtTime = () => {};
    return p;
  }
  class FakeContext {
    constructor() {
      this.state = startState;
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = { name: 'destination' };
      this.made = { gain: [], osc: [], filter: [], source: [] };
      this.resumes = 0;
      contexts.push(this);
    }
    node(kind, extra = {}) {
      const node = { kind, outputs: [], connect(to) { this.outputs.push(to); }, disconnect() { this.outputs = []; }, ...extra };
      return node;
    }
    createGain() { const g = this.node('gain', { gain: param(1) }); this.made.gain.push(g); return g; }
    createOscillator() {
      const o = this.node('osc', { frequency: param(), start() {}, stop() {} });
      this.made.osc.push(o);
      return o;
    }
    createBiquadFilter() { const f = this.node('filter', { frequency: param(), Q: param() }); this.made.filter.push(f); return f; }
    createBuffer(channels, length) { const data = new Float32Array(length); return { sampleRate: this.sampleRate, getChannelData: () => data }; }
    createBufferSource() { const s = this.node('source', { start() {}, stop() {} }); this.made.source.push(s); return s; }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  }
  return { win: { AudioContext: FakeContext }, contexts };
}

const SOUND_EVENT = { type: 'roundStart' }; // a short sound effect
const sounding = (ctx) => ctx.made.osc.length + ctx.made.source.length;

/** Follow a node's connections to the speakers. */
function reaches(node, target, seen = new Set()) {
  if (node === target) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  return node.outputs.some((next) => reaches(next, target, seen));
}

describe('audio: one switch for music and effects', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates nothing and plays nothing before a gesture, even when the saved choice is on', () => {
    const { win, contexts } = fakeAudioWindow();
    const audio = createAudio({ enabled: true, win });
    const game = playingGame();
    audio.handle(SOUND_EVENT);
    for (let i = 0; i < 30; i++) audio.update(game.state, 1 / 60);
    expect(contexts).toHaveLength(0);
    expect(audio.snapshot()).toEqual({ enabled: true, unlocked: false, context: null, master: null });
  });

  it('a muted player\'s first gesture creates no AudioContext either', () => {
    const { win, contexts } = fakeAudioWindow();
    const audio = createAudio({ win });
    expect(audio.unlock()).toBe(true);
    audio.handle(SOUND_EVENT);
    audio.update(playingGame().state, 1 / 60);
    expect(contexts).toHaveLength(0);
  });

  it('unlocks on a gesture when sound is on, and routes everything through the master volume', () => {
    const { win, contexts } = fakeAudioWindow();
    const audio = createAudio({ enabled: true, win });
    expect(audio.unlock()).toBe(true); // the fake resumes at once
    const [ctx] = contexts;
    expect(ctx.resumes).toBe(1);
    const master = ctx.made.gain[0];
    expect(master.outputs).toEqual([ctx.destination]);
    audio.handle(SOUND_EVENT);
    const game = playingGame();
    for (let i = 0; i < 20; i++) { ctx.currentTime += 1 / 60; audio.update(game.state, 1 / 60); }
    expect(sounding(ctx)).toBeGreaterThan(0);
    for (const voice of [...ctx.made.osc, ...ctx.made.source]) expect(reaches(voice, master)).toBe(true);
    expect(audio.snapshot()).toMatchObject({ enabled: true, unlocked: true, context: 'running', master: 1 });
  });

  it('muting silences music and effects at once, and schedules nothing more', () => {
    const { win, contexts } = fakeAudioWindow();
    const audio = createAudio({ win });
    audio.toggle(); // on, from a gesture
    const [ctx] = contexts;
    const master = ctx.made.gain[0];
    const game = playingGame();
    audio.handle(SOUND_EVENT);
    const [effects] = ctx.made.gain.filter((g) => g.outputs.includes(master)); // the effects' bus, before the band joins
    for (let i = 0; i < 20; i++) { ctx.currentTime += 1 / 60; audio.update(game.state, 1 / 60); }
    expect(audio.toggle()).toBe(false);
    expect(audio.snapshot().master).toBe(0);
    expect(effects.outputs).toEqual([]); // anything already scheduled can never come back
    const before = sounding(ctx);
    audio.handle(SOUND_EVENT);
    audio.handle({ type: 'gameover' });
    for (let i = 0; i < 60; i++) { ctx.currentTime += 1 / 60; audio.update(game.state, 1 / 60); }
    expect(sounding(ctx)).toBe(before);
  });

  it('unmuting makes no sound of its own, reuses the same context and band, and keeps their volumes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25); // the band's arrangement, held still
    const { win, contexts } = fakeAudioWindow();
    const audio = createAudio({ win });
    const game = playingGame();
    audio.toggle();
    const [ctx] = contexts;
    const step = (frames) => { for (let i = 0; i < frames; i++) { ctx.currentTime += 1 / 60; audio.update(game.state, 1 / 60); } };
    step(30);
    const bus = ctx.made.gain[1]; // the band's own volume, made once
    const level = bus.gain.targets.at(-1);
    audio.toggle();
    step(30);
    const made = { contexts: contexts.length, gains: ctx.made.gain.length, filters: ctx.made.filter.length, sounds: sounding(ctx) };
    audio.toggle(); // back on: no chirp, no new context, no second band
    expect(sounding(ctx)).toBe(made.sounds);
    expect({ contexts: contexts.length, filters: ctx.made.filter.length }).toEqual({ contexts: made.contexts, filters: made.filters });
    expect(audio.snapshot().master).toBe(1);
    step(120);
    expect(bus.gain.targets.at(-1)).toBeCloseTo(level, 5);
    expect(ctx.made.gain[1]).toBe(bus);
    expect(sounding(ctx)).toBeGreaterThan(made.sounds); // the band carries on where it would have been
  });

  it('never touches the simulation', () => {
    const { win } = fakeAudioWindow({ startState: 'running' });
    const run = (withAudio) => {
      const game = createGame({ seed: 7 });
      const audio = withAudio ? createAudio({ enabled: true, win }) : null;
      audio?.unlock();
      game.primaryAction();
      for (let i = 0; i < 600; i++) {
        game.update(1 / 60, { left: i % 90 < 30, right: false, fire: i % 4 === 0 });
        for (const event of game.drainEvents()) audio?.handle(event);
        audio?.update(game.state, 1 / 60);
        if (i === 200) audio?.toggle();
        if (i === 400) audio?.toggle();
      }
      return JSON.stringify(game.state);
    };
    expect(run(true)).toBe(run(false));
  });

  it('survives a browser without Web Audio', () => {
    const audio = createAudio({ enabled: true, win: {} });
    expect(audio.unlock()).toBe(false);
    expect(() => { audio.handle(SOUND_EVENT); audio.update(playingGame().state, 1 / 60); audio.toggle(); audio.toggle(); }).not.toThrow();
  });
});
