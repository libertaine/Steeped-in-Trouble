// Regenerates pot-0.22.0.json from the v0.22.0 release (a5e74ba), so the
// fixture holds authentic schema 5 saves rather than downgraded 0.23.0 ones:
//   git worktree add ../sit-v0.22.0 v0.22.0
//   node tests/fixtures/generate-0.22.0.js ../sit-v0.22.0 tests/fixtures/pot-0.22.0.json
// (Any v0.22.0 tree with src/ and tests/ works, e.g. `git archive v0.22.0 src tests`.)
// Everything that plays comes from the release: its game, and its own copy of
// the scripted play (tests/support/legacyPlay.js), which only calls public
// game methods. Each pot is recorded twice from the same seed and inputs,
// once with Auto Steam on and once off: 0.23.0 migrates the first to Chill and
// the second to Arcade. Continuations record the readings 0.22.0 itself went
// on to brew, so restored random streams can be checked cup by cup.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [root, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${root}/${path}`).href);
const { createGame } = await load('src/core/game.js');
const { POT_SCHEMA_VERSION } = await load('src/core/checkpoint.js');
const { continueFrom, killLast, leave, spill } = await load('tests/support/legacyPlay.js');
if (POT_SCHEMA_VERSION !== 5) throw new Error(`expected a schema 5 release, found ${POT_SCHEMA_VERSION}`);

const result = { version: '0.22.0', commit: 'a5e74bab4e777d3812ad4cefd158e861f518c386', checkpoints: {}, continuations: {} };

function record(name, checkpoint, check) {
  if (!checkpoint || checkpoint.schemaVersion !== 5 || !check(checkpoint.state)) throw new Error(`unexpected ${name} checkpoint`);
  result.checkpoints[name] = checkpoint;
  result.continuations[name] = continueFrom(createGame, checkpoint, 4).readings;
}

for (const autoSteam of [true, false]) {
  const suffix = autoSteam ? 'Auto' : 'Manual';
  // Early: the round 2 reading, holding three sugar bursts from a bonus-sugar
  // cup (more than 0.23.0's capacity of 2), with one milk poured.
  {
    const game = createGame({ seed: 77 });
    game.setAutoSteam(autoSteam);
    game.primaryAction();
    killLast(game); leave(game);
    game.pourMilk();
    killLast(game);
    record(`early${suffix}`, game.exportCheckpoint(), (s) => s.round === 2 && s.autoSteam === autoSteam
      && s.sugarLeft === 3 && s.milkLeft === 1);
  }
  // Chapter 2: past the milestone Daily Grind (beaten), with upgrades, Tea
  // Cash, a genuine spill (a real chip in the porcelain) and the reading after
  // round 8, holding four sugar bursts with one Sugar Scoop (over 0.23.0's 3).
  {
    const game = createGame({ seed: 2222 });
    game.setAutoSteam(autoSteam);
    game.primaryAction();
    for (let round = 1; round < 8; round++) {
      killLast(game);
      leave(game);
      if (round === 6) spill(game, 5);
    }
    game.pourMilk();
    killLast(game);
    record(`chapter2${suffix}`, game.exportCheckpoint(), (s) => s.round === 8 && s.autoSteam === autoSteam
      && s.progress.chapter === 2 && s.porcelain.fractures.length > 0 && s.teaCash > 0
      && s.spoon.sugarScoop === 1 && s.sugarLeft === 4 && s.milkLeft === 1);
  }
}

writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
console.log('wrote', out);
