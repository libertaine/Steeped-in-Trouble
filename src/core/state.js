import { CONFIG } from '../config.js';
import { modifiersFor } from '../gameplay/fortunes.js';

/** Game phases. See docs/ARCHITECTURE.md for the transition diagram. */
export const PHASE = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  READING: 'reading',
  GAME_OVER: 'gameover',
});

export function createRoundStats() {
  return {
    milkKills: 0, // kills made inside or beside a milk cloud
    milkUses: 0,
    motionTime: 0, // seconds the spoon spent moving
  };
}

/**
 * The complete simulation state. Plain data only, with no DOM or canvas
 * references, so it can be inspected, tested, and rendered by anything.
 */
export function createInitialState() {
  return {
    phase: PHASE.READY,
    pausedFrom: PHASE.PLAYING,
    round: 1,
    score: 0,
    lives: CONFIG.lives,
    kills: 0,
    target: CONFIG.rounds.baseTarget,
    milkLeft: CONFIG.milk.perRound,
    sugarLeft: CONFIG.sugar.perRound,

    fortune: null, // fortune id active this round
    nextFortune: null, // fortune id revealed by the latest reading
    modifiers: modifiersFor(null),

    angle: CONFIG.player.startAngle, // spoon position on the rim
    shotCooldown: 0,
    spawnTimer: 1.1,
    readingTime: 0, // seconds since the reading began (drives its animation)

    shots: [], // { angle, radius, speed, sugar }
    enemies: [], // { angle, radius, speed, wiggle, shifted, size, alpha }
    clouds: [], // { angle, time, duration }
    residue: [], // { lane, radius, angle, spin, size }
    roundStats: createRoundStats(),
  };
}
