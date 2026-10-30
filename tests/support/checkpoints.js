import { expect } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { answerShortage, completeRound, finishBonus } from '../unit/helpers.js';

// Real finishing collision, fortune, reward and scheduling, with a finite
// spawning clock. Production checkpoints reject test-only Infinity sentinels.
export function finishNormal(game) {
  game.state.current = null;
  game.state.modifiers.laneDrift = false;
  game.state.spawnTimer = 1e6;
  completeRound(game);
  expect(game.state.phase).toBe('reading');
}
export function leaveReading(game, day = 'keep', adventures = true) {
  game.update(5);
  if (game.state.offer) game.chooseUpgrade(0); else game.primaryAction();
  if (game.state.phase === 'shortage') {
    game.state.shortage.time = 5;
    game.chooseErrand(adventures ? 'run' : 'skip');
    if (adventures) { game.primaryAction(); game.update(60); game.primaryAction(); }
  }
  answerShortage(game);
  finishBonus(game, { win: true });
  if (game.state.phase === 'arcadeOffer') {
    game.chooseInterlude(adventures);
    if (adventures) {
      game.primaryAction();
      for (let i = 0; i < 6000; i++) game.update(1 / 60);
      game.primaryAction();
    }
  }
  game.chooseDay(day);
  expect(game.state.phase, `continuing round ${game.state.round}`).toBe('playing');
}
export function checkpointAfter(round, { day = 'keep', seed = 42 } = {}) {
  const game = createGame({ seed }); game.primaryAction();
  for (let i = 1; i <= round; i++) {
    finishNormal(game);
    if (i < round) leaveReading(game, day);
  }
  const checkpoint = game.exportCheckpoint();
  expect(checkpoint).not.toBeNull();
  return { game, checkpoint };
}
