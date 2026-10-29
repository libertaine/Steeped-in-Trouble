import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { MAX_HEAT, cupOfDay, dayOf, difficultyAt, nextHeat, withHeat } from '../../src/gameplay/days.js';
import { advanceEnemy, nextSpawnDelay, spawnEnemy, updateSpawning } from '../../src/gameplay/enemies.js';
import { FORTUNES } from '../../src/gameplay/fortunes.js';
import { teaUnlocks, teasOnTap } from '../../src/gameplay/progress.js';
import { TEAS, roundModifiers } from '../../src/gameplay/teas.js';
import { hudText } from '../../src/ui/hud.js';
import { prepareDayPractice } from '../../src/dev/days.js';
import { completeRound, finishBonus, placeEnemy, playingGame, step } from './helpers.js';
import { finishNormal, resolveReading, simulateDays } from '../support/daySimulation.js';

function boundary(round = 10, heat = 9) {
  const g = createGame({ seed: 1 });
  g.primaryAction();
  Object.assign(g.state, { round, heat, grindAfter: null, lastGrind: round,
    havocAfter: null, lastHavoc: round, shortageAfter: 1000 });
  finishNormal(g);
  return g;
}

describe('Day completion and deliberate choices', () => {
  it('derives ten cups per Day without replacing the global round', () => {
    expect(Array.from({ length: 10 }, (_, i) => dayOf(i + 1))).toEqual(Array(10).fill(1));
    expect([11, 21].map(dayOf)).toEqual([2, 3]);
    expect([1, 10, 11, 20, 21].map(cupOfDay)).toEqual([1, 10, 1, 10, 1]);
  });

  it.each(['fresh', 'keep'])('consumes %s once and keeps the next fortune for exactly one normal cup', (choice) => {
    const g = boundary();
    g.state.nextFortune = 'karma';
    resolveReading(g);
    expect(g.state.phase).toBe('day');
    expect(g.confirm()).toBe(false);
    g.primaryAction(); g.pause(); g.togglePause(); step(g, 90);
    expect(g.state.round).toBe(10);
    expect(g.chooseDay('invalid')).toBe(false);
    expect(g.chooseDay(choice)).toBe(true);
    expect(g.chooseDay(choice)).toBe(false);
    expect(g.state).toMatchObject({ round: 11, heat: choice === 'fresh' ? 0 : 10,
      target: choice === 'fresh' ? 16 : 32, phase: 'playing', dayPending: false, fortune: 'karma' });
    expect(g.state.modifiers.karma).toBe(true);
    // Karma still bounces then puffs at the rim, with no lost cups or score.
    const before = { score: g.state.score, lives: g.state.lives };
    g.state.spawnTimer = Infinity;
    const leaf = placeEnemy(g.state, { radius: CONFIG.arena.rimRadius, speed: 0 });
    g.update(1 / 60);
    expect(leaf.karma).toBe('bounced');
    leaf.backwash = 0; leaf.radius = CONFIG.arena.rimRadius;
    g.update(1 / 60);
    expect(g.state.enemies).not.toContain(leaf);
    expect(g.state).toMatchObject(before);
    finishNormal(g); g.state.nextFortune = 'star'; resolveReading(g);
    expect(g.state.fortune).toBe('star'); expect(g.state.modifiers.karma).toBe(false);
  });

  it('preserves progression, scheduling, funds, cups, upgrades, discoveries and Golden Spoon time', () => {
    const g = boundary(20, 19), s = g.state;
    Object.assign(s, { progress: { chapter: 2, starts: [1, 6] }, goldenSpoon: 6,
      teaCash: 73, score: 888, lives: 2, discovered: ['doubleGilt'], extraSugar: 1 });
    s.spoon.polished = 2; s.spoon.strainer = 1;
    s.teaServed = { green: 20, chai: 18, black: 19 };
    resolveReading(g);
    const keys = ['progress', 'spoon', 'teaCash', 'score', 'lives', 'discovered', 'goldenSpoon',
      'shortageAfter', 'havocAfter', 'lastHavoc', 'grindAfter', 'lastGrind', 'arcade'];
    const retained = Object.fromEntries(keys.map((k) => [k, structuredClone(s[k])]));
    const history = { ...s.teaServed }, unlocks = teaUnlocks(s.progress);
    g.chooseDay('fresh');
    expect(Object.fromEntries(keys.map((k) => [k, s[k]]))).toEqual(retained);
    expect(teaUnlocks(s.progress)).toEqual(unlocks);
    expect(teasOnTap(s.progress, 21)).toHaveLength(6);
    for (const [tea, last] of Object.entries(history)) expect(s.teaServed[tea]).toBe(tea === s.tea ? 21 : last);
    expect(s.teaAge).toBeGreaterThan(1);
    expect(s.sugarLeft).toBeGreaterThanOrEqual(CONFIG.sugar.perRound + 1);
  });

  it.each([10, 20])('resolves every encounter before the choice after round %i', (round) => {
    for (const encounter of ['shortage', 'run', 'havoc', 'grind', 'dailyPour', 'biscuitBreakout']) {
      const g = boundary(round, round - 1), s = g.state;
      s.progress = { chapter: 2, starts: [1, 6] };
      s.nextFortune = 'karma';
      s.offer = ['polished', 'strainer'];
      if (encounter === 'shortage' || encounter === 'run') s.shortageDue = true;
      else if (encounter === 'havoc') s.havocDue = true;
      else if (encounter === 'grind') s.grindDue = true;
      else s.arcadeDue = encounter;
      g.primaryAction(); expect(s.phase).toBe('reading');
      g.update(5); expect(g.chooseUpgrade(0)).toBe(true);
      expect(g.chooseDay('fresh')).toBe(false);
      expect(s.dayPending).toBe(true); expect(s.round).toBe(round);
      if (encounter === 'shortage' || encounter === 'run') {
        g.update(5); g.chooseErrand(encounter === 'run' ? 'run' : 'skip');
        if (encounter === 'run') {
          g.primaryAction(); step(g, 40); s.run.time = 5; g.primaryAction();
        }
      } else if (encounter === 'havoc' || encounter === 'grind') finishBonus(g, { win: true });
      else {
        expect(s.phase).toBe('arcadeOffer'); g.chooseInterlude(true); g.primaryAction();
        step(g, encounter === 'dailyPour' ? 35 : 50); g.primaryAction();
      }
      expect(s.phase).toBe('day'); expect(s.round).toBe(round);
      expect(s.heat).toBe(round - 1);
      g.primaryAction(); g.primaryAction();
      expect(g.chooseDay('fresh')).toBe(true);
      expect(s.round).toBe(round + 1); expect(s.fortune).toBe('karma');
      expect(g.drainEvents().filter((e) => e.type === 'dayEnd')).toHaveLength(1);
    }
  });

  it('opens Chapter 2 at a boundary milestone before resetting Heat', () => {
    const g = boundary(); g.state.grindDue = true; g.state.grindAfter = 10;
    resolveReading(g);
    expect(g.state.progress).toEqual({ chapter: 2, starts: [1, 11] });
    expect(g.state.phase).toBe('day'); g.chooseDay('fresh');
    expect(g.state.tea).toBe('chai'); expect(g.state.teaAge).toBe(1);
    expect(g.state.progress.starts).toEqual([1, 11]);
  });

  it('does not offer tomorrow after a fatal spill in cup ten', () => {
    const g = playingGame();
    Object.assign(g.state, { round: 10, heat: 9, lives: 1, strainerLeft: 0 });
    placeEnemy(g.state, { radius: CONFIG.arena.rimRadius }); g.update(1 / 60);
    expect(g.state.phase).toBe('gameover'); expect(g.state.dayPending).toBe(false);
    expect(g.chooseDay('fresh')).toBe(false);
    g.restart(); expect(g.state).toMatchObject({ heat: 0, round: 1, dayPending: false });
  });
});

describe('bounded combat pressure', () => {
  it('retains Day 1 targets and increases pressure only from Heat ten', () => {
    expect(Array.from({ length: 10 }, (_, h) => difficultyAt(h).target)).toEqual([16, 18, 20, 22, 24, 26, 28, 30, 32, 32]);
    for (let h = 0; h < 10; h++) expect(difficultyAt(h)).toMatchObject({ speed: 1, interval: 1 });
    expect(difficultyAt(10)).toEqual({ target: 32, speed: 1.0125, interval: 0.992 });
    expect(MAX_HEAT).toBe(28); expect(nextHeat(MAX_HEAT)).toBe(MAX_HEAT);
    expect(difficultyAt(1e9)).toEqual({ target: 32, speed: 1.2, interval: 0.85 });
  });

  it('respects actual movement and spawn limits for all teas, fortunes, chapters and Heat levels', () => {
    for (const chapter of CONFIG.chapters) for (const tea of Object.keys(TEAS)) {
      for (const fortune of [null, ...Object.keys(FORTUNES)]) for (const heat of [0, 9, 10, 20, MAX_HEAT]) {
        const g = playingGame({ tea }), s = g.state;
        s.progress.chapter = CONFIG.chapters.indexOf(chapter) + 1;
        s.modifiers = withHeat(roundModifiers(fortune, tea, 99), heat, chapter);
        expect(chapter.enemySpeed * s.modifiers.enemySpeedMultiplier).toBeLessThanOrEqual(CONFIG.days.maxOverallSpeed);
        const rng = createRandom(42), sim = { state: s, rng, emit: () => {} };
        const leaf = spawnEnemy(sim); leaf.dart = null; leaf.wander = null; leaf.shifted = true;
        const radius = leaf.radius;
        advanceEnemy(leaf, sim, 0.1);
        expect(leaf.radius - radius).toBeCloseTo(leaf.speed * s.modifiers.enemySpeedMultiplier * 0.1);
        s.enemies = []; s.spawnTimer = 0; updateSpawning(sim, 0);
        expect(s.spawnTimer).toBeGreaterThanOrEqual(CONFIG.days.minSpawnInterval);
        expect(s.spawnTimer).toBeLessThanOrEqual(chapter.spawnInterval * s.modifiers.spawnIntervalMultiplier * CONFIG.spawning.jitterMax);
      }
    }
    const s = playingGame().state;
    s.modifiers.spawnIntervalMultiplier = 0.001; s.spawnTimer = 0;
    updateSpawning({ state: s, rng: createRandom(1) }, 0);
    expect(s.spawnTimer).toBe(CONFIG.days.minSpawnInterval);
    expect(withHeat(roundModifiers(null), MAX_HEAT, { enemySpeed: 10 }).enemySpeedMultiplier * 10).toBe(2);
  });
});

describe('sixty completed normal rounds', () => {
  it.each([['fresh'], ['keep'], ['keep', 'fresh'], ['fresh', 'keep']])('supports the repeating %j policy', (...choices) => {
    const { rows, game } = simulateDays(choices);
    let expected = 0;
    for (let i = 0; i < rows.length; i++) {
      if (i && i % 10 === 0 && choices[(i / 10 - 1) % choices.length] === 'fresh') expected = 0;
      else if (i) expected = Math.min(MAX_HEAT, expected + 1);
      expect(rows[i].heat).toBe(expected);
      expect(rows[i].target).toBe(Math.min(32, 16 + 2 * expected));
      expect(rows[i].day).toBe(Math.floor(i / 10) + 1);
    }
    expect(game.state.round).toBe(61); expect(game.state.progress.chapter).toBe(2);
  });

  it('keeps chapter unlocks, tea selection and adventure scheduling identical across policies', () => {
    const a = simulateDays(['fresh']), b = simulateDays(['keep']);
    expect(a.offers).toEqual(b.offers);
    expect(a.rows.map(({ tea, age, chapter, fortune }) => ({ tea, age, chapter, fortune })))
      .toEqual(b.rows.map(({ tea, age, chapter, fortune }) => ({ tea, age, chapter, fortune })));
    expect(a.offers.some((x) => x.arcade === 'dailyPour')).toBe(true);
    expect(a.offers.some((x) => x.arcade === 'biscuitBreakout')).toBe(true);
    expect(simulateDays(['keep']).rows).toEqual(b.rows);
  });

  it('reports implemented Day values and deterministic jitter in representative cups', () => {
    const fresh = simulateDays(['fresh']).rows, keep = simulateDays(['keep']).rows;
    const mixed = simulateDays(['keep', 'fresh']).rows;
    const rows = [['Day 1', keep[0]], ['Day 2 Fresh', fresh[10]], ['Day 2 Keep', keep[10]],
      ['Day 3 Keep', keep[20]], ['Day 3 reset', mixed[20]], ['Day 5 maximum', keep[40]]];
    console.table(rows.map(([scenario, r]) => ({ scenario, ...r,
      spawnSeconds: Number(nextSpawnDelay(r.interval, createRandom(42)).toFixed(6)) })));
    expect(keep[40].heat).toBe(MAX_HEAT);
  });
});

it('provides real development practice transitions and a truthful HUD', () => {
  const g = playingGame();
  for (const mode of ['near', 'end', 'fresh', 'keep', 'max']) {
    expect(prepareDayPractice(g, mode)).toBe(true);
    if (mode === 'near') { completeRound(g); expect(g.state.phase).toBe('reading'); }
    if (mode === 'end') expect(g.state.phase).toBe('day');
    if (mode === 'fresh') expect(g.state).toMatchObject({ round: 11, heat: 0, target: 16 });
    if (mode === 'keep') expect(g.state).toMatchObject({ round: 11, heat: 10, target: 32 });
    if (mode === 'max') expect(hudText(g.state).hudDay).toBe('DAY 5 · CUP 1/10 · HEAT 28 MAX');
  }
  expect(prepareDayPractice(g, 'invalid')).toBe(false);
});
