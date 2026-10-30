import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { ARCADE_IDS, createLocalProgress, emptyRecords, POT_KEY, RECORDS_KEY } from '../../src/storage/localProgress.js';
import { checkpointAfter } from '../support/checkpoints.js';

export function fakeStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { entries, getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v), removeItem: (k) => entries.delete(k) };
}
function finishPour(points = 3) {
  const game = createGame({ seed: 42, practice: 'dailyPour' });
  game.primaryAction();
  game.state.dailyPour.delivered = points;
  game.update(32);
  return game;
}

describe('local arcade records', () => {
  it('opens a bounded empty book without a browser', () => {
    const p = createLocalProgress(fakeStorage());
    expect(p.records).toEqual(emptyRecords()); expect(p.pot).toBeNull();
    expect(p.status).toEqual({ records: '', pot: '' });
  });
  it('saves settled results once, reloads after restart, and only improves a best', () => {
    const storage = fakeStorage(), p = createLocalProgress(storage);
    const game = finishPour(6);
    expect(p.settle(game)?.improved).toBe(true);
    for (let i = 0; i < 4; i++) { game.primaryAction(); game.update(5); expect(p.settle(game)).toBeNull(); }
    expect(p.records.games.dailyPour).toMatchObject({ plays: 1, wins: 1, perfects: 0, bestScore: 150 });
    expect(p.settle(finishPour(6))?.improved).toBe(false);
    expect(p.settle(finishPour(1))?.improved).toBe(false);
    const reload = createLocalProgress(storage);
    expect(reload.records.games.dailyPour).toMatchObject({ plays: 3, wins: 2, bestScore: 150 });
    expect(Date.parse(reload.records.games.dailyPour.lastPlayed)).toBeGreaterThan(0);
  });
  it.each(ARCADE_IDS)('does not record an opening, an unfinished %s, or the main pot', (id) => {
    const p = createLocalProgress(fakeStorage());
    expect(p.settle(createGame({ seed: 42, practice: id }))).toBeNull();
    expect(p.settle(createGame({ seed: 42 }))).toBeNull();
    expect(p.records).toEqual(emptyRecords());
  });
  it.each(['{', 'null', '{"schemaVersion":99}', '{}'])('recovers from invalid stored records: %s', (raw) => {
    const p = createLocalProgress(fakeStorage({ [RECORDS_KEY]: raw }));
    expect(p.records).toEqual(emptyRecords()); expect(p.status.records).toContain('could not be read');
    expect(p.settle(finishPour())).not.toBeNull();
  });
  it.each([
    (r) => { delete r.games.teaRun; },
    (r) => { r.games.spoonGolf = {}; },
    (r) => { r.games.teaRun.bestScore = -1; },
    (r) => { r.games.teaRun.plays = '2'; },
    (r) => { r.games.teaRun.wins = 4; },
    (r) => { r.games.dailyPour.perfects = 1; },
    (r) => { r.games.teaRun.lastPlayed = 'tomorrow'; },
  ])('rejects missing, unknown or inconsistent record fields', (change) => {
    const r = emptyRecords(); change(r);
    expect(createLocalProgress(fakeStorage({ [RECORDS_KEY]: JSON.stringify(r) })).records).toEqual(emptyRecords());
  });
  it.each(['denied', 'quota'])('keeps records in memory when writes fail: %s', (message) => {
    const storage = fakeStorage(); storage.setItem = () => { throw new Error(message); };
    const p = createLocalProgress(storage);
    expect(p.settle(finishPour())?.improved).toBe(true);
    expect(p.records.games.dailyPour.plays).toBe(1); expect(p.status.records).toContain('will not be saved');
  });
  it('handles read exceptions, unavailable storage and hostile JSON independently', () => {
    for (const storage of [null, { getItem() { throw new Error('denied'); } }]) {
      const p = createLocalProgress(storage);
      expect(p.pot).toBeNull(); expect(p.settle(finishPour())).not.toBeNull();
      expect(p.status.records).toContain('will not be saved');
    }
  });
});

describe('independent pot storage', () => {
  it('saves a checkpoint and clears only that key, retaining records and unrelated settings', () => {
    const storage = fakeStorage({ unrelated: 'keep me' }), p = createLocalProgress(storage);
    p.settle(finishPour());
    const checkpoint = checkpointAfter(1).checkpoint;
    expect(p.saveCheckpoint(checkpoint)).toBe(true);
    const reload = createLocalProgress(storage);
    expect(reload.pot).toEqual(checkpoint);
    const record = storage.getItem(RECORDS_KEY);
    expect(reload.clearPot()).toBe(true);
    expect(storage.getItem(POT_KEY)).toBeNull(); expect(reload.pot).toBeNull();
    expect(storage.getItem(RECORDS_KEY)).toBe(record); expect(storage.getItem('unrelated')).toBe('keep me');
  });
  it('rejects bad saves without affecting the arcade book', () => {
    const storage = fakeStorage(), p = createLocalProgress(storage); p.settle(finishPour());
    storage.setItem(POT_KEY, '{"schemaVersion":0}');
    const reload = createLocalProgress(storage);
    expect(reload.pot).toBeNull(); expect(reload.status.pot).toContain('could not be resumed');
    expect(reload.records).toEqual(p.records); expect(reload.saveCheckpoint({})).toBe(false);
  });
  it('reports failed writes and deletion, retaining the last usable checkpoint', () => {
    const storage = fakeStorage(), p = createLocalProgress(storage), checkpoint = checkpointAfter(1).checkpoint;
    p.saveCheckpoint(checkpoint);
    storage.setItem = storage.removeItem = () => { throw new Error('quota'); };
    expect(p.saveCheckpoint(checkpointAfter(2).checkpoint)).toBe(false);
    expect(p.clearPot()).toBe(false); expect(p.pot).toEqual(checkpoint);
    expect(p.status.pot).toContain('cannot be saved');
  });
});
