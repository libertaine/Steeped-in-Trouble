// How strongly the Strange Brews steep: the learning curve.
//
// Each special behaviour starts gentle and reaches full strength in a later
// round. CONFIG.teas.stages says where each stage starts; tuning that varies
// by stage is a list in CONFIG with one value per stage, read with
// byStage(). The stage depends only on the round number, so a pinned tea
// (?tea=…) and an ordinary pot brew the same round the same way.

import { CONFIG } from '../config.js';

const STAGES = CONFIG.teas.stages;

/** The index of the stage a round belongs to (0 for the first). */
export function teaStage(round) {
  let stage = 0;
  for (let i = 1; i < STAGES.length; i++) if (round >= STAGES[i].from) stage = i;
  return stage;
}

/** A per-stage tuning value (a list in CONFIG) for a round. */
export function byStage(values, round) {
  return values[teaStage(round)];
}
