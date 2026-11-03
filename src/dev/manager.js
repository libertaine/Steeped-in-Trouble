// Imported only by the DEV branch in main.js; Vite removes it from production.
// Two ways to meet The Mycelium Manager without playing ten cups:
//
//   prepareManager(game, visit)  straight into the encounter: visit 1 is the
//     milestone (Chapter 2's), 2 and on are rematches with their twists.
//   prepareProgression(game)     Chapter 2's fifth cup, a few leaves from
//     done: finish it and the real reading, the Manager, Chapter 3 and its
//     first cup of Mushroom Tea follow exactly as they would in a pot.
import { difficultyAt } from '../gameplay/days.js';

function freshPot(game) {
  game.state.phase = 'gameover';
  game.restart();
  return game.state;
}

/** Into the Manager's entrance, as visit `visit` (1 = the milestone). Returns true if it is under way. */
export function prepareManager(game, visit = 1) {
  const appearance = Number.parseInt(visit, 10);
  if (!Number.isSafeInteger(appearance) || appearance < 1) return false;
  const s = freshPot(game);
  const milestone = appearance === 1;
  const round = milestone ? 10 : 20;
  Object.assign(s, {
    round, heat: round - 1, phase: 'reading', readingTime: 10, offer: null, nextFortune: 'star', dayPending: round % 10 === 0,
    progress: milestone ? { chapter: 2, starts: [1, 6] } : { chapter: 3, starts: [1, 6, 11] },
    grindAfter: null, lastGrind: round - 1, havocAfter: null, lastHavoc: round - 1, shortageAfter: round + 5,
    havocDue: false, grindDue: false, shortageDue: false, arcadeDue: null,
    managerDue: true, managerAfter: milestone ? round : null, managerVisits: milestone ? 0 : appearance - 2, lastManager: 0,
  });
  game.primaryAction();
  return s.phase === 'manager';
}

/** Chapter 2's fifth cup, nearly finished, with the Manager due at its reading. */
export function prepareProgression(game) {
  const s = freshPot(game);
  Object.assign(s, {
    round: 10, heat: 9, progress: { chapter: 2, starts: [1, 6] },
    grindAfter: null, lastGrind: 5, havocAfter: null, lastHavoc: 9, shortageAfter: 16, managerAfter: 10,
  });
  s.target = difficultyAt(s.heat).target;
  s.kills = s.target - 4;
  return true;
}
