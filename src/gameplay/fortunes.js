// Fortunes: reading the leaves left by a completed round, and the modifiers
// each fortune applies to the following round.
//
// Flow:
//   1. When a round ends, the game builds a round record
//      ({ milkKills, milkUses, sugarUses, escapes, nearMisses, leafLanes }).
//   2. selectFortune(record) finds the pattern the leaves point at: the first
//      fortune in FORTUNE_PRIORITY whose matches() accepts the reading.
//   3. drawFortune(record, rng) makes the actual choice: a weighted draw in
//      which that pattern is a strong favourite and each fortune's weight()
//      leans on how the round was played. Tendencies, never guarantees.
//   4. When the next round starts, modifiersFor(id) produces that round's
//      modifiers. They expire automatically at the following round start.
//
// To add a fortune, add an entry to FORTUNES (with a weight()), and give any
// new modifier a neutral default in BASE_MODIFIERS. Only fortunes with
// matches() belong in FORTUNE_PRIORITY.

import { CONFIG } from '../config.js';
import { LANES, wrapLane } from './arena.js';

const F = CONFIG.fortunes;

/** Neutral values: a round with no fortune plays with these. */
export const BASE_MODIFIERS = Object.freeze({
  bonusSugar: 0, // extra sugar bursts this round
  milkDurationBonus: 0, // extra seconds per milk cloud
  steamSpeedMultiplier: 1, // regular steam dart speed
  scoreMultiplier: 1, // applied to every kill
  laneDrift: false, // foes drift one lane sideways mid-flight
  sugarRegenInterval: 0, // seconds per regenerated sugar burst; 0 = none
  twinSteam: false, // each steam shot is two veering darts
  enemySpeedMultiplier: 1, // leaf speed
  goldenCube: false, // a golden sugar cube appears once this round
  stormyMilk: false, // milk is caught in the currents (The Perfect Storm)
});

/** Follow a polyline: t ∈ [0, 1] moves evenly from point to point. */
function alongPath(points, t) {
  const xx = t * (points.length - 1);
  const k = Math.min(points.length - 2, Math.floor(xx));
  const f = xx - k;
  return {
    x: points[k][0] * (1 - f) + points[k + 1][0] * f,
    y: points[k][1] * (1 - f) + points[k + 1][1] * f,
  };
}

// Neutral round records count nothing; weight() helpers treat a clean round
// (no escapes) as the mark of a well-played cup.
const clean = (record) => (record.escapes ?? 0) === 0;

const CROWN_OUTLINE = [
  [-115, 72], [-125, -57], [-70, -22], [-34, -109], [0, -32],
  [45, -112], [75, -22], [128, -54], [109, 72], [-115, 72],
];

// An isometric sugar cube: the hexagon, then the inner "Y".
const CUBE_OUTLINE = [
  [-95, -55], [0, -110], [95, -55], [95, 55], [0, 110], [-95, 55], [-95, -55],
  [0, 0], [95, -55], [0, 0], [0, 110],
];

const BOLT_OUTLINE = [[40, -130], [-50, 5], [10, 5], [-40, 130], [60, -20], [0, -20], [40, -130]];

export const FORTUNES = Object.freeze({
  crown: {
    id: 'crown',
    name: 'The Crown',
    quote: 'Heavy is the head that wears the teacup.',
    info: 'A cluster of leaves foretells abundance: +1 sugar burst.',
    tag: '+1 sugar',
    tone: 'good',
    color: '#eed393',
    weight: () => 0.5,
    modifiers: { bonusSugar: F.crownBonusSugar },
    matches: (reading) => reading.clusterShare >= F.crownClusterShare,
    // Leaves trace a crown outline.
    glyph: (t) => alongPath(CROWN_OUTLINE, t),
  },
  veil: {
    id: 'veil',
    name: 'The Veil',
    quote: 'Some things are better left a little cloudy.',
    info: 'Milky leaves promise cover: milk clouds last 2.5 seconds longer.',
    tag: 'longer milk',
    tone: 'good',
    color: '#d1e8de',
    weight: (record) => 0.5 + 0.6 * (record.milkUses ?? 0), // a defensive cup invites more defence
    modifiers: { milkDurationBonus: F.veilMilkBonus },
    matches: (reading) => reading.milkKills >= F.veilMilkKills,
    // A drifting horizontal wave.
    glyph(t) {
      return {
        x: -123 + 246 * t,
        y: 43 * Math.sin(t * 4 * Math.PI) - 28 * Math.cos(t * 2 * Math.PI),
      };
    },
  },
  spiral: {
    id: 'spiral',
    name: 'The Spiral',
    quote: 'The leaves have taken up interpretive dance.',
    info: 'Scattered leaves foretell crosswinds: foes drift between lanes; each kill scores 25% more.',
    tag: 'drifting leaves, +25%',
    tone: 'trouble',
    color: '#b7dcbe',
    weight: () => 0.5,
    modifiers: { laneDrift: true, scoreMultiplier: F.spiralScoreMultiplier },
    matches: (reading) => reading.occupiedLanes >= F.spiralOccupiedLanes,
    glyph(t) {
      const r = 17 + 120 * t;
      const a = t * 3.6 * Math.PI - Math.PI / 2;
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    },
  },
  star: {
    id: 'star',
    name: 'The Star',
    quote: 'A clear cup and a steady spoon.',
    info: 'A clear cup guides the spoon: steam darts travel 35% faster.',
    tag: 'fast steam',
    tone: 'good',
    color: '#cfdeef',
    weight: (record) => (clean(record) ? 1 : 0.5),
    modifiers: { steamSpeedMultiplier: F.starSteamMultiplier },
    matches: () => true, // the fallback reading
    // Five outer points, then five inner points.
    glyph(t) {
      const r = t < 0.5 ? 120 : 55;
      const a = -Math.PI / 2 + Math.floor(t * 10) * (Math.PI / 5);
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    },
  },
  sugarRush: {
    id: 'sugarRush',
    name: 'Sugar Rush',
    quote: 'One lump or seventeen?',
    info: `Sugar bursts regenerate: one every ${F.sugarRushInterval} seconds, up to your usual supply.`,
    tag: 'sugar regrows',
    tone: 'good',
    color: '#ffe7a3',
    modifiers: { sugarRegenInterval: F.sugarRushInterval },
    weight: (record) => 1 + 1.2 * (record.sugarUses ?? 0), // the sweet tooth is noticed
    glyph: (t) => alongPath(CUBE_OUTLINE, t),
  },
  doubleTrouble: {
    id: 'doubleTrouble',
    name: 'Double Trouble',
    quote: 'Two spoons would be excessive. Two shots, however…',
    info: 'Every puff of steam is two darts that veer gently apart.',
    tag: 'twin steam',
    tone: 'good',
    color: '#c8f5e6',
    modifiers: { twinSteam: true },
    weight: (record) => (clean(record) ? 2.5 : 1),
    // Two linked rings.
    glyph(t) {
      const left = t < 0.5;
      const a = (left ? t * 2 : (t - 0.5) * 2) * Math.PI * 2 + (left ? 0 : Math.PI);
      return { x: (left ? -52 : 52) + 78 * Math.cos(a), y: 78 * Math.sin(a) };
    },
  },
  tempest: {
    id: 'tempest',
    name: 'Tempestuous Tea',
    quote: 'A disturbance in the steeping.',
    info: 'The tea is in a mood: wilder currents, and leaves rise 18% faster.',
    tag: 'faster leaves',
    tone: 'trouble',
    color: '#f2a27a',
    modifiers: { enemySpeedMultiplier: F.tempestEnemySpeed, stormyMilk: true },
    // Spills stir up trouble, and so, a little, do narrow escapes.
    weight: (record) => 0.6 + 1.6 * (record.escapes ?? 0)
      + CONFIG.strainer.nearMissWeight * Math.min(CONFIG.strainer.maxNearMisses, record.nearMisses ?? 0),
    glyph: (t) => alongPath(BOLT_OUTLINE, t),
  },
  golden: {
    id: 'golden',
    name: 'Golden Opportunity',
    quote: 'Fortune favors the well-caffeinated.',
    info: 'A golden sugar cube will appear briefly. Steam it before it dissolves.',
    tag: 'watch for gold',
    tone: 'good',
    rare: true,
    color: '#ffd45e',
    modifiers: { goldenCube: true },
    weight: (record) => (clean(record) ? 2 : 0.8),
    // A four-pointed sparkle.
    glyph(t) {
      const a = t * Math.PI * 2 - Math.PI / 2;
      return { x: 135 * Math.cos(a) ** 3, y: 135 * Math.sin(a) ** 3 };
    },
  },
  lie: {
    id: 'lie',
    name: 'The Leaves Lie',
    quote: 'Your future is perfectly clear. Probably.',
    info: 'Nothing is promised. Something may happen anyway.',
    tag: '???',
    tone: 'odd',
    rare: true,
    color: '#d9b8f2',
    modifiers: {},
    weight: (record) => (clean(record) ? 0.6 : 0.35),
    // A question mark: a hook, a stem, and a dot.
    glyph(t) {
      if (t > 0.86) {
        const a = ((t - 0.86) / 0.14) * Math.PI * 2;
        return { x: 11 * Math.cos(a), y: 100 + 11 * Math.sin(a) };
      }
      if (t < 0.66) {
        const a = Math.PI + (t / 0.66) * Math.PI * 1.25;
        return { x: 64 * Math.cos(a), y: -58 + 64 * Math.sin(a) };
      }
      const f = (t - 0.66) / 0.2;
      return { x: 45 * (1 - f), y: -13 + 63 * f };
    },
  },
});

/**
 * What The Leaves Lie claims before it changes its mind. Shown during the
 * reading, chosen cosmetically.
 */
export const FIBS = Object.freeze([
  { claim: 'Great Wealth', retraction: 'The leaves request a second opinion.' },
  { claim: 'A Tall, Dark Stranger', retraction: 'On reflection, it was a teaspoon.' },
  { claim: 'Eternal Glory', retraction: 'Or a mild inconvenience. Hard to say.' },
  { claim: 'Beware the Biscuit', retraction: 'The leaves stand by the biscuit.' },
  { claim: 'Absolutely Nothing', retraction: 'Which is, itself, a lie.' },
  { claim: 'A Perfectly Clear Future', retraction: 'Probably.' },
]);

/** Pattern readings, checked in order; the first match wins. */
export const FORTUNE_PRIORITY = Object.freeze(['veil', 'crown', 'spiral', 'star']);

/**
 * Summarize where the leaves settled.
 * @param {number[]} leafLanes lane index of every leaf in the cup
 */
export function readLeafPattern(leafLanes) {
  const bins = new Array(LANES).fill(0);
  for (const lane of leafLanes) bins[wrapLane(lane)]++;
  let maxCluster = 0;
  for (let i = 0; i < LANES; i++) {
    let sum = 0;
    for (let k = 0; k < F.crownClusterWidth; k++) sum += bins[(i + k) % LANES];
    maxCluster = Math.max(maxCluster, sum);
  }
  return {
    bins,
    total: leafLanes.length,
    maxCluster,
    clusterShare: maxCluster / Math.max(1, leafLanes.length),
    occupiedLanes: bins.filter((count) => count > 0).length,
  };
}

/**
 * The fortune the leaf pattern points at, from a completed round's record.
 * @param {{ milkKills: number, leafLanes: number[] }} record
 * @returns {string} fortune id
 */
export function selectFortune(record) {
  const reading = { milkKills: record.milkKills, ...readLeafPattern(record.leafLanes) };
  return FORTUNE_PRIORITY.find((id) => FORTUNES[id].matches(reading));
}

/**
 * How likely each fortune is after a round: its own weight(record), plus a
 * strong lean towards the pattern the leaves formed.
 * @returns {Record<string, number>}
 */
export function fortuneWeights(record) {
  const pattern = selectFortune(record);
  const weights = {};
  for (const [id, fortune] of Object.entries(FORTUNES)) {
    weights[id] = fortune.weight(record) + (id === pattern ? F.patternWeight : 0);
  }
  return weights;
}

/**
 * Draw the fortune for the next round.
 * @param {{ milkKills: number, milkUses?: number, sugarUses?: number, escapes?: number, nearMisses?: number,
 *   leafLanes: number[] }} record
 * @param {{ next(): number }} rng
 * @returns {string} fortune id
 */
export function drawFortune(record, rng) {
  const weights = Object.entries(fortuneWeights(record));
  let roll = rng.next() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of weights) {
    roll -= w;
    if (roll < 0) return id;
  }
  return weights.at(-1)[0];
}

/** The modifiers a round plays with under a fortune (or none). */
export function modifiersFor(fortuneId) {
  const fortune = fortuneId ? FORTUNES[fortuneId] : null;
  return { ...BASE_MODIFIERS, ...(fortune?.modifiers ?? {}) };
}

/**
 * Where leaf number `index` of `count` settles while forming a fortune's
 * glyph, as an offset from the cup centre.
 */
export function glyphPoint(fortuneId, index, count) {
  const t = index / Math.max(1, count - 1);
  return FORTUNES[fortuneId].glyph(t);
}
