// Central gameplay and layout constants.
//
// Every value was carried over unchanged from the 0.1 prototype
// (docs/reference/prototype-0.1.html). Times are in seconds, distances in
// logical canvas units (see docs/ARCHITECTURE.md), angles in radians.

function deepFreeze(object) {
  for (const value of Object.values(object)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(object);
}

export const CONFIG = deepFreeze({
  arena: {
    width: 920, // logical canvas width
    height: 790, // logical canvas height
    centerX: 451, // cup centre (slightly left of middle to leave room for the handle)
    centerY: 400,
    rimRadius: 273, // radius of the liquid surface; leaves escaping past it cost a life
    lanes: 16,
  },

  timing: {
    maxFrameSeconds: 0.04, // largest simulation step after a slow frame or tab switch
  },

  player: {
    turnSpeed: 2.8, // radians per second
    startAngle: -Math.PI / 2, // top of the cup
  },

  lives: 3,

  steam: {
    speed: 450, // units per second, travelling inward
    spawnInset: 13, // spawn this far inside the rim
    cooldown: 0.19, // seconds between regular shots
    despawnRadius: 10, // removed once this close to the centre
  },

  sugar: {
    perRound: 2,
    speed: 560,
    spawnInset: 12,
    laneOffsets: [-1, 0, 1], // three darts: left, centre, right lane
  },

  milk: {
    perRound: 2,
    duration: 5.2,
    slowFactor: 0.31, // enemies in a cloud move at 31% speed
    slowHalfWidthLanes: 1.65, // cloud slows enemies within this many lanes
    creditHalfWidthLanes: 1.7, // kills within this many lanes count as milk kills
  },

  enemies: {
    maxActive: 18,
    spawnRadiusMin: 30,
    spawnRadiusMax: 47,
    speedMin: 31,
    speedMax: 47,
    speedPerRound: 6,
    maxRoundSpeedBonus: 55,
    sizeMin: 9,
    sizeMax: 12,
    fadeInRate: 2, // alpha per second
    escapeInset: 3, // escapes when within this distance of the rim
  },

  spawning: {
    firstDelay: 0.95,
    baseInterval: 1.15,
    intervalPerRound: 0.055,
    minInterval: 0.57,
    maxInterval: 1.1,
    jitterMin: 0.72,
    jitterMax: 1.36,
  },

  collision: {
    radialTolerance: 17, // units
    laneTolerance: 0.48, // fraction of a lane width
  },

  scoring: {
    steamKill: 10,
    sugarKill: 15,
  },

  rounds: {
    baseTarget: 16, // kills needed in round 1
    targetPerRound: 4, // extra kills needed per later round
  },

  residue: {
    maxLeaves: 90,
    radiusMin: 50,
    radiusMax: 138,
    angleJitter: 0.055,
    spinMin: -2,
    spinMax: 2,
    sizeMin: 5,
    sizeMax: 8,
  },

  fortunes: {
    veilMilkKills: 3, // milk kills needed for The Veil
    crownClusterWidth: 3, // adjacent lanes examined for The Crown
    crownClusterShare: 0.4, // share of leaves that must sit in that cluster
    spiralOccupiedLanes: 10, // distinct lanes holding leaves for The Spiral
    crownBonusSugar: 1,
    veilMilkBonus: 2.5,
    spiralScoreMultiplier: 1.25,
    spiralDriftRadius: 140, // foes drift one lane after passing this radius
    starSteamMultiplier: 1.35,

    // 0.3 fortunes. Each lasts only the round after its reading.
    sugarRushInterval: 6, // Sugar Rush: seconds per regenerated sugar burst (up to the round's capacity)
    twinSpreadRate: 0.45, // Double Trouble: radians per second each twin dart veers away from the other
    tempestEnemySpeed: 1.18, // Tempestuous Tea: leaves move this much faster
    revealAt: 2.1, // reading seconds before the fortune is revealed
    lieRetractAt: 3.4, // The Leaves Lie: reading seconds before the leaves change their mind

    // Selection: the classic pattern reading is a strong tendency, never a guarantee.
    patternWeight: 6, // weight given to the fortune the leaf pattern points at
  },

  golden: {
    delayMin: 4, // seconds into the round before the cube may appear
    delayMax: 14,
    life: 5, // seconds it stays before dissolving
    radiusMin: 110,
    radiusMax: 200,
    laneReach: 5, // appears within this many lanes of the spoon
    points: 150,
    jackpotPoints: 500,
    // Reward odds, checked in order; whatever is left over is bonus points.
    jackpotChance: 0.06, // points + full sugar and milk
    lifeChance: 0.12, // an extra cup (up to lives + 1)
    sugarChance: 0.32, // refill sugar, plus one
  },
});
