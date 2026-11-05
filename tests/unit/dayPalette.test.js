import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { dayOf } from '../../src/gameplay/days.js';
import { DAY_PALETTES, DAY_PROPERTIES, createDayPalette, paletteForDay, paletteForRound, paletteIndex } from '../../src/ui/dayPalette.js';
import { checkpointAfter } from '../support/checkpoints.js';
import { finishNormal, resolveReading } from '../support/daySimulation.js';

const IDS = ['parchment', 'sage', 'lavender', 'honey', 'rose', 'porcelain', 'biscuit'];

/** Just enough of a document: <body> with a dataset and an inline style. */
function fakeDoc() {
  const props = {};
  const body = { dataset: {}, style: { setProperty: (name, value) => { props[name] = value; } } };
  return { doc: { body }, body, props };
}

/** Relative luminance and WCAG contrast, for the lettering that sits on the ground. */
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('Day palette selection', () => {
  it('has seven distinct palettes in Day order, Day 1 being the established page ground', () => {
    expect(DAY_PALETTES.map((p) => p.id)).toEqual(IDS);
    expect(DAY_PALETTES.map((p) => p.name)).toEqual(['Warm Parchment', 'Sage Cream', 'Lavender Mist', 'Honey Cream',
      'Rose Beige', 'Blue Porcelain', 'Sunday Biscuit']);
    expect(DAY_PALETTES[0]).toMatchObject({ glow: '#263e34', mid: '#13231f', deep: '#0c1716', paper: '#e6e1d5' });
    for (const key of Object.keys(DAY_PROPERTIES)) {
      expect(new Set(DAY_PALETTES.map((p) => p[key])).size, key).toBe(7);
      for (const p of DAY_PALETTES) expect(p[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.isFrozen(DAY_PALETTES) && DAY_PALETTES.every(Object.isFrozen)).toBe(true);
  });

  it('chooses Days 1-7 in order and repeats from Day 8', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => paletteForDay(d).id)).toEqual(IDS);
    expect([8, 9, 14, 15, 21, 22, 70, 71].map(paletteIndex)).toEqual([0, 1, 6, 0, 6, 0, 6, 0]);
    expect(paletteForDay(8)).toBe(paletteForDay(1));
    expect(paletteForDay(1_000_000)).toBe(paletteForDay(1_000_000 % 7));
  });

  it.each([undefined, null, 0, -1, -8, 1.5, NaN, Infinity, '3', {}, [], 2 ** 60])('treats Day %s as Day 1', (day) => {
    expect(paletteForDay(day)).toBe(DAY_PALETTES[0]);
  });

  it('follows the HUD Day: ten cups each, changing on cup 11, 21 ...', () => {
    for (let round = 1; round <= 160; round++) expect(paletteForRound(round)).toBe(paletteForDay(dayOf(round)));
    expect([1, 10, 11, 20, 21, 70, 71, 80].map((r) => paletteForRound(r).id))
      .toEqual(['parchment', 'parchment', 'sage', 'sage', 'lavender', 'biscuit', 'parchment', 'parchment']);
    for (const round of [undefined, null, 0, -3, 2.5, NaN, '11']) expect(paletteForRound(round)).toBe(DAY_PALETTES[0]);
  });

  it('keeps the light page lettering at least as readable as on Day 1', () => {
    const lettering = ['#a1bdb0', '#93a99b', '#f1dfbd', '#bbd3c2']; // kicker, footer, brand, version
    for (const ink of lettering) {
      const floor = Math.min(contrast(ink, DAY_PALETTES[0].glow), 4.5);
      for (const p of DAY_PALETTES) {
        for (const ground of [p.glow, p.mid, p.deep]) expect(contrast(ink, ground), `${ink} on ${p.id}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('matches the registered CSS defaults to Day 1, so the page looks the same before scripts run', () => {
    const css = readFileSync(new URL('../../styles/main.css', import.meta.url), 'utf8');
    for (const [key, property] of Object.entries(DAY_PROPERTIES)) {
      const rule = css.match(new RegExp(`@property ${property} \\{[^}]*initial-value: (#[0-9a-f]{6})`));
      expect(rule?.[1], property).toBe(DAY_PALETTES[0][key]);
    }
    // Decorative targets only: the gradient and the header rule, nothing else reads the palette.
    const uses = css.split('\n').filter((line) => /var\(--day-/.test(line));
    expect(uses).toHaveLength(2);
  });
});

describe('the page palette controller', () => {
  it('applies the first palette at once and writes only when it changes', () => {
    const { doc, body, props } = fakeDoc();
    const palette = createDayPalette(doc);
    expect(palette.update({ round: 1 })).toBe(DAY_PALETTES[0]);
    expect(body.dataset).toEqual({ dayPalette: 'parchment' });
    expect(props).toEqual({ '--day-paper': '#e6e1d5', '--day-glow': '#263e34', '--day-mid': '#13231f', '--day-deep': '#0c1716' });
    body.dataset.dayPalette = 'touched';
    palette.update({ round: 7 });
    expect(body.dataset.dayPalette).toBe('touched'); // same Day: no DOM writes
  });

  it('fades only for a Day choice on High graphics; restores, resets and Low graphics snap', () => {
    const { doc, body } = fakeDoc();
    const palette = createDayPalette(doc);
    palette.update({ round: 10 });
    palette.handle({ type: 'dayStart', choice: 'keep', day: 2 });
    palette.update({ round: 11 });
    expect(body.dataset).toMatchObject({ dayPalette: 'sage', dayFade: 'on' });
    palette.update({ round: 1 }); // New pot
    expect(body.dataset).toEqual({ dayPalette: 'parchment' });
    palette.update({ round: 35 }); // Continue a saved pot
    expect(body.dataset).toEqual({ dayPalette: 'honey' });
    palette.handle({ type: 'dayStart' });
    palette.update({ round: 41 }, { quality: 'low' });
    expect(body.dataset).toEqual({ dayPalette: 'rose' });
    // A dayStart that changes nothing is forgotten, not saved up for a later restore.
    palette.handle({ type: 'dayStart' });
    palette.update({ round: 42 });
    palette.update({ round: 1 });
    expect(body.dataset.dayFade).toBeUndefined();
    for (const type of ['matchStart', 'roundStart', 'reading', 'dayEnd', 'checkpoint']) palette.handle({ type });
    palette.update({ round: 11 });
    expect(body.dataset.dayFade).toBeUndefined();
  });

  it('survives a missing state or body', () => {
    const { doc, body } = fakeDoc();
    expect(createDayPalette(doc).update(undefined)).toBe(DAY_PALETTES[0]);
    expect(body.dataset.dayPalette).toBe('parchment');
    expect(createDayPalette({ body: null }).update({ round: 11 })).toBe(DAY_PALETTES[1]);
  });
});

describe('palettes and the real game', () => {
  it('advances on the Day choice, resets on a new pot and never touches the simulation or its RNG', () => {
    const { doc, body } = fakeDoc();
    const palette = createDayPalette(doc);
    const g = createGame({ seed: 42 });
    const sync = () => {
      for (const event of g.drainEvents()) palette.handle(event);
      const before = { state: structuredClone(g.state), random: g.exportRandom() };
      palette.update(g.state);
      expect({ state: structuredClone(g.state), random: g.exportRandom() }).toEqual(before);
    };
    sync();
    expect(body.dataset.dayPalette).toBe('parchment');
    g.primaryAction();
    Object.assign(g.state, { round: 10, heat: 9, grindAfter: null, lastGrind: 10, havocAfter: null, lastHavoc: 10, shortageAfter: 1000 });
    finishNormal(g);
    resolveReading(g);
    sync();
    expect(g.state.phase).toBe('day');
    expect(body.dataset).toEqual({ dayPalette: 'parchment' }); // "Day 1 complete" is still Day 1
    expect(g.chooseDay('keep')).toBe(true);
    sync();
    expect(body.dataset).toEqual({ dayPalette: 'sage', dayFade: 'on' });
    g.state.phase = 'gameover';
    g.primaryAction(); // a fresh pot
    sync();
    expect(g.state.round).toBe(1);
    expect(body.dataset).toEqual({ dayPalette: 'parchment' });
  });

  it.each([[9, 'parchment'], [27, 'lavender'], [31, 'honey']])('restores the Day of a pot saved after round %i from its existing round', (round, id) => {
    const { checkpoint } = checkpointAfter(round);
    expect(Object.keys(checkpoint)).toEqual(['schemaVersion', 'state', 'random', 'pinnedTea']);
    expect(JSON.stringify(checkpoint)).not.toMatch(/palette/i); // nothing new in the save
    const resumed = createGame({ checkpoint: JSON.parse(JSON.stringify(checkpoint)) });
    const { doc, body } = fakeDoc();
    createDayPalette(doc).update(resumed.state);
    expect(body.dataset).toEqual({ dayPalette: id });
  });
});
