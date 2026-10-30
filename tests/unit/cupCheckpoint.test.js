import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom, toSeed } from '../../src/core/random.js';
import { POT_SCHEMA_VERSION, RANDOM_STREAMS, migrateCheckpoint, validateCheckpoint } from '../../src/core/checkpoint.js';
import { GOLDEN_LEAF_SALT } from '../../src/gameplay/goldenLeaf.js';
import { readingMemory } from '../../src/gameplay/memory.js';
import { POT_KEY, createLocalProgress } from '../../src/storage/localProgress.js';
import { continueFrom, killLast, leave, spill } from '../support/legacyPlay.js';
import legacy from '../fixtures/pot-0.16.0.json' with { type: 'json' };

const V1_STREAMS = RANDOM_STREAMS.filter((id) => id !== 'goldenLeaf');
const v1 = () => structuredClone(legacy.checkpoints.critical);
const memoryStorage = (entries = {}) => {
  const data = new Map(Object.entries(entries));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
};

describe('Continue Pot: 0.16.0 saves', () => {
  it('migrates an authentic 0.16.0 checkpoint, keeping everything it held', () => {
    const original = v1();
    expect(original.schemaVersion).toBe(1);
    const before = JSON.stringify(original);
    const migrated = migrateCheckpoint(original);
    expect(JSON.stringify(original)).toBe(before); // never changed in place
    expect(migrated.schemaVersion).toBe(POT_SCHEMA_VERSION);
    expect(validateCheckpoint(migrated)).toBe(true);
    const { porcelain, goldenLeaf, goldenLeafTimer, ...kept } = migrated.state;
    expect(kept).toEqual(original.state);
    expect({ goldenLeaf, goldenLeafTimer }).toEqual({ goldenLeaf: null, goldenLeafTimer: null });
    for (const id of V1_STREAMS) expect(migrated.random[id]).toEqual(original.random[id]);
    const seed = toSeed(original.random.normal.seed) ^ GOLDEN_LEAF_SALT;
    expect(migrated.random.goldenLeaf).toEqual(createRandom(seed).exportState());
    // A critical cup: two cracks, at the documented places, never invented spills.
    expect(original.state.lives).toBe(1);
    expect(porcelain.fractures.map((f) => f.kind)).toEqual(['crack', 'crack']);
    porcelain.fractures.forEach((f, i) => expect(f.angle).toBeCloseTo(CONFIG.porcelain.migratedAngles[i], 12));
    expect(migrateCheckpoint(v1())).toEqual(migrated); // deterministic
  });

  it('restores the pending reading and upgrade without rerolling anything', () => {
    const original = v1();
    const game = createGame({ checkpoint: original });
    expect(game.state).toMatchObject({ phase: 'reading', nextFortune: original.state.nextFortune, offer: original.state.offer,
      round: original.state.round, lives: 1 });
    for (const id of V1_STREAMS) expect(game.exportRandom()[id]).toEqual(original.random[id]);
    expect(readingMemory(game.state)?.fortune).toBe(original.state.nextFortune);
    game.update(5);
    expect(game.chooseUpgrade(0)).toBe(true);
    expect(game.state.spoon[original.state.offer[0]]).toBe(original.state.spoon[original.state.offer[0]] + 1);
    expect(game.state.fortune).toBe(original.state.nextFortune);
  });

  it('keeps a pending Day choice', () => {
    const original = structuredClone(legacy.checkpoints.dayEnd);
    const game = createGame({ checkpoint: original });
    expect(game.state).toMatchObject({ dayPending: true, round: 10, porcelain: { fractures: [] } });
    game.update(5);
    if (game.state.offer) game.chooseUpgrade(0); else game.primaryAction();
    while (game.state.phase !== 'day') {
      if (game.state.phase === 'arcadeOffer') game.chooseInterlude(false);
      else game.primaryAction(), game.update(60), game.primaryAction();
    }
    expect(game.chooseDay('fresh')).toBe(true);
    expect(game.state).toMatchObject({ phase: 'playing', round: 11, heat: 0 });
  });

  it('plays on exactly as 0.16.0 did, cup by cup, every original random stream included', () => {
    for (const name of ['critical', 'dayEnd']) {
      const { readings } = continueFrom(createGame, legacy.checkpoints[name], legacy.continuations[name].length, V1_STREAMS);
      expect(readings).toEqual(legacy.continuations[name]);
    }
  });

  it('saves again under the new schema, and the new save resumes identically', () => {
    const migrated = createGame({ checkpoint: v1() });
    for (let i = 0; i < 2; i++) { leave(migrated); killLast(migrated); }
    const saved = JSON.parse(JSON.stringify(migrated.exportCheckpoint()));
    expect(saved.schemaVersion).toBe(2);
    expect(validateCheckpoint(saved)).toBe(true);
    const resumed = createGame({ checkpoint: saved });
    for (let i = 0; i < 4; i++) {
      for (const game of [migrated, resumed]) { leave(game); killLast(game); }
      expect(JSON.stringify(resumed.state)).toBe(JSON.stringify(migrated.state));
      expect(resumed.exportRandom()).toEqual(migrated.exportRandom());
    }
  });

  it('keeps the stored 0.16.0 save until the migrated pot saves over it', () => {
    const raw = JSON.stringify(v1());
    const storage = memoryStorage({ [POT_KEY]: raw });
    const progress = createLocalProgress(storage);
    expect(progress.pot.schemaVersion).toBe(2);
    expect(progress.status.pot).toBe('');
    expect(storage.data.get(POT_KEY)).toBe(raw);
    const game = createGame({ checkpoint: progress.pot });
    leave(game); killLast(game);
    expect(progress.saveCheckpoint(game.exportCheckpoint())).toBe(true);
    expect(JSON.parse(storage.data.get(POT_KEY)).schemaVersion).toBe(2);
  });

  it('refuses a damaged 0.16.0 save without deleting it', () => {
    const broken = v1();
    broken.random.tea.state = -1;
    const raw = JSON.stringify(broken);
    const storage = memoryStorage({ [POT_KEY]: raw });
    const progress = createLocalProgress(storage);
    expect(progress.pot).toBeNull();
    expect(progress.status.pot).toContain('could not be resumed');
    expect(storage.data.get(POT_KEY)).toBe(raw);
    for (const change of [
      (c) => { c.state.porcelain = { serial: 0, fractures: [] }; }, // already has new fields
      (c) => { c.random.goldenLeaf = c.random.normal; },
      (c) => { delete c.random.boss; },
      (c) => { c.schemaVersion = 0; },
      (c) => { c.state.lives = 0; },
    ]) {
      const c = v1();
      change(c);
      expect(migrateCheckpoint(c)).toBeNull();
      expect(() => createGame({ checkpoint: c })).toThrow();
    }
  });
});

describe('schema 2 checkpoints', () => {
  function crackedCheckpoint() {
    const game = createGame({ seed: 31 });
    game.primaryAction();
    spill(game, 4);
    killLast(game);
    return game.exportCheckpoint();
  }

  it('save and restore the cracks, seams and Golden Leaf stream', () => {
    const game = createGame({ seed: 32 });
    game.primaryAction();
    spill(game, 4);
    spill(game, 10);
    game.state.goldenLeafTimer = 0.001;
    game.update(1 / 60);
    const s = game.state;
    s.angle = s.goldenLeaf.home; s.shotCooldown = 0; game.fireSteam();
    for (let i = 0; i < 90 && s.goldenLeaf; i++) game.update(1 / 60);
    killLast(game);
    const saved = game.exportCheckpoint();
    expect(saved.state.porcelain.fractures.map((f) => f.kind)).toEqual(['crack', 'seam']);
    const restored = createGame({ checkpoint: JSON.parse(JSON.stringify(saved)) });
    expect(restored.state.porcelain).toEqual(s.porcelain);
    expect(restored.exportRandom().goldenLeaf).toEqual(game.exportRandom().goldenLeaf);
  });

  it('reject malformed or inconsistent damage records', () => {
    const good = crackedCheckpoint();
    expect(validateCheckpoint(good)).toBe(true);
    const bad = [
      (c) => { c.state.porcelain.fractures = []; }, // a cracked cup must show its crack
      (c) => { c.state.porcelain.fractures[0].kind = 'seam'; },
      (c) => { c.state.porcelain.fractures.push({ ...c.state.porcelain.fractures[0] }); },
      (c) => { c.state.porcelain.fractures[0].kind = 'shard'; },
      (c) => { c.state.porcelain.fractures[0].angle = 7; },
      (c) => { c.state.porcelain.fractures[0].angle = Number.NaN; },
      (c) => { c.state.porcelain.fractures[0].seed = 2 ** 32; },
      (c) => { c.state.porcelain.fractures[0].id = 5; },
      (c) => { c.state.porcelain.fractures[0].extra = true; },
      (c) => { c.state.porcelain.serial = 0; },
      (c) => { c.state.porcelain.fractures = Array.from({ length: 15 }, (_, id) => ({ id, kind: id ? 'chip' : 'crack', angle: 1, seed: 1 }));
        c.state.porcelain.serial = 15; },
      (c) => { c.state.goldenLeaf = { angle: 1, radius: 100 }; },
      (c) => { c.state.goldenLeafTimer = 3; },
      (c) => { delete c.random.goldenLeaf; },
      (c) => { c.schemaVersion = 3; },
    ];
    for (const change of bad) {
      const c = structuredClone(good);
      change(c);
      expect(validateCheckpoint(c)).toBe(false);
      expect(migrateCheckpoint(c)).toBeNull();
    }
  });
});
