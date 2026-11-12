import { createGame } from './game.js';
import { randomSeed, toSeed } from './random.js';
import { ARCADE_IDS } from '../storage/localProgress.js';
import { createTraining } from './training.js';

/** One suspended pot and a disposable practice or training instance. No shared state/RNG. */
export function createSessions(main, progress, { nextSeed = randomSeed } = {}) {
  let pot = main, practice = null, training = null, collection = false, result = null;
  const active = () => training ?? practice ?? pot;
  // Existing input, HUD and renderer keep one stable interface. Method lookup
  // happens at invocation, so listeners cannot retain an abandoned session.
  const methods = new Map();
  const game = new Proxy({}, {
    get(_, key) {
      // Keep the simulation clock replaceable by the existing read-only
      // browser harness: saving update, then stubbing it, must retain the
      // original instance's clock for explicit deterministic advancement.
      if (key === 'update') return active().update;
      if (typeof active()[key] !== 'function') return active()[key];
      if (!methods.has(key)) methods.set(key, (...args) => active()[key](...args));
      return methods.get(key);
    },
    set(_, key, value) { active()[key] = value; return true; },
  });
  return {
    game,
    get main() { return pot; },
    get practice() { return practice; },
    get training() { return training; },
    get ordinary() { return !training && !practice && !collection; },
    train(options) { this.back(); training = createTraining(options); return training; },
    get collection() { return collection; },
    get result() { return result; },
    open() { this.back(); collection = true; },
    launch(id, seed = nextSeed()) {
      if (!ARCADE_IDS.includes(id)) return false;
      training = null;
      practice = createGame({ seed, practice: id });
      collection = false;
      result = null;
      return true;
    },
    replay(same = false) {
      if (!practice) return false;
      const oldSeed = practice.seed, id = practice.practice;
      let seed = oldSeed;
      if (!same) {
        seed = toSeed(nextSeed());
        if (seed === oldSeed) seed = toSeed(seed + 1);
      }
      return this.launch(id, seed);
    },
    back() { training = null; practice = null; collection = false; result = null; },
    settle() {
      if (practice && !result) result = progress.settle(practice);
      return result;
    },
    continuePot() {
      const checkpoint = progress.pot;
      if (!checkpoint) return false;
      pot = createGame({ checkpoint });
      this.back();
      return true;
    },
    // Confirmation belongs to the caller. Failed storage is reported by the
    // progress store; it cannot prevent a confirmed new session from playing.
    newPot(confirmed = false) {
      if (progress.pot && !confirmed) return false;
      if (progress.pot) progress.clearPot();
      pot = createGame({ seed: nextSeed() });
      this.back();
      pot.primaryAction();
      return true;
    },
    handle(event) {
      if (!this.ordinary) return;
      if (event.type === 'checkpoint') progress.saveCheckpoint(event.checkpoint);
      if (event.type === 'gameover') progress.clearPot();
    },
  };
}
