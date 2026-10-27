// The game simulation: phase transitions and the per-frame update.
//
// The simulation never touches the DOM, canvas, or audio. It mutates plain
// state and queues events ({ type, ...data }) describing what happened, which
// presentation code (effects, audio, input) drains once per frame.
//
// Events: matchStart, roundStart, steam, sugar, sugarRegen, milk, kill, drift,
// escape, goldenAppear, goldenCatch, goldenGone, reading, reveal, retract,
// gameover, paused, resumed.

import { CONFIG } from '../config.js';
import { createRandom } from './random.js';
import { PHASE, createInitialState, createRoundStats } from './state.js';
import { laneOf } from '../gameplay/arena.js';
import { drawFortune, modifiersFor } from '../gameplay/fortunes.js';
import { updateGolden } from '../gameplay/golden.js';
import { moveSpoon } from '../gameplay/player.js';
import { advanceEnemy, hasEscaped, updateSpawning } from '../gameplay/enemies.js';
import {
  findStrikingShot, fireSteam, isNearCloud, killScore, pourMilk, sugarBurst, updateClouds, updateShots,
  updateSugarRegen,
} from '../gameplay/weapons.js';

const { revealAt, lieRetractAt } = CONFIG.fortunes;

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
  const playing = () => state.phase === PHASE.PLAYING;

  function clearField() {
    state.shots = [];
    state.enemies = [];
    state.clouds = [];
    state.golden = null;
    state.goldenTimer = null;
  }

  function startRound() {
    state.phase = PHASE.PLAYING;
    clearField();
    state.residue = [];
    state.kills = 0;
    state.target = CONFIG.rounds.baseTarget + (state.round - 1) * CONFIG.rounds.targetPerRound;
    state.modifiers = modifiersFor(state.fortune);
    state.milkLeft = CONFIG.milk.perRound;
    state.sugarLeft = CONFIG.sugar.perRound + state.modifiers.bonusSugar;
    state.sugarRegenTimer = state.modifiers.sugarRegenInterval;
    if (state.modifiers.goldenCube) state.goldenTimer = rng.range(CONFIG.golden.delayMin, CONFIG.golden.delayMax);
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
    emit('matchStart');
    startRound();
  }

  function readLeaves() {
    state.phase = PHASE.READING;
    state.readingTime = 0;
    clearField();
    const { milkKills, milkUses, sugarUses, escapes } = state.roundStats;
    state.nextFortune = drawFortune({
      milkKills, milkUses, sugarUses, escapes,
      leafLanes: state.residue.map((leaf) => leaf.lane),
    }, rng);
    emit('reading', { fortune: state.nextFortune });
  }

  function finishGame() {
    state.phase = PHASE.GAME_OVER;
    clearField();
    emit('gameover', { score: state.score });
  }

  function loseLife(enemy) {
    state.lives--;
    state.roundStats.escapes++;
    emit('escape', { angle: enemy.angle });
    if (state.lives <= 0) finishGame();
  }

  function killEnemy(enemy, shot) {
    const R = CONFIG.residue;
    emit('kill', { radius: enemy.radius, angle: enemy.angle, sugar: shot.sugar });
    state.residue.push({
      lane: laneOf(enemy.angle),
      radius: rng.range(R.radiusMin, R.radiusMax),
      angle: enemy.angle + rng.range(-R.angleJitter, R.angleJitter),
      spin: rng.range(R.spinMin, R.spinMax),
      size: rng.range(R.sizeMin, R.sizeMax),
    });
    if (state.residue.length > R.maxLeaves) state.residue.shift();
    if (isNearCloud(state.clouds, enemy.angle, CONFIG.milk.creditHalfWidthLanes)) state.roundStats.milkKills++;
    state.score += killScore(shot, state.modifiers);
    state.kills++;
    if (state.kills >= state.target) readLeaves();
  }

  function updateEnemies(dt) {
    const { enemies } = state;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      advanceEnemy(enemy, sim, dt);
      if (hasEscaped(enemy)) {
        enemies.splice(i, 1);
        loseLife(enemy);
        if (!playing()) return;
        continue;
      }
      const struck = findStrikingShot(state.shots, enemy);
      if (struck >= 0) {
        const [shot] = state.shots.splice(struck, 1);
        enemies.splice(i, 1);
        killEnemy(enemy, shot);
        if (!playing()) return;
      }
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
    if (!playing()) return;
    moveSpoon(state, input, dt);
    state.shotCooldown -= dt;
    if (input.fire) fireSteam(sim);
    updateSugarRegen(sim, dt);
    updateSpawning(sim, dt);
    updateClouds(state, dt);
    updateShots(state, dt);
    updateGolden(sim, dt);
    updateEnemies(dt);
  }

  function pause() {
    if (!playing()) return;
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
        state.round++;
        state.fortune = state.nextFortune;
        startRound();
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
    /** Enter: start, or continue from a reading or game over. Returns true if handled. */
    confirm() {
      if (![PHASE.READY, PHASE.READING, PHASE.GAME_OVER].includes(state.phase)) return false;
      primaryAction();
      return true;
    },
    /** P: pause or resume during a round. Returns true if handled. */
    togglePause() {
      if (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PAUSED) return false;
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
    fireSteam: () => playing() && fireSteam(sim),
    pourMilk: () => playing() && pourMilk(sim),
    sugarBurst: () => playing() && sugarBurst(sim),
    /** Remove and return all events queued since the last call. */
    drainEvents() {
      return events.splice(0, events.length);
    },
  };
}
