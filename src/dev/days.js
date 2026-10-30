// Imported only by the DEV branch in main.js; Vite removes it from production.
import { OFFER_AT } from '../core/game.js';
import { MAX_HEAT, difficultyAt } from '../gameplay/days.js';

export function prepareDayPractice(game, mode = 'end') {
  if (!['near', 'end', 'fresh', 'keep', 'max'].includes(mode)) return false;
  game.state.phase = 'gameover';
  game.restart();
  const s = game.state;
  const round = mode === 'max' ? 40 : 10;
  Object.assign(s, {
    round, heat: mode === 'max' ? MAX_HEAT : 9,
    progress: { chapter: 2, starts: [1, 6] },
    grindAfter: null, lastGrind: round, havocAfter: null, lastHavoc: round,
    shortageAfter: round + 5, spawnTimer: Infinity, current: null,
  });
  s.arcade.after.dailyPour = round + 2;
  s.arcade.after.biscuitBreakout = round + 9;
  s.arcade.after.crossingStreet = round + 5;
  s.target = difficultyAt(s.heat).target;
  s.kills = s.target - 1;
  if (mode === 'near') return true;
  // Finish with a real steam collision, then take the actual reading/upgrade path.
  s.enemies = [{ kind: 'leaf', angle: s.angle, radius: 120, home: 40, speed: 0,
    wiggle: 0, shifted: true, size: 10, alpha: 1, backwash: 0 }];
  s.shots = [{ angle: s.angle, radius: 120, speed: 0, sugar: false, veer: 0, golden: false }];
  game.update(1 / 120);
  game.update(OFFER_AT);
  if (s.offer) game.chooseUpgrade(0);
  else game.primaryAction();
  if (mode === 'fresh' || mode === 'keep') game.chooseDay(mode);
  if (mode === 'max') game.chooseDay('keep');
  return true;
}
