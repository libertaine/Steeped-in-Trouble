// A small registry of optional between-round detours. Existing adventures keep
// their phases and priority. Scheduling never consumes any game's random stream.
// Each adventure keeps its own date (CONFIG.arcade); at most one is offered per
// reading, and when several are due the one that has waited longest goes first.
import { CONFIG } from '../config.js';

export const INTERLUDES = Object.freeze({
  dailyPour: { title: 'The Daily Pour' },
  biscuitBreakout: { title: 'Biscuit Breakout' },
  crossingStreet: { title: 'Crossing the Street' },
});

export function createArcadeSchedule() {
  const after = {};
  for (const id of Object.keys(INTERLUDES)) after[id] = CONFIG.arcade[id].firstAfter;
  return { after, offeredAt: null };
}

/**
 * Decide once per reading. A conflicting encounter postpones to a later
 * reading. Among those due, the earliest date wins (ties: registry order), so
 * a postponed adventure is never starved by one listed before it.
 */
export function eligibleInterlude(state) {
  if (state.shortageDue || state.grindDue || state.havocDue) return null;
  if (state.arcade.offeredAt === state.round) return null;
  let best = null;
  for (const id of Object.keys(INTERLUDES)) {
    const rule = CONFIG.arcade[id];
    const due = state.arcade.after[id];
    if (state.progress.chapter < rule.minChapter || state.round < due) continue;
    if (best === null || due < state.arcade.after[best]) best = id;
  }
  return best;
}

/** Accepting and skipping both consume the opportunity, with no queue or backlog. */
export function consumeInterlude(state, id) {
  state.arcade.offeredAt = state.round;
  state.arcade.after[id] = state.round + CONFIG.arcade[id].repeatEvery;
  state.arcadeDue = null;
}

/** Settlement belongs to simulation, once, even if an outro is dismissed repeatedly. */
export function awardInterlude(state, mission, summary) {
  if (mission.summary) return false;
  mission.summary = summary;
  state.score += summary.points;
  state.teaCash += summary.cash;
  return true;
}
