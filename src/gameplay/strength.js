// How strongly the Strange Brews steep: the learning curve.
//
// Each special behaviour starts gentle and reaches full strength later on.
// CONFIG.teas.stages says where each stage starts; tuning that varies by
// stage is a list in CONFIG with one value per stage, read with byStage().
// The stage depends only on the tea's age: the normal rounds since it came
// on tap, counting its first as 1 (gameplay/progress.js). A tea that arrives
// in Chapter 2 starts at the beginning however late in the pot that is, and
// a pinned tea (?tea=…) counts as on tap from the first cup.

import { CONFIG } from '../config.js';

const STAGES = CONFIG.teas.stages;

/** The index of the stage a tea of this age is at (0 for the first). */
export function teaStage(age) {
  let stage = 0;
  for (let i = 1; i < STAGES.length; i++) if (age >= STAGES[i].from) stage = i;
  return stage;
}

/** A per-stage tuning value (a list in CONFIG) for a tea of this age. */
export function byStage(values, age) {
  return values[teaStage(age)];
}
