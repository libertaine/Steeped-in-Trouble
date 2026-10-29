// Central gameplay and layout constants.
//
// The 0.1 values were carried over unchanged from the prototype
// (docs/reference/prototype-0.1.html); later versions add their own. Times
// are in seconds, distances in logical canvas units (see
// docs/ARCHITECTURE.md), angles in radians.

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

  grace: {
    duration: 1, // seconds after a spill during which further escapes cost nothing
    recoil: 150, // leaves reaching the rim during the grace period are sloshed this far back
  },

  strainer: {
    perRound: 1, // catches per round before any Strainer Attachment
    nearMissWeight: 0.5, // Tempestuous Tea weight per near miss (strainer catch, grace recoil, milk rescue)
    maxNearMisses: 4, // near misses counted towards that weight
  },

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
    backwash: 120, // the pour's first wave pushes leaves in the slowed wedge this far back towards the centre
    backwashRate: 7, // how quickly the push plays out (per second; about 95% done in 0.4 s)
    rescueShare: 0.75, // a pushed leaf beyond this share of the rim radius counts as a near miss
    carryChance: 0.2, // a steam dart that kills a leaf in a cloud may be carried on by the cream (once)
    // The recovery pulse: in a normal round every pour also sends a wave through the whole cup.
    // Under the cloud itself the stronger push and slowdown win; the two never add up.
    pulse: {
      backwash: 40, // every leaf in the cup is pushed this far back
      duration: 1.5, // and slowed for this long (a second pour starts it again)…
      slowFactor: 0.65, // …to this share of its speed
    },
  },

  enemies: {
    maxActive: 18,
    spawnRadiusMin: 30,
    spawnRadiusMax: 47,
    speedMin: 41, // a new leaf's speed, before the chapter's multiplier (CONFIG.chapters)
    speedMax: 57,
    sizeMin: 9,
    sizeMax: 12,
    fadeInRate: 2, // alpha per second
    escapeInset: 3, // escapes when within this distance of the rim
  },

  spawning: {
    firstDelay: 0.95,
    jitterMin: 0.72, // each gap is the chapter's interval (CONFIG.chapters) times a random factor between these
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
    targetPerRound: 2, // extra kills needed per later round…
    maxTarget: 32, // …up to this many
  },

  // The slow burn (gameplay/progress.js): a pot is told in chapters. Within a
  // chapter the leaves' speed and the pace of their arrival hold steady; a
  // chapter begins with the cup after its milestone boss is beaten. `teas`
  // lists the varieties the chapter brings, each with the number of normal
  // rounds after the chapter's first before it comes on tap.
  chapters: [
    {
      name: 'Learning to Steep',
      enemySpeed: 1, // multiplies every new leaf's speed
      spawnInterval: 1, // seconds between new leaves, before jitter and the tea
      teas: { house: 0, herbal: 0, earlGrey: 0 },
    },
    {
      name: 'Things Heat Up',
      enemySpeed: 1.15,
      spawnInterval: 1,
      teas: { chai: 0, green: 2, black: 4 },
    },
  ],

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

  // Spoon upgrades: chosen after some rounds, kept until the pot runs dry.
  upgrades: {
    firstOffer: 1, // offered after this round…
    offerEvery: 2, // …and every this many rounds after it
    choices: 2,
    polishedSpeed: 0.2, // Polished Spoon: steam speed per level
    quickStirSpeed: 0.15, // Quick Stir: turn speed per level
  },

  // The Golden Spoon: a temporary transformation from the golden sugar cube.
  goldenSpoon: {
    duration: 9,
    cooldownFactor: 0.5, // steam fires twice as often
    speedFactor: 1.15, // and a little faster, on top of every other bonus
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
    jackpotChance: 0.06, // points + full sugar and milk + the Golden Spoon
    goldenSpoonChance: 0.24, // the Golden Spoon
    lifeChance: 0.12, // an extra cup (up to lives + 1)
    sugarChance: 0.28, // refill sugar, plus one
  },

  // The Prismatic Sugar Cube: rarer and quicker than the golden one, under
  // any fortune. Steaming it sets off a Steam Nova down every lane.
  prismatic: {
    firstRound: 2, // never in the first cup
    chance: 0.2, // per round from then on
    delayMin: 5,
    delayMax: 18,
    life: 2.5,
    radiusMin: 120,
    radiusMax: 190,
    laneReach: 4,
  },

  // Unexpected brews: combinations that unlock a new behaviour (gameplay/combos.js).
  combos: {
    stormSpread: 1.6, // The Perfect Storm: milk clouds this much wider…
    stormDrift: 0.35, // …and carried around the cup at this many radians per second
    tornadoSpinUp: 0.5, // The Silver Tornado: seconds of steady turning before the wake forms
    tornadoTrail: 0.25, // seconds of the spoon's path the wake covers
    tornadoDepth: 16, // how far in from the rim the wake reaches with one level of each upgrade
    tornadoDepthPerLevel: 6, // and per further level of either
    giltSplash: 48, // Double Gilt: a golden twin's kill splashes the nearest leaf within this distance
  },

  // Hot Chocolate Havoc: a bonus round between normal rounds (gameplay/chocolate.js).
  chocolate: {
    firstAfterMin: 3, // the first bonus always follows one of these rounds…
    firstAfterMax: 4, // …so it never meets the first Daily Grind
    minGap: 3, // later bonuses: at least this many normal rounds apart…
    chance: 0.3, // …then this chance after each round
    introTime: 4.2, // the prophecy and the transformation (Enter skips it)
    duration: 25, // seconds of toasting
    outroMin: 0.6, // the summary can't be dismissed by accident before this

    // Flames: slower than steam, and they burn out partway down the lane.
    flameSpeed: 330,
    flameRange: 175, // distance from the rim before a flame burns out
    polishedRange: 0.12, // Polished Spoon: extra range per level (flames are faster too)
    flameCooldown: 0.22, // seconds between flames (the Golden Spoon halves it)

    // Marshmallows.
    maxActive: 9,
    openingBatch: 3, // marshmallows that bob up as the havoc begins
    spawnMin: 0.75, // seconds between new marshmallows
    spawnMax: 1.35,
    spawnRadiusMin: 45,
    spawnRadiusMax: 75,
    speedMin: 14,
    speedMax: 22,
    size: 11,
    hopMin: 2.5, // seconds between chances to bob into a neighbouring lane
    hopMax: 6,
    hopChance: 0.4,
    knockback: 10, // a flame nudges a marshmallow this far back towards the centre

    // Cooking: every flame adds one level of doneness and one unit of heat;
    // heat cools off over time. Too much heat at once and it catches fire.
    toastAt: 2, // doneness that counts as toasted
    perfectAt: 4, // doneness that counts as perfect (collected at once)
    flashPoint: 1.75, // heat above this sets it alight
    coolRate: 2.6, // heat lost per second (flames about 0.3 s apart toast without burning)
    goldenHeat: 0.55, // Golden Spoon flames toast as well but scorch less
    points: { raw: 0, toasted: 12, perfect: 30, burned: 2 },

    // The giant marshmallow.
    giantChance: 0.4, // per bonus round
    giantDelayMin: 4,
    giantDelayMax: 12,
    giantRadius: 95, // where it surfaces
    giantSize: 22,
    giantSpeed: 6,
    giantGrowth: 0.11, // size gained per flame, as a share of its starting size
    giantHits: 8, // flames until it bursts
    giantMinis: 7, // little marshmallows it bursts into
    miniSize: 8,

    // Rewards at the end, on top of the marshmallows' own points.
    goodPerfects: 5,
    goodBonus: 75,
    greatPerfects: 9,
    greatBonus: 200,
    rewardSugar: 1, // an extra sugar burst next cup for a good or great round
  },

  // The Daily Grind: a coffee boss between normal rounds (gameplay/grind.js).
  // Pairs are [calm, furious]: the machine speeds up as it takes damage.
  grind: {
    milestoneAfter: 5, // the first encounter always follows this round: Chapter 1's milestone
    retryAfter: 2, // if the machine gets away, it is back after this many more normal rounds, until beaten
    minGap: 4, // once beaten, rematches: at least this many normal rounds apart…
    chance: 0.25, // …then this chance after each round (never alongside Hot Chocolate Havoc)
    introTime: 4.6, // the announcement and the machine rising (Enter skips it)
    duration: 38, // seconds to defeat it before it leaves anyway
    outroMin: 1.6, // the result can't be dismissed by accident before this

    health: 56,
    scalds: 3, // boss-round hits before the machine escapes (they never cost a cup)
    safeTime: 1.4, // seconds after a scald before another can land
    hitHalfWidth: 0.55, // lanes either side of the spoon within which a bean or jet scalds it
    bodyRadius: 84, // steam stops here: on the safety valve if it is open in that lane, else with a clank

    // The safety valve: it turns to face a lane near the spoon, then blows open for a moment.
    valveTurn: [1.3, 0.85], // seconds spent turning
    valveOpen: 2.0, // seconds it stays open
    valveReachMin: 3, // it opens this many lanes from the spoon…
    valveReachMax: 6,
    steamDamage: 1,
    sugarDamage: 3, // per sugar dart that finds the open valve
    hitPoints: 10,
    beanPoints: 5,

    // Attacks, one at a time.
    firstAttack: 2.4, // seconds into the fight
    attackGap: [2.4, 1.1], // seconds between attacks
    beanSpeed: [100, 145],
    beanSize: 7,
    maxBeans: 30,
    pressureBuild: 0.8, // the machine swells…
    pressureWarn: [1.7, 1.15], // …the threatened lanes glow for this long…
    pressureBurst: 0.7, // …then hot coffee shoots down them
    jetSpeed: 900,
    wedgeLanes: [5, 7], // lanes in a wedge-shaped burst
    milkDelay: 1.3, // milk poured while the pressure builds holds it off this long (once per attack)

    // Rewards.
    points: 350,
    goldenSpoon: 12, // seconds of Golden Spoon, which start with the next cup
    maxLives: 4,
    fullCupPoints: 150, // instead of a cup the player has no room for
  },

  // Strange Brews: the tea variety brewed for each normal round (gameplay/teas.js).
  teas: {
    weightCap: 4, // a variety's draw weight grows by 1 per round since it was last served, up to this
    maxAbsence: 7, // a variety missing for more than this many rounds is served next
    maxEnemySpeedMultiplier: 1.35, // tea × fortune leaf speed never goes beyond this
    // The learning curve: each stage starts at this many normal rounds since
    // the tea came on tap (1 for the round it arrives) and lasts until the
    // next one starts. Darting, wandering, and currents below list one value
    // per stage, in this order; everything else about a tea is the same in
    // every round.
    stages: [
      { name: 'learn', from: 1 }, // introduce each behaviour, with generous warnings
      { name: 'adapt', from: 5 }, // more often, and a little quicker
      { name: 'full', from: 9 }, // full strength
    ],
    green: { enemySpeed: 1.1 },
    black: { spawnInterval: 0.88, scoreMultiplier: 1.25 },
    herbal: { enemySpeed: 0.88, spawnInterval: 1.06, milkBonus: 1, lieWeight: 1 },
  },

  // Green Tea's darting leaves: a warning crouch, then a short burst of speed.
  // The dash adds a fixed distance on top of the leaf's ordinary movement, so
  // a faster leaf doesn't dash further. Even the fastest leaf finishes its
  // dash well inside the rim, and the crouch gives back about what the dash
  // takes, so even the slowest leaf never reaches the rim noticeably sooner
  // for having darted.
  darting: {
    chance: [0.1, 0.2, 0.3], // by stage: share of new leaves that dart
    atMin: 60, // the crouch starts once a leaf passes a radius between these
    atMax: 100,
    latestAt: 130, // a darter somehow further out than this when its turn comes never dashes
    warnTime: [0.75, 0.65, 0.55], // by stage: seconds of visible crouch…
    warnPace: 0.35, // …at this share of its speed
    dashTime: 0.45, // seconds of dash, accelerating and then settling…
    dashDistance: [10, 14, 18], // …by stage: carrying it this much further than an ordinary leaf would go
  },

  // Earl Grey's wandering leaves: a visible lean, then a glide into the neighbouring lane,
  // always in the middle of the cup.
  wandering: {
    chance: [0.15, 0.25, 0.4], // by stage: share of new leaves that wander
    atMin: 65, // the lean starts once a leaf passes a radius between these
    atMax: 100,
    latestAt: 130, // a wanderer somehow further out than this when its turn comes stays in its lane
    warnTime: [0.8, 0.65, 0.55], // by stage
    glideTime: 0.35,
  },

  // Chai's spice currents: on a fixed clock, every leaf in the cup is carried one lane sideways.
  currents: {
    firstAt: [6.5, 5.5, 5], // by stage: seconds into the round before the first warning
    calmTime: [10, 8.5, 7.5], // by stage: seconds between one current ending and the next warning
    warnTime: [2.2, 1.9, 1.6], // by stage: arrows round the rim show the direction for this long…
    flowTime: 0.9, // …then the leaves glide one lane over this long
  },

  // Secrets: things the leaves notice about a finished round, and reward.
  secrets: {
    perfectMinVolleys: 12, // Not a Drop Wasted: steam shots needed for a perfect round to count
    perfectPoints: 250,
    perfectSugar: 1, // extra sugar bursts next cup
    thriftyMinVolleys: 8, // More Leaves Than Steam: steam shots needed
  },

  // Tea Cash: pocket money for the pot, kept apart from the score (gameplay/shortage.js).
  // Provisional tuning; it resets with every new pot.
  teaCash: {
    round: 5, // each normal round completed
    milestone: 15, // beating a chapter's milestone boss
    runBonus: 5, // reaching the shop in the Tea Run
  },

  // The Tea Shortage: an emergency between rounds (gameplay/shortage.js).
  shortage: {
    firstAfter: 9, // the first shortage follows this round's reading…
    minChapter: 2, // …once the pot has reached this chapter (otherwise the first reading after it has)
    repeatEvery: 7, // targets 9, 16, 23…; delayed visits skip missed targets
    teaPrice: 20, // Tea Cash to buy tea instead of running for it
    restockSugar: 1, // buying or fetching tea: extra sugar bursts for the next normal cup
    chooseAt: 1.2, // seconds of announcement before the choice can be made
  },

  // The Tea Run: the side-scrolling errand (gameplay/teaRun.js). Distances are
  // logical canvas units along the sidewalk; heights are above the paving.
  teaRun: {
    introTime: 3, // the announcement (Enter, or JUMP, skips it)
    outroMin: 1.6, // the result can't be dismissed by accident before this
    finishTime: 1.4, // the spoon trotting into the shop
    speed: 330, // units per second, steady for the whole run
    courseTime: 34, // seconds of running from the gate to the shop door
    timeLimit: 45, // the shop shuts after this many seconds of running
    hits: 3, // stumbles that end the errand (never a cup)
    tumbleTime: 0.45, // seconds of tumbling after a stumble, at…
    tumblePace: 0.45, // …this share of the usual speed
    safeTime: 1.3, // seconds after a stumble before another can land

    spoon: { halfWidth: 12, height: 66, slideHeight: 26 },
    jumpTime: 0.6, // seconds from takeoff to landing
    jumpHeight: 125, // at the top of the arc
    aerialChance: 0.7, // independent roll per fresh airborne press; failure locks until landing
    aerial: {
      // One hidden opportunity per errand, drawn from the runner's own stream.
      orbit: { altitude: 850, chance: 0.01, duration: 5.4 },
      power: { altitude: 380, chance: 0.08, duration: 3.2 },
      bird: { altitude: 210, chance: 0.14, duration: 3.6 },
    },
    slideTime: 0.6,
    recoverTime: 0.08, // a moment on its feet after landing or standing up
    bufferTime: 0.18, // a press during another action waits this long for the spoon to be ready

    // The course: obstacles meet the spoon at planned times, never closer than minGap.
    firstAt: 2.6, // seconds into the run
    gapStart: 2.3, // seconds between obstacles at the start…
    gapEnd: 1.55, // …easing to this by the shop
    gapJitter: 0.45, // plus up to this much
    minGap: 1.4,
    clearRun: 2, // seconds of clear sidewalk before the shop door

    // Hitboxes are the drawn shapes, inset a little so a near miss looks like one.
    obstacles: {
      sugarCube: { width: 38, height: 38, inset: 5, roll: 45, action: 'jump' }, // rolls towards the spoon
      puddle: { width: 90, height: 8, inset: 14, action: 'jump' },
      coffeeCup: { width: 76, height: 78, clearance: 40, inset: 8, action: 'slide' }, // rope is decorative
    },
    // Things to pick up on the way: a few points each, kept however the run ends.
    coinGap: 1.6, // a row of coins may sit in a gap at least this long…
    coinChance: 0.45, // …this often
    packetChance: 0.35, // a tea packet over a jump (or under a cup) this often
    packetHeight: 130, // over a jump; under a cup it sits on the paving
    pickupRadius: 15,
    coinPoints: 5,
    packetPoints: 10, // a packet stays a small bonus beside an ordinary round
  },

  // Optional arcade offers count normal rounds only. Missed dates collapse into one opportunity.
  arcade: {
    dailyPour: { firstAfter: 12, repeatEvery: 14, minChapter: 2 },
  },
  dailyPour: {
    introTime: 3, outroMin: 1.5, duration: 30,
    speed: 165, houses: 9, firstAt: 4, houseInterval: 2.8,
    cooldown: 0.85, sparePapers: 2, successRatio: 0.6,
    deliveryPoints: 25, successCash: 5, perfectBonus: 50,
    riderX: 190, releaseY: 552,
    targets: {
      near: { ahead: 145, y: 450, flight: 0.65 },
      far: { ahead: 200, y: 335, flight: 0.9 },
    },
    // One bystander between houses 5 and 6: scenery, not a target or obstacle.
    // Speech starts `notice` route seconds before the spoon draws level.
    pedestrian: { x: 2910, notice: 1.95, speech: 3 },
  },

  // Easy Touch (input/gestures.js): forgiving gestures on the cup for milk and sugar.
  touch: {
    doubleTap: 300, // ms from a tap to the next touch for milk
    tapSlop: 48, // CSS px the second tap may land from the first
    tapMax: 300, // ms: a touch held longer is not a tap
    longPress: 450, // ms held still for sugar
    moveSlop: 32, // CSS px a finger may wander before it is a drag, not a press
  },
});
