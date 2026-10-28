import { createGame } from '../../src/core/game.js';
import { laneAngle } from '../../src/gameplay/arena.js';

export const IDLE = Object.freeze({ left: false, right: false, fire: false });

/** A game already in round 1, with automatic spawning switched off. */
export function playingGame({ seed = 1, spawning = false } = {}) {
  const game = createGame({ seed });
  game.primaryAction();
  if (!spawning) game.state.spawnTimer = Infinity;
  game.drainEvents();
  return game;
}

/** Put a tea leaf directly into the cup. */
export function placeEnemy(state, { lane = 0, radius = 150, speed = 0 } = {}) {
  const enemy = { angle: laneAngle(lane), radius, speed, wiggle: 0, shifted: false, size: 10, alpha: 1 };
  state.enemies.push(enemy);
  return enemy;
}

/** Advance the game in fixed 1/60 s steps. */
export function step(game, seconds, input = IDLE) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds - 1e-9; t += dt) game.update(dt, input);
}

/** Aim at a lane and kill one leaf there with a steam dart. */
export function killOne(game, lane = 0) {
  game.state.angle = laneAngle(lane);
  placeEnemy(game.state, { lane, radius: 200 });
  game.state.shotCooldown = 0;
  game.fireSteam();
  step(game, 0.25);
}

/** Hurry through The Daily Grind, if it is under way (letting the machine escape), to the next cup. */
export function finishGrind(game) {
  if (game.state.phase !== 'grind') return;
  if (game.state.grind.stage === 'intro') game.primaryAction();
  if (game.state.grind.stage === 'fight') {
    game.state.grind.left = 0;
    game.update(1 / 60);
  }
  game.state.grind.time = Math.max(game.state.grind.time, 5);
  game.primaryAction();
}

/** Hurry through a Hot Chocolate Havoc bonus round or The Daily Grind, if one is under way, to the next cup. */
export function finishBonus(game) {
  finishGrind(game);
  if (game.state.phase !== 'chocolate') return;
  if (game.state.chocolate.stage === 'intro') game.primaryAction();
  if (game.state.chocolate.stage === 'play') {
    game.state.chocolate.left = 0;
    game.update(1 / 60);
  }
  game.state.chocolate.time = Math.max(game.state.chocolate.time, 5);
  game.primaryAction();
}

/**
 * Continue from a reading to the next cup, declining any upgrade offer (so
 * tests of other features play with a plain spoon), and passing through any
 * bonus round on the way.
 */
export function brewNext(game) {
  game.state.offer = null;
  game.primaryAction();
  finishBonus(game);
}

/** Finish the current round: the next kill reaches the target. */
export function completeRound(game) {
  game.state.kills = game.state.target - 1;
  killOne(game);
}
