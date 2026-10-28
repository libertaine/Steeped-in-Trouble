// Full seeded courses with a curious player tapping Jump every 150 ms.
// Real obstacles, stumbles, pickups, expiry and safe returns remain enabled.
import { createRandom } from '../../src/core/random.js';
import { createRun, press, updateRun } from '../../src/gameplay/teaRun.js';

export function sampleAerialRuns(count = 20000) {
  const counts = { bird: 0, power: 0, orbit: 0, none: 0 };
  const opportunities = { bird: 0, power: 0, orbit: 0, none: 0 };
  for (let seed = 1; seed <= count; seed++) {
    const rng = createRandom(seed);
    const run = createRun(rng);
    opportunities[run.opportunity ?? 'none']++;
    run.stage = 'run';
    const sim = { state: { run, score: 0, teaCash: 0, extraSugar: 0 }, rng, emit() {} };
    for (let i = 0; i < 500 && run.stage === 'run'; i++) {
      press(sim, 'jump');
      updateRun(sim, 0.15);
    }
    counts[run.encountered ?? 'none']++;
  }
  return { count, counts, opportunities, orbitRate: counts.orbit / count };
}
