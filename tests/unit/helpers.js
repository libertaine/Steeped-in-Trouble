import { createGame } from '../../src/core/game.js';
import { laneAngle } from '../../src/gameplay/arena.js';
import { spoonLane } from '../../src/gameplay/player.js';

export const IDLE = Object.freeze({ left: false, right: false, fire: false });

/**
 * A game already in round 1, with automatic spawning switched off. It brews
 * only the House Blend unless a `tea` is given, so tests of other rules play
 * every cup with the same neutral tea.
 */
export function playingGame({ seed = 1, spawning = false, tea = 'house' } = {}) {
  const game = createGame({ seed, tea });
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

/** In the fight: land the last hit on the machine with a real steam dart down its open valve. */
export function beatGrind(game) {
  const { state } = game;
  const g = state.grind;
  g.attack = null;
  g.attackTimer = Infinity;
  g.beans = [];
  g.health = 1;
  Object.assign(g.valve, { lane: spoonLane(state), stage: 'open', time: 0, length: Infinity });
  state.shotCooldown = 0;
  game.fireSteam();
  for (let i = 0; i < 120 && g.stage === 'fight'; i++) game.update(1 / 60);
}

/**
 * Hurry through The Daily Grind, if it is under way, to the next cup: by
 * default the machine escapes; with `win` it is beaten.
 */
export function finishGrind(game, { win = false } = {}) {
  if (game.state.phase !== 'grind') return;
  if (game.state.grind.stage === 'intro') game.primaryAction();
  if (game.state.grind.stage === 'fight') {
    if (win) {
      beatGrind(game);
    } else {
      game.state.grind.left = 0;
      game.update(1 / 60);
    }
  }
  game.state.grind.time = Math.max(game.state.grind.time, 5);
  game.primaryAction();
}

/** Hurry through a Hot Chocolate Havoc bonus round or The Daily Grind, if one is under way, to the next cup. */
export function finishBonus(game, { win = false } = {}) {
  finishGrind(game, { win });
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
 * bonus round on the way (beating The Daily Grind only with `win`).
 */
export function brewNext(game, { win = false } = {}) {
  game.state.offer = null;
  game.primaryAction();
  finishBonus(game, { win });
}

/**
 * Play cups as quickly as possible until `round` starts, passing through
 * every bonus round on the way (beating The Daily Grind only with `win`).
 */
export function playTo(game, round, { win = false } = {}) {
  while (game.state.round < round) {
    // A spice current or The Spiral could carry the finishing leaf out of the shot's way.
    game.state.current = null;
    game.state.modifiers = { ...game.state.modifiers, laneDrift: false };
    completeRound(game);
    brewNext(game, { win });
  }
}

/** Finish the current round: the next kill reaches the target. */
export function completeRound(game) {
  game.state.kills = game.state.target - 1;
  killOne(game);
}
