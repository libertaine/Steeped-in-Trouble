// Schema 3 (Mushroom Tea): authentic 0.18.0 saves migrate without losing or
// rerolling anything, and 0.18.0's seeded pots play out exactly as they did.
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { POT_SCHEMA_VERSION, RANDOM_STREAMS, migrateCheckpoint, validateCheckpoint } from '../../src/core/checkpoint.js';
import { POT_KEY, createLocalProgress } from '../../src/storage/localProgress.js';
import { continueFrom, killLast, leave, signature, undefended } from '../support/legacyPlay.js';
import release from '../fixtures/pot-0.18.0.json' with { type: 'json' };
import oldest from '../fixtures/pot-0.16.0.json' with { type: 'json' };

const v2 = (name = 'critical') => structuredClone(release.checkpoints[name]);
const memoryStorage = (entries = {}) => {
  const data = new Map(Object.entries(entries));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
};

describe('Continue Pot: 0.18.0 saves', () => {
  it('migrates an authentic 0.18.0 checkpoint, adding only the empty spores and the neutral puffball chance', () => {
    for (const name of ['critical', 'dayEnd']) {
      const original = v2(name);
      expect(original.schemaVersion).toBe(2);
      expect(validateCheckpoint(original)).toBe(false); // the current schema only, as ever
      const before = JSON.stringify(original);
      const migrated = migrateCheckpoint(original);
      expect(JSON.stringify(original)).toBe(before); // never changed in place
      expect(migrated.schemaVersion).toBe(POT_SCHEMA_VERSION);
      expect(validateCheckpoint(migrated)).toBe(true);
      const { spores, modifiers, ...kept } = migrated.state;
      const { modifiers: heldModifiers, ...held } = original.state;
      expect(kept).toEqual(held);
      expect(spores).toEqual([]);
      expect(modifiers).toEqual({ ...heldModifiers, puffballChance: 0 });
      for (const id of RANDOM_STREAMS) expect(migrated.random[id]).toEqual(original.random[id]);
      expect(migrated.pinnedTea).toBe(original.pinnedTea);
      expect(migrateCheckpoint(v2(name))).toEqual(migrated); // deterministic
    }
  });

  it('keeps the cracks, the pending upgrade and the Day choice it held', () => {
    const critical = createGame({ checkpoint: v2('critical') });
    expect(critical.state).toMatchObject({ phase: 'reading', lives: 1, offer: release.checkpoints.critical.state.offer });
    expect(critical.state.porcelain).toEqual(release.checkpoints.critical.state.porcelain);
    const day = createGame({ checkpoint: v2('dayEnd') });
    expect(day.state).toMatchObject({ dayPending: true, round: 10 });
  });

  it('continues reading for reading as 0.18.0 did', () => {
    for (const name of ['critical', 'dayEnd']) {
      const { readings } = continueFrom(createGame, release.checkpoints[name], release.continuations[name].length);
      expect(readings).toEqual(release.continuations[name]);
    }
  });

  it('loads a stored 0.18.0 save without rewriting it, then saves again under schema 3', () => {
    const raw = JSON.stringify(release.checkpoints.critical);
    const storage = memoryStorage({ [POT_KEY]: raw });
    const progress = createLocalProgress(storage);
    expect(progress.pot.schemaVersion).toBe(POT_SCHEMA_VERSION);
    expect(storage.data.get(POT_KEY)).toBe(raw);
    const game = createGame({ checkpoint: progress.pot });
    leave(game); killLast(game);
    const saved = JSON.parse(JSON.stringify(game.exportCheckpoint()));
    expect(saved.schemaVersion).toBe(POT_SCHEMA_VERSION);
    expect(validateCheckpoint(saved)).toBe(true);
    expect(createGame({ checkpoint: saved }).exportCheckpoint()).toEqual(saved);
  });

  it('still migrates the oldest saves, through schema 2, to schema 3', () => {
    const migrated = migrateCheckpoint(structuredClone(oldest.checkpoints.critical));
    expect(migrated?.schemaVersion).toBe(POT_SCHEMA_VERSION);
    expect(migrated.state.spores).toEqual([]);
    expect(migrated.state.modifiers.puffballChance).toBe(0);
  });

  it('rejects schema 2 saves that are malformed, and schema 3 saves with live spores', () => {
    const bad = [
      (c) => { c.state.spores = []; }, // a schema 2 save never had them
      (c) => { c.state.modifiers.puffballChance = 0; },
      (c) => { delete c.state.porcelain; },
      (c) => { delete c.random.goldenLeaf; },
      (c) => { c.state.lives = 'three'; },
    ];
    for (const change of bad) {
      const c = v2();
      change(c);
      expect(migrateCheckpoint(c)).toBeNull();
    }
    const live = migrateCheckpoint(v2());
    live.state.spores = [{ angle: 0, radius: 100, time: 1, duration: 2.5 }];
    expect(validateCheckpoint(live)).toBe(false);
    const odd = migrateCheckpoint(v2());
    odd.state.modifiers.puffballChance = -1;
    expect(validateCheckpoint(odd)).toBe(false);
  });
});

describe('0.18.0 seeded pots', () => {
  it('play out reading for reading as they did in 0.18.0', () => {
    for (const [seed, readings] of Object.entries(release.readings)) {
      const game = createGame({ seed: Number(seed) });
      game.primaryAction();
      const now = [];
      for (let round = 1; round <= readings.length; round++) {
        killLast(game);
        now.push(signature(game, Object.keys(readings[0].random)));
        leave(game);
      }
      expect(now).toEqual(readings);
    }
  });

  it('move every undefended leaf exactly as they did in 0.18.0', () => {
    for (const [seed, recorded] of Object.entries(release.undefended)) {
      const game = createGame({ seed: Number(seed) });
      game.primaryAction();
      expect(undefended(game)).toEqual(recorded);
    }
  });
});
