import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { LANES, laneAngle, wrapLane } from '../../src/gameplay/arena.js';
import { grindDue, milestoneDue } from '../../src/gameplay/grind.js';
import { spoonLane } from '../../src/gameplay/player.js';
import { hudText } from '../../src/ui/hud.js';
import { brewNext, completeRound, finishBonus, playingGame, step } from './helpers.js';

const G = CONFIG.grind;
const RIM = CONFIG.arena.rimRadius;

/** A game at the end of round 1, with the coffee boss due. */
function readingWithBoss(seed = 1) {
  const game = playingGame({ seed });
  completeRound(game);
  game.state.offer = null;
  game.state.havocDue = false;
  game.state.grindDue = true;
  game.drainEvents();
  return game;
}

/**
 * A game in the fight, with the spoon at the top, no attacks unless a test
 * starts one, and the safety valve open on lane 0 for as long as needed.
 */
function fightingGame(seed = 1) {
  const game = readingWithBoss(seed);
  game.primaryAction(); // the entrance
  game.primaryAction(); // skipped
  const g = game.state.grind;
  g.attackTimer = Infinity;
  Object.assign(g.valve, { lane: 0, from: 0, stage: 'open', time: 0, length: Infinity });
  game.state.angle = laneAngle(0);
  game.drainEvents();
  return game;
}

/** Fire one steam dart down a lane and let it land. */
function steamAt(game, lane) {
  game.state.angle = laneAngle(lane);
  game.state.shotCooldown = 0;
  expect(game.fireSteam()).toBe(true);
  step(game, 0.6);
}

function placeBean(state, { lane = 0, radius = RIM - 12, speed = 60 } = {}) {
  const bean = { id: 99, angle: laneAngle(lane), radius, home: G.bodyRadius + 4, speed, backwash: 0, alpha: 1, shifted: true, spin: 0 };
  state.grind.beans.push(bean);
  return bean;
}

/** Scald the spoon once with a bean, then let it recover. */
function scald(game) {
  placeBean(game.state, { lane: spoonLane(game.state) });
  step(game, 0.2);
  step(game, G.safeTime);
}

const types = (game) => game.drainEvents().map((e) => e.type);

describe('when The Daily Grind happens', () => {
  it('guarantees the first encounter after round 5 in every pot', () => {
    for (let seed = 0; seed < 50; seed++) expect(playingGame({ seed }).state.grindAfter).toBe(G.milestoneAfter);
    expect(G.milestoneAfter).toBe(5);
  });

  it('comes after that round in a real match, between numbered rounds', () => {
    const game = playingGame({ seed: 3 });
    const after = game.state.grindAfter;
    while (game.state.round < after) {
      completeRound(game);
      expect(game.state.grindDue).toBe(false);
      brewNext(game); // through any hot chocolate on the way
    }
    completeRound(game);
    expect(game.state.grindDue).toBe(true);
    game.state.offer = null;
    game.primaryAction();
    expect(game.state.phase).toBe('grind');
    expect(game.state.round).toBe(after); // not a numbered round
  });

  it('as the milestone, takes the reading when Hot Chocolate Havoc wants it too, and the hot chocolate waits one', () => {
    const game = playingGame({ seed: 3 });
    const after = game.state.grindAfter;
    game.state.havocAfter = after; // both want the same reading
    while (game.state.round < after) {
      completeRound(game);
      brewNext(game);
    }
    completeRound(game);
    expect(game.state.havocDue).toBe(false);
    expect(game.state.grindDue).toBe(true);
    game.state.offer = null;
    game.primaryAction();
    expect(game.state.phase).toBe('grind');
    finishBonus(game);
    expect(game.state.round).toBe(after + 1);
    completeRound(game);
    expect(game.state.havocDue).toBe(true);
    expect(game.state.grindDue).toBe(false);
  });

  it('as a rematch once beaten, waits for a later reading rather than share one with Hot Chocolate Havoc', () => {
    const state = { havocDue: true, grindAfter: null, lastGrind: 1, round: 12 };
    expect(grindDue(state, createRandom(1))).toBe(false);
    expect(milestoneDue(state)).toBe(false);
    expect(milestoneDue({ grindAfter: 7, round: 7 })).toBe(true);
    expect(milestoneDue({ grindAfter: 7, round: 6 })).toBe(false);
  });

  it('later on, returns now and then, never within a few rounds of the last, and never with the hot chocolate', () => {
    const rng = createRandom(5);
    const state = { havocDue: false, grindAfter: null, lastGrind: 7, round: 7 };
    const rounds = [];
    for (state.round = 8; state.round < 400; state.round++) {
      state.havocDue = state.round % 5 === 0;
      if (grindDue(state, rng)) {
        expect(state.havocDue).toBe(false);
        rounds.push(state.round);
        state.lastGrind = state.round;
      }
    }
    const gaps = rounds.map((r, i) => r - (rounds[i - 1] ?? 7));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(G.minGap);
    expect(rounds.length).toBeGreaterThan(20);
    expect(rounds.length).toBeLessThan(100);
  });
});

describe('the fight', () => {
  it('runs entrance → fight → result → the next cup', () => {
    const game = readingWithBoss();
    game.primaryAction();
    expect(game.state.phase).toBe('grind');
    expect(game.state.grind.stage).toBe('intro');
    expect(types(game)).toEqual(['grindStart']);
    step(game, G.introTime + 0.05);
    expect(game.state.grind.stage).toBe('fight');
    expect(hudText(game.state).hudStatus).toMatch(/^THE DAILY GRIND · \d+s$/);
    game.state.grind.attackTimer = Infinity; // an idle spoon would be scalded out long before time is up
    step(game, G.duration);
    expect(game.state.grind.stage).toBe('outro');
    expect(game.state.grind.result).toBe('escaped');
    game.primaryAction(); // too soon to dismiss
    expect(game.state.phase).toBe('grind');
    step(game, G.outroMin);
    expect(game.confirm()).toBe(true);
    expect(game.state.phase).toBe('playing');
    expect(game.state.round).toBe(2);
    expect(game.state.grind).toBeNull();
  });

  it('pauses and resumes during the fight, and Enter cannot interrupt it', () => {
    const game = fightingGame();
    expect(game.confirm()).toBe(false);
    game.togglePause();
    expect(game.state.phase).toBe('paused');
    const left = game.state.grind.left;
    step(game, 1);
    expect(game.state.grind.left).toBe(left);
    game.togglePause();
    expect(game.state.phase).toBe('grind');
  });

  it('takes damage from steam down the open valve’s lane, and none anywhere else', () => {
    const game = fightingGame();
    const g = game.state.grind;
    steamAt(game, 0);
    expect(g.health).toBe(G.health - G.steamDamage);
    expect(types(game)).toContain('grindHit');
    steamAt(game, 5);
    expect(g.health).toBe(G.health - G.steamDamage);
    expect(types(game)).toContain('clank');
    g.valve.stage = 'turning';
    g.valve.length = Infinity;
    steamAt(game, 0);
    expect(g.health).toBe(G.health - G.steamDamage);
  });

  it('takes heavier damage from sugar', () => {
    const game = fightingGame();
    game.state.angle = laneAngle(0);
    expect(game.sugarBurst()).toBe(true);
    step(game, 0.6);
    expect(game.state.grind.health).toBe(G.health - G.sugarDamage); // only the middle dart finds the valve
  });

  it('gets angrier and faster as it is damaged', () => {
    const game = fightingGame();
    const g = game.state.grind;
    g.health = Math.ceil(G.health / 2) + 1;
    steamAt(game, 0);
    expect(types(game)).toContain('grindRage');
    expect(g.rage).toBe(1);
  });

  it('lets steam crack beans and milk wash them back', () => {
    const game = fightingGame();
    const g = game.state.grind;
    placeBean(game.state, { lane: 3, radius: 180, speed: 0 });
    steamAt(game, 3);
    expect(g.beans).toHaveLength(0);
    expect(g.tally.beans).toBe(1);
    const bean = placeBean(game.state, { lane: 8, radius: 220, speed: 0 });
    game.state.angle = laneAngle(8);
    expect(game.pourMilk()).toBe(true);
    step(game, 0.6);
    expect(bean.radius).toBeLessThan(150);
  });

  it('warns about every lane a pressure burst will hit, and always the spoon’s', () => {
    const game = fightingGame(11);
    const g = game.state.grind;
    for (let k = 0; k < 20; k++) {
      g.lastAttack = 'barrage';
      g.attackTimer = 0;
      game.state.angle = laneAngle(k % LANES);
      while (!(g.attack?.kind === 'pressure' && g.attack.stage === 'warn')) {
        if (g.attack && g.attack.kind !== 'pressure') {
          g.attack = null;
          g.lastAttack = 'barrage';
          g.attackTimer = 0;
        }
        step(game, 1 / 60);
      }
      expect(g.attack.lanes).toContain(k % LANES);
      expect(g.attack.lanes.length).toBeLessThan(LANES); // somewhere is always safe
      g.attack = null;
    }
  });

  it('scalds a spoon left in a warned lane, and spares one that moves out of it', () => {
    const game = fightingGame();
    const g = game.state.grind;
    g.attack = { kind: 'pressure', stage: 'warn', time: 0, length: 1, lanes: [0, 1, 15], milked: false, reach: 0 };
    step(game, 1.6);
    expect(g.scalds).toBe(1);

    const dodger = fightingGame();
    const d = dodger.state.grind;
    d.attack = { kind: 'pressure', stage: 'warn', time: 0, length: 1, lanes: [0, 1, 15], milked: false, reach: 0 };
    dodger.state.angle = laneAngle(4);
    step(dodger, 1.6);
    expect(d.scalds).toBe(0);
  });

  it('holds off a building pressure attack once when milk is poured', () => {
    const game = fightingGame();
    const g = game.state.grind;
    g.attack = { kind: 'pressure', stage: 'warn', time: 0, length: 1, lanes: [4, 5], milked: false, reach: 0 };
    game.pourMilk();
    expect(types(game)).toContain('sputter');
    step(game, 1.05);
    expect(g.attack.stage).toBe('warn'); // still waiting
    game.pourMilk(); // only once per attack
    expect(types(game)).not.toContain('sputter');
    step(game, G.milkDelay);
    expect(g.attack.stage).toBe('burst');
  });
});

describe('losing to the machine', () => {
  it('lets it escape after three scalds, without costing a cup, an upgrade, the round, or the fortune', () => {
    const game = readingWithBoss();
    const { state } = game;
    state.spoon.polished = 2;
    state.spoon.strainer = 1;
    state.lives = 2;
    state.goldenSpoon = 4;
    state.extraSugar = 1;
    const { round, nextFortune, score } = state;
    game.primaryAction();
    game.primaryAction();
    state.grind.attackTimer = Infinity;
    for (let i = 0; i < G.scalds; i++) scald(game);
    expect(state.grind.stage).toBe('outro');
    expect(state.grind.result).toBe('escaped');
    expect(types(game)).toContain('grindEscape');
    expect(state.lives).toBe(2);
    expect(state.score).toBe(score);
    expect(state.goldenSpoon).toBe(4); // its time stood still
    step(game, G.outroMin);
    game.primaryAction();
    expect(state.phase).toBe('playing');
    expect(state.round).toBe(round + 1);
    expect(state.fortune).toBe(nextFortune);
    expect(state.spoon).toMatchObject({ polished: 2, strainer: 1 });
    expect(state.strainerLeft).toBe(2);
    expect(state.sugarLeft).toBe(CONFIG.sugar.perRound + state.modifiers.bonusSugar + 1); // the promised extra burst
  });

  it('counts only one scald while the spoon recovers', () => {
    const game = fightingGame();
    placeBean(game.state, { lane: 0 });
    placeBean(game.state, { lane: 0, radius: RIM - 20 });
    step(game, 0.4);
    expect(game.state.grind.scalds).toBe(1);
  });

  it('leaves when time runs out', () => {
    const game = fightingGame();
    game.state.grind.left = 0.05;
    step(game, 0.1);
    expect(game.state.grind.result).toBe('escaped');
    expect(game.state.grind.summary.reason).toBe('time');
    expect(game.state.lives).toBe(CONFIG.lives);
  });
});

describe('defeating the machine', () => {
  function nearlyBeaten(seed = 1) {
    const game = fightingGame(seed);
    game.state.grind.health = 1;
    return game;
  }

  it('pays out points and a Golden Spoon whose time starts with the next cup', () => {
    const game = nearlyBeaten();
    const { state } = game;
    state.lives = 2;
    scald(game); // not perfect
    const score = state.score;
    steamAt(game, 0);
    expect(state.grind.result).toBe('victory');
    expect(state.score - score).toBe(G.hitPoints + G.points);
    expect(state.lives).toBe(2);
    expect(state.grind.summary.perfect).toBe(false);
    expect(state.goldenSpoon).toBe(G.goldenSpoon);
    step(game, G.outroMin + 1);
    expect(state.goldenSpoon).toBe(G.goldenSpoon);
    game.primaryAction();
    expect(state.phase).toBe('playing');
    step(game, 1);
    expect(state.goldenSpoon).toBeCloseTo(G.goldenSpoon - 1, 5);
  });

  it('restores a cup for a Perfect Brew', () => {
    const game = nearlyBeaten();
    game.state.lives = 2;
    steamAt(game, 0);
    expect(game.state.grind.summary).toMatchObject({ result: 'victory', perfect: true, cup: true });
    expect(game.state.lives).toBe(3);
  });

  it('never restores more than four cups, and pays a little instead', () => {
    const game = nearlyBeaten();
    game.state.lives = 3;
    steamAt(game, 0);
    expect(game.state.lives).toBe(4);

    const full = nearlyBeaten();
    full.state.lives = G.maxLives;
    const score = full.state.score;
    steamAt(full, 0);
    expect(full.state.lives).toBe(G.maxLives);
    expect(full.state.grind.summary).toMatchObject({ perfect: true, cup: false });
    expect(full.state.score - score).toBe(G.hitPoints + G.points + G.fullCupPoints);
  });

  it('keeps the round, the fortune, and the upgrades, and carries on', () => {
    const game = readingWithBoss();
    const { state } = game;
    state.spoon.quickStir = 1;
    const { round, nextFortune } = state;
    game.primaryAction();
    game.primaryAction();
    state.grind.health = 1;
    state.grind.attackTimer = Infinity;
    Object.assign(state.grind.valve, { lane: 0, stage: 'open', time: 0, length: Infinity });
    steamAt(game, 0);
    step(game, G.outroMin);
    game.primaryAction();
    expect(state.phase).toBe('playing');
    expect(state.round).toBe(round + 1);
    expect(state.fortune).toBe(nextFortune);
    expect(state.spoon.quickStir).toBe(1);
    expect(state.kills).toBe(0);
  });
});

it('leaves the normal rounds exactly as they would have been without it', () => {
  const run = (boss) => {
    const game = readingWithBoss(21);
    game.state.grindDue = boss;
    game.primaryAction();
    finishBonus(game);
    step(game, 6);
    return game.state.enemies.map((e) => [e.angle, e.radius, e.speed]);
  };
  expect(run(true)).toEqual(run(false));
  expect(run(true).length).toBeGreaterThan(2);
});

it('fights with fresh milk and sugar, and the Sugar Scoop counts', () => {
  const game = readingWithBoss();
  game.state.spoon.sugarScoop = 1;
  game.state.milkLeft = 0;
  game.state.sugarLeft = 0;
  game.primaryAction();
  expect(game.state.milkLeft).toBe(CONFIG.milk.perRound);
  expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + 1);
  expect(wrapLane(game.state.grind.valve.lane)).toBe(game.state.grind.valve.lane);
});
