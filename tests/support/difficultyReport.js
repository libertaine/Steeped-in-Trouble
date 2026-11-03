// The late-game difficulty and Mycelium Manager sweeps behind
// docs/PHASE_4_REVIEW_019.md, as a plain report (not a test). Seeded, so
// every run prints the same tables:
//
//   node tests/support/difficultyReport.js [seeds]
//
// Cups 11–20 in Chapters 2 and 3, under Keep the Kettle On (Heat 10–19) and
// Fresh Brew (Heat 0–9), for three kinds of player; then Manager fights by
// appearance and skill.
import { measure } from './cupSweep.js';
import { fight } from './managerBot.js';

const seeds = Number(process.argv[2] ?? 12);
const pct = (n, digits = 0) => `${(100 * n).toFixed(digits)}%`;

console.log(`Cups (${seeds} seeds per Heat, Heat in steps of 2): share of cups that cost a cup, escapes per cup,`);
console.log('the nearest leaf\'s average and worst reach (share of the way to the rim), time with 3+ leaves, rushes per cup.\n');
for (const [name, chapter, heats] of [
  ['Chapter 2, Keep the Kettle On', 2, [10, 12, 14, 16, 18]],
  ['Chapter 2, Fresh Brew', 2, [0, 2, 4, 6, 8]],
  ['Chapter 3, Keep the Kettle On', 3, [10, 12, 14, 16, 18]],
  ['Chapter 3, Fresh Brew', 3, [0, 2, 4, 6, 8]],
]) {
  console.log(name);
  for (const [player, r] of Object.entries(measure({ chapter, heats, seeds }))) {
    console.log(`  ${player.padEnd(10)} costly ${pct(r.costly).padStart(4)}  escapes ${r.escapesPerCup.toFixed(2)}  `
      + `reach ${pct(r.reach, 1).padStart(6)}  worst ${pct(r.peak).padStart(4)}  3+ leaves ${pct(r.busy).padStart(3)}  `
      + `${r.seconds.toFixed(1)} s  rushes ${r.rushesPerCup.toFixed(2)}`);
  }
}

console.log(`\nThe Mycelium Manager (${seeds * 2} fights each): wins, average scalds, fight length, memos popped.\n`);
for (const appearance of [1, 2, 3, 4, 5]) {
  for (const skill of ['careful', 'casual', 'reckless']) {
    const rows = Array.from({ length: seeds * 2 }, (_, i) => fight({ seed: i + 1, skill, appearance }));
    const wins = rows.filter((r) => r.result === 'victory').length;
    const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
    console.log(`  appearance ${appearance} ${skill.padEnd(8)} wins ${String(wins).padStart(2)}/${rows.length}  `
      + `scalds ${avg('scalds').toFixed(2)}  ${avg('time').toFixed(1)} s  memos ${avg('memos').toFixed(1)}`);
  }
}
