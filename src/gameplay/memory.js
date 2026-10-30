// What the cup remembers: a short, truthful account of how a finished round
// leaned on the fortune draw, shown during the reading.
//
// Everything here is derived from the same round record the draw used
// (fortuneRecord()), so it is pure and deterministic: it draws no random
// numbers, changes no state, and a restored checkpoint explains itself exactly
// as it did before it was saved. It describes influence, never cause: each
// observation names a weight that really moved in fortunes.js, and the result
// says plainly when the leaves picked something else.
//
// Observations, strongest first (at most CONFIG.fortunes.memory.maxShown):
//   1. the pattern the leaves formed (The Veil, The Crown, The Spiral)
//   2. tactics: spills, heavy milk, heavy sugar
//   3. near misses
//   4. supporting influences, shown only beside a stronger one: a clean cup,
//      and Herbal Tea's nudge towards The Leaves Lie
// With nothing stronger than a supporting influence, one neutral line stands
// in rather than an invented cause. Secret feats are never hinted at here.

import { CONFIG } from '../config.js';
import { FORTUNES, readLeafPattern, selectFortune } from './fortunes.js';
import { teaFortuneNudges } from './teas.js';
import { PHASE } from '../core/state.js';

const M = CONFIG.fortunes.memory;
const LANES = CONFIG.arena.lanes;

/** The round record a reading draws its fortune from. The one source for the draw and its explanation. */
export function fortuneRecord(state) {
  const { milkKills, milkUses, sugarUses, escapes, nearMisses } = state.roundStats;
  return {
    milkKills, milkUses, sugarUses, escapes, nearMisses,
    leafLanes: state.residue.map((leaf) => leaf.lane),
    nudges: teaFortuneNudges(state.tea),
  };
}

const plural = (n, one, many) => (n === 1 ? one : many);
const times = (n) => (n === 2 ? 'twice' : `${n} times`);

// Shown when the leaves picked one of the fortunes the round favoured.
const AGREED = Object.freeze({
  crown: 'The leaves are wearing it well.',
  veil: 'The leaves recommend staying suspiciously cloudy.',
  spiral: 'The leaves are already a little dizzy.',
  star: 'The leaves approve of the steady spoon.',
  sugarRush: 'The leaves noticed the sweet tooth.',
  tempest: 'The leaves are still rattled.',
  doubleTrouble: 'The leaves suggest twice the steam.',
  golden: 'The leaves are feeling generous.',
  lie: 'The herbal tea is not sorry.',
});
const DIFFERED = 'The leaves considered your suggestion. Briefly.';
const UNPROMPTED = 'The leaves had ideas of their own.';
const KARMA = 'Karma arrives when it pleases.';

/**
 * Explain a reading: what the round did, which fortunes that favoured, and
 * the fortune the draw actually produced.
 * @param {object} record see fortuneRecord()
 * @param {string} fortuneId the fortune drawn
 * @param {{ secrets?: number }} [options] secrets shown alongside take a slot each
 */
export function rememberRound(record, fortuneId, { secrets = 0 } = {}) {
  const leaves = readLeafPattern(record.leafLanes);
  const pattern = selectFortune(record);
  const milkUses = record.milkUses ?? 0;
  const sugarUses = record.sugarUses ?? 0;
  const escapes = record.escapes ?? 0;
  const nearMisses = record.nearMisses ?? 0;
  const found = [];
  const add = (rank, id, fact, influence, favors) => found.push({ rank, id, fact, influence, favors });

  if (pattern === 'veil') {
    add(1, 'veilPattern', `Milk helped defeat ${record.milkKills} ${plural(record.milkKills, 'leaf', 'leaves')}.`,
      'Milk-soaked leaves formed a strong Veil pattern.', ['veil']);
  } else if (pattern === 'crown') {
    add(1, 'crownPattern', `${leaves.maxCluster} of ${leaves.total} ${plural(leaves.total, 'leaf', 'leaves')} settled close together.`,
      'The concentrated pattern favored The Crown.', ['crown']);
  } else if (pattern === 'spiral') {
    add(1, 'spiralPattern', `Leaves settled across ${leaves.occupiedLanes} of ${LANES} lanes.`,
      'The scattered pattern favored The Spiral.', ['spiral']);
  }
  if (escapes > 0) {
    add(2, 'spills', escapes === 1 ? 'A leaf spilled over the rim.' : `${escapes} leaves spilled over the rim.`,
      'Spills increased the likelihood of Tempestuous Tea.', ['tempest']);
  }
  // A Veil pattern already says everything the milk would.
  if (milkUses >= M.heavyMilk && pattern !== 'veil') {
    add(2, 'milk', `You poured milk ${times(milkUses)}.`, 'Your defensive tactics favored The Veil.', ['veil']);
  }
  if (sugarUses >= M.heavySugar) {
    add(2, 'sugar', `You fired ${sugarUses} sugar bursts.`, 'Sugar Rush became more likely.', ['sugarRush']);
  }
  if (nearMisses > 0) {
    add(3, 'nearMisses', `${nearMisses} narrow ${plural(nearMisses, 'escape', 'escapes')} at the rim.`,
      `Narrow escapes ${escapes > 0 ? 'also ' : ''}nudged the reading toward Tempestuous Tea.`, ['tempest']);
  }
  if (escapes === 0) {
    add(4, 'clean', 'No leaves spilled.', 'A clean cup favored several kindly fortunes.', ['star', 'doubleTrouble', 'golden']);
  }
  if ((record.nudges?.lie ?? 0) > 0) {
    add(5, 'herbal', 'The herbal tea gave the leaves ideas.', 'The Leaves Lie became a little more likely.', ['lie']);
  }

  const room = Math.max(1, M.maxShown - secrets);
  const neutral = !found.some((o) => o.rank <= 3);
  const observations = neutral ? [] : found.sort((a, b) => a.rank - b.rank).slice(0, room)
    .map(({ id, fact, influence, favors }) => ({ id, fact, influence, favors }));
  if (neutral) {
    // Only possible in a clean cup with no pattern: The Star's fallback, and the clean cup's lean.
    observations.push({
      id: 'neutral', fact: 'A tidy cup: nothing spilled, and no strong pattern formed.',
      influence: 'Quiet cups lean toward The Star and other kindly fortunes.', favors: ['star', 'doubleTrouble', 'golden'],
    });
  }
  const favored = [...new Set(observations.flatMap((o) => o.favors))];
  const agreed = favored.includes(fortuneId);
  const fortune = FORTUNES[fortuneId];
  let remark = AGREED[fortuneId] ?? KARMA; // Karma is never favoured by play
  if (fortuneId !== 'karma' && !agreed) remark = neutral ? UNPROMPTED : DIFFERED;
  return { observations, neutral, favored, fortune: fortuneId, agreed, name: fortune.name, effect: fortune.effect, remark };
}

/** The current reading's explanation, or null outside a reading. */
export function readingMemory(state) {
  if (state.phase !== PHASE.READING || !state.nextFortune) return null;
  return rememberRound(fortuneRecord(state), state.nextFortune, { secrets: state.secrets.length });
}
