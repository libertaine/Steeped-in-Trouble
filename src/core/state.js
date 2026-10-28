import { CONFIG } from '../config.js';
import { modifiersFor } from '../gameplay/fortunes.js';
import { createSpoon } from '../gameplay/upgrades.js';

/** Game phases. See docs/ARCHITECTURE.md for the transition diagram. */
export const PHASE = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  READING: 'reading',
  CHOCOLATE: 'chocolate', // Hot Chocolate Havoc, between a reading and the next cup
  GRIND: 'grind', // The Daily Grind, the coffee boss, likewise between rounds
  GAME_OVER: 'gameover',
});

export function createRoundStats() {
  return {
    milkKills: 0, // kills made inside or beside a milk cloud
    milkUses: 0,
    sugarUses: 0,
    escapes: 0, // leaves that reached the rim and cost a cup
    nearMisses: 0, // strainer catches, grace recoils, and milk rescues from the rim
    motionTime: 0, // seconds the spoon spent moving
    volleys: 0, // steam shots fired (a Double Trouble pair is one shot)
    wastedVolleys: 0, // shots whose every dart missed
    steamKills: 0, // leaves destroyed by fired steam (not sugar, not a Steam Nova)
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
    strainerLeft: CONFIG.strainer.perRound, // escaping leaves the strainer can still catch this round
    graceTime: 0, // seconds left in which the cup is recovering from a spill

    // Kept for the whole pot, separate from the round's fortune modifiers.
    spoon: createSpoon(), // upgrade levels; see gameplay/upgrades.js
    goldenSpoon: 0, // seconds of Golden Spoon left (only runs during play)
    offer: null, // upgrade ids offered during the current reading, or null

    fortune: null, // fortune id active this round
    nextFortune: null, // fortune id revealed by the latest reading
    modifiers: modifiersFor(null), // the fortune's and the tea's, combined (gameplay/teas.js)

    // Strange Brews (gameplay/teas.js).
    tea: 'house', // tea variety of the current (or latest) normal round
    teaServed: {}, // tea id -> the round it was last served, for the variety draw
    current: null, // Chai's spice current clock this round; see createCurrent()

    angle: CONFIG.player.startAngle, // spoon position on the rim
    shotCooldown: 0,
    spawnTimer: 1.1,
    readingTime: 0, // seconds since the reading began (drives its animation)
    sugarRegenTimer: 0, // Sugar Rush: seconds until the next regenerated burst
    goldenTimer: null, // Golden Opportunity: seconds until the cube appears, or null
    golden: null, // the golden sugar cube on the field: { angle, radius, time, life }
    prismaticTimer: null, // seconds until the Prismatic Sugar Cube appears this round, or null
    prismatic: null, // the prismatic cube on the field: { angle, radius, time, life }
    extraSugar: 0, // sugar bursts promised for the next cup on top of the usual
    secrets: [], // secret ids the leaves noticed at the latest reading
    discovered: [], // unexpected brews (gameplay/combos.js) already announced this pot
    stir: { dir: 0, time: 0 }, // which way the spoon is turning (-1, 0, 1), and for how long
    wake: null, // The Silver Tornado's wake this frame: { angle, arc, dir, depth }, or null

    volleys: {}, // steam shots still in flight: volley id -> darts left

    // Hot Chocolate Havoc (gameplay/chocolate.js).
    havocAfter: null, // the round after which the first bonus comes, until it has
    lastHavoc: 0, // the round after which the latest bonus came
    havocDue: false, // decided at each reading: a bonus before the next cup?
    chocolate: null, // the bonus round in progress; see createHavoc()

    // The Daily Grind (gameplay/grind.js).
    grindAfter: null, // the round after which the first encounter comes, until it has
    lastGrind: 0, // the round after which the latest encounter came
    grindDue: false, // decided at each reading: the coffee boss before the next cup?
    grind: null, // the encounter in progress; see createGrind()

    shots: [], // { angle, radius, speed, sugar, veer, golden, volley?, nova?, cream? }
    // { kind, angle, radius, home, speed, wiggle, shifted, size, alpha, backwash, glide, dart?, wander? }
    enemies: [],
    clouds: [], // { angle, time, duration, spread, drift }
    residue: [], // { lane, radius, angle, spin, size }
    roundStats: createRoundStats(),
  };
}
