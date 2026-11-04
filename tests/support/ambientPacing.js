// The ant colony's pacing, as a plain report (not a test). Seeded, so every
// run prints the same tables:
//
//   node tests/support/ambientPacing.js [seeds] [minutes]
//
// Three timings of the colony's empty spell (A, the current one; B,
// moderately longer; C, much longer) under identical measured layouts and
// seeds, from a calm screen. An ant counts as visible once any of it is
// inside the stage (not while it stands fully clipped beyond a portal).
import { createRandom } from '../../src/core/random.js';
import { AMBIENT, createColony, displayBudget, safeRegions } from '../../src/rendering/ambient.js';

const seeds = Number(process.argv[2] ?? 20);
const minutes = Number(process.argv[3] ?? 30);
const FRAME = 1 / 60;

const PACINGS = Object.freeze({
  A: { label: 'A: current (empty 12–30 s)', empty: AMBIENT.empty },
  B: { label: 'B: moderately longer (empty 24–48 s)', empty: [24, 48] },
  C: { label: 'C: much longer (empty 45–90 s)', empty: [45, 90] },
});

// Measured 0.20.0 playing layouts (production build, Chromium; docs/ARCHITECTURE.md).
const LAYOUTS = [
  { name: '1920 × 1080 Full', visible: { x: 0, y: 0, w: 1526, h: 857 }, game: { x: 264, y: 0, w: 998, h: 857 }, viewport: [1920, 1080] },
  { name: '1280 × 720 Full', visible: { x: 0, y: 0, w: 1226, h: 498 }, game: { x: 323, y: 0, w: 580, h: 498 }, viewport: [1280, 720] },
];

const R = AMBIENT.footprint;
const inside = (a, v) => a.x + R > v.x && a.x - R < v.x + v.w && a.y + R > v.y && a.y - R < v.y + v.h;
const quantile = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(p * (s.length - 1))];
};

/** One seeded run: per-frame visible counts, social moments, runs of activity and closeness. */
function pace({ layout, empty, seed, seconds }) {
  const regions = safeRegions(layout.visible, [layout.game]);
  const [w, h] = layout.viewport;
  const limit = Math.min(displayBudget(regions, { viewport: { w, h }, screen: { w: 1920, h: 1080 }, touch: false }), 12);
  const colony = createColony({ random: createRandom(seed), tuning: { ...AMBIENT, empty } });
  let none = 0, total = 0, frames = 0, moments = 0, busy = false, crowdedFrames = 0, closeFrames = 0, multi = 0;
  const active = [], quiet = [];
  let run = 0, gap = 0;
  for (let t = 0; t < seconds; t += FRAME) {
    colony.step(FRAME, regions, limit);
    frames++;
    const seen = colony.ants.filter((a) => a.state !== 'absent' && inside(a, layout.visible));
    total += seen.length;
    if (seen.length === 0) {
      none++;
      if (run > 0) { active.push(run); run = 0; }
      gap += FRAME;
    } else {
      if (gap > 0) { quiet.push(gap); gap = 0; }
      run += FRAME;
    }
    if (seen.length >= 4) crowdedFrames++;
    // Two ants on their own within 40 px of each other: a visible clump.
    let close = false;
    for (let i = 0; i < seen.length && !close; i++) {
      if (seen[i].mode !== 'solo') continue;
      for (let j = i + 1; j < seen.length; j++) {
        if (seen[j].mode === 'solo' && Math.hypot(seen[i].x - seen[j].x, seen[i].y - seen[j].y) < 40) { close = true; break; }
      }
    }
    if (close) closeFrames++;
    if (seen.length >= 2) multi++;
    const social = colony.ants.some((a) => a.mode !== 'solo');
    if (social && !busy) moments++;
    busy = social;
  }
  if (run > 0) active.push(run);
  return { limit, none: none / frames, mean: total / frames, whileSeen: total / Math.max(1, frames - none),
    moments, active, quiet, crowded: crowdedFrames / frames, close: closeFrames / Math.max(1, multi) };
}

function report() {
  const pct = (n) => `${(100 * n).toFixed(0)}%`;
  console.log(`Ant colony pacing: ${seeds} seeds × ${minutes} min per row, ready/playing calm screen, High graphics.`);
  console.log('Empty = share of time with no ant visible; mean = average ants visible (and while any are);');
  console.log('social = moments per 10 min; activity / quiet = median and 90th-percentile run lengths (s);');
  console.log('4+ = share of time with four or more out; clumps = share of multi-ant time two solo ants are within 40 px.\n');
  for (const layout of LAYOUTS) {
    console.log(`${layout.name}`);
    console.log('| Pacing | Empty | Mean (while seen) | Social /10 min | Activity median / p90 | Quiet median / p90 | 4+ | Clumps |');
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const { label, empty } of Object.values(PACINGS)) {
      const runs = Array.from({ length: seeds }, (_, i) => pace({ layout, empty, seed: i + 1, seconds: minutes * 60 }));
      const avg = (key) => runs.reduce((a, r) => a + r[key], 0) / runs.length;
      const active = runs.flatMap((r) => r.active), quiet = runs.flatMap((r) => r.quiet);
      const social = runs.reduce((a, r) => a + r.moments, 0) / (seeds * minutes / 10);
      console.log(`| ${label} | ${pct(avg('none'))} | ${avg('mean').toFixed(2)} (${avg('whileSeen').toFixed(2)}) | ${social.toFixed(1)}`
        + ` | ${quantile(active, 0.5).toFixed(0)} / ${quantile(active, 0.9).toFixed(0)} | ${quantile(quiet, 0.5).toFixed(0)} / ${quantile(quiet, 0.9).toFixed(0)}`
        + ` | ${pct(avg('crowded'))} | ${pct(avg('close'))} |`);
    }
    console.log('');
  }
}

report();
