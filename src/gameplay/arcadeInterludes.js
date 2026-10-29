// A small registry of optional between-round detours. Existing adventures keep
// their phases and priority. Scheduling never consumes any game's random stream.
import { CONFIG } from '../config.js';

export const INTERLUDES = Object.freeze({ dailyPour: { title: 'The Daily Pour' } });

export function createArcadeSchedule() {
  return { after: { dailyPour: CONFIG.arcade.dailyPour.firstAfter }, offeredAt: null };
}

/** Decide once per reading. A conflicting encounter postpones to a later reading. */
export function eligibleInterlude(state) {
  if (state.shortageDue || state.grindDue || state.havocDue) return null;
  return Object.keys(INTERLUDES).find((id) => {
    const rule = CONFIG.arcade[id];
    return state.progress.chapter >= rule.minChapter && state.round >= state.arcade.after[id]
      && state.arcade.offeredAt !== state.round;
  }) ?? null;
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
