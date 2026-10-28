// Strange Brews: the tea variety brewed for each normal round.
//
// The tea is the round's environment; the fortune read from the last round's
// leaves is a second, independent layer on top. Each round start:
//   1. chooseTea(state, rng) picks the variety from the tea generator, among
//      the teas on tap so far (gameplay/progress.js). The first cup is always
//      the House Blend, and a tea that has just come on tap is served the
//      round it arrives. Otherwise a variety never repeats straight away,
//      rounds since it was last served raise its chances, and one missing for
//      too long is served next.
//   2. roundModifiers(fortuneId, teaId, age) folds the tea's modifiers into
//      the fortune's by fixed rules (multipliers multiply, bonuses add, chances
//      take the larger, switches combine), so nothing stacks twice and
//      everything expires at the next round start.
//   3. Chai starts a spice current clock (createCurrent()), which
//      updateCurrent() runs during play.
// How strongly a variety's behaviour brews depends on its age, the normal
// rounds since it came on tap: see gameplay/strength.js. A tea's
// `strength(age)` gives its modifiers that grow with the stage.
//
// Hot Chocolate Havoc and The Daily Grind never read the tea.
//
// To add a variety, add an entry to TEAS and to a chapter's teas in
// CONFIG.chapters, give any new modifier a neutral default in BASE_MODIFIERS
// and a rule in COMBINE, and put its tuning numbers in CONFIG.teas (or, if
// they grow with the stage, in a per-stage list read through byStage()).

import { CONFIG } from '../config.js';
import { LANE_STEP } from './arena.js';
import { glide } from './enemies.js';
import { modifiersFor } from './fortunes.js';
import { debutTea, teasOnTap } from './progress.js';
import { byStage } from './strength.js';

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
    modifiers: { enemySpeedMultiplier: T.green.enemySpeed },
    strength: (age) => ({ dartChance: byStage(CONFIG.darting.chance, age) }),
  },
  earlGrey: {
    id: 'earlGrey',
    name: 'Earl Grey',
    quip: 'Trouble with a Touch of Class',
    title: 'Earl Grey',
    info: 'Some leaves change lanes. A lavender curl shows which way they are about to step.',
    tag: 'wandering leaves',
    color: '#c9b3ef',
    modifiers: {},
    strength: (age) => ({ wanderChance: byStage(CONFIG.wandering.chance, age) }),
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

/** The modifiers a tea of a given age brews with (its fixed ones, plus those that grow with the stage). */
export function teaModifiers(teaId, age) {
  const tea = TEAS[teaId];
  return { ...tea?.modifiers, ...tea?.strength?.(age) };
}

/**
 * The modifiers a normal round plays with: the fortune's, with the tea's
 * at its age folded in by COMBINE, and leaf speed capped.
 */
export function roundModifiers(fortuneId, teaId = 'house', age = 1) {
  const modifiers = modifiersFor(fortuneId);
  for (const [key, value] of Object.entries(teaModifiers(teaId, age))) {
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
 * The variety for the round in state.round, given the teas on tap
 * (state.progress), the one served last round (state.tea), and when each was
 * last served (state.teaServed). Always draws exactly one number, so the tea
 * generator advances the same way every cup.
 */
export function chooseTea(state, rng) {
  const roll = rng.next();
  if (state.round <= 1) return 'house';
  const debut = debutTea(state.progress, state.round);
  if (debut) return debut;
  // Never served: count from the first cup.
  const since = (id) => state.round - (state.teaServed[id] ?? 1);
  const candidates = teasOnTap(state.progress, state.round).filter((id) => id !== state.tea);
  if (!candidates.length) return state.tea;
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

/**
 * A current clock for one Chai round. `dir` is the first current's direction
 * (−1 or 1); Chai's age sets how long the warnings and calms last.
 */
export function createCurrent(dir, age = 1) {
  return {
    stage: 'calm', // calm → warning → flowing → calm …
    time: 0, // seconds in the current stage
    wait: byStage(C.firstAt, age), // seconds of calm before the next warning
    calm: byStage(C.calmTime, age), // the calm between currents
    warn: byStage(C.warnTime, age), // how long each warning lasts
    dir, // −1 anticlockwise, 1 clockwise; alternates after each current
    count: 0, // currents so far this round
  };
}

/** Seconds until the current clock leaves its stage. */
export function currentStageLength(current) {
  if (current.stage === 'warning') return current.warn;
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
  const length = currentStageLength(c);
  if (c.time < length) return;
  c.time -= length; // keep the overshoot, so the clock keeps time at any frame rate
  if (c.stage === 'calm') {
    c.stage = 'warning';
    emit('currentWarn', { dir: c.dir });
  } else if (c.stage === 'warning') {
    c.stage = 'flowing';
    for (const enemy of state.enemies) glide(enemy, c.dir * LANE_STEP, C.flowTime);
    emit('currentFlow', { dir: c.dir, carried: state.enemies.length });
  } else {
    c.stage = 'calm';
    c.wait = c.calm;
    c.count++;
    emit('currentEnd', { dir: c.dir });
    c.dir = -c.dir;
  }
}
