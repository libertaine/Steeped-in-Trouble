// Issue #15: the pattern readings stay balanced as leaf targets grow. Every
// sample is seeded, so these shares are exact and repeatable, not flaky.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { selectFortune } from '../../src/gameplay/fortunes.js';
import { sweep } from '../support/fortuneSweep.js';

const R = CONFIG.rounds;
const TARGETS = Array.from({ length: (R.maxTarget - R.baseTarget) / R.targetPerRound + 1 },
  (_, i) => R.baseTarget + i * R.targetPerRound); // 16, 18, … 32

/** Pattern shares for cups whose leaves settled in uniformly random lanes. */
function uniformShares(kills, samples = 4000) {
  const rng = createRandom(kills);
  const counts = { veil: 0, crown: 0, spiral: 0, star: 0 };
  for (let i = 0; i < samples; i++) {
    const leafLanes = Array.from({ length: kills }, () => rng.int(CONFIG.arena.lanes));
    counts[selectFortune({ milkKills: 0, leafLanes })]++;
  }
  return Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, n / samples]));
}

describe('fortune pattern balance across leaf targets (#15)', () => {
  const shares = TARGETS.map((kills) => ({ kills, ...uniformShares(kills) }));

  it('keeps every pattern in its band at every target', () => {
    for (const s of shares) {
      expect(s.crown, `Crown at ${s.kills}`).toBeGreaterThan(0.17);
      expect(s.crown, `Crown at ${s.kills}`).toBeLessThan(0.27);
      expect(s.spiral, `Spiral at ${s.kills}`).toBeGreaterThan(0.35);
      expect(s.spiral, `Spiral at ${s.kills}`).toBeLessThan(0.46);
      expect(s.star, `Star at ${s.kills}`).toBeGreaterThan(0.32);
      expect(s.star, `Star at ${s.kills}`).toBeLessThan(0.43);
    }
  });

  it('holds each share steady from the first cup to the 32-leaf cap', () => {
    for (const id of ['crown', 'spiral', 'star']) {
      const values = shares.map((s) => s[id]);
      expect(Math.max(...values) - Math.min(...values), id).toBeLessThan(0.05);
    }
  });

  // 180 real rounds per target by players who cover the whole cup. Before the
  // fix this sample read The Star in under 1% of 32-leaf cups.
  it('keeps the shares in real rounds, in the first cup and at the cap', () => {
    for (const target of [R.baseTarget, R.maxTarget]) {
      const { patterns } = sweep({ targets: [target], styles: ['sweeper', 'milky', 'sweet'], seeds: 30 });
      expect(Math.max(...Object.values(patterns)), `dominant at ${target}`).toBeLessThan(0.5);
      expect(patterns.star, `Star at ${target}`).toBeGreaterThan(0.2);
      expect(patterns.crown, `Crown at ${target}`).toBeGreaterThan(0.15);
      expect(patterns.spiral, `Spiral at ${target}`).toBeGreaterThan(0.3);
    }
  });

  it('still reads a cup guarded in one place as The Crown, and a milky one as The Veil', () => {
    const camper = sweep({ targets: [R.baseTarget, R.maxTarget], styles: ['camper'], seeds: 15 });
    expect(camper.patterns.crown).toBeGreaterThan(0.5);
    expect(camper.patterns.spiral).toBe(0); // half a cup can never look scattered
    const milky = sweep({ targets: [R.baseTarget, R.maxTarget], styles: ['milky'], seeds: 15 });
    const sweeper = sweep({ targets: [R.baseTarget, R.maxTarget], styles: ['sweeper'], seeds: 15 });
    expect(milky.patterns.veil).toBeGreaterThan(sweeper.patterns.veil); // tied to milk, not to the target
  });
});
