// The game simulation: phase transitions and the per-frame update.
//
// The simulation never touches the DOM, canvas, or audio. It mutates plain
// state and queues events ({ type, ...data }) describing what happened, which
// presentation code (effects, audio, input) drains once per frame.
//
// Events: matchStart, roundStart, steam, sugar, sugarRegen, milk, kill, drift,
// escape, strain, recoil, goldenAppear, goldenCatch, goldenGone, goldenSpoon,
// goldenSpoonEnd, prismaticAppear, prismaticCatch, prismaticGone, nova, secret,
// discover, reading, reveal, retract, upgrade, gameover, paused,
// resumed; and in Hot Chocolate Havoc: chocolateStart, havocStart, flame,
// toast, burn, perfect, scoop, crumble, bump, giantAppear, giantGrow,
// catastrophe, giantGone, havocEnd.

import { CONFIG } from '../config.js';
import { createRandom, toSeed } from './random.js';
import { PHASE, createInitialState, createRoundStats } from './state.js';
import { laneOf } from '../gameplay/arena.js';
import { drawFortune, modifiersFor } from '../gameplay/fortunes.js';
import { updateGolden } from '../gameplay/golden.js';
import { rollPrismatic, updatePrismatic } from '../gameplay/prismatic.js';
import { SECRETS, findSecrets } from '../gameplay/secrets.js';
import { discover, giltSplashTarget, inWake, tornadoWake } from '../gameplay/combos.js';
import { moveSpoon } from '../gameplay/player.js';
import {
  createHavoc, finishHavoc, fireFlame, firstHavocRound, havocDue, spawnMarshmallow, updateHavoc,
} from '../gameplay/chocolate.js';
import { advanceEnemy, hasEscaped, updateSpawning, washBack } from '../gameplay/enemies.js';
import { UPGRADES, applyUpgrade, createSpoon, drawOffer, offerDue, strainerCapacity } from '../gameplay/upgrades.js';
import {
  findStrikingShot, fireSteam, isNearCloud, killScore, pourMilk, spendDart, sugarBurst, sugarCapacity, updateClouds,
  updateShots, updateSugarRegen,
} from '../gameplay/weapons.js';

const { revealAt, lieRetractAt } = CONFIG.fortunes;

/** Reading seconds before an upgrade offer appears and can be taken. */
export const OFFER_AT = revealAt + 0.6;

const NO_INPUT = Object.freeze({ left: false, right: false, fire: false });

/**
 * @param {{ seed?: number, random?: ReturnType<typeof createRandom> }} [options]
 *   Pass a seed (or a generator) to reproduce an exact gameplay sequence.
 */
export function createGame({ seed, random } = {}) {
  const rng = random ?? createRandom(seed);
  const state = createInitialState();
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });
  const sim = { state, rng, emit };
  // The bonus round draws from its own generator, so the normal rounds play
  // out identically whether or not one happens.
  const treats = createRandom(toSeed(rng.seed ?? 0) ^ 0x5eedc0c0);
  const havoc = { state, rng: treats, emit };
  const playing = () => state.phase === PHASE.PLAYING;
  const chocolate = (stage) => state.phase === PHASE.CHOCOLATE && (!stage || state.chocolate.stage === stage);
  const offerOpen = () => state.phase === PHASE.READING && !!state.offer && state.readingTime >= OFFER_AT;

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
  }

  function startRound() {
    state.phase = PHASE.PLAYING;
    clearField();
    state.residue = [];
    state.kills = 0;
    state.target = CONFIG.rounds.baseTarget + (state.round - 1) * CONFIG.rounds.targetPerRound;
    state.modifiers = modifiersFor(state.fortune);
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
    emit('roundStart', { round: state.round, fortune: state.fortune });
  }

  function resetMatch() {
    state.round = 1;
    state.score = 0;
    state.lives = CONFIG.lives;
    state.fortune = null;
    state.nextFortune = null;
    state.spoon = createSpoon();
    state.goldenSpoon = 0;
    state.extraSugar = 0;
    state.discovered = [];
    state.chocolate = null;
    state.havocDue = false;
    state.lastHavoc = 0;
    state.havocAfter = firstHavocRound(treats);
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
    }, rng);
    state.offer = offerDue(state.round) ? drawOffer(state.spoon, rng) : null;
    state.havocDue = havocDue(state, treats);
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

  /** Leave a reading: on to the next cup, or first a detour into hot chocolate. */
  function continueFromReading() {
    if (state.havocDue) startHavoc();
    else brewNextCup();
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
    state.kills++;
    if (state.kills >= state.target) readLeaves();
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
    if (input.fire) fireSteam(sim);
    updateSugarRegen(sim, dt);
    updateSpawning(sim, dt);
    updateClouds(state, dt);
    updateShots(state, dt);
    updateGolden(sim, dt);
    updatePrismatic(sim, dt);
    updateEnemies(dt);
  }

  function pause() {
    if (!playing() && !chocolate('intro') && !chocolate('play')) return;
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
      if (![PHASE.READY, PHASE.READING, PHASE.GAME_OVER, PHASE.CHOCOLATE].includes(state.phase)) return false;
      if (state.offer || chocolate('play')) return false;
      primaryAction();
      return true;
    },
    /** Is an upgrade offer on show and ready to be taken? */
    offerOpen,
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
      if (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PAUSED && !chocolate('play')) return false;
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
    fireSteam: () => (chocolate('play') ? fireFlame(havoc) : playing() && fireSteam(sim)),
    pourMilk: () => playing() && pourMilk(sim),
    sugarBurst: () => playing() && sugarBurst(sim),
    /** Remove and return all events queued since the last call. */
    drainEvents() {
      return events.splice(0, events.length);
    },
  };
}
