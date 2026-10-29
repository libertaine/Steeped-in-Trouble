// The game simulation: phase transitions and the per-frame update.
//
// The simulation never touches the DOM, canvas, or audio. It mutates plain
// state and queues events ({ type, ...data }) describing what happened, which
// presentation code (effects, audio, input) drains once per frame.
//
// Events: matchStart, roundStart, steam, sugar, sugarRegen, milk, milkPulse, kill, drift,
// escape, strain, recoil, goldenAppear, goldenCatch, goldenGone, goldenSpoon,
// goldenSpoonEnd, prismaticAppear, prismaticCatch, prismaticGone, nova, secret,
// discover, reading, reveal, retract, upgrade, gameover, paused,
// resumed; and in Hot Chocolate Havoc: chocolateStart, havocStart, flame,
// toast, burn, perfect, scoop, crumble, bump, giantAppear, giantGrow,
// catastrophe, giantGone, havocEnd; and in The Daily Grind: grindStart, grindFight,
// valveTurn, valveOpen, barrage, beans, beanCrack, beanSplat, pressureBuild,
// pressureWarn, pressureBurst, sputter, clank, grindHit, grindRage, scald,
// grindDefeat, grindEscape; and in Strange Brews: dartWarn, dart, wanderWarn,
// wander, currentWarn, currentFlow, currentEnd (roundStart also names the tea,
// whether it has just come on tap, and the chapter, and whether this cup opens it);
// and for The Tea Shortage: shortage, teaBought, shortageSkipped, and in the
// Tea Run: runStart, runGo, runJump, runSlide, runLand, runHit, runPickup,
// runFinish, runFail, runEnd; Arcade Interludes: arcadeOffer, arcadeSkipped, and
// The Daily Pour's pour* and paper* events, and Biscuit Breakout's breakoutStart,
// breakoutGo, cubeLaunch, cubeWall, cubePaddle, biscuitBreak, biscuitTalk,
// cubeLost, breakoutFinish, breakoutEnd; and under Karma: karmaBounce, karmaPuff.

import { CONFIG } from '../config.js';
import { createRandom, toSeed } from './random.js';
import { PHASE, createInitialState, createRoundStats } from './state.js';
import { laneOf } from '../gameplay/arena.js';
import { drawFortune, modifiersFor } from '../gameplay/fortunes.js';
import { advanceChapter, createProgress, opensChapter, teaAge } from '../gameplay/progress.js';
import { TEAS, chooseTea, createCurrent, roundModifiers, teaFortuneNudges, updateCurrent } from '../gameplay/teas.js';
import { updateGolden } from '../gameplay/golden.js';
import { rollPrismatic, updatePrismatic } from '../gameplay/prismatic.js';
import { SECRETS, findSecrets } from '../gameplay/secrets.js';
import { discover, giltSplashTarget, inWake, tornadoWake } from '../gameplay/combos.js';
import { moveSpoon } from '../gameplay/player.js';
import {
  createHavoc, finishHavoc, fireFlame, firstHavocRound, havocDue, spawnMarshmallow, updateHavoc,
} from '../gameplay/chocolate.js';
import { createGrind, grindDue, milestoneDue, milkTheMachine, updateGrind } from '../gameplay/grind.js';
import { autoSteamWanted, autoSteamWantedInGrind } from '../gameplay/autoSteam.js';
import { ERRANDS, buyTea, earnTeaCash, scheduleNextShortage, shortageDue } from '../gameplay/shortage.js';
import { createRun, press, startRunning, updateRun } from '../gameplay/teaRun.js';
import { consumeInterlude, createArcadeSchedule, eligibleInterlude } from '../gameplay/arcadeInterludes.js';
import { aimPour, createDailyPour, startPour, throwPaper, updateDailyPour } from '../gameplay/dailyPour.js';
import {
  BREAKOUT_SALT, createBreakout, launchCube, startBreakout, updateBreakout,
} from '../gameplay/biscuitBreakout.js';
import { advanceEnemy, hasEscaped, updateSpawning, washBack } from '../gameplay/enemies.js';
import { UPGRADES, applyUpgrade, createSpoon, drawOffer, offerDue, strainerCapacity } from '../gameplay/upgrades.js';
import {
  findStrikingShot, fireSteam, isNearCloud, killScore, milkPulse, pourMilk, spendDart, sugarBurst, sugarCapacity,
  updateClouds, updateShots, updateSugarRegen,
} from '../gameplay/weapons.js';

const { revealAt, lieRetractAt } = CONFIG.fortunes;

/** Reading seconds before an upgrade offer appears and can be taken. */
export const OFFER_AT = revealAt + 0.6;

const NO_INPUT = Object.freeze({ left: false, right: false, fire: false });

/**
 * @param {{ seed?: number, random?: ReturnType<typeof createRandom>, tea?: string }} [options]
 *   Pass a seed (or a generator) to reproduce an exact gameplay sequence.
 *   Pass a tea id (see TEAS) to brew only that variety, every cup, as if it
 *   had been on tap from the first; the chapters run as usual around it.
 */
export function createGame({ seed, random, tea: onlyTea } = {}) {
  const rng = random ?? createRandom(seed);
  const state = createInitialState();
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });
  const sim = { state, rng, emit };
  // The bonus round draws from its own generator, so the normal rounds play
  // out identically whether or not one happens.
  const treats = createRandom(toSeed(rng.seed ?? 0) ^ 0x5eedc0c0);
  const havoc = { state, rng: treats, emit };
  // So does the coffee boss.
  const brew = createRandom(toSeed(rng.seed ?? 0) ^ 0xc0ffee);
  const grindSim = { state, rng: brew, emit };
  // And the tea varieties, so the cups are steeped in the same order however they are played.
  const steep = createRandom(toSeed(rng.seed ?? 0) ^ 0x7ea7ea);
  // And the Tea Run, so the errand never changes the teas, fortunes, or leaves that follow it.
  const errand = createRandom(toSeed(rng.seed ?? 0) ^ 0x5b007e);
  const runSim = { state, rng: errand, emit };
  const papers = createRandom(toSeed(rng.seed ?? 0) ^ 0xda11b007);
  const pourSim = { state, rng: papers, emit };
  const crumbs = createRandom(toSeed(rng.seed ?? 0) ^ BREAKOUT_SALT);
  const breakoutSim = { state, rng: crumbs, emit };
  const pinnedTea = typeof onlyTea === 'string' && Object.hasOwn(TEAS, onlyTea) ? onlyTea : null;
  const playing = () => state.phase === PHASE.PLAYING;
  const chocolate = (stage) => state.phase === PHASE.CHOCOLATE && (!stage || state.chocolate.stage === stage);
  const grinding = (stage) => state.phase === PHASE.GRIND && (!stage || state.grind.stage === stage);
  const running = (stage) => state.phase === PHASE.TEA_RUN && (!stage || state.run.stage === stage);
  const pouring = (stage) => state.phase === PHASE.DAILY_POUR && (!stage || state.dailyPour.stage === stage);
  const breaking = (stage) => state.phase === PHASE.BISCUIT_BREAKOUT && (!stage || state.biscuitBreakout.stage === stage);
  const offerOpen = () => state.phase === PHASE.READING && !!state.offer && state.readingTime >= OFFER_AT;
  const errandOpen = () => state.phase === PHASE.SHORTAGE && state.shortage.time >= CONFIG.shortage.chooseAt;

  function clearField() {
    state.shots = [];
    state.enemies = [];
    state.clouds = [];
    state.golden = null;
    state.goldenTimer = null;
    state.prismatic = null;
    state.prismaticTimer = null;
    state.volleys = {};
    state.stir = { dir: 0, time: 0 };
    state.wake = null;
    state.current = null;
    state.pulse = 0;
  }

  /** Steep this cup's tea. The tea generator always advances by the same two draws. */
  function steepTea() {
    const chosen = chooseTea(state, steep);
    const lean = steep.next() < 0.5 ? -1 : 1; // which way Chai's first current runs
    state.tea = pinnedTea ?? chosen;
    state.teaAge = pinnedTea ? state.round : teaAge(state.progress, state.tea, state.round);
    state.teaServed[state.tea] = state.round;
    return lean;
  }

  function startRound() {
    const R = CONFIG.rounds;
    state.phase = PHASE.PLAYING;
    clearField();
    state.residue = [];
    state.kills = 0;
    state.target = Math.min(R.maxTarget, R.baseTarget + (state.round - 1) * R.targetPerRound);
    const lean = steepTea();
    state.modifiers = roundModifiers(state.fortune, state.tea, state.teaAge);
    if (state.modifiers.spiceCurrents) state.current = createCurrent(lean, state.teaAge);
    state.milkLeft = CONFIG.milk.perRound;
    state.sugarLeft = sugarCapacity(state) + state.extraSugar;
    state.extraSugar = 0;
    state.secrets = [];
    state.strainerLeft = strainerCapacity(state.spoon);
    state.graceTime = 0;
    state.offer = null;
    state.sugarRegenTimer = state.modifiers.sugarRegenInterval;
    if (state.modifiers.goldenCube) state.goldenTimer = rng.range(CONFIG.golden.delayMin, CONFIG.golden.delayMax);
    state.prismaticTimer = rollPrismatic(state.round, rng);
    state.spawnTimer = CONFIG.spawning.firstDelay;
    state.shotCooldown = 0;
    state.roundStats = createRoundStats();
    state.angle = CONFIG.player.startAngle;
    emit('roundStart', {
      round: state.round, fortune: state.fortune, tea: state.tea, debut: state.round > 1 && state.teaAge === 1,
      chapter: state.progress.chapter, opens: opensChapter(state.progress, state.round),
    });
  }

  function resetMatch() {
    state.round = 1;
    state.score = 0;
    state.lives = CONFIG.lives;
    state.fortune = null;
    state.nextFortune = null;
    state.tea = 'house';
    state.teaServed = {};
    state.progress = createProgress();
    state.spoon = createSpoon();
    state.goldenSpoon = 0;
    state.extraSugar = 0;
    state.discovered = [];
    state.chocolate = null;
    state.havocDue = false;
    state.lastHavoc = 0;
    state.havocAfter = firstHavocRound(treats);
    state.grind = null;
    state.grindDue = false;
    state.lastGrind = 0;
    state.grindAfter = CONFIG.grind.milestoneAfter;
    state.teaCash = 0;
    state.shortageAfter = CONFIG.shortage.firstAfter;
    state.aerialDiscoveries = [];
    state.shortageDue = false;
    state.shortage = null;
    state.run = null;
    state.arcade = createArcadeSchedule();
    state.arcadeDue = null;
    state.interlude = null;
    state.dailyPour = null;
    state.biscuitBreakout = null;
    emit('matchStart');
    startRound();
  }

  function readLeaves() {
    state.phase = PHASE.READING;
    state.readingTime = 0;
    clearField();
    const { milkKills, milkUses, sugarUses, escapes, nearMisses } = state.roundStats;
    state.nextFortune = drawFortune({
      milkKills, milkUses, sugarUses, escapes, nearMisses,
      leafLanes: state.residue.map((leaf) => leaf.lane),
      nudges: teaFortuneNudges(state.tea),
    }, rng);
    state.offer = offerDue(state.round) ? drawOffer(state.spoon, rng) : null;
    state.havocDue = havocDue(state, treats);
    if (state.havocDue && milestoneDue(state)) {
      // The milestone never waits: the hot chocolate comes after the next reading instead.
      state.havocDue = false;
      state.havocAfter = state.round + 1;
    }
    state.grindDue = grindDue(state, brew); // never alongside the hot chocolate
    state.shortageDue = shortageDue(state); // never alongside a milestone boss
    state.arcadeDue = eligibleInterlude(state);
    earnTeaCash(state, CONFIG.teaCash.round);
    emit('reading', { fortune: state.nextFortune, offer: state.offer });
    state.secrets = findSecrets(state.roundStats);
    for (const id of state.secrets) {
      SECRETS[id].award(state);
      emit('secret', { id, angle: state.angle });
    }
  }

  function brewNextCup() {
    state.round++;
    state.fortune = state.nextFortune;
    startRound();
  }

  /**
   * Leave a reading: on to the next cup, or first a detour. An empty tea tin
   * comes first, and the game returns here once it is dealt with, so a hot
   * chocolate or coffee boss decided at the same reading still follows.
   */
  function continueFromReading() {
    if (state.shortageDue) startShortage();
    else if (state.havocDue) startHavoc();
    else if (state.grindDue) startGrind();
    else if (state.arcadeDue) {
      const id = state.arcadeDue;
      consumeInterlude(state, id);
      state.interlude = { id };
      state.phase = PHASE.ARCADE_OFFER;
      emit('arcadeOffer', { id });
    }
    else brewNextCup();
  }

  function chooseInterlude(accept) {
    if (state.phase !== PHASE.ARCADE_OFFER || typeof accept !== 'boolean') return false;
    const id = state.interlude?.id ?? 'dailyPour';
    state.interlude = null;
    if (!accept) {
      emit('arcadeSkipped', { id });
      continueFromReading();
      return true;
    }
    if (id === 'biscuitBreakout') {
      state.biscuitBreakout = createBreakout(crumbs);
      state.phase = PHASE.BISCUIT_BREAKOUT;
      emit('breakoutStart', { biscuits: state.biscuitBreakout.total });
      return true;
    }
    state.dailyPour = createDailyPour(papers);
    state.phase = PHASE.DAILY_POUR;
    emit('pourStart');
    return true;
  }

  function beginBreakout() {
    if (startBreakout(state.biscuitBreakout)) emit('breakoutGo');
  }

  function leaveBreakout() {
    state.biscuitBreakout = null;
    emit('breakoutEnd');
    continueFromReading();
  }

  function beginPour() {
    if (startPour(state.dailyPour)) emit('pourGo');
  }

  function leavePour() {
    state.dailyPour = null;
    emit('pourEnd');
    continueFromReading();
  }

  /**
   * The Tea Shortage: the reading's fortune, the spoon, the chapter, and any
   * bonus round still to come all wait while the player decides.
   */
  function startShortage() {
    state.phase = PHASE.SHORTAGE;
    clearField();
    state.shortageDue = false;
    state.shortage = { time: 0 };
    scheduleNextShortage(state);
    emit('shortage', { round: state.round, cash: state.teaCash, price: CONFIG.shortage.teaPrice });
  }

  function leaveShortage() {
    state.shortage = null;
    continueFromReading();
  }

  /** The Tea Run. Like the bonus rounds it leaves the cups, the spoon, and the next fortune alone. */
  function startRun() {
    state.phase = PHASE.TEA_RUN;
    state.shortage = null;
    clearField();
    state.run = createRun(errand);
    emit('runStart', { obstacles: state.run.obstacles.length });
  }

  function beginRunning() {
    startRunning(state.run);
    emit('runGo', {});
  }

  function leaveRun() {
    const { result } = state.run;
    state.run = null;
    emit('runEnd', { result });
    continueFromReading();
  }

  /**
   * Hot Chocolate Havoc. The reading's fortune waits in state.nextFortune, and
   * the spoon, its upgrades, the Golden Spoon's time, and the cups all carry
   * through untouched.
   */
  function startHavoc() {
    state.phase = PHASE.CHOCOLATE;
    clearField();
    state.residue = [];
    state.graceTime = 0;
    state.shotCooldown = 0;
    state.angle = CONFIG.player.startAngle;
    state.havocDue = false;
    state.havocAfter = null;
    state.lastHavoc = state.round;
    state.chocolate = createHavoc(treats);
    emit('chocolateStart', { round: state.round });
  }

  function beginToasting() {
    const c = state.chocolate;
    c.stage = 'play';
    c.time = 0;
    c.spawnTimer = CONFIG.chocolate.spawnMax;
    // The first few bob up across the cup, so there is something to toast straight away.
    for (let i = 0; i < CONFIG.chocolate.openingBatch; i++) {
      spawnMarshmallow(havoc, { radius: treats.range(70, 160) });
    }
    emit('havocStart', { marshmallows: c.marshmallows.length });
  }

  function endHavoc() {
    const c = state.chocolate;
    c.stage = 'outro';
    c.time = 0;
    emit('havocEnd', { ...finishHavoc(havoc) });
  }

  function leaveHavoc() {
    state.chocolate = null;
    brewNextCup();
  }

  function updateChocolate(dt, input) {
    const c = state.chocolate;
    c.time += dt;
    if (c.stage === 'intro') {
      if (c.time >= CONFIG.chocolate.introTime) beginToasting();
      return;
    }
    if (c.stage !== 'play') return;
    // The Golden Spoon's time stands still in the chocolate.
    moveSpoon(state, input, dt);
    state.shotCooldown -= dt;
    if (input.fire) fireFlame(havoc);
    updateHavoc(havoc, dt);
    c.left = Math.max(0, c.left - dt);
    if (c.left === 0) endHavoc();
  }

  /**
   * The Daily Grind. Like the hot chocolate it leaves the round, the reading's
   * fortune, the spoon, and the Golden Spoon's time alone, and however it ends
   * the next cup follows. It brings its own milk and sugar, and plays without
   * the last cup's fortune. Until it is first beaten it is Chapter 1's
   * milestone: see leaveGrind().
   */
  function startGrind() {
    const milestone = milestoneDue(state);
    state.phase = PHASE.GRIND;
    clearField();
    state.residue = [];
    state.graceTime = 0;
    state.shotCooldown = 0;
    state.angle = CONFIG.player.startAngle;
    state.grindDue = false;
    state.lastGrind = state.round;
    state.modifiers = modifiersFor(null);
    state.milkLeft = CONFIG.milk.perRound;
    state.sugarLeft = sugarCapacity(state);
    state.roundStats = createRoundStats();
    state.grind = createGrind({ milestone });
    emit('grindStart', { round: state.round, milestone });
  }

  function beginFight() {
    const g = state.grind;
    g.stage = 'fight';
    g.time = 0;
    emit('grindFight', {});
  }

  /**
   * Back to the tea. After the milestone encounter, a victory opens the next
   * chapter with the coming cup (once: later encounters are not milestones);
   * an escape brings the machine back a fixed number of rounds later, with
   * the chapter unchanged.
   */
  function leaveGrind() {
    const { milestone, result } = state.grind;
    state.grind = null;
    if (milestone && result === 'victory') {
      state.grindAfter = null;
      advanceChapter(state.progress, state.round + 1);
    } else if (milestone) {
      state.grindAfter = state.round + CONFIG.grind.retryAfter;
    }
    brewNextCup();
  }

  function updateGrindPhase(dt, input) {
    const g = state.grind;
    g.time += dt;
    if (g.stage === 'intro') {
      if (g.time >= CONFIG.grind.introTime) beginFight();
      return;
    }
    if (g.stage !== 'fight') return;
    // As in the hot chocolate, the Golden Spoon's time stands still.
    moveSpoon(state, input, dt);
    state.shotCooldown -= dt;
    if (input.fire || (state.autoSteam && autoSteamWantedInGrind(state))) fireSteam(grindSim);
    updateClouds(state, dt);
    updateShots(state, dt);
    updateGrind(grindSim, dt);
  }

  function finishGame() {
    state.phase = PHASE.GAME_OVER;
    state.offer = null;
    clearField();
    emit('gameover', { score: state.score });
  }

  /**
   * A leaf has reached the rim. While the cup recovers from a spill it is
   * sloshed back into the tea; otherwise the strainer catches it if it can,
   * and failing that it spills and costs a cup.
   * @returns {boolean} true if the leaf stays in the cup
   */
  function escape(enemy) {
    const stats = state.roundStats;
    if (state.graceTime > 0) {
      washBack(enemy, CONFIG.grace.recoil);
      stats.nearMisses++;
      emit('recoil', { angle: enemy.angle });
      return true;
    }
    if (state.strainerLeft > 0) {
      state.strainerLeft--;
      stats.nearMisses++;
      emit('strain', {
        angle: enemy.angle, size: enemy.size, left: state.strainerLeft, capacity: strainerCapacity(state.spoon),
      });
      return false;
    }
    state.lives--;
    stats.escapes++;
    emit('escape', { angle: enemy.angle });
    if (state.lives <= 0) finishGame();
    else state.graceTime = CONFIG.grace.duration;
    return false;
  }

  /**
   * Karma: the rim answers instead of the strainer or the cups. The first
   * contact washes the leaf back (it stays in play, and can still be shot);
   * once that recoil has settled, its next contact makes it vanish. That
   * clears it towards the round's target, but it is not a kill: no points,
   * no residue for the reading, no kill or shot statistics.
   * @returns {boolean} true if the leaf stays in the cup
   */
  function karmaRim(enemy) {
    const stats = state.roundStats;
    if (!enemy.karma) {
      enemy.karma = 'bounced';
      washBack(enemy, CONFIG.karma.recoil);
      stats.karmaBounces++;
      emit('karmaBounce', { angle: enemy.angle, radius: enemy.radius, count: stats.karmaBounces });
      return true;
    }
    if (enemy.backwash > 0) return true; // still recoiling from the first contact
    stats.karmaPuffs++;
    emit('karmaPuff', { angle: enemy.angle, radius: enemy.radius, size: enemy.size });
    return false;
  }

  /** One more leaf off the round's list, by a kill or by Karma. Starts the reading at the target. */
  function clearLeaf() {
    state.kills++;
    if (state.kills >= state.target) readLeaves();
  }

  function killEnemy(enemy, shot, inMilk) {
    const R = CONFIG.residue;
    emit('kill', { radius: enemy.radius, angle: enemy.angle, sugar: shot.sugar, by: shot.by });
    state.residue.push({
      lane: laneOf(enemy.angle),
      radius: rng.range(R.radiusMin, R.radiusMax),
      angle: enemy.angle + rng.range(-R.angleJitter, R.angleJitter),
      spin: rng.range(R.spinMin, R.spinMax),
      size: rng.range(R.sizeMin, R.sizeMax),
    });
    if (state.residue.length > R.maxLeaves) state.residue.shift();
    if (inMilk) state.roundStats.milkKills++;
    if (shot.volley) state.roundStats.steamKills++;
    state.score += killScore(shot, state.modifiers);
    clearLeaf();
  }

  /** Unexpected brews that destroy leaves without a dart of their own. */
  const WAKE = Object.freeze({ sugar: false, by: 'wake' });
  const SPLASH = Object.freeze({ sugar: false, by: 'splash' });

  function updateEnemies(dt) {
    const { enemies } = state;
    const splashed = []; // Double Gilt: leaves to splash once the loop is done
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      advanceEnemy(enemy, sim, dt);
      if (state.wake && inWake(state.wake, enemy)) {
        enemies.splice(i, 1);
        killEnemy(enemy, WAKE, false);
        if (!playing()) return;
        continue;
      }
      if (hasEscaped(enemy)) {
        if (state.modifiers.karma) {
          if (karmaRim(enemy)) continue;
          enemies.splice(i, 1);
          clearLeaf();
          if (!playing()) return;
          continue;
        }
        if (escape(enemy)) continue;
        enemies.splice(i, 1);
        if (!playing()) return;
        continue;
      }
      const struck = findStrikingShot(state.shots, enemy);
      if (struck >= 0) {
        const shot = state.shots[struck];
        const inMilk = isNearCloud(state.clouds, enemy.angle, CONFIG.milk.creditHalfWidthLanes);
        // Now and then the cream carries a steam dart on to the next leaf. Nobody mentions it.
        if (inMilk && !shot.sugar && !shot.cream && rng.next() < CONFIG.milk.carryChance) shot.cream = true;
        else state.shots.splice(struck, 1);
        spendDart(state, shot, true);
        enemies.splice(i, 1);
        const splash = giltSplashTarget(enemies, enemy, shot);
        if (splash && !splashed.includes(splash)) splashed.push(splash);
        killEnemy(enemy, shot, inMilk);
        if (!playing()) return;
      }
    }
    for (const enemy of splashed) {
      const index = enemies.indexOf(enemy);
      if (index < 0) continue; // already gone
      enemies.splice(index, 1);
      discover(sim, 'doubleGilt');
      killEnemy(enemy, SPLASH, isNearCloud(state.clouds, enemy.angle, CONFIG.milk.creditHalfWidthLanes));
      if (!playing()) return;
    }
  }

  /**
   * Advance the simulation by dt seconds.
   * @param {number} dt
   * @param {{ left: boolean, right: boolean, fire: boolean }} input held controls
   */
  function update(dt, input = NO_INPUT) {
    if (state.phase === PHASE.READING) {
      const before = state.readingTime;
      state.readingTime += dt;
      const crossed = (at) => before < at && state.readingTime >= at;
      if (crossed(revealAt)) emit('reveal', { fortune: state.nextFortune });
      if (state.nextFortune === 'lie' && crossed(lieRetractAt)) emit('retract');
      return;
    }
    if (state.phase === PHASE.CHOCOLATE) {
      updateChocolate(dt, input);
      return;
    }
    if (state.phase === PHASE.GRIND) {
      updateGrindPhase(dt, input);
      return;
    }
    if (state.phase === PHASE.SHORTAGE) {
      state.shortage.time += dt;
      return;
    }
    if (state.phase === PHASE.TEA_RUN) {
      updateRun(runSim, dt);
      return;
    }
    if (pouring()) {
      updateDailyPour(pourSim, dt);
      return;
    }
    if (breaking()) {
      updateBreakout(breakoutSim, dt, input);
      return;
    }
    if (!playing()) return;
    state.graceTime = Math.max(0, state.graceTime - dt);
    if (state.goldenSpoon > 0) {
      state.goldenSpoon = Math.max(0, state.goldenSpoon - dt);
      if (state.goldenSpoon === 0) emit('goldenSpoonEnd', { angle: state.angle });
    }
    moveSpoon(state, input, dt);
    state.wake = tornadoWake(state);
    if (state.wake) discover(sim, 'silverTornado');
    state.shotCooldown -= dt;
    if (input.fire || (state.autoSteam && autoSteamWanted(state))) fireSteam(sim);
    updateSugarRegen(sim, dt);
    updateSpawning(sim, dt);
    updateCurrent(sim, dt);
    updateClouds(state, dt);
    updateShots(state, dt);
    updateGolden(sim, dt);
    updatePrismatic(sim, dt);
    updateEnemies(dt);
  }

  function pause() {
    if (!playing() && !chocolate('intro') && !chocolate('play') && !grinding('intro') && !grinding('fight')
      && !running('intro') && !running('run') && !pouring() && !breaking()) return;
    state.pausedFrom = state.phase;
    state.phase = PHASE.PAUSED;
    emit('paused');
  }

  function resume() {
    if (state.phase !== PHASE.PAUSED) return;
    state.phase = state.pausedFrom;
    emit('resumed');
  }

  /** The main button: start, pause/resume, or brew the next cup. */
  function primaryAction() {
    switch (state.phase) {
      case PHASE.READY:
      case PHASE.GAME_OVER:
        resetMatch();
        break;
      case PHASE.READING:
        if (!state.offer) continueFromReading(); // an offer waits for a choice
        break;
      case PHASE.CHOCOLATE:
        if (chocolate('intro')) beginToasting(); // skip ahead to the marshmallows
        else if (chocolate('play')) pause();
        else if (state.chocolate.time >= CONFIG.chocolate.outroMin) leaveHavoc();
        break;
      case PHASE.GRIND:
        if (grinding('intro')) beginFight(); // skip the entrance
        else if (grinding('fight')) pause();
        else if (state.grind.time >= CONFIG.grind.outroMin) leaveGrind();
        break;
      case PHASE.TEA_RUN:
        if (running('intro')) beginRunning(); // skip the announcement
        else if (running('run')) pause();
        else if (running('outro') && state.run.time >= CONFIG.teaRun.outroMin) leaveRun();
        break;
      case PHASE.DAILY_POUR:
        if (pouring('intro')) beginPour();
        else if (pouring('play')) pause();
        else if (state.dailyPour.time >= CONFIG.dailyPour.outroMin) leavePour();
        break;
      case PHASE.BISCUIT_BREAKOUT:
        if (breaking('intro')) beginBreakout();
        else if (breaking('play')) pause();
        else if (state.biscuitBreakout.time >= CONFIG.biscuitBreakout.outroMin) leaveBreakout();
        break;
      case PHASE.PLAYING:
        pause();
        break;
      case PHASE.PAUSED:
        resume();
        break;
    }
  }

  return {
    state,
    seed: rng.seed,
    update,
    primaryAction,
    /**
     * Enter: start, or continue from a reading or game over. Returns true if
     * handled. While an upgrade is on offer Enter is left alone, so a focused
     * upgrade card can take it as a click.
     */
    confirm() {
      if (![PHASE.READY, PHASE.READING, PHASE.GAME_OVER, PHASE.CHOCOLATE, PHASE.GRIND, PHASE.TEA_RUN, PHASE.DAILY_POUR,
        PHASE.BISCUIT_BREAKOUT].includes(state.phase)) return false;
      if (pouring('play') || breaking('play')) return false;
      if (state.offer || chocolate('play') || grinding('fight') || running('run') || running('finish')) return false;
      primaryAction();
      return true;
    },
    /** Is an upgrade offer on show and ready to be taken? */
    offerOpen,
    /** Is the Tea Shortage's choice on show and ready to be made? */
    errandOpen,
    chooseInterlude,
    aimPaper: (aim) => pouring('play') && aimPour(state.dailyPour, aim),
    throwPaper: () => pouring('play') && throwPaper(pourSim),
    /** Used by input to give these keys exclusively to this mission, even while paused. */
    paperControls: () => pouring() || (state.phase === PHASE.PAUSED && state.pausedFrom === PHASE.DAILY_POUR),
    /**
     * Biscuit Breakout: Space (or LAUNCH) sends the waiting cube up; before
     * play it starts the mission, like JUMP before the Tea Run. Never in the outro.
     */
    launchCube() {
      if (breaking('intro')) {
        beginBreakout();
        return true;
      }
      return breaking('play') && launchCube(breakoutSim);
    },
    /** Used by input to keep Space for the spoon paddle, even while paused. */
    breakoutControls: () => breaking() || (state.phase === PHASE.PAUSED && state.pausedFrom === PHASE.BISCUIT_BREAKOUT),
    /**
     * Answer the Tea Shortage: 'buy' (if the Tea Cash runs to it), 'run', or
     * 'skip'. Returns true if the choice was taken.
     */
    chooseErrand(choice) {
      if (!errandOpen() || !ERRANDS.includes(choice)) return false;
      if (choice === 'run') {
        startRun();
        return true;
      }
      if (choice === 'buy') {
        if (!buyTea(state)) return false;
        emit('teaBought', { cash: state.teaCash, sugar: CONFIG.shortage.restockSugar });
      } else {
        emit('shortageSkipped', {});
      }
      leaveShortage();
      return true;
    },
    /**
     * In the Tea Run: jump (Space / ↑, or JUMP). Before the run it starts it,
     * and after it, once the result has been seen, it heads home.
     */
    jump() {
      if (running('intro') || running('outro')) {
        const before = state.run;
        primaryAction();
        return state.run !== before || running('run');
      }
      return running('run') && press(runSim, 'jump');
    },
    /** In the Tea Run: slide (↓, or SLIDE). */
    slide: () => running('run') && press(runSim, 'slide'),
    /** Turn Auto Steam on or off; it lasts from pot to pot. */
    setAutoSteam(on) {
      state.autoSteam = !!on;
    },
    /**
     * Which touch gestures the cup answers right now (Easy Touch): 'cup' for
     * milk and sugar in a round or the boss fight, 'flame' to hold for flames
     * in the hot chocolate, or null.
     */
    touchGestures() {
      if (playing() || grinding('fight')) return 'cup';
      if (chocolate('play')) return 'flame';
      return null;
    },
    /**
     * Take offered upgrade number `index` (0-based) and brew the next cup.
     * Returns true if an upgrade was taken.
     */
    chooseUpgrade(index) {
      if (!offerOpen()) return false;
      const id = state.offer[index];
      if (!id) return false;
      applyUpgrade(state.spoon, id);
      state.offer = null;
      continueFromReading();
      emit('upgrade', { id, level: state.spoon[id], name: UPGRADES[id].name, angle: state.angle });
      return true;
    },
    /** P: pause or resume during a round. Returns true if handled. */
    togglePause() {
      if (pouring() || breaking()) {
        pause();
        return true;
      }
      if (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PAUSED && !chocolate('play') && !grinding('fight')
        && !running('run')) return false;
      primaryAction();
      return true;
    },
    /** R: start a fresh match from the game-over screen. */
    restart() {
      if (state.phase !== PHASE.GAME_OVER) return false;
      resetMatch();
      return true;
    },
    pause,
    resume,
    /** Space: steam, or in the hot chocolate a little flame. */
    fireSteam: () => {
      if (chocolate('play')) return fireFlame(havoc);
      if (grinding('fight')) return fireSteam(grindSim);
      return playing() && fireSteam(sim);
    },
    /** Down / M: pour milk. In a normal round the whole cup gets a recovery pulse as well. */
    pourMilk: () => {
      if (grinding('fight')) {
        const poured = pourMilk(grindSim);
        if (poured) milkTheMachine(grindSim);
        return poured;
      }
      if (!playing() || !pourMilk(sim)) return false;
      milkPulse(sim);
      return true;
    },
    sugarBurst: () => (grinding('fight') ? sugarBurst(grindSim) : playing() && sugarBurst(sim)),
    /** Remove and return all events queued since the last call. */
    drainEvents() {
      return events.splice(0, events.length);
    },
  };
}
