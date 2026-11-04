import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { createTextMischief, textFormation } from '../../src/rendering/textMischief.js';
import { createReadingMischief, readingTextSpace } from '../../src/ui/textMischief.js';

const eligible = { eligible: true };
const tuning = CONFIG.textMischief;
function tick(controller, seconds, policy = eligible) {
  for (let i = 0; i < Math.round(seconds * 100); i++) controller.step(0.01, policy);
}
const make = (seed = 7) => createTextMischief({ random: createRandom(seed) });

describe('the cosmetic reading timeline', () => {
  it('leaves the caption alone for twelve eligible idle seconds', () => {
    const c = createTextMischief({ random: { next: () => 0 } });
    tick(c, 11.99);
    expect(c.snapshot()).toMatchObject({ phase: 'idle', tried: false });
    tick(c, 0.01);
    expect(c.snapshot()).toMatchObject({ phase: 'approach', tried: true });
  });

  it('samples one opportunity per reading rather than repeatedly rolling while waiting', () => {
    let draws = 0;
    const c = createTextMischief({ random: { next: () => { draws++; return 0.8; } } });
    tick(c, 120);
    expect(c.snapshot()).toMatchObject({ phase: 'idle', tried: true });
    expect(draws).toBe(1);
    expect(c.trigger()).toBe(false);
  });

  it('has an uncommon seeded frequency near twenty percent', () => {
    let stolen = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const c = make(seed);
      tick(c, tuning.idle);
      stolen += c.snapshot().phase === 'approach' ? 1 : 0;
    }
    expect(stolen).toBeGreaterThan(160);
    expect(stolen).toBeLessThan(240);
  });

  it('approaches, lifts, carries, disappears and quietly restores once', () => {
    const c = make();
    expect(c.trigger()).toBe(true);
    tick(c, tuning.approach);
    expect(c.snapshot().phase).toBe('lift');
    tick(c, tuning.lift);
    expect(c.snapshot().phase).toBe('carry');
    tick(c, tuning.carry);
    expect(c.snapshot().phase).toBe('absent');
    tick(c, tuning.absent - 0.01);
    expect(c.snapshot().phase).toBe('absent');
    tick(c, 0.01);
    expect(c.snapshot().phase).toBe('restored');
    tick(c, 60);
    expect(c.snapshot().phase).toBe('restored');
  });

  it.each(['approach', 'lift', 'carry', 'absent'])('cancels %s immediately and resets for a fresh entry', (phase) => {
    const c = make(); c.trigger();
    for (const p of ['approach', 'lift', 'carry']) {
      if (c.snapshot().phase === phase) break;
      tick(c, tuning[p]);
    }
    expect(c.snapshot().phase).toBe(phase);
    c.step(0.01, { eligible: false });
    expect(c.snapshot()).toMatchObject({ phase: 'restored', elapsed: 0, tried: true });
    c.reset();
    expect(c.snapshot()).toMatchObject({ phase: 'idle', elapsed: 0, idle: 0, tried: false });
    expect(c.trigger()).toBe(true);
  });

  it('counts no hidden time and discards catch-up; focus loss restores an active gag', () => {
    const c = make();
    tick(c, 5);
    const before = c.snapshot();
    tick(c, 90, { ...eligible, suspended: true });
    expect(c.snapshot()).toEqual(before);
    c.step(1000, eligible);
    expect(c.snapshot().idle - before.idle).toBeCloseTo(0.04);
    c.trigger();
    c.step(1000, { ...eligible, suspended: true });
    expect(c.snapshot()).toMatchObject({ phase: 'restored', elapsed: 0 });
  });

  it('resets idle on interaction and never starts while ineligible', () => {
    const c = make();
    tick(c, 6);
    c.step(0.01, { ...eligible, engaged: true });
    expect(c.snapshot().idle).toBe(0);
    tick(c, 60, { eligible: false });
    expect(c.snapshot()).toMatchObject({ phase: 'idle', idle: 0, tried: false });
  });

  it('keeps three or four distinct carriers under the recognizable caption, within the lane', () => {
    const geometry = { width: 550, textWidth: 240 };
    for (const size of [3, 4]) {
      const start = textFormation({ phase: 'carry', elapsed: 0, size }, geometry);
      const end = textFormation({ phase: 'carry', elapsed: tuning.carry, size }, geometry);
      expect(start.ants).toHaveLength(size);
      expect(new Set(start.ants.map(a => a.x)).size).toBe(size);
      expect(start.x).toBe(275);
      expect(end.x - geometry.textWidth / 2).toBeGreaterThan(geometry.width);
      for (let t = 0; t < tuning.carry; t += 0.01) {
        const pose = textFormation({ phase: 'carry', elapsed: t, size }, geometry);
        for (const a of pose.ants) {
          expect(a.y - 9).toBeGreaterThan(0);
          expect(a.y + 9).toBeLessThan(tuning.laneHeight);
        }
      }
    }
  });

  it('replays identically with a private cosmetic seed and cannot change simulation, RNG or checkpoints', () => {
    const a = make(19), b = make(19);
    const game = createGame({ seed: 42 });
    game.confirm();
    const state = JSON.stringify(game.state), rng = game.exportRandom(), checkpoint = game.exportCheckpoint();
    for (let entry = 0; entry < 40; entry++) {
      a.reset(); b.reset();
      tick(a, 30); tick(b, 30);
      expect(a.snapshot()).toEqual(b.snapshot());
    }
    expect(JSON.stringify(game.state)).toBe(state);
    expect(game.exportRandom()).toEqual(rng);
    expect(game.exportCheckpoint()).toEqual(checkpoint);
  });

  it('leaves scripted gameplay state, events, streams and checkpoint bytes identical with different cosmetic seeds', () => {
    function play(cosmeticSeed) {
      const game = createGame({ seed: 77 });
      const c = cosmeticSeed === null ? null : make(cosmeticSeed);
      const log = [];
      game.confirm();
      for (let i = 0; i < 2400; i++) {
        game.update(1 / 60, { left: i % 160 < 80, right: i % 160 >= 80, fire: true });
        if (game.offerOpen()) game.chooseUpgrade(0);
        else game.confirm();
        for (const event of game.drainEvents()) log.push(`${i}:${event.type}`);
        if (i % 600 === 0) { c?.reset(); c?.trigger(); }
        for (let n = 0; n < i % 4; n++) c?.step(0.04, eligible);
      }
      return { state: JSON.stringify(game.state), rng: game.exportRandom(),
        checkpoint: JSON.stringify(game.exportCheckpoint()), log };
    }
    const plain = play(null);
    expect(play(3)).toEqual(plain);
    expect(play(42)).toEqual(plain);
  });
});

describe('safe decorative reading space', () => {
  const space = () => ({ panel: { left: 650, top: 150, right: 1250, bottom: 700 },
    copy: { scrollHeight: 500, clientHeight: 500 }, last: { bottom: 500 },
    viewport: { w: 1280, h: 720 }, width: 576, textWidth: 240 });
  it('uses free space below all functional copy', () => expect(readingTextSpace(space())).toBe(true));
  it.each(['scroll', 'crowded', 'clipped', 'narrow', 'long-text', 'invalid', 'portrait'])('suppresses %s geometry', (kind) => {
    const s = space();
    if (kind === 'scroll') s.copy.scrollHeight = 501.1;
    if (kind === 'crowded') s.last.bottom = 630;
    if (kind === 'clipped') s.panel.bottom = 721;
    if (kind === 'narrow') s.width = 350;
    if (kind === 'long-text') s.textWidth = 550;
    if (kind === 'invalid') s.panel.left = NaN;
    if (kind === 'portrait') s.viewport = { w: 400, h: 900 };
    expect(readingTextSpace(s)).toBe(false);
  });
});

describe('the reading overlay invariant: no measured space, no overlay', () => {
  /** Just enough of a page to measure, with geometry each test can change. */
  function fakePage() {
    const target = () => ({ addEventListener() {}, removeEventListener() {} });
    const room = { last: { bottom: 300 } };
    const line = {};
    const copy = { ...target(), scrollHeight: 300, clientHeight: 300, children: [line], lastElementChild: { getBoundingClientRect: () => room.last } };
    const panel = { ...target(), querySelector: () => copy, contains: () => false,
      getBoundingClientRect: () => ({ left: 650, top: 100, right: 1250, bottom: 700, width: 600 }) };
    const lane = { hidden: true };
    const context = { font: '', measureText: () => ({ width: 240 }), clearRect() {}, setTransform() {} };
    const canvas = { hidden: true, width: 0, height: 0, getContext: () => context };
    const caption = { textContent: 'Management denies the existence of ants.', hasAttribute: () => false, setAttribute() {}, removeAttribute() {} };
    const observers = [];
    const win = { ...target(), innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
      getComputedStyle: () => ({ font: '13px serif', color: '#fff' }),
      ResizeObserver: class { constructor(run) { this.run = run; this.watched = []; observers.push(this); }
        observe(e) { this.watched.push(e); } disconnect() { this.watched = []; } } };
    const nodes = { readingMischief: lane, readingAnts: canvas, readingCaption: caption, readingPresentation: panel };
    const doc = { ...target(), defaultView: win, activeElement: null, visibilityState: 'visible',
      getElementById: (id) => nodes[id], getSelection: () => null };
    const scene = { phase: 'reading', readingReady: true, readingKey: 'a', offer: false, blocked: false, holding: false };
    const mischief = createReadingMischief({ doc, random: createRandom(7) });
    const settings = { quality: 'high', reduced: false, focused: true, hidden: false, settling: false };
    const update = (over = {}, sceneOver = {}) => mischief.update(0.016, { ...scene, ...sceneOver }, { ...settings, ...over });
    return { room, lane, line, observers, mischief, update };
  }
  const CROWDED = { bottom: 640 };

  it('shows the lane when there is room to spare', () => {
    const { lane, mischief, update } = fakePage();
    update();
    expect(mischief.snapshot()).toMatchObject({ eligible: true, measured: true, laneHidden: false });
    expect(lane.hidden).toBe(false);
  });
  it('keeps the lane hidden, and refuses a trigger, when the copy needs the space', () => {
    const { room, lane, mischief, update } = fakePage();
    room.last = CROWDED;
    update();
    expect(mischief.snapshot()).toMatchObject({ eligible: false, geometry: null, measured: true, laneHidden: true });
    expect(lane.hidden).toBe(true);
    expect(mischief.trigger()).toBe(false);
  });
  it('hides the lane the moment a layout change invalidates it, not on the next measurement', () => {
    const { room, lane, mischief, update } = fakePage();
    update();
    room.last = CROWDED;
    mischief.invalidate();
    expect(lane.hidden).toBe(true);
    expect(mischief.snapshot()).toMatchObject({ eligible: false, geometry: null, measured: false });
    update();
    expect(mischief.snapshot()).toMatchObject({ eligible: false, measured: true, laneHidden: true });
  });
  it('watches the words for a reflow inside a panel that keeps its size', () => {
    const { room, line, lane, observers, mischief, update } = fakePage();
    expect(observers[0].watched).toEqual([line]);
    update();
    room.last = CROWDED;
    observers[0].run();
    update();
    expect(lane.hidden).toBe(true);
    expect(mischief.snapshot().eligible).toBe(false);
  });
  it('does not carry a measurement to a new reading while an unfocused window cannot measure', () => {
    const { room, lane, mischief, update } = fakePage();
    update();
    expect(lane.hidden).toBe(false);
    room.last = CROWDED;
    update({ focused: false }, { readingKey: 'b' });
    expect(lane.hidden).toBe(true);
    expect(mischief.snapshot()).toMatchObject({ eligible: false, geometry: null, measured: false });
    update({ focused: true }, { readingKey: 'b' });
    expect(mischief.snapshot()).toMatchObject({ eligible: false, measured: true, laneHidden: true });
  });
  it('holds through every way out of a reading', () => {
    const cases = [[{}, { phase: 'playing' }], [{ quality: 'low' }, {}], [{ reduced: true }, {}], [{ settling: true }, {}], [{}, { offer: true }]];
    for (const [over, sceneOver] of cases) {
      const { lane, mischief, update } = fakePage();
      update();
      update(over, sceneOver);
      expect(lane.hidden).toBe(true);
      expect(mischief.snapshot().eligible).toBe(false);
    }
  });
  it('returns once room is back, so a cramped moment is not a permanent verdict', () => {
    const { room, lane, mischief, update } = fakePage();
    room.last = CROWDED;
    update();
    room.last = { bottom: 300 };
    mischief.invalidate();
    update();
    expect(lane.hidden).toBe(false);
    expect(mischief.snapshot().eligible).toBe(true);
  });
});
