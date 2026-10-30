// The scripted play behind tests/fixtures/pot-0.16.0.json. The generator runs
// it against the v0.16.0 release; the tests run it against this tree. It only
// calls public game methods, so both play out the same.
import { laneAngle } from '../../src/gameplay/arena.js';
import { answerShortage, finishBonus } from '../unit/helpers.js';

/** Finish the cup with a real steam kill (no currents or drift in the way). */
export function killLast(game) {
  const s = game.state;
  s.current = null; s.modifiers.laneDrift = false; s.spawnTimer = 1e6;
  s.kills = s.target - 1;
  s.enemies = [{ angle: s.angle, radius: 200, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 }];
  s.shotCooldown = 0; game.fireSteam();
  for (let i = 0; i < 15 && s.phase === 'playing'; i++) game.update(1 / 60);
  if (s.phase !== 'reading') throw new Error(`no reading: ${s.phase}`);
}

/** A genuine damaging escape down a lane, then the grace period passes. */
export function spill(game, lane) {
  const s = game.state;
  s.strainerLeft = 0; s.graceTime = 0; s.spawnTimer = 1e6;
  s.enemies.push({ angle: laneAngle(lane), radius: 268, speed: 60, wiggle: 0, shifted: false, size: 10, alpha: 1 });
  const before = s.lives;
  for (let i = 0; i < 60 && s.lives === before; i++) game.update(1 / 60);
  for (let i = 0; i < 70; i++) game.update(1 / 60);
}

/** Leave a reading for the next cup: first upgrade, no errands or adventures, bosses beaten, kettle kept on. */
export function leave(game) {
  game.update(5);
  if (game.state.offer) game.chooseUpgrade(0); else game.primaryAction();
  if (game.state.phase === 'shortage') { game.state.shortage.time = 5; game.chooseErrand('skip'); }
  answerShortage(game);
  finishBonus(game, { win: true });
  if (game.state.phase === 'arcadeOffer') game.chooseInterlude(false);
  game.chooseDay('keep');
  if (game.state.phase !== 'playing') throw new Error(`stuck in ${game.state.phase}`);
}

/** What a reading settled, and every original random stream's cursor. */
export function signature(game, streams = Object.keys(game.exportRandom())) {
  const s = game.state;
  const random = game.exportRandom();
  return { round: s.round, nextFortune: s.nextFortune, offer: s.offer, tea: s.tea, score: s.score, lives: s.lives,
    havocDue: s.havocDue, grindDue: s.grindDue, shortageDue: s.shortageDue, arcadeDue: s.arcadeDue, dayPending: s.dayPending,
    heat: s.heat, chapter: s.progress.chapter, random: Object.fromEntries(streams.map((id) => [id, random[id]])) };
}

/** Restore a checkpoint and play `rounds` more cups, recording each reading. */
export function continueFrom(createGame, checkpoint, rounds, streams) {
  const game = createGame({ checkpoint: structuredClone(checkpoint) });
  const out = [];
  for (let i = 0; i < rounds; i++) {
    leave(game);
    killLast(game);
    out.push(signature(game, streams));
  }
  return { game, readings: out };
}
