import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/game.js';
import { createSessions } from '../../src/core/sessions.js';
import { recordEligible } from '../../src/core/recordEligibility.js';
import { prepareDayPractice } from '../../src/dev/days.js';
import { prepareCup, seedLegacyPot } from '../../src/dev/cup.js';
import { prepareManager, prepareProgression } from '../../src/dev/manager.js';
import { prepareCrossingPractice } from '../../src/dev/crossing.js';
import { prepareCheckpoint, prepareRecord } from '../../src/dev/collection.js';
import { createLocalProgress } from '../../src/storage/localProgress.js';
import { checkpointAfter, leaveReading } from '../support/checkpoints.js';
import { simulateDays } from '../support/daySimulation.js';
function fakeStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { entries, getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
}

describe('Arcade always keeps the kettle on', () => {
  it('advances all six Days automatically with the existing Heat ceilings and no Fresh Brew', () => {
    const { rows, game } = simulateDays(['fresh'], 60, 'arcade');
    rows.forEach((row, i) => expect(row.heat).toBe(Math.min(28, i)));
    expect(game.state).toMatchObject({ round: 61, heat: 28, dayPending: false, phase: 'playing' });
    const events = game.drainEvents();
    expect(events.filter((e) => e.type === 'dayStart')).toEqual(Array.from({ length: 6 }, (_, i) => ({
      type: 'dayStart', choice: 'keep', mode: 'arcade', day: i + 2, heat: Math.min(28, (i + 1) * 10),
    })));
    expect(game.chooseDay('fresh')).toBe(false);
  });

  it('rejects a direct Fresh Brew call even if a caller puts Arcade in the Day phase', () => {
    const game = createGame({ seed: 1, mode: 'arcade' });
    game.primaryAction();
    Object.assign(game.state, { phase: 'day', dayPending: true, round: 10, heat: 9 });
    const before = structuredClone(game.state);
    expect(game.chooseDay('fresh')).toBe(false);
    expect(game.state).toEqual(before);
    expect(game.chooseDay('keep')).toBe(true);
    expect(game.chooseDay('keep')).toBe(false);
    expect(game.state).toMatchObject({ round: 11, heat: 10, dayPending: false });
  });

  it.each([10, 20, 40])('restores cup %i, resolves its pending encounters, and advances exactly once', (round) => {
    const { checkpoint } = checkpointAfter(round);
    const storage = fakeStorage(), progress = createLocalProgress(storage);
    progress.saveCheckpoint(checkpoint);
    const sessions = createSessions(createGame(), progress);
    expect(sessions.continuePot()).toBe(true);
    const game = sessions.game;
    const rewards = { score: game.state.score, teaCash: game.state.teaCash, spoon: structuredClone(game.state.spoon) };
    // Skip pending adventures, but retain real milestone boss resolution.
    leaveReading(game, 'fresh', false);
    expect(game.state).toMatchObject({ round: round + 1, heat: Math.min(28, checkpoint.state.heat + 1),
      phase: 'playing', dayPending: false, fortune: checkpoint.state.nextFortune });
    const after = structuredClone(game.state);
    expect(game.chooseDay('fresh')).toBe(false);
    expect(game.chooseDay('keep')).toBe(false);
    expect(game.state).toEqual(after);
    expect(game.drainEvents().filter((e) => e.type === 'dayStart')).toHaveLength(1);
    expect(progress.pot.state.score).toBe(rewards.score);
    expect(progress.pot.state.teaCash).toBe(rewards.teaCash);
    expect(progress.pot.state.spoon).toEqual(rewards.spoon);
    expect(progress.modeRecords.modes.arcade.cups).toBe(0); // restoring/advancing does not complete another cup
  });
});

describe('injected scenarios cannot persist gameplay results', () => {
  const scenarios = [
    ...['near', 'end', 'fresh', 'keep', 'max'].map((id) => [`day=${id}`, (g) => prepareDayPractice(g, id)]),
    ...['healthy', 'cracked', 'critical', 'leaf', 'repair', 'seams', 'shatter'].map((id) => [`cup=${id}`, (g) => prepareCup(g, id)]),
    ['manager', (g) => prepareManager(g)], ['manager progression', prepareProgression],
    ['crossing', (g) => prepareCrossingPractice(g, 42)],
  ];
  it.each(scenarios)('%s cannot record, overwrite or clear a saved pot, even after restarting', (_name, inject) => {
    const storage = fakeStorage(), progress = createLocalProgress(storage);
    const { checkpoint } = checkpointAfter(1);
    progress.saveCheckpoint(checkpoint);
    const game = createGame({ seed: 42, mode: 'arcade' });
    const sessions = createSessions(game, progress);
    expect(inject(game)).toBe(true);
    expect(recordEligible(game)).toBe(false);
    const before = [...storage.entries];
    expect(progress.recordPot(game.state, { finished: true, cupCompleted: true })).toBeNull();
    expect(progress.saveCheckpoint(checkpoint, game.state)).toBe(false);
    expect(progress.clearPot(game.state)).toBe(false);
    expect(game.exportCheckpoint()).toBeNull();
    sessions.handle({ type: 'checkpoint', checkpoint, cupCompleted: true });
    sessions.handle({ type: 'gameover' });
    game.state.phase = 'gameover'; game.restart();
    expect(progress.recordPot(game.state, { finished: true })).toBeNull();
    expect([...storage.entries]).toEqual(before);
    expect(sessions.continuePot()).toBe(true);
    expect(recordEligible(sessions.game)).toBe(true);
  });

  it('excludes checkpoint and personal-best shortcuts, while public collection play remains eligible', () => {
    const storage = fakeStorage(), progress = createLocalProgress(storage);
    const sessions = createSessions(createGame({ seed: 42 }), progress);
    prepareCheckpoint(sessions);
    expect(sessions.game.exportCheckpoint()).toBeNull();
    for (const event of sessions.game.drainEvents()) sessions.handle(event);
    expect(storage.entries.size).toBe(0);
    sessions.launch('dailyPour', 42);
    expect(recordEligible(sessions.game)).toBe(true);
    expect(prepareRecord(sessions)).toBe(true);
    expect(progress.settle(sessions.game)).toBeNull();
    expect(progress.records.games.dailyPour.plays).toBe(0);
    expect(storage.entries.size).toBe(0);
  });

  it('keeps legacy migration preview entirely in memory and suppresses its records', () => {
    const storage = fakeStorage({ unrelated: 'retained' });
    const progress = createLocalProgress(seedLegacyPot(), { eligible: false });
    const sessions = createSessions(createGame(), progress);
    expect(sessions.continuePot()).toBe(true);
    sessions.handle({ type: 'gameover' });
    expect(progress.modeRecords.modes.arcade.plays).toBe(0);
    expect([...storage.entries]).toEqual([['unrelated', 'retained']]);
  });

  it('does not exclude an ordinary game when a shortcut rejects its arguments', () => {
    const game = createGame({ seed: 42 });
    expect(prepareDayPractice(game, 'unknown')).toBe(false);
    expect(prepareCup(game, 'unknown')).toBe(false);
    expect(prepareManager(game, 0)).toBe(false);
    expect(recordEligible(game)).toBe(true);
  });

  it.each(['chill', 'arcade'])('continues normal %s cup counts, finished plays and saved-pot writes', (mode) => {
    const storage = fakeStorage(), progress = createLocalProgress(storage);
    const game = createGame({ mode, seed: 42 }), sessions = createSessions(game, progress);
    game.primaryAction();
    // An ordinary game's record eligibility does not depend on a browser/debug flag.
    expect(recordEligible(game)).toBe(true);
    const { checkpoint } = checkpointAfter(1);
    sessions.handle({ type: 'checkpoint', checkpoint, cupCompleted: true });
    sessions.handle({ type: 'gameover' });
    expect(progress.modeRecords.modes[mode]).toMatchObject({ cups: 1, plays: 1, bestRound: 1 });
    expect(progress.pot).toBeNull();
    expect(createLocalProgress(storage).modeRecords).toEqual(progress.modeRecords);
  });
});
