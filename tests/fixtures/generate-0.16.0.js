// Regenerates pot-0.16.0.json from the v0.16.0 release, so the fixture is an
// authentic 0.16.0 save rather than a hand-written imitation:
//   git worktree add ../sit-v0.16.0 v0.16.0
//   node tests/fixtures/generate-0.16.0.js ../sit-v0.16.0 tests/fixtures/pot-0.16.0.json
// The game comes from the release; the scripted play (tests/support/legacyPlay.js)
// only calls public game methods, so it is shared with the tests.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { continueFrom, killLast, leave, signature, spill } from '../support/legacyPlay.js';

const [root, out] = process.argv.slice(2);
const { createGame } = await import(pathToFileURL(`${root}/src/core/game.js`).href);
const result = { version: '0.16.0', checkpoints: {}, continuations: {}, readings: {} };

// A critical cup (two genuine spills) with an upgrade pending at the round 3 reading.
{
  const game = createGame({ seed: 4242 });
  game.primaryAction();
  killLast(game); leave(game);
  killLast(game); leave(game);
  spill(game, 3); spill(game, 11);
  killLast(game);
  const checkpoint = game.exportCheckpoint();
  if (!checkpoint?.state.offer || checkpoint.state.lives !== 1) throw new Error('unexpected critical checkpoint');
  result.checkpoints.critical = checkpoint;
  result.continuations.critical = continueFrom(createGame, checkpoint, 8).readings;
}
// A healthy cup at the end of Day 1, with the day's choice pending.
{
  const game = createGame({ seed: 77 });
  game.primaryAction();
  for (let round = 1; round <= 10; round++) {
    killLast(game);
    if (round < 10) leave(game);
  }
  const checkpoint = game.exportCheckpoint();
  if (!checkpoint?.state.dayPending) throw new Error('unexpected day checkpoint');
  result.checkpoints.dayEnd = checkpoint;
  result.continuations.dayEnd = continueFrom(createGame, checkpoint, 6).readings;
}
// Untouched seeded pots, reading by reading: fortune selection must never drift.
for (const seed of [1, 2, 3, 42, 99]) {
  const game = createGame({ seed });
  game.primaryAction();
  const readings = [];
  for (let round = 1; round <= 30; round++) {
    killLast(game);
    readings.push(signature(game));
    leave(game);
  }
  result.readings[seed] = readings;
}
writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
console.log('wrote', out);
