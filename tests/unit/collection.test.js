import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createSessions } from '../../src/core/sessions.js';
import { ARCADE_IDS, createLocalProgress, POT_KEY, RECORDS_KEY } from '../../src/storage/localProgress.js';
import { checkpointAfter, finishNormal } from '../support/checkpoints.js';

function setup() {
  const entries = new Map();
  const storage = { getItem: (k) => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v), removeItem: (k) => entries.delete(k) };
  const progress = createLocalProgress(storage);
  const main = checkpointAfter(9).game;
  progress.saveCheckpoint(main.exportCheckpoint());
  let seed = 42;
  const sessions = createSessions(main, progress, { nextSeed: () => seed++ });
  return { sessions, progress, main, storage };
}
function advance(game, seconds) { for (let i = 0; i < seconds * 60; i++) game.update(1 / 60); }

describe('the independent Arcade Collection', () => {
  it.each(ARCADE_IDS)('launches %s immediately, from a completely unplayed pot', (id) => {
    const main = createGame({ seed: 42 }), sessions = createSessions(main, createLocalProgress(null));
    sessions.open(); expect(sessions.launch(id, 123)).toBe(true);
    expect(sessions.practice).not.toBe(main); expect(sessions.game.practice).toBe(id);
    expect(sessions.game.practiceMission().stage).toBe('intro');
    expect(main.state.phase).toBe('ready'); expect(main.state.round).toBe(1);
  });
  it.each(ARCADE_IDS)('settles %s failure/timeout once without changing any main-pot state, RNG or checkpoint', (id) => {
    const { sessions, main, storage, progress } = setup();
    const before = structuredClone(main.state), rng = main.exportRandom(), saved = storage.getItem(POT_KEY);
    sessions.open(); sessions.launch(id, 42); sessions.game.primaryAction();
    advance(sessions.game, 100);
    expect(sessions.game.practiceMission().summary).toBeTruthy();
    sessions.settle(); sessions.settle();
    expect(progress.records.games[id].plays).toBe(1);
    expect(progress.records.games[id].wins).toBe(0);
    expect(storage.getItem(RECORDS_KEY)).not.toBeNull();
    for (let i = 0; i < 5; i++) sessions.game.primaryAction();
    expect(sessions.game.practice).toBe(id);
    expect(main.state).toEqual(before); expect(main.exportRandom()).toEqual(rng);
    expect(storage.getItem(POT_KEY)).toBe(saved);
    sessions.back(); expect(sessions.game.state).toBe(main.state);
    expect(sessions.game.state).toEqual(before);
  });
  it('a successful Tea Run restocks and awards currency only in the practice instance', () => {
    const { sessions, main } = setup(); const before = structuredClone(main.state), rng = main.exportRandom();
    sessions.launch('teaRun', 42); sessions.game.primaryAction();
    const run = sessions.game.state.run;
    // Last clear step to the shop, through the unmodified settlement code.
    run.obstacles = []; run.pickups = []; run.distance = run.finish - 1; run.coins = 3;
    advance(sessions.game, 4);
    expect(run.summary.result).toBe('success');
    expect(sessions.practice.state.teaCash).toBeGreaterThan(0); expect(sessions.practice.state.extraSugar).toBeGreaterThan(0);
    expect(main.state.teaCash).toBe(before.teaCash); expect(main.state.extraSugar).toBe(before.extraSugar);
    expect(main.state).toEqual(before); expect(main.exportRandom()).toEqual(rng);
  });
  it.each(['dailyPour', 'biscuitBreakout', 'crossingStreet'])('awardInterlude settles a successful %s only on its disposable state', (id) => {
    const { sessions, main, progress } = setup(); const before = structuredClone(main.state), rng = main.exportRandom();
    sessions.launch(id, 42); sessions.game.primaryAction();
    const m = sessions.game.practiceMission();
    if (id === 'dailyPour') m.delivered = m.scheduled;
    else if (id === 'biscuitBreakout') { m.broken = m.total; m.biscuits.forEach((b) => { b.alive = false; }); }
    else {
      m.lanes.forEach((l) => { l.vehicles = []; });
      m.spoon.row = 6; sessions.game.hop('up');
    }
    advance(sessions.game, 50); sessions.settle();
    expect(m.summary.success).toBe(true); expect(m.summary.perfect).toBe(true);
    expect(progress.records.games[id]).toMatchObject({ plays: 1, wins: 1, perfects: 1 });
    expect(sessions.practice.state.score).toBeGreaterThan(0); expect(sessions.practice.state.teaCash).toBeGreaterThan(0);
    expect(main.state).toEqual(before); expect(main.exportRandom()).toEqual(rng);
  });
  it.each(ARCADE_IDS)('retries %s with the same seed, and plays again with a new seed, retaining fresh state', (id) => {
    const { sessions, progress } = setup();
    sessions.launch(id, 42); const initial = structuredClone(sessions.game.state);
    sessions.game.primaryAction(); advance(sessions.game, 10);
    sessions.replay(true); expect(sessions.game.seed).toBe(42); expect(sessions.game.state).toEqual(initial);
    sessions.replay(false); expect(sessions.game.seed).not.toBe(42); expect(sessions.game.state).not.toEqual(initial);
    expect(progress.records.games[id].plays).toBe(0);
    sessions.open(); expect(sessions.practice).toBeNull(); expect(sessions.collection).toBe(true);
    sessions.back(); expect(sessions.collection).toBe(false);
  });
  it('retained input command functions always dispatch to the current session', () => {
    const { sessions } = setup(); const action = sessions.game.primaryAction;
    sessions.launch('dailyPour', 42); action(); expect(sessions.game.state.dailyPour.stage).toBe('play');
    sessions.launch('teaRun', 42); action(); expect(sessions.game.state.run.stage).toBe('run');
  });
  it('preserves the existing browser harness clock override without losing its original step', () => {
    const { sessions } = setup();
    sessions.launch('dailyPour', 42); sessions.game.primaryAction();
    const advance = sessions.game.update;
    sessions.game.update = () => {};
    sessions.game.update(2); expect(sessions.game.practiceMission().clock).toBe(0);
    advance(2); expect(sessions.game.practiceMission().clock).toBeGreaterThan(1.9);
  });
  it('can pause and resume a settled practice result without dismissing or settling it twice', () => {
    const { sessions, progress } = setup(); sessions.launch('dailyPour', 42);
    sessions.game.primaryAction(); advance(sessions.game, 40); sessions.settle();
    sessions.game.togglePause(); expect(sessions.game.state.phase).toBe('paused');
    sessions.game.togglePause(); expect(sessions.game.state.phase).toBe('dailyPour');
    expect(sessions.game.practiceMission().stage).toBe('outro');
    sessions.settle(); expect(progress.records.games.dailyPour.plays).toBe(1);
  });
  it('requires confirmation before replacing a saved pot, retains arcade records, and clears on game over', () => {
    const { sessions, progress, storage } = setup(), saved = storage.getItem(POT_KEY);
    const main = sessions.main;
    expect(sessions.newPot()).toBe(false); expect(storage.getItem(POT_KEY)).toBe(saved); expect(sessions.main).toBe(main);
    expect(sessions.newPot(true)).toBe(true); expect(progress.pot).toBeNull();
    finishNormal(sessions.game);
    for (const event of sessions.game.drainEvents()) sessions.handle(event);
    expect(progress.pot.state.round).toBe(1);
    const records = storage.getItem(RECORDS_KEY);
    sessions.handle({ type: 'gameover' }); expect(progress.pot).toBeNull(); expect(storage.getItem(RECORDS_KEY)).toBe(records);
  });
  it('practice cannot save or clear a main checkpoint, and Continue restores a real game instance', () => {
    const { sessions, progress, storage } = setup(), saved = storage.getItem(POT_KEY);
    sessions.launch('teaRun'); sessions.handle({ type: 'gameover' });
    sessions.handle({ type: 'checkpoint', checkpoint: checkpointAfter(1).checkpoint });
    expect(storage.getItem(POT_KEY)).toBe(saved);
    const checkpoint = progress.pot; sessions.back(); expect(sessions.continuePot()).toBe(true);
    expect(sessions.main.state).toEqual(checkpoint.state); expect(sessions.main.exportRandom()).toEqual(checkpoint.random);
  });
});
