import { CONFIG } from '../config.js';
import { createGame } from './game.js';
import { createRandom } from './random.js';
import { PHASE, createRoundStats } from './state.js';
import { angleDifference, laneOf } from '../gameplay/arena.js';
import { spawnEnemy, milkSlow } from '../gameplay/enemies.js';

// Private seed and fixed lanes. Retries restart the same exercise RNG, never a pot RNG.
export const TRAINING_SEED = 0x7ea1c0;
export const TRAINING_LANE = laneOf(CONFIG.player.startAngle);
export const PRACTICE_LANES = [0, 1, -1, 2, 0].map((n) => TRAINING_LANE + n);

export function createTraining({ released = () => true } = {}) {
  let sim, stage = 0, engaged = false, success = false, failures = 0;
  let travel = [0, 0], previousAngle = 0, milkTarget = null, milkRadius = 0, evidenceTime = 0;
  let practiceIndex = 0, advance = false, preview = 0;
  const view = { stage: 0, engaged: false, success: false, failures: 0, complete: false };
  function prepare(retry = false) {
    const { state } = sim;
    sim.rng = createRandom(TRAINING_SEED + stage);
    state.enemies = []; state.shots = []; state.clouds = []; state.volleys = {};
    state.pulse = 0; state.shotCooldown = 0; state.stir = { dir: 0, time: 0 };
    state.milkLeft = CONFIG.milk.perRound; state.sugarLeft = CONFIG.sugar.perRound;
    state.roundStats = createRoundStats(); state.kills = 0;
    state.target = stage === 4 ? PRACTICE_LANES.length : stage === 3 ? 3 : 1;
    state.angle = CONFIG.player.startAngle;
    engaged = stage === 4; success = false; advance = false; travel = [0, 0];
    milkTarget = null; evidenceTime = 0; practiceIndex = 0;
    preview = stage === 3 ? 1.2 : 0;
    if (!retry) failures = 0;
    if (stage > 0 && stage < 5) targets();
    sync(); sim.emit('trainingStage');
  }
  function leaf(lane, radius) {
    const enemy = spawnEnemy(sim, { lane });
    // Controlled placement only: speed, damage, milk and collision rules stay ordinary.
    if (radius !== undefined) enemy.radius = radius;
    enemy.alpha = 1;
    return enemy;
  }
  function targets() {
    if (stage === 3) for (const n of [-1, 0, 1]) leaf(TRAINING_LANE + n, CONFIG.arena.rimRadius * .55);
    else if (stage === 4) leaf(PRACTICE_LANES[practiceIndex]);
    else leaf(TRAINING_LANE, CONFIG.arena.rimRadius * (stage === 2 ? .83 : .5));
  }
  function sync() {
    Object.assign(view, { stage, engaged, success, failures, preview, complete: stage === 5 });
  }
  const policy = {
    view,
    get frozen() { return !engaged || success || stage === 5; },
    init(context) { sim = context; sim.state.phase = PHASE.PLAYING; sim.state.training = view; prepare(); },
    allow(action) {
      return !success && stage < 5 && (stage === 4 || ['move', 'steam', 'milk', 'sugar'][stage] === action);
    },
    engage() { if (stage > 0 && stage < 5 && !success) engaged = true; },
    before(dt, input) {
      if (advance) { stage++; prepare(); }
      previousAngle = sim.state.angle;
      if (input.left !== input.right || input.fire) this.engage();
    },
    after(dt, input) {
      preview = Math.max(0, preview - dt);
      if (stage === 0) {
        const delta = angleDifference(sim.state.angle, previousAngle);
        if (delta) travel[delta < 0 ? 0 : 1] += Math.abs(delta);
        success = travel.every((n) => n >= .22);
      }
      if (stage === 2 && milkTarget && sim.state.enemies.includes(milkTarget)
        && milkTarget.radius < milkRadius && milkSlow(sim.state, milkTarget.angle) < 1) {
        evidenceTime += dt;
        if (evidenceTime >= .65) success = true;
      }
      // Auto Steam waits for deliberate steering; opening the prompt never fires for you.
      if (stage > 0 && stage < 5 && !success && sim.state.enemies.length === 0) targets();
      if (!success && stage === 2 && sim.state.milkLeft === 0 && !milkTarget) this.retry();
      if (!success && stage === 3 && sim.state.sugarLeft === 0 && sim.state.shots.length === 0) this.retry();
      // Success is observed only in the current simulation. No queued/delayed events can skip stages.
      if (success && !input.left && !input.right && !input.fire && released()) advance = true;
      sync();
    },
    hit(shot) {
      if (stage === 1 && !shot.sugar && shot.volley) success = true;
      if (stage === 3 && shot.sugar) success = true;
      if (stage === 4) { practiceIndex++; if (practiceIndex === PRACTICE_LANES.length) success = true; }
    },
    milk() {
      engaged = true;
      milkTarget = sim.state.enemies.find((e) => e.backwash >= CONFIG.milk.backwash);
      milkRadius = milkTarget?.radius ?? 0;
      evidenceTime = 0;
    },
    missed() { failures++; if (stage === 2) milkTarget = null; sync(); },
    retry() { if (stage >= 5) return; failures++; prepare(true); },
  };
  // The ordinary simulation owns all weapons, movement, collisions and visual events.
  const game = createGame({ seed: TRAINING_SEED, training: policy });
  return game;
}
