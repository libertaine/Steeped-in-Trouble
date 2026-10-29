import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { nextSpawnDelay, spawnEnemy } from '../../src/gameplay/enemies.js';
import {
  advanceChapter, createProgress, currentChapter, debutTea, opensChapter, teaAge, teaUnlocks, teasOnTap,
} from '../../src/gameplay/progress.js';
import { byStage } from '../../src/gameplay/strength.js';
import { TEAS } from '../../src/gameplay/teas.js';
import { answerShortage, completeRound, finishBonus, placeEnemy, playTo, playingGame, step } from './helpers.js';

const G = CONFIG.grind;
const D = CONFIG.darting;
const [ONE, TWO] = CONFIG.chapters;
const FIRST_TEAS = ['house', 'herbal', 'earlGrey'];

/** A fresh pot (the real tea draw, nothing pinned) in round 1. */
function pot(seed = 1) {
  const game = createGame({ seed });
  game.primaryAction();
  game.state.spawnTimer = Infinity;
  game.drainEvents();
  return game;
}

/** Finish the current round with one shot; a spice current or The Spiral could carry the last leaf away. */
function finishRound(game) {
  game.state.current = null;
  game.state.modifiers = { ...game.state.modifiers, laneDrift: false };
  completeRound(game);
}

/**
 * Finish the round and leave its reading for the next cup, recording what was
 * due there. A Tea Shortage is skipped (and noted) on the way to any bonus round.
 */
function nextCup(game, { win = false } = {}) {
  finishRound(game);
  const due = { round: game.state.round, havoc: game.state.havocDue, grind: game.state.grindDue };
  game.state.offer = null;
  game.primaryAction();
  due.shortage = answerShortage(game);
  due.phase = game.state.phase;
  due.milestone = game.state.grind?.milestone ?? false;
  finishBonus(game, { win });
  game.chooseInterlude(false);
  game.chooseDay('keep');
  return due;
}

/**
 * Play a pot to the start of `round`, letting the machine escape until the
 * reading after round `winAt`, and beating it from then on. Returns every
 * reading, and the tea of every cup from the current one on.
 */
function playPot(game, round, { winAt = Infinity } = {}) {
  const readings = [];
  const teas = [game.state.tea];
  while (game.state.round < round) {
    readings.push(nextCup(game, { win: game.state.round >= winAt }));
    teas.push(game.state.tea);
  }
  return { readings, teas };
}

/** A pot that has just beaten its milestone after round 5 and is starting Chapter 2. */
function chapterTwo(seed = 1) {
  const game = pot(seed);
  playPot(game, 6, { winAt: 5 });
  return game;
}

/** The round's spawn timings, as the real spawner sets them. */
function spawnGaps(game, count = 20) {
  const gaps = [];
  for (let i = 0; i < count; i++) {
    game.state.enemies = [];
    game.state.spawnTimer = 0;
    game.update(1 / 60);
    gaps.push(game.state.spawnTimer);
  }
  return gaps;
}

describe('the chapters', () => {
  it('starts every pot in Chapter 1, with only its teas', () => {
    expect(createProgress()).toEqual({ chapter: 1, starts: [1] });
    const p = createProgress();
    expect(currentChapter(p)).toBe(ONE);
    expect(teasOnTap(p, 1)).toEqual(FIRST_TEAS);
    expect(teasOnTap(p, 40)).toEqual(FIRST_TEAS);
    // Between them, the two chapters bring every tea, once.
    expect([...Object.keys(ONE.teas), ...Object.keys(TWO.teas)].sort()).toEqual(Object.keys(TEAS).sort());
  });

  it('advances once per call, and not past the last chapter', () => {
    const p = createProgress();
    advanceChapter(p, 6);
    expect(p).toEqual({ chapter: 2, starts: [1, 6] });
    expect(currentChapter(p)).toBe(TWO);
    advanceChapter(p, 12);
    expect(p).toEqual({ chapter: 2, starts: [1, 6] });
    expect(opensChapter(p, 6)).toBe(true);
    expect(opensChapter(p, 7)).toBe(false);
    expect(opensChapter(createProgress(), 1)).toBe(false);
  });

  it('brings Chapter 2’s teas in one at a time: Chai, then Green Tea, then Black Tea', () => {
    const p = createProgress();
    advanceChapter(p, 9);
    expect(teaUnlocks(p)).toEqual({ house: 1, herbal: 1, earlGrey: 1, chai: 9, green: 11, black: 13 });
    expect(teasOnTap(p, 8)).toEqual(FIRST_TEAS);
    expect(teasOnTap(p, 9)).toEqual([...FIRST_TEAS, 'chai']);
    expect(teasOnTap(p, 11)).toEqual([...FIRST_TEAS, 'chai', 'green']);
    expect(teasOnTap(p, 13)).toEqual([...FIRST_TEAS, 'chai', 'green', 'black']);
    expect([8, 9, 10, 11, 12, 13, 14].map((r) => debutTea(p, r))).toEqual([null, 'chai', null, 'green', null, 'black', null]);
    expect(debutTea(createProgress(), 1)).toBeNull();
  });

  it('counts each tea’s age from the round it comes on tap', () => {
    const p = createProgress();
    expect(teaAge(p, 'earlGrey', 1)).toBe(1);
    expect(teaAge(p, 'earlGrey', 7)).toBe(7);
    advanceChapter(p, 9);
    expect(teaAge(p, 'chai', 9)).toBe(1);
    expect(teaAge(p, 'green', 11)).toBe(1);
    expect(teaAge(p, 'green', 15)).toBe(5);
  });
});

describe('Chapter 1: Learning to Steep', () => {
  it('always opens with the House Blend, then serves only its own three teas, never twice running', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { teas } = playPot(pot(seed), 11); // every boss fight lost: Chapter 1 throughout
      expect(teas[0]).toBe('house');
      for (const [i, tea] of teas.entries()) {
        expect(FIRST_TEAS).toContain(tea);
        if (i) expect(tea).not.toBe(teas[i - 1]);
      }
      expect(teas).toContain('herbal');
      expect(teas).toContain('earlGrey');
    }
  });

  it('keeps the House Blend in the rotation as a breather', () => {
    let breathers = 0;
    for (let seed = 1; seed <= 40; seed++) breathers += playPot(pot(seed), 6).teas.slice(1).filter((t) => t === 'house').length;
    expect(breathers).toBeGreaterThan(20);
  });

  it('holds leaf speed and arrivals steady from round 1 to round 5 and beyond', () => {
    const speeds = (round) => {
      const game = pot(7);
      game.state.round = round;
      return Array.from({ length: 30 }, (_, i) => spawnEnemy({ state: game.state, rng: createRandom(i) }).speed);
    };
    expect(speeds(5)).toEqual(speeds(1));
    expect(speeds(15)).toEqual(speeds(1));
    for (const speed of speeds(1)) {
      expect(speed).toBeGreaterThanOrEqual(CONFIG.enemies.speedMin);
      expect(speed).toBeLessThan(CONFIG.enemies.speedMax);
    }
    const early = playingGame({ seed: 4 });
    const late = playingGame({ seed: 4 });
    late.state.round = 5;
    expect(spawnGaps(late)).toEqual(spawnGaps(early));
    expect(nextSpawnDelay(ONE.spawnInterval, createRandom(5))).toBeCloseTo(ONE.spawnInterval * createRandom(5).range(0.72, 1.36), 10);
  });

  it('stays at its own pace for as long as the machine keeps escaping', () => {
    const game = pot(3);
    playPot(game, 14); // escapes after rounds 5, 7, 9, 11 and 13
    expect(game.state.progress).toEqual({ chapter: 1, starts: [1] });
    expect(spawnEnemy({ state: game.state, rng: createRandom(1) }).speed)
      .toBe(spawnEnemy({ state: pot(3).state, rng: createRandom(1) }).speed);
    expect(teasOnTap(game.state.progress, game.state.round)).toEqual(FIRST_TEAS);
  });
});

describe('the milestone: The Daily Grind after round 5', () => {
  it('always comes straight after round 5’s reading', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { readings } = playPot(pot(seed), 6);
      expect(readings.slice(0, 4).every((r) => !r.grind)).toBe(true);
      expect(readings[4]).toMatchObject({ round: 5, grind: true, havoc: false, phase: 'grind', milestone: true });
    }
  });

  it('first reads the leaves and offers the spoon its upgrade, as any reading does', () => {
    const game = pot(2);
    playTo(game, 5);
    finishRound(game);
    expect(game.state.phase).toBe('reading');
    expect(game.state.nextFortune).toBeTruthy();
    expect(game.state.offer).toHaveLength(CONFIG.upgrades.choices); // round 5 is an offer round
    expect(game.state.grindDue).toBe(true);
    game.state.readingTime = 10;
    expect(game.chooseUpgrade(0)).toBe(true);
    expect(game.state.phase).toBe('grind');
    expect(game.state.grind.milestone).toBe(true);
  });

  it('puts the first Hot Chocolate Havoc after round 3 or 4, so it can never delay the milestone', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const havoc = playPot(pot(seed), 6).readings.filter((r) => r.havoc).map((r) => r.round);
      expect(havoc).toHaveLength(1);
      seen.add(havoc[0]);
    }
    expect([...seen].sort()).toEqual([3, 4]);
  });

  it('goes first when the hot chocolate wants the same reading, and the hot chocolate follows the next one', () => {
    const game = pot(5);
    game.state.havocAfter = 5; // both want round 5's reading
    const { readings } = playPot(game, 7);
    expect(readings[4]).toMatchObject({ round: 5, grind: true, havoc: false, phase: 'grind' });
    expect(readings[5]).toMatchObject({ round: 6, grind: false, havoc: true, phase: 'chocolate' });
    expect(game.state.round).toBe(7);
  });

  it('puts off a chance hot chocolate that lands on a rematch to the next reading, rather than lose it or double up', () => {
    for (let seed = 1; seed < 400; seed++) {
      const game = pot(seed);
      playPot(game, 7); // the first attempt got away: the rematch follows round 7
      finishRound(game);
      expect(game.state.grindDue).toBe(true);
      expect(game.state.havocDue).toBe(false);
      if (game.state.havocAfter !== 8) continue; // the hot chocolate did not want this reading
      game.state.offer = null;
      game.primaryAction();
      expect(game.state.phase).toBe('grind');
      finishBonus(game);
      finishRound(game);
      expect(game.state.havocDue).toBe(true);
      expect(game.state.grindDue).toBe(false);
      return;
    }
    throw new Error('no pot has a hot chocolate wanting the first rematch’s reading');
  });

  it('never costs a cup to lose, and brings the machine back after two more cups until it is beaten', () => {
    const game = pot(8);
    const { readings } = playPot(game, 12);
    expect(game.state.lives).toBe(CONFIG.lives);
    const fights = readings.filter((r) => r.grind);
    expect(fights.map((r) => r.round)).toEqual([5, 7, 9, 11]);
    expect(fights.every((r) => r.milestone)).toBe(true);
    expect(game.state.grindAfter).toBe(11 + G.retryAfter);
    expect(game.state.progress.chapter).toBe(1);
  });

  it('plays a rematch exactly as hard as the first attempt', () => {
    const fight = (round) => {
      const game = pot(4);
      playTo(game, round);
      finishRound(game);
      game.state.offer = null;
      game.primaryAction();
      expect(game.state.phase).toBe('grind');
      const { health, left, scalds, valve, attackTimer, milestone } = game.state.grind;
      return { health, left, scalds, valve, attackTimer, milestone };
    };
    expect(fight(9)).toEqual(fight(5));
  });

  it('keeps the spoon, its upgrades, and the cups through each lost attempt', () => {
    const game = pot(6);
    playTo(game, 5);
    game.state.spoon.polished = 2;
    game.state.lives = 2;
    playPot(game, 8); // lost after rounds 5 and 7
    expect(game.state.spoon.polished).toBe(2);
    expect(game.state.lives).toBe(2);
  });

  it('on victory pays out as before and opens Chapter 2 with the next cup, exactly once', () => {
    const game = pot(1);
    playTo(game, 5);
    finishRound(game);
    game.state.offer = null;
    game.primaryAction();
    game.drainEvents();
    const score = game.state.score;
    finishBonus(game, { win: true });
    expect(game.state.score).toBeGreaterThanOrEqual(score + G.points);
    expect(game.state.goldenSpoon).toBeGreaterThan(0);
    expect(game.state.round).toBe(6);
    expect(game.state.progress).toEqual({ chapter: 2, starts: [1, 6] });
    expect(game.state.grindAfter).toBeNull();
    expect(game.drainEvents().find((e) => e.type === 'roundStart'))
      .toMatchObject({ round: 6, chapter: 2, opens: true, tea: 'chai', debut: true });
    // Later rematches come and go, beaten every time, without opening another chapter.
    const { readings } = playPot(game, 40, { winAt: 0 });
    const rematches = readings.filter((r) => r.grind);
    expect(rematches.length).toBeGreaterThan(1);
    expect(rematches.every((r) => !r.milestone)).toBe(true);
    expect(game.state.progress).toEqual({ chapter: 2, starts: [1, 6] });
    expect(game.drainEvents().filter((e) => e.type === 'roundStart' && e.opens)).toEqual([]);
  });

  it('opens Chapter 2 whenever the machine is finally beaten', () => {
    const game = pot(2);
    playPot(game, 12, { winAt: 9 }); // escapes after 5 and 7, beaten after 9
    expect(game.state.progress).toEqual({ chapter: 2, starts: [1, 10] });
    expect(teaUnlocks(game.state.progress)).toMatchObject({ chai: 10, green: 12, black: 14 });
  });
});

describe('Chapter 2: Things Heat Up', () => {
  it('hurries every new leaf by the chapter’s multiplier, once, and holds it there', () => {
    const a = spawnEnemy({ state: pot(3).state, rng: createRandom(9) });
    const two = chapterTwo(3);
    const b = spawnEnemy({ state: two.state, rng: createRandom(9) });
    expect(TWO.enemySpeed).toBeCloseTo(1.15);
    expect(b.speed / a.speed).toBeCloseTo(TWO.enemySpeed, 9);
    playPot(two, 30, { winAt: 0 }); // rematches beaten along the way
    expect(spawnEnemy({ state: two.state, rng: createRandom(9) }).speed).toBeCloseTo(b.speed, 9);
  });

  it('brings leaves no more often than Chapter 1, and steadily', () => {
    expect(TWO.spawnInterval).toBeGreaterThanOrEqual(ONE.spawnInterval * 0.95);
    const game = chapterTwo(6);
    game.state.modifiers = { ...game.state.modifiers, spawnIntervalMultiplier: 1 };
    game.state.round += 9; // the round number plays no part
    for (const gap of spawnGaps(game, 200)) {
      expect(gap).toBeGreaterThanOrEqual(TWO.spawnInterval * CONFIG.spawning.jitterMin - 1e-9);
      expect(gap).toBeLessThanOrEqual(TWO.spawnInterval * CONFIG.spawning.jitterMax + 1e-9);
    }
  });

  it('serves each new tea in the round it arrives, then mixes it in with the rest', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = chapterTwo(seed);
      const { teas } = playPot(game, 22, { winAt: 0 });
      expect(teas[0]).toBe('chai');
      expect(teas[2]).toBe('green');
      expect(teas[4]).toBe('black');
      // Nothing arrives before its time, and nothing repeats straight away.
      expect(teas.slice(0, 2)).not.toContain('green');
      expect(teas.slice(0, 4)).not.toContain('black');
      for (let i = 1; i < teas.length; i++) expect(teas[i]).not.toBe(teas[i - 1]);
      // Once on tap, every tea keeps turning up.
      for (const id of Object.keys(TEAS)) expect(teas.slice(5)).toContain(id);
    }
  });

  it('starts each new tea at its gentlest, however late in the pot it arrives', () => {
    const C = CONFIG.currents;
    const game = pot(2);
    playPot(game, 16, { winAt: 13 }); // Chapter 2 from round 14: Chai then, Green Tea from round 16
    expect(game.state.tea).toBe('green');
    expect(game.state.teaAge).toBe(1);
    expect(game.state.modifiers.dartChance).toBe(D.chance[0]);
    const leaves = Array.from({ length: 300 }, (_, i) => spawnEnemy({ state: game.state, rng: createRandom(i) }));
    expect(leaves.find((e) => e.kind === 'darter').dart).toMatchObject({ warn: D.warnTime[0], distance: D.dashDistance[0] });
    // Chai's first round, in round 14, gives its longest warnings and calms.
    const chai = pot(2);
    playPot(chai, 14, { winAt: 13 });
    expect(chai.state.tea).toBe('chai');
    expect(chai.state.current).toMatchObject({ wait: C.firstAt[0], warn: C.warnTime[0], calm: C.calmTime[0] });
  });

  it('strengthens a new tea with the rounds since it arrived, not with how often it was served', () => {
    const ages = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      const game = chapterTwo(seed); // Green Tea on tap from round 8
      while (game.state.round < 24) {
        if (game.state.tea === 'green') {
          const age = game.state.round - 8 + 1;
          expect(game.state.teaAge).toBe(age);
          expect(game.state.modifiers.dartChance).toBe(byStage(D.chance, age));
          ages.add(byStage(D.chance, age));
        }
        nextCup(game, { win: true });
      }
    }
    expect(ages).toEqual(new Set(D.chance)); // seen in every stage
  });
});

describe('practice teas (?tea=…)', () => {
  it('brews a pinned tea from the first cup, as if on tap all along, while the chapters run as usual', () => {
    for (const tea of ['green', 'chai', 'black']) {
      const game = createGame({ seed: 3, tea });
      game.primaryAction();
      expect(game.state.tea).toBe(tea);
      expect(game.state.teaAge).toBe(1);
      playTo(game, 7);
      expect(game.state.tea).toBe(tea);
      expect(game.state.teaAge).toBe(7);
      expect(game.state.progress.chapter).toBe(1); // the machine got away: still Chapter 1
    }
    const won = createGame({ seed: 3, tea: 'green' });
    won.primaryAction();
    playTo(won, 6, { win: true });
    expect(won.state.tea).toBe('green');
    expect(won.state.progress.chapter).toBe(2);
  });
});

describe('a fresh pot', () => {
  /** Spill the last cup. */
  function spillOut(game) {
    game.state.lives = 1;
    game.state.strainerLeft = 0;
    placeEnemy(game.state, { radius: CONFIG.arena.rimRadius, speed: 1 });
    step(game, 0.05);
    expect(game.state.phase).toBe('gameover');
  }

  it('forgets every chapter, unlock, and milestone of the last one', () => {
    const game = chapterTwo(9);
    playPot(game, 9, { winAt: 0 });
    expect(game.state.progress.chapter).toBe(2);
    game.pourMilk();
    spillOut(game);
    game.restart();
    const fresh = pot(9);
    for (const key of ['progress', 'grindAfter', 'lastGrind', 'lastHavoc', 'tea', 'teaAge', 'teaServed', 'pulse', 'round', 'target']) {
      expect(game.state[key]).toEqual(fresh.state[key]);
    }
    expect(game.state.grindAfter).toBe(G.milestoneAfter);
    expect([3, 4]).toContain(game.state.havocAfter);
  });

  it('starts from the same place whether the last pot ended early or deep in Chapter 2', () => {
    const short = pot(4);
    const long = chapterTwo(4);
    playPot(long, 12, { winAt: 0 });
    for (const game of [short, long]) {
      spillOut(game);
      game.restart();
    }
    expect(long.state.progress).toEqual(short.state.progress);
    expect(long.state.tea).toBe('house');
    expect(long.state.target).toBe(CONFIG.rounds.baseTarget);
  });

  it('keeps progression through a pause', () => {
    const game = chapterTwo(5);
    const before = JSON.stringify(game.state.progress);
    game.togglePause();
    step(game, 2);
    game.togglePause();
    expect(JSON.stringify(game.state.progress)).toBe(before);
    expect(game.state.phase).toBe('playing');
  });
});
