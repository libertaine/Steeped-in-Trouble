// A scripted player for measuring which leaf patterns real rounds leave
// behind (issue #15). It plays genuine rounds — real spawning, teas, currents
// and milk credit — with a few distinct styles, then reads the cup exactly
// as the game does. Seeded, so every sweep is repeatable.
import { createGame } from '../../src/core/game.js';
import { angleDifference, laneOf } from '../../src/gameplay/arena.js';
import { FORTUNES, selectFortune } from '../../src/gameplay/fortunes.js';
import { fortuneRecord } from '../../src/gameplay/memory.js';

const DT = 1 / 60;
const REACTION = 0.2; // seconds between a style's changes of mind

/**
 * How hard the cup pushes: leaf speed and arrival pace, as multipliers.
 * 'calm' is the first chapter's opening cups; 'rush' the second chapter
 * with every Heat bonus saturated (gameplay/days.js), where leaves pile up.
 */
export const PACES = Object.freeze({
  calm: { speed: 1, interval: 1 },
  rush: { speed: 1.15 * 1.2, interval: 0.85 },
});

/**
 * How each style chooses its next leaf, and when it reaches for milk.
 *   sweeper: the leaf nearest the rim, wherever it is (the 0.8.0 sweep bot)
 *   camper:  guards the half of the cup it starts facing and lets the rest spill
 *   milky:   a sweeper that pours milk as soon as a leaf climbs halfway up
 *   sweet:   a sweeper that spends its sugar early
 */
export const STYLES = Object.freeze({
  sweeper: { pick: 'rim', milkAt: 3, sugar: false, arc: Math.PI },
  camper: { pick: 'near', milkAt: 3, sugar: false, arc: Math.PI / 2 },
  milky: { pick: 'rim', milkAt: 1, sugar: false, arc: Math.PI },
  sweet: { pick: 'rim', milkAt: 3, sugar: true, arc: Math.PI },
});

const HOME = -Math.PI / 2; // the spoon's starting angle, at the top of the cup

function chooseLeaf(state, { pick, arc }) {
  let best = null;
  let bestScore = -Infinity;
  for (const enemy of state.enemies) {
    if (Math.abs(angleDifference(enemy.angle, HOME)) > arc) continue;
    const score = pick === 'rim' ? enemy.radius : -Math.abs(angleDifference(enemy.angle, state.angle));
    if (score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Play one round to its reading with `style`, from a fresh pot.
 * @param {{ seed: number, target: number, style: keyof STYLES, tea?: string, pace?: keyof PACES }} options
 * @returns {{ record: object, pattern: string, fortune: string, kills: number }}
 */
export function playRound({ seed, target, style, tea = 'house', pace = 'calm' }) {
  const S = STYLES[style];
  const game = createGame({ seed, tea });
  game.primaryAction();
  const { state } = game;
  state.target = target;
  state.lives = 1e6; // measure the reading, not survival
  state.modifiers.enemySpeedMultiplier *= PACES[pace].speed;
  state.modifiers.spawnIntervalMultiplier *= PACES[pace].interval;
  let leaf = null;
  let thought = 0;
  for (let t = 0; t < 600 && state.phase === 'playing'; t += DT) {
    thought -= DT;
    if (!state.enemies.includes(leaf) || thought <= 0) {
      leaf = chooseLeaf(state, S);
      thought = REACTION;
    }
    let input = { left: false, right: false, fire: false };
    if (leaf) {
      const turn = angleDifference(leaf.angle, state.angle);
      const aligned = laneOf(leaf.angle) === laneOf(state.angle);
      input = { left: !aligned && turn < 0, right: !aligned && turn > 0, fire: aligned };
      const crowded = state.enemies.filter((e) => e.radius > 150).length;
      if (crowded >= S.milkAt && state.milkLeft > 0) game.pourMilk();
      if (S.sugar && aligned && state.sugarLeft > 0) game.sugarBurst();
    }
    game.update(DT, input);
  }
  if (state.phase !== 'reading') throw new Error(`round did not finish: ${state.phase}`);
  const record = fortuneRecord(state);
  return { record, pattern: selectFortune(record), fortune: state.nextFortune, kills: state.kills };
}

/**
 * Share of rounds pointing at each pattern, and of fortunes actually drawn.
 * @returns {{ rounds: number, patterns: Record<string, number>, fortunes: Record<string, number> }}
 */
export function sweep({ targets, styles = Object.keys(STYLES), teas = ['house'], paces = Object.keys(PACES),
  seeds = 20, firstSeed = 1 }) {
  const patterns = { veil: 0, crown: 0, spiral: 0, star: 0 };
  const fortunes = Object.fromEntries(Object.keys(FORTUNES).map((id) => [id, 0]));
  let rounds = 0;
  for (const target of targets) {
    for (const style of styles) {
      for (const tea of teas) {
        for (const pace of paces) {
          for (let i = 0; i < seeds; i++) {
            // A different pot for every target, so one band never replays another's opening leaves.
            const seed = firstSeed + i + 1000 * target;
            const { pattern, fortune } = playRound({ seed, target, style, tea, pace });
            patterns[pattern]++;
            fortunes[fortune]++;
            rounds++;
          }
        }
      }
    }
  }
  const share = (counts) => Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, n / rounds]));
  return { rounds, patterns: share(patterns), fortunes: share(fortunes) };
}
