import { createGame } from '../../src/core/game.js';
import { currentChapter } from '../../src/gameplay/progress.js';
import { cupOfDay, dayOf } from '../../src/gameplay/days.js';
import { answerShortage, completeRound, finishBonus } from '../unit/helpers.js';

export function finishNormal(game) {
  game.state.current = null;
  game.state.modifiers.laneDrift = false; // keep the finishing fixture in its lane
  game.state.spawnTimer = Infinity;
  completeRound(game); // real collision -> readLeaves, rewards and scheduling
  if (game.state.phase !== 'reading') throw new Error('finishing collision did not read the leaves');
}

export function resolveReading(game) {
  game.update(5);
  if (game.state.offer) game.chooseUpgrade(0);
  else game.primaryAction();
  answerShortage(game);
  finishBonus(game, { win: true });
  game.chooseInterlude(false);
}

export function simulateDays(choices, rounds = 60) {
  const game = createGame({ seed: 42 });
  game.primaryAction();
  const rows = [], offers = [];
  for (let i = 0; i < rounds; i++) {
    const s = game.state;
    if (s.phase !== 'playing' || s.round !== i + 1) throw new Error(`stalled at ${s.round}: ${s.phase}`);
    const chapter = currentChapter(s.progress);
    rows.push({ round: s.round, day: dayOf(s.round), cup: cupOfDay(s.round), heat: s.heat,
      target: s.target, tea: s.tea, age: s.teaAge, chapter: s.progress.chapter,
      speed: chapter.enemySpeed * s.modifiers.enemySpeedMultiplier,
      interval: chapter.spawnInterval * s.modifiers.spawnIntervalMultiplier,
      fortune: s.fortune });
    finishNormal(game);
    const scheduled = { round: s.round, shortage: s.shortageDue, havoc: s.havocDue,
      grind: s.grindDue, arcade: s.arcadeDue };
    offers.push(scheduled);
    resolveReading(game);
    if (s.phase === 'day') game.chooseDay(choices[(dayOf(s.round) - 1) % choices.length]);
    if (s.round !== i + 2) throw new Error('normal round did not advance exactly once');
  }
  return { rows, offers, game };
}
