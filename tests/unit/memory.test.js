import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { FORTUNES, fortuneWeights, selectFortune } from '../../src/gameplay/fortunes.js';
import { fortuneRecord, readingMemory, rememberRound } from '../../src/gameplay/memory.js';
import { teaFortuneNudges } from '../../src/gameplay/teas.js';
import { hudText } from '../../src/ui/hud.js';
import { completeRound, playingGame } from './helpers.js';
import { killLast, leave, signature } from '../support/legacyPlay.js';
import legacy from '../fixtures/pot-0.16.0.json' with { type: 'json' };

const lanesEach = (lanes, perLane = 1) => lanes.flatMap((lane) => new Array(perLane).fill(lane));
const quiet = [0, 4, 8]; // no cluster, few lanes: The Star's fallback reading
const scattered = lanesEach([0, 2, 4, 6, 8, 10, 12, 14, 1, 9, 5]); // 11 lanes
const clustered = [...lanesEach([3, 4, 5], 3), 10, 12]; // 9 of 11 in three lanes
const record = (r = {}) => ({ milkKills: 0, milkUses: 0, sugarUses: 0, escapes: 0, nearMisses: 0, leafLanes: quiet, nudges: {}, ...r });
const ids = (memory) => memory.observations.map((o) => o.id);

describe('what the cup remembers', () => {
  it('names a strong milk round and its Veil pattern, without repeating the milk', () => {
    const m = rememberRound(record({ milkKills: 4, milkUses: 2, leafLanes: scattered }), 'veil');
    expect(m.observations[0]).toMatchObject({ id: 'veilPattern', fact: 'Milk helped defeat 4 leaves.',
      influence: 'Milk-soaked leaves formed a strong Veil pattern.' });
    expect(ids(m)).not.toContain('milk');
    expect(m).toMatchObject({ agreed: true, name: 'The Veil', effect: 'Milk clouds last 2.5 seconds longer.',
      remark: 'The leaves recommend staying suspiciously cloudy.' });
  });

  it('notices heavy milk use even without the pattern', () => {
    const m = rememberRound(record({ milkUses: 2, milkKills: 1 }), 'veil');
    expect(m.observations[0]).toMatchObject({ id: 'milk', fact: 'You poured milk twice.',
      influence: 'Your defensive tactics favored The Veil.' });
  });

  it('says plainly when the leaves picked another fortune', () => {
    // A spill too, so nothing remembered favoured The Star.
    const m = rememberRound(record({ milkKills: 4, milkUses: 2, escapes: 1 }), 'star');
    expect(m.observations[0].influence).toBe('Milk-soaked leaves formed a strong Veil pattern.');
    expect(m.favored).not.toContain('star');
    expect(m).toMatchObject({ agreed: false, name: 'The Star', effect: 'Steam travels 35% faster.',
      remark: 'The leaves considered your suggestion. Briefly.' });
  });

  it('notices a sweet tooth', () => {
    const m = rememberRound(record({ sugarUses: 3 }), 'sugarRush');
    expect(m.observations[0]).toMatchObject({ id: 'sugar', fact: 'You fired 3 sugar bursts.',
      influence: 'Sugar Rush became more likely.' });
    expect(m.agreed).toBe(true);
  });

  it('reads concentrated and scattered residue', () => {
    expect(rememberRound(record({ leafLanes: clustered }), 'crown').observations[0]).toMatchObject({
      id: 'crownPattern', fact: '9 of 11 leaves settled close together.', influence: 'The concentrated pattern favored The Crown.' });
    expect(rememberRound(record({ leafLanes: scattered }), 'spiral').observations[0]).toMatchObject({
      id: 'spiralPattern', fact: 'Leaves settled across 11 of 16 lanes.', influence: 'The scattered pattern favored The Spiral.' });
  });

  it('credits a clean cup beside a stronger memory', () => {
    const m = rememberRound(record({ leafLanes: scattered }), 'doubleTrouble');
    expect(ids(m)).toEqual(['spiralPattern', 'clean']);
    expect(m.observations[1].influence).toBe('A clean cup favored several kindly fortunes.');
    expect(m.agreed).toBe(true);
  });

  it('blames spills, and narrow escapes, on Tempestuous Tea', () => {
    const spilled = rememberRound(record({ escapes: 2, nearMisses: 1 }), 'tempest');
    expect(spilled.observations).toEqual([
      expect.objectContaining({ id: 'spills', fact: '2 leaves spilled over the rim.', influence: 'Spills increased the likelihood of Tempestuous Tea.' }),
      expect.objectContaining({ id: 'nearMisses', fact: '1 narrow escape at the rim.',
        influence: 'Narrow escapes also nudged the reading toward Tempestuous Tea.' }),
    ]);
    const close = rememberRound(record({ nearMisses: 3 }), 'golden');
    expect(close.observations[0]).toMatchObject({ id: 'nearMisses',
      influence: 'Narrow escapes nudged the reading toward Tempestuous Tea.' });
    expect(ids(close)).toEqual(['nearMisses', 'clean']);
    expect(close.agreed).toBe(true); // the clean cup favoured Golden Opportunity too
  });

  it('offers one neutral line, not an invented cause, after an uneventful cup', () => {
    const m = rememberRound(record(), 'sugarRush');
    expect(m.neutral).toBe(true);
    expect(m.observations).toHaveLength(1);
    expect(m.observations[0].fact).toBe('A tidy cup: nothing spilled, and no strong pattern formed.');
    expect(m.remark).toBe('The leaves had ideas of their own.');
    expect(selectFortune(record())).toBe('star'); // which is why the neutral line mentions The Star
  });

  it('shows at most two memories, strongest first, and gives a slot to each secret shown', () => {
    const busy = record({ escapes: 1, nearMisses: 2, sugarUses: 2, milkUses: 2, leafLanes: clustered, nudges: { lie: 1 } });
    expect(ids(rememberRound(busy, 'tempest'))).toEqual(['crownPattern', 'spills']);
    expect(ids(rememberRound(busy, 'tempest', { secrets: 1 }))).toEqual(['crownPattern']);
    expect(ids(rememberRound(busy, 'tempest', { secrets: 2 }))).toEqual(['crownPattern']);
  });

  it('mentions Herbal Tea and The Leaves Lie only as a supporting memory', () => {
    const herbal = rememberRound(record({ sugarUses: 2, nudges: teaFortuneNudges('herbal') }), 'lie');
    expect(ids(herbal)).toEqual(['sugar', 'clean']);
    const spilled = rememberRound(record({ escapes: 1, nudges: teaFortuneNudges('herbal') }), 'lie');
    expect(ids(spilled)).toEqual(['spills', 'herbal']);
    expect(spilled).toMatchObject({ agreed: true, effect: FORTUNES.lie.effect });
  });

  it('never claims the round summoned Karma', () => {
    const m = rememberRound(record({ leafLanes: scattered }), 'karma');
    expect(m.favored).not.toContain('karma');
    expect(m.remark).toBe('Karma arrives when it pleases.');
  });

  it('only names influences that really move the weights', () => {
    const rng = createRandom(31);
    for (let i = 0; i < 400; i++) {
      const r = record({
        milkKills: rng.int(5), milkUses: rng.int(3), sugarUses: rng.int(4), escapes: rng.int(3), nearMisses: rng.int(4),
        leafLanes: Array.from({ length: 4 + rng.int(20) }, () => rng.int(rng.next() < 0.5 ? 16 : 3)),
        nudges: rng.next() < 0.3 ? teaFortuneNudges('herbal') : {},
      });
      const weights = fortuneWeights(r);
      const without = (change) => fortuneWeights({ ...r, ...change });
      for (const o of rememberRound(r, 'star').observations) {
        if (o.id.endsWith('Pattern')) expect(selectFortune(r)).toBe(o.favors[0]);
        const lower = { milk: { milkUses: 0 }, sugar: { sugarUses: 0 }, spills: { escapes: 0 }, nearMisses: { nearMisses: 0 },
          clean: { escapes: 1 }, herbal: { nudges: {} } }[o.id];
        if (lower) for (const id of o.favors) expect(weights[id]).toBeGreaterThan(without(lower)[id]);
        if (o.id === 'neutral') expect(selectFortune(r)).toBe('star');
      }
    }
  });
});

describe('the reading explains itself without changing the draw', () => {
  it('draws from exactly the record the 0.16.0 reading used', () => {
    const game = playingGame({ seed: 5 });
    completeRound(game);
    const { milkKills, milkUses, sugarUses, escapes, nearMisses } = game.state.roundStats;
    expect(fortuneRecord(game.state)).toEqual({ milkKills, milkUses, sugarUses, escapes, nearMisses,
      leafLanes: game.state.residue.map((leaf) => leaf.lane), nudges: teaFortuneNudges(game.state.tea) });
  });

  it('draws no random numbers and changes no state', () => {
    const game = playingGame({ seed: 8 });
    completeRound(game);
    const before = JSON.stringify({ state: game.state, random: game.exportRandom() });
    for (let i = 0; i < 50; i++) {
      readingMemory(game.state);
      hudText(game.state);
    }
    expect(JSON.stringify({ state: game.state, random: game.exportRandom() })).toBe(before);
  });

  it('keeps every 0.16.0 reading, round by round, for untouched seeded pots', () => {
    // Recorded by tests/fixtures/generate-0.16.0.js against the v0.16.0 release.
    for (const [seed, readings] of Object.entries(legacy.readings)) {
      const game = createGame({ seed: Number(seed) });
      game.primaryAction();
      for (const expected of readings) {
        killLast(game);
        expect(signature(game, Object.keys(expected.random))).toEqual(expected);
        leave(game);
      }
    }
  });

  it('explains a restored reading exactly as before it was saved', () => {
    const game = playingGame({ seed: 12 });
    game.state.spawnTimer = 1e6; // checkpoints refuse the test-only Infinity
    game.state.roundStats.milkUses = 2;
    completeRound(game);
    const restored = createGame({ checkpoint: game.exportCheckpoint() });
    expect(readingMemory(restored.state)).toEqual(readingMemory(game.state));
    expect(restored.state.nextFortune).toBe(game.state.nextFortune);
  });

  it('shows the memory in the panel, and keeps The Leaves Lie’s secret until it confesses', () => {
    const game = playingGame({ seed: 3 });
    completeRound(game);
    Object.assign(game.state, { nextFortune: 'lie', readingTime: 2.5 });
    let text = hudText(game.state);
    expect(text.readingMemory).toContain('No leaves spilled.');
    expect(text.compactFortune).toBe('Next cup: Something Wonderful');
    expect(text.compactEffect).toBe('');
    game.state.readingTime = 4;
    text = hudText(game.state);
    expect(text.compactEffect).toBe(FORTUNES.lie.effect);
    game.state.offer = null;
    game.primaryAction();
    expect(hudText(game.state)).toMatchObject({ readingMemory: '', compactMemory: '', compactEffect: '' });
  });
});
