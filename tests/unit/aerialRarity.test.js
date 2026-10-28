import { expect, it } from 'vitest';
import { sampleAerialRuns } from '../support/aerialSampling.js';

it('keeps orbit rare across 20,000 real seeded courses with repeated jump taps', () => {
  const sample = sampleAerialRuns();
  // A balance guard for this fixed experiment, not a probabilistic/flaky test.
  expect(sample.orbitRate).toBeGreaterThan(0.0025);
  expect(sample.orbitRate).toBeLessThan(0.0075);
  expect(sample.counts.bird).toBeGreaterThan(sample.counts.power);
  expect(sample.counts.power).toBeGreaterThan(sample.counts.orbit);
  expect(Object.values(sample.counts).reduce((sum, n) => sum + n, 0)).toBe(sample.count);
}, 60000);
