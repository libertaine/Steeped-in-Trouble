import { createGame } from './game.js';
import { randomSeed, toSeed } from './random.js';
import { ARCADE_IDS } from '../storage/localProgress.js';

/** One suspended pot, one disposable practice instance. No state or RNG is shared. */
export function createSessions(main, progress, { nextSeed = randomSeed } = {}) {
  let pot = main, practice = null, collection = false, result = null;
  const active = () => practice ?? pot;
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
    get collection() { return collection; },
    get result() { return result; },
    open() { practice = null; collection = true; result = null; },
    launch(id, seed = nextSeed()) {
      if (!ARCADE_IDS.includes(id)) return false;
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
    back() { practice = null; collection = false; result = null; },
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
      if (practice || collection) return;
      if (event.type === 'checkpoint') progress.saveCheckpoint(event.checkpoint);
      if (event.type === 'gameover') progress.clearPot();
    },
  };
}
