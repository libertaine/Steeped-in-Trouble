import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { POT_SCHEMA_VERSION, migrateCheckpoint, validateCheckpoint } from '../../src/core/checkpoint.js';
import { OFFER_AT, createGame, readingReadyAt, restockOpen } from '../../src/core/game.js';
import { createSessions } from '../../src/core/sessions.js';
import { laneAngle, wrapLane } from '../../src/gameplay/arena.js';
import { difficultyAt, maxHeatFor, nextHeat, withHeat } from '../../src/gameplay/days.js';
import { BASE_MODIFIERS } from '../../src/gameplay/fortunes.js';
import { milkCapacity, passiveMilkGain, sugarCapacity } from '../../src/gameplay/weapons.js';
import { hudText, restockView } from '../../src/ui/hud.js';
import { POT_KEY, createLocalProgress } from '../../src/storage/localProgress.js';
import {
  atShortage, beatGrind, beatManager, brewNext, completeRound, placeEnemy, playingGame, step,
} from './helpers.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
  };
}

describe('gameplay modes: Chill and Arcade', () => {
  it('selects and persists the chosen mode across game creation and sessions', () => {
    const chill = createGame({ seed: 7, mode: 'chill' });
    expect(chill.state.mode).toBe('chill');
    expect(hudText(chill.state).hudMode).toBe('CHILL MODE');

    const arcade = createGame({ seed: 7, mode: 'arcade' });
    expect(arcade.state.mode).toBe('arcade');
    expect(hudText(arcade.state).hudMode).toBe('ARCADE MODE');

    // Only changes mode on the title overlay before a run begins; mid-run mode switching is blocked.
    expect(chill.setMode('arcade')).toBe(true);
    expect(chill.state.mode).toBe('arcade');
    chill.primaryAction(); // now in round 1
    expect(chill.setMode('chill')).toBe(false);
    expect(chill.state.mode).toBe('arcade');
  });

  it('starts a new pot in the requested mode and preserves that mode when continuing a saved pot', () => {
    const storage = fakeStorage();
    const progress = createLocalProgress(storage);
    const sessions = createSessions(createGame({ seed: 11, mode: 'chill' }), progress, { nextSeed: () => 22 });
    expect(sessions.game.state.mode).toBe('chill');
    sessions.game.primaryAction();
    completeRound(sessions.game);
    for (const event of sessions.game.drainEvents()) sessions.handle(event);
    expect(progress.pot).not.toBeNull();
    expect(progress.potInfo.mode).toBe('chill');

    // Reopening from storage loads the saved Chill pot and continues in Chill Mode.
    const resumedProgress = createLocalProgress(storage);
    const resumed = createSessions(createGame({ seed: 99, mode: 'arcade' }), resumedProgress, { nextSeed: () => 33 });
    expect(resumed.continuePot()).toBe(true);
    expect(resumed.game.state.mode).toBe('chill');
    expect(resumed.game.state.round).toBe(1);
    expect(resumed.game.state.phase).toBe('reading');

    // Starting a confirmed new pot in Arcade mode switches cleanly.
    expect(resumed.newPot(true, 'arcade')).toBe(true);
    expect(resumed.game.state.mode).toBe('arcade');
    expect(resumed.game.state.phase).toBe('playing');
  });

  it('enforces Auto Steam disabled in Arcade Mode and optional in Chill Mode', () => {
    const arcade = playingGame({ seed: 3, mode: 'arcade' });
    expect(arcade.state.autoSteam).toBe(false);
    expect(arcade.setAutoSteam(true)).toBe(false);
    expect(arcade.state.autoSteam).toBe(false);
    arcade.state.angle = laneAngle(0);
    placeEnemy(arcade.state, { lane: 0, radius: 120 });
    step(arcade, 1);
    expect(arcade.state.roundStats.volleys).toBe(0);

    const chill = playingGame({ seed: 3, mode: 'chill' });
    expect(chill.state.autoSteam).toBe(false);
    expect(chill.setAutoSteam(true)).toBe(true);
    expect(chill.state.autoSteam).toBe(true);
    chill.state.angle = laneAngle(0);
    placeEnemy(chill.state, { lane: 0, radius: 120 });
    step(chill, 1);
    expect(chill.state.roundStats.volleys).toBeGreaterThanOrEqual(1);
    expect(chill.setAutoSteam(false)).toBe(false);
    expect(chill.state.autoSteam).toBe(false);
  });

  it('applies gentler difficulty progression and a lower heat ceiling in Chill Mode', () => {
    expect(maxHeatFor('chill')).toBe(CONFIG.modes.chill.maxHeat);
    expect(maxHeatFor('arcade')).toBe(CONFIG.modes.arcade.maxHeat);
    expect(maxHeatFor('chill')).toBeLessThan(maxHeatFor('arcade'));

    expect(nextHeat(14, 'chill')).toBe(14);
    expect(nextHeat(14, 'arcade')).toBe(15);

    const chillDiff = difficultyAt(12, 'chill');
    const arcadeDiff = difficultyAt(12, 'arcade');
    expect(chillDiff.target).toBeLessThanOrEqual(CONFIG.modes.chill.maxTarget);
    expect(chillDiff.speed).toBeLessThan(arcadeDiff.speed);
    expect(chillDiff.interval).toBeGreaterThan(arcadeDiff.interval);

    const chillMods = withHeat(BASE_MODIFIERS, 14, { enemySpeed: 1.25 }, 'chill');
    const arcadeMods = withHeat(BASE_MODIFIERS, 14, { enemySpeed: 1.25 }, 'arcade');
    expect(chillMods.enemySpeedMultiplier).toBeLessThan(arcadeMods.enemySpeedMultiplier);
    expect(chillMods.spawnIntervalMultiplier).toBeGreaterThan(arcadeMods.spawnIntervalMultiplier);
  });

  it('keeps high scores, best rounds, and play counts separate by gameplay mode', () => {
    const storage = fakeStorage();
    const progress = createLocalProgress(storage);

    progress.recordPot({ round: 4, score: 120, mode: 'chill' }, { finished: true, cupCompleted: true });
    progress.recordPot({ round: 7, score: 310, mode: 'arcade' }, { finished: true, cupCompleted: true });
    progress.recordPot({ round: 6, score: 180, mode: 'chill' }, { finished: true, cupCompleted: true });

    expect(progress.modeRecords.modes.chill).toMatchObject({ bestScore: 180, bestRound: 6, plays: 2, cups: 2 });
    expect(progress.modeRecords.modes.arcade).toMatchObject({ bestScore: 310, bestRound: 7, plays: 1, cups: 1 });
  });

  it('migrates v0.22.0 (schema 5) saves safely without discarding progress', () => {
    const storage = fakeStorage();
    const progress = createLocalProgress(storage);
    const game = playingGame({ seed: 5, mode: 'chill', spawning: true });
    game.setAutoSteam(true);
    completeRound(game);
    const event = game.drainEvents().find((e) => e.type === 'checkpoint');
    expect(event).toBeDefined();
    expect(progress.saveCheckpoint(event.checkpoint)).toBe(true);

    // Downgrade the stored payload to v0.22.0 schema 5 (without `mode`).
    const raw = JSON.parse(storage.getItem(POT_KEY));
    expect(raw.schemaVersion).toBe(POT_SCHEMA_VERSION);
    raw.schemaVersion = 5;
    delete raw.state.mode;

    const migrated = migrateCheckpoint(structuredClone(raw));
    expect(migrated).not.toBeNull();
    expect(migrated.state.mode).toBe('chill'); // inferred from autoSteam: true
    expect(migrated.state.autoSteam).toBe(true);
    expect(migrated.state.round).toBe(1);

    // A schema 5 save with autoSteam: false migrates to arcade mode.
    raw.state.autoSteam = false;
    const migratedArcade = migrateCheckpoint(structuredClone(raw));
    expect(migratedArcade).not.toBeNull();
    expect(migratedArcade.state.mode).toBe('arcade');

    // A tampered v6 checkpoint claiming arcade + autoSteam is rejected.
    const invalid = JSON.parse(storage.getItem(POT_KEY));
    invalid.state.mode = 'arcade';
    invalid.state.autoSteam = true;
    expect(validateCheckpoint(invalid)).toBe(false);
  });
});

describe('seven-lane Sugar and scarce resource economy', () => {
  for (const mode of ['chill', 'arcade']) {
    it(`persists multiple purchases without recounting cups in ${mode}, including reload and the next cup`, () => {
      const storage = fakeStorage();
      let progress = createLocalProgress(storage);
      let sessions = createSessions(playingGame({ seed: 41, mode, spawning: true }), progress);
      const flush = () => {
        const events = sessions.game.drainEvents();
        for (const event of events) sessions.handle(event);
        return events;
      };
      sessions.game.state.teaCash = 100;
      sessions.game.pourMilk();
      sessions.game.sugarBurst();
      completeRound(sessions.game);
      expect(flush().find((e) => e.type === 'checkpoint').cupCompleted).toBe(true);
      expect(progress.modeRecords.modes[mode].cups).toBe(1);
      sessions.game.state.readingTime = 10;
      for (const kind of ['milk', 'sugar', 'milk', 'sugar']) {
        expect(sessions.game.buySupply(kind)).toBe(true);
        expect(flush().find((e) => e.type === 'checkpoint').cupCompleted).toBe(false);
        const saved = createLocalProgress(storage);
        expect(saved.modeRecords.modes[mode].cups).toBe(1);
        expect(saved.pot.state).toMatchObject({
          teaCash: sessions.game.state.teaCash,
          milkLeft: sessions.game.state.milkLeft,
          sugarLeft: sessions.game.state.sugarLeft,
        });
      }
      expect(sessions.game.state).toMatchObject({ teaCash: 35, milkLeft: 3, sugarLeft: 2 });
      progress = createLocalProgress(storage);
      sessions = createSessions(createGame({ seed: 5 }), progress);
      expect(sessions.continuePot()).toBe(true);
      expect(sessions.game.state).toMatchObject({ mode, teaCash: 35, milkLeft: 3, sugarLeft: 2 });
      expect(progress.modeRecords.modes[mode].cups).toBe(1);
      brewNext(sessions.game);
      completeRound(sessions.game);
      flush();
      expect(createLocalProgress(storage).modeRecords.modes[mode].cups).toBe(2);
      expect(progress.pot.state.round).toBe(2);
    });
  }

  for (const boss of ['grind', 'manager']) {
    for (const full of [false, true]) {
      it(`awards ${boss} rematch cash and one Sugar once, with ${full ? 'full' : 'empty'} inventory`, () => {
        const game = playingGame({ seed: 16 });
        const s = game.state;
        Object.assign(s, {
          phase: 'reading', readingTime: 10, offer: null, havocDue: false, shortageDue: false,
          arcadeDue: null, grindDue: boss === 'grind', managerDue: boss === 'manager',
          grindAfter: null, managerAfter: null, managerVisits: 2,
          progress: { chapter: 3, starts: [1, 6, 11] }, teaCash: 7,
          milkLeft: full ? 3 : 0, sugarLeft: full ? 2 : 0,
        });
        game.primaryAction();
        game.primaryAction();
        expect(s.phase).toBe(boss);
        expect(s[boss].milestone).toBe(false);
        game.drainEvents();
        if (boss === 'grind') beatGrind(game);
        else beatManager(game);
        expect(s[boss].summary).toMatchObject({ result: 'victory', cash: CONFIG.teaCash.rematch, sugar: full ? 0 : 1, milk: 0 });
        expect(s).toMatchObject({ teaCash: 7 + CONFIG.teaCash.rematch, milkLeft: full ? 3 : 0, sugarLeft: full ? 2 : 1 });
        const awarded = { cash: s.teaCash, milk: s.milkLeft, sugar: s.sugarLeft, score: s.score };
        step(game, 1);
        expect({ cash: s.teaCash, milk: s.milkLeft, sugar: s.sugarLeft, score: s.score }).toEqual(awarded);
        expect(game.drainEvents().filter((e) => e.type === `${boss}Defeat`)).toHaveLength(1);
      });
    }
  }

  it('fires seven visible darts covering [-3, -2, -1, 0, +1, +2, +3] with arena wraparound', () => {
    const game = playingGame({ seed: 9 });
    game.state.angle = laneAngle(1);
    expect(game.sugarBurst()).toBe(true);
    expect(game.state.shots).toHaveLength(7);
    const expectedLanes = [-3, -2, -1, 0, 1, 2, 3].map((offset) => wrapLane(1 + offset));
    expect(expectedLanes).toEqual([14, 15, 0, 1, 2, 3, 4]);
    game.state.shots.forEach((shot, i) => {
      expect(shot.sugar).toBe(true);
      expect(shot.angle).toBeCloseTo(laneAngle(expectedLanes[i]), 6);
    });
  });

  it('carries milk and sugar across normal rounds and replenishes milk conservatively by mode', () => {
    // Arcade Mode: starts at 2 milk, 1 sugar; +1 milk only every 2 completed cups (entering rounds 3, 5, ...), 0 passive sugar.
    const arcade = playingGame({ seed: 12, mode: 'arcade' });
    expect([arcade.state.milkLeft, arcade.state.sugarLeft]).toEqual([2, 1]);
    arcade.pourMilk();
    arcade.pourMilk();
    arcade.sugarBurst();
    expect([arcade.state.milkLeft, arcade.state.sugarLeft]).toEqual([0, 0]);

    completeRound(arcade);
    arcade.state.nextFortune = 'star';
    brewNext(arcade); // Round 2 in Arcade: passiveMilkGain(arcade, 2) === 0
    expect(arcade.state.round).toBe(2);
    expect(passiveMilkGain(arcade.state, 2)).toBe(0);
    expect([arcade.state.milkLeft, arcade.state.sugarLeft]).toEqual([0, 0]);

    completeRound(arcade);
    arcade.state.nextFortune = 'star';
    brewNext(arcade); // Round 3 in Arcade: passiveMilkGain(arcade, 3) === 1
    expect(arcade.state.round).toBe(3);
    expect(passiveMilkGain(arcade.state, 3)).toBe(1);
    expect([arcade.state.milkLeft, arcade.state.sugarLeft]).toEqual([1, 0]);

    // Chill Mode: +1 milk after every completed normal cup up to capacity (3), 0 passive sugar.
    const chill = playingGame({ seed: 12, mode: 'chill' });
    chill.pourMilk();
    chill.sugarBurst();
    expect([chill.state.milkLeft, chill.state.sugarLeft]).toEqual([1, 0]);

    completeRound(chill);
    chill.state.nextFortune = 'star';
    brewNext(chill); // Round 2 in Chill: +1 milk -> 2, 0 sugar -> 0
    expect([chill.state.milkLeft, chill.state.sugarLeft]).toEqual([2, 0]);
  });

  it('enforces maximum inventory capacity for milk (3) and sugar (2 + Sugar Scoop)', () => {
    const game = playingGame({ seed: 4, mode: 'chill' });
    expect(milkCapacity(game.state)).toBe(3);
    expect(sugarCapacity(game.state)).toBe(2);

    // Unused milk in Chill caps at 3 across rounds.
    for (let r = 0; r < 3; r++) {
      completeRound(game);
      game.state.nextFortune = 'star';
      brewNext(game);
    }
    expect(game.state.milkLeft).toBe(3);
    expect(game.state.sugarLeft).toBe(1);

    // Sugar Scoop increases sugar capacity and grants +1 immediate charge when chosen.
    completeRound(game);
    game.state.readingTime = 10;
    game.state.offer = ['sugarScoop', 'quickStir'];
    expect(game.chooseUpgrade(0)).toBe(true);
    expect(sugarCapacity(game.state)).toBe(3);
    expect(game.state.sugarLeft).toBe(2);
  });

  it('allows purchasing milk (10 Tea Cash) and sugar (25 Tea Cash) between rounds, respecting funds and capacity', () => {
    const game = playingGame({ seed: 8, mode: 'arcade' });
    game.pourMilk();
    game.sugarBurst();
    completeRound(game); // earns +5 Tea Cash
    game.state.readingTime = 10; // reading ready

    // Insufficient funds initially (5 Tea Cash < 10 and 25).
    expect(game.buySupply('milk')).toBe(false);
    expect(game.buySupply('sugar')).toBe(false);
    expect(restockView(game.state)).toMatchObject({
      cash: 5,
      milk: { enabled: false },
      sugar: { enabled: false },
    });

    // Grant 60 Tea Cash and buy milk and sugar up to capacity.
    game.state.teaCash = 60;
    expect(game.buySupply('milk')).toBe(true); // 1 -> 2, cash 50
    expect(game.buySupply('milk')).toBe(true); // 2 -> 3 (full), cash 40
    expect(game.buySupply('milk')).toBe(false); // already at capacity 3
    expect(game.state.milkLeft).toBe(3);
    expect(game.state.teaCash).toBe(40);

    expect(game.buySupply('sugar')).toBe(true); // 0 -> 1, cash 15
    expect(game.buySupply('sugar')).toBe(false); // 15 < 25 insufficient funds
    expect(game.state.sugarLeft).toBe(1);
    expect(game.state.teaCash).toBe(15);
  });

  it('refuses supply purchases until the reading\'s restock bar is available, then sells and saves once', () => {
    for (const fortune of [null, 'lie']) {
      // Spawning stays on: a checkpoint (like a real pot) never holds an infinite spawn timer.
      const game = playingGame({ seed: 8, mode: 'arcade', spawning: true });
      game.pourMilk();
      game.sugarBurst();
      completeRound(game);
      const s = game.state;
      if (fortune) s.nextFortune = fortune; // The Lie keeps the reading busy for longer.
      Object.assign(s, { teaCash: 100, readingTime: 0 });
      game.drainEvents();
      const ready = readingReadyAt(s);
      const before = { cash: s.teaCash, milk: s.milkLeft, sugar: s.sugarLeft };
      for (const t of [0, OFFER_AT - 0.01, ready - 0.01]) {
        s.readingTime = t;
        expect(restockOpen(s)).toBe(false);
        expect(restockView(s)).toBeNull();
        expect(game.supplyShopOpen()).toBe(false);
        expect(game.buySupply('milk')).toBe(false);
        expect(game.buySupply('sugar')).toBe(false);
      }
      expect({ cash: s.teaCash, milk: s.milkLeft, sugar: s.sugarLeft }).toEqual(before);
      expect(game.drainEvents()).toEqual([]);

      s.readingTime = ready;
      expect(restockView(s)).not.toBeNull();
      expect(game.supplyShopOpen()).toBe(true);
      expect(game.buySupply('milk')).toBe(true);
      expect(game.buySupply('sugar')).toBe(true);
      expect(s).toMatchObject({ teaCash: 100 - CONFIG.teaCash.milkPrice - CONFIG.teaCash.sugarPrice,
        milkLeft: before.milk + 1, sugarLeft: before.sugar + 1 });
      const saves = game.drainEvents().filter((e) => e.type === 'checkpoint');
      expect(saves.map((e) => e.cupCompleted)).toEqual([false, false]);
      expect(saves[1].checkpoint.state).toMatchObject({ teaCash: s.teaCash, milkLeft: s.milkLeft, sugarLeft: s.sugarLeft });
    }
  });

  it('sells no supplies during play, a Tea Shortage or a Chill Day choice', () => {
    const playing = playingGame({ seed: 3, mode: 'chill' });
    playing.state.teaCash = 100;
    playing.state.milkLeft = 0;
    expect(playing.buySupply('milk')).toBe(false);

    const shortage = atShortage(4);
    expect(shortage.errandOpen()).toBe(true);
    Object.assign(shortage.state, { teaCash: 100, milkLeft: 0, sugarLeft: 0 });
    expect(shortage.buySupply('milk')).toBe(false);
    expect(shortage.buySupply('sugar')).toBe(false);

    const day = playingGame({ seed: 11, mode: 'chill' });
    day.state.round = 10;
    completeRound(day);
    Object.assign(day.state, { shortageDue: false, havocDue: false, grindDue: false, managerDue: false,
      arcadeDue: null, offer: null, readingTime: 99 });
    day.primaryAction();
    expect(day.state.phase).toBe('day');
    Object.assign(day.state, { teaCash: 100, milkLeft: 0, sugarLeft: 0 });
    expect(day.buySupply('milk')).toBe(false);
    expect(day.buySupply('sugar')).toBe(false);
    for (const game of [playing, shortage, day]) {
      expect(game.state.teaCash).toBe(100);
      expect(game.drainEvents().filter((e) => e.type === 'supplyBought')).toEqual([]);
    }
  });

  it('awards Tea Cash and scarce resources on milestone and rematch boss victories, and balances 7-lane sugar against bosses', () => {
    // Milestone Daily Grind victory awards +15 Tea Cash, +1 Sugar, +1 Milk (clamped to capacity).
    const grindGame = playingGame({ seed: 15, mode: 'arcade' });
    grindGame.state.round = 5;
    grindGame.pourMilk();
    grindGame.sugarBurst();
    completeRound(grindGame);
    grindGame.state.offer = null;
    grindGame.primaryAction(); // enter milestone Daily Grind
    grindGame.primaryAction(); // start fight
    const cashBeforeGrind = grindGame.state.teaCash;
    beatGrind(grindGame);
    expect(grindGame.state.grind.result).toBe('victory');
    expect(grindGame.state.teaCash).toBe(cashBeforeGrind + CONFIG.teaCash.milestone);
    expect(grindGame.state.sugarLeft).toBe(1);
    expect(grindGame.state.milkLeft).toBe(2);

    // Mycelium Manager: each dart in a 7-lane sugar burst is consumed on its first hit in a lane.
    const managerGame = createGame({ seed: 16, mode: 'arcade' });
    managerGame.primaryAction();
    Object.assign(managerGame.state, {
      phase: 'reading',
      readingTime: 10,
      offer: null,
      havocDue: false,
      grindDue: false,
      shortageDue: false,
      arcadeDue: null,
      managerDue: true,
      grindAfter: null,
      progress: { chapter: 2, starts: [1, 6] },
      managerAfter: managerGame.state.round,
      managerVisits: 0,
    });
    managerGame.primaryAction(); // enter milestone Mycelium Manager
    managerGame.primaryAction(); // start fight
    const m = managerGame.state.manager;
    Object.assign(m, { rootTimer: Infinity, memoTimer: Infinity, meetingTimer: Infinity, meeting: null });
    // Place a root at tip 220 shielding a memo at radius 150 in lane 0: one sugar dart clears the root first and does not also pop the memo behind it.
    m.roots = [{ lane: 0, stage: 'grow', time: 0, tip: 220, frozen: false }];
    m.memos = [{ id: 99, lane: 0, angle: laneAngle(0), radius: 150, speed: 0 }];
    managerGame.state.angle = laneAngle(0);
    expect(managerGame.sugarBurst()).toBe(true);
    step(managerGame, 0.35);
    expect(m.roots).toHaveLength(0);
    expect(m.memos).toHaveLength(1);

    // Defeating the milestone Manager awards +15 Tea Cash and replenishes sugar/milk up to capacity.
    const cashBeforeManager = managerGame.state.teaCash;
    beatManager(managerGame);
    expect(managerGame.state.manager.result).toBe('victory');
    expect(managerGame.state.teaCash).toBe(cashBeforeManager + CONFIG.teaCash.milestone);
    expect(managerGame.state.sugarLeft).toBe(1);
  });

  it('resets resources and preserves the selected mode on game over and restart', () => {
    const game = playingGame({ seed: 20, mode: 'chill' });
    game.pourMilk();
    game.sugarBurst();
    game.state.teaCash = 35;
    game.state.lives = 1;
    game.state.strainerLeft = 0;
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    expect(game.state.phase).toBe('gameover');

    expect(game.restart()).toBe(true);
    expect(game.state.phase).toBe('playing');
    expect(game.state.mode).toBe('chill');
    expect([game.state.milkLeft, game.state.sugarLeft, game.state.teaCash]).toEqual([2, 1, 0]);
  });
});
