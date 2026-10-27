// Fortunes: reading the leaves left by a completed round, and the modifiers
// each fortune applies to the following round.
//
// Flow:
//   1. When a round ends, the game builds a round record ({ milkKills, leafLanes }).
//   2. selectFortune(record) returns the id of the first fortune in
//      FORTUNE_PRIORITY whose matches() accepts the reading.
//   3. When the next round starts, modifiersFor(id) produces that round's
//      modifiers. They expire automatically at the following round start.
//
// To add a fortune, add an entry to FORTUNES, place its id in FORTUNE_PRIORITY,
// and give any new modifier a neutral default in BASE_MODIFIERS.

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
});

const CROWN_OUTLINE = [
  [-115, 72], [-125, -57], [-70, -22], [-34, -109], [0, -32],
  [45, -112], [75, -22], [128, -54], [109, 72], [-115, 72],
];

export const FORTUNES = Object.freeze({
  crown: {
    id: 'crown',
    name: 'The Crown',
    info: 'A cluster of leaves foretells abundance: +1 sugar burst next cup.',
    color: '#eed393',
    modifiers: { bonusSugar: F.crownBonusSugar },
    matches: (reading) => reading.clusterShare >= F.crownClusterShare,
    // Leaves trace a crown outline.
    glyph(t) {
      const xx = t * (CROWN_OUTLINE.length - 1);
      const k = Math.min(CROWN_OUTLINE.length - 2, Math.floor(xx));
      const f = xx - k;
      return {
        x: CROWN_OUTLINE[k][0] * (1 - f) + CROWN_OUTLINE[k + 1][0] * f,
        y: CROWN_OUTLINE[k][1] * (1 - f) + CROWN_OUTLINE[k + 1][1] * f,
      };
    },
  },
  veil: {
    id: 'veil',
    name: 'The Veil',
    info: 'Milky leaves promise cover: milk clouds last 2.5 seconds longer next cup.',
    color: '#d1e8de',
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
    info: 'Scattered leaves foretell crosswinds: foes drift between lanes; each kill scores 25% more.',
    color: '#b7dcbe',
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
    info: 'A clear cup guides the spoon: steam darts travel 35% faster next cup.',
    color: '#cfdeef',
    modifiers: { steamSpeedMultiplier: F.starSteamMultiplier },
    matches: () => true, // the fallback reading
    // Five outer points, then five inner points.
    glyph(t) {
      const r = t < 0.5 ? 120 : 55;
      const a = -Math.PI / 2 + Math.floor(t * 10) * (Math.PI / 5);
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    },
  },
});

/** Checked in order; the first match wins. */
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
 * Choose the fortune for the next round from a completed round's record.
 * @param {{ milkKills: number, leafLanes: number[] }} record
 * @returns {string} fortune id
 */
export function selectFortune(record) {
  const reading = { milkKills: record.milkKills, ...readLeafPattern(record.leafLanes) };
  return FORTUNE_PRIORITY.find((id) => FORTUNES[id].matches(reading));
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
