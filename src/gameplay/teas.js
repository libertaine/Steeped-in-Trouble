// Strange Brews: the tea variety brewed for each normal round.
//
// The tea is the round's environment; the fortune read from the last round's
// leaves is a second, independent layer on top. Each round start:
//   1. chooseTea(state, rng) picks the variety from the tea generator. The
//      first cup is always the House Blend; after that a variety never repeats
//      straight away, rounds since it was last served raise its chances, and
//      one missing for too long is served next.
//   2. roundModifiers(fortuneId, teaId) folds the tea's modifiers into the
//      fortune's by fixed rules (multipliers multiply, bonuses add, chances
//      take the larger, switches combine), so nothing stacks twice and
//      everything expires at the next round start.
//   3. Chai starts a spice current clock (createCurrent()), which
//      updateCurrent() runs during play.
//
// Hot Chocolate Havoc and The Daily Grind never read the tea.
//
// To add a variety, add an entry to TEAS (and to TEA_ROTATION), give any new
// modifier a neutral default in BASE_MODIFIERS and a rule in COMBINE, and
// put its tuning numbers in CONFIG.teas.

import { CONFIG } from '../config.js';
import { LANE_STEP } from './arena.js';
import { glide } from './enemies.js';
import { modifiersFor } from './fortunes.js';

const T = CONFIG.teas;
const C = CONFIG.currents;

export const TEAS = Object.freeze({
  house: {
    id: 'house',
    name: 'House Blend',
    quip: 'Just tea. For now.',
    title: 'the storm stirs',
    info: 'The familiar brew. Learn the cup while it behaves.',
    tag: 'house blend',
    color: '#e0a35a',
    modifiers: {},
  },
  green: {
    id: 'green',
    name: 'Green Tea',
    quip: 'A Little Too Refreshing',
    title: 'Green Tea',
    info: 'Leaves rise a little faster, and some dart: they crouch and flicker, then sprint.',
    tag: 'darting leaves',
    color: '#b9e37a',
    modifiers: { enemySpeedMultiplier: T.green.enemySpeed, dartChance: T.green.dartChance },
  },
  earlGrey: {
    id: 'earlGrey',
    name: 'Earl Grey',
    quip: 'Trouble with a Touch of Class',
    title: 'Earl Grey',
    info: 'Some leaves change lanes. A lavender curl shows which way they are about to step.',
    tag: 'wandering leaves',
    color: '#c9b3ef',
    modifiers: { wanderChance: T.earlGrey.wanderChance },
  },
  chai: {
    id: 'chai',
    name: 'Chai',
    quip: 'Spice Things Up',
    title: 'Chai',
    info: 'Spice currents sweep every leaf one lane sideways. Arrows round the rim warn which way.',
    tag: 'spice currents',
    color: '#f0a050',
    modifiers: { spiceCurrents: true },
  },
  black: {
    id: 'black',
    name: 'Black Tea',
    quip: 'Properly Strong',
    title: 'Black Tea',
    info: 'Leaves arrive more often, and every leaf scores 25% more.',
    tag: 'dense, +25%',
    color: '#e8c48a',
    modifiers: { spawnIntervalMultiplier: T.black.spawnInterval, scoreMultiplier: T.black.scoreMultiplier },
  },
  herbal: {
    id: 'herbal',
    name: 'Herbal Tea',
    quip: 'What Could Possibly Go Wrong?',
    title: 'Herbal Tea',
    info: 'A gentler cup: leaves arrive and rise more slowly, and milk lingers. The leaves may get ideas.',
    tag: 'calm… ish',
    color: '#f2b8cf',
    modifiers: {
      enemySpeedMultiplier: T.herbal.enemySpeed,
      spawnIntervalMultiplier: T.herbal.spawnInterval,
      milkDurationBonus: T.herbal.milkBonus,
    },
    // After an herbal round The Leaves Lie is more likely (never certain).
    fortuneNudges: { lie: T.herbal.lieWeight },
  },
});

/** The varieties served from the second cup on, in a fixed order for tie-breaks. */
export const TEA_ROTATION = Object.freeze(['green', 'earlGrey', 'chai', 'black', 'herbal']);

/** How each modifier a tea may set combines with the fortune's value. */
export const COMBINE = Object.freeze({
  enemySpeedMultiplier: 'multiply',
  spawnIntervalMultiplier: 'multiply',
  scoreMultiplier: 'multiply',
  milkDurationBonus: 'add',
  dartChance: 'max',
  wanderChance: 'max',
  spiceCurrents: 'or',
});

const RULES = {
  multiply: (a, b) => a * b,
  add: (a, b) => a + b,
  max: (a, b) => Math.max(a, b),
  or: (a, b) => a || b,
};

/**
 * The modifiers a normal round plays with: the fortune's, with the tea's
 * folded in by COMBINE, and leaf speed capped.
 */
export function roundModifiers(fortuneId, teaId = 'house') {
  const modifiers = modifiersFor(fortuneId);
  for (const [key, value] of Object.entries(TEAS[teaId]?.modifiers ?? {})) {
    modifiers[key] = RULES[COMBINE[key]](modifiers[key], value);
  }
  modifiers.enemySpeedMultiplier = Math.min(T.maxEnemySpeedMultiplier, modifiers.enemySpeedMultiplier);
  return modifiers;
}

/** Extra fortune weights after a round of this tea (fortune id → weight). */
export function teaFortuneNudges(teaId) {
  return TEAS[teaId]?.fortuneNudges ?? {};
}

/**
 * The variety for the round in state.round, given the one served last round
 * (state.tea) and when each was last served (state.teaServed). Always draws
 * exactly one number, so the tea generator advances the same way every cup.
 */
export function chooseTea(state, rng) {
  const roll = rng.next();
  if (state.round <= 1) return 'house';
  // Never served: count from the first cup.
  const since = (id) => state.round - (state.teaServed[id] ?? 1);
  const candidates = TEA_ROTATION.filter((id) => id !== state.tea);
  const overdue = candidates.filter((id) => since(id) > T.maxAbsence);
  if (overdue.length) return overdue.reduce((a, b) => (since(b) > since(a) ? b : a));
  const weights = candidates.map((id) => Math.min(T.weightCap, since(id)));
  let left = roll * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < candidates.length; i++) {
    left -= weights[i];
    if (left < 0) return candidates[i];
  }
  return candidates.at(-1);
}

// ── Chai's spice currents ────────────────────────────────────────────────

/** A current clock for one Chai round. `dir` is the first current's direction (−1 or 1). */
export function createCurrent(dir) {
  return {
    stage: 'calm', // calm → warning → flowing → calm …
    time: 0, // seconds in the current stage
    wait: C.firstAt, // seconds of calm before the next warning
    dir, // −1 anticlockwise, 1 clockwise; alternates after each current
    count: 0, // currents so far this round
  };
}

/** Seconds until the current clock leaves its stage. */
export function currentStageLength(current) {
  if (current.stage === 'warning') return C.warnTime;
  if (current.stage === 'flowing') return C.flowTime;
  return current.wait;
}

/**
 * Run the spice current clock: a warning, then every leaf in the cup glides
 * one lane in the current's direction. Timing is fixed, so it can be learned.
 */
export function updateCurrent({ state, emit }, dt) {
  const c = state.current;
  if (!c) return;
  c.time += dt;
  if (c.time < currentStageLength(c)) return;
  c.time = 0;
  if (c.stage === 'calm') {
    c.stage = 'warning';
    emit('currentWarn', { dir: c.dir });
  } else if (c.stage === 'warning') {
    c.stage = 'flowing';
    for (const enemy of state.enemies) glide(enemy, c.dir * LANE_STEP, C.flowTime);
    emit('currentFlow', { dir: c.dir, carried: state.enemies.length });
  } else {
    c.stage = 'calm';
    c.wait = C.calmTime;
    c.count++;
    emit('currentEnd', { dir: c.dir });
    c.dir = -c.dir;
  }
}
