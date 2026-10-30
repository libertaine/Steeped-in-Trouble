// Imported only by the DEV branch in main.js; Vite removes it from production.
import { CONFIG } from '../config.js';
import { createRandom, toSeed } from '../core/random.js';
import { CROSSING_SALT, createCrossing, planCrossing, startCrossing } from '../gameplay/crossingStreet.js';

const P = CONFIG.crossingStreet;
const TICK = 1 / 120;

/**
 * A fresh practice pot taken straight to Crossing the Street through the real
 * offer, with the road the given seed makes. Modes: 'start' (the
 * introduction), 'late' (under way with 5 seconds left), 'last' (one attempt left).
 */
export function prepareCrossingPractice(game, seed, mode = 'start') {
  if (!['start', 'late', 'last'].includes(mode)) return false;
  game.state.phase = 'gameover';
  game.restart();
  Object.assign(game.state, { round: CONFIG.arcade.crossingStreet.firstAfter, progress: { chapter: 2, starts: [1, 6] },
    phase: 'arcadeOffer', interlude: { id: 'crossingStreet' },
    grindAfter: null, havocDue: false, grindDue: false, shortageDue: false });
  game.chooseInterlude(true);
  const m = createCrossing(createRandom(toSeed(seed) ^ CROSSING_SALT));
  game.state.crossingStreet = m;
  if (mode === 'late') {
    startCrossing(m);
    m.clock = P.duration - 5;
  }
  if (mode === 'last') m.attempts = 1;
  return true;
}

/**
 * Play a cautious crossing from where the spoon stands, pressing each hop on
 * its planned tick. A generous margin absorbs frame timing. Returns false if
 * the spoon is not free to move, or no crossing could be found.
 */
export function crossForMe(game) {
  const m = game.state.crossingStreet;
  if (game.state.phase !== 'crossingStreet' || m?.stage !== 'play') return false;
  const s = m.spoon;
  if (s.hop || s.stumble > 0 || s.freeze > 0) return false;
  const first = m.ticks + 1;
  const moves = planCrossing(m.lanes, first * TICK, { col: s.col, row: s.row, margin: 14 });
  if (!moves) return false;
  const every = Math.round(P.repeat / TICK);
  let next = 0;
  const hits = m.hits;
  const drive = () => {
    if (game.state.crossingStreet !== m || m.stage !== 'play' || m.hits !== hits) return;
    if (game.state.phase === 'crossingStreet') {
      while (next < moves.length && first + next * every <= m.ticks + 1) {
        if (moves[next] !== 'wait') game.hop(moves[next]);
        next++;
      }
    }
    if (next < moves.length) requestAnimationFrame(drive);
  };
  drive();
  return true;
}
