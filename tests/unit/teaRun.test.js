import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { normalizeAngle } from '../../src/gameplay/arena.js';
import {
  createRun, obstacleBox, overlapTime, planCourse, press, spoonBox, spoonHeight, updateRun,
} from '../../src/gameplay/teaRun.js';
import { atShortage, completeRound, step } from './helpers.js';

const R = CONFIG.teaRun;
const DT = 1 / 60;

/** A pot whose spoon has just set off for the shop (the announcement skipped). */
function running(seed = 1) {
  const game = atShortage(seed);
  game.chooseErrand('run');
  game.primaryAction();
  game.drainEvents();
  return game;
}

/** A bare errand with only the obstacles given, for the rules on their own. */
function lane(obstacles = [], seed = 1) {
  const events = [];
  const state = { run: createRun(createRandom(seed)), score: 0, teaCash: 0, extraSugar: 0 };
  state.run.stage = 'run';
  state.run.obstacles = obstacles.map((o, id) => ({ id, roll: 0, hitAt: null, ...o }));
  state.run.pickups = [];
  const sim = { state, rng: createRandom(seed), emit: (type, data = {}) => events.push({ type, ...data }) };
  const advance = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) updateRun(sim, DT);
  };
  return { sim, state, run: state.run, events, advance };
}

/**
 * Press the right action for every obstacle, `offset(i)` seconds away from
 * the moment that centres the jump or slide on it (0 = perfect timing).
 */
function autopilot(game, offset = () => 0, dt = DT) {
  const run = game.state.run;
  const pressed = new Set();
  for (let i = 0; i < Math.ceil(60 / dt) && game.state.phase === 'teaRun' && run.stage === 'run'; i++) {
    const front = run.distance + R.spoon.halfWidth;
    for (const ob of run.obstacles) {
      if (pressed.has(ob.id)) continue;
      const O = R.obstacles[ob.kind];
      const length = O.action === 'jump' ? R.jumpTime : R.slideTime;
      const until = (obstacleBox(ob, run.clock).left - front) / (R.speed + ob.roll);
      if (until <= (length - overlapTime(ob.kind)) / 2 + offset(ob.id)) {
        pressed.add(ob.id);
        if (O.action === 'jump') game.jump();
        else game.slide();
      }
      break; // one obstacle at a time, in order
    }
    game.update(dt);
  }
}

describe('the course', () => {
  it('is planned the same from the same seed, and differently from another', () => {
    const plan = (seed) => JSON.stringify(planCourse(createRandom(seed)));
    expect(plan(7)).toBe(plan(7));
    expect(plan(7)).not.toBe(plan(8));
  });

  it('opens with one of each obstacle, spaces them generously, and leaves a clear run to the shop', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { obstacles, finish } = planCourse(createRandom(seed));
      expect(new Set(obstacles.slice(0, 3).map((o) => o.kind)).size).toBe(3);
      expect(obstacles.length).toBeGreaterThanOrEqual(12);
      expect(obstacles[0].at).toBe(R.firstAt);
      for (let i = 1; i < obstacles.length; i++) {
        const gap = obstacles[i].at - obstacles[i - 1].at;
        expect(gap).toBeGreaterThanOrEqual(R.minGap - 1e-9);
        // Early gaps are wider than late ones (before jitter).
        if (obstacles[i].at < 8) expect(gap).toBeGreaterThanOrEqual(R.gapStart - 0.2);
        // Never three of a kind in a row.
        if (i >= 2) expect(new Set(obstacles.slice(i - 2, i + 1).map((o) => o.kind)).size).toBeGreaterThan(1);
      }
      expect(obstacles.at(-1).at).toBeLessThanOrEqual(R.courseTime - R.clearRun);
      expect(finish).toBe(R.speed * R.courseTime);
    }
  });

  it('leaves time for an action, its recovery, and more than half a second to spare between any two', () => {
    const busy = Math.max(R.jumpTime, R.slideTime) + R.recoverTime;
    for (const kind of Object.keys(R.obstacles)) expect(R.minGap - busy).toBeGreaterThan(0.5 + overlapTime(kind) / 2);
  });

  it('takes 30 to 45 seconds from the announcement to the shop at full speed', () => {
    const total = R.introTime + R.courseTime + R.finishTime;
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(45);
    expect(R.timeLimit).toBeGreaterThan(R.courseTime + R.hits * R.tumbleTime);
  });

  it('places every hitbox where its obstacle is drawn, a little inside the edges', () => {
    const cube = { kind: 'sugarCube', x0: 1000, roll: 0 };
    expect(obstacleBox(cube, 0)).toEqual({ left: 1005, right: 1033, bottom: 0, top: 33 });
    const cup = { kind: 'coffeeCup', x0: 1000, roll: 0 };
    expect(obstacleBox(cup, 0)).toMatchObject({ left: 1008, right: 1068, bottom: R.obstacles.coffeeCup.clearance });
    // A rolling cube comes towards the spoon.
    expect(obstacleBox({ ...cube, roll: 45 }, 2).left).toBe(1005 - 90);
  });
});

describe('jumping', () => {
  it('follows the same arc at any frame rate: up, a readable top, and a predictable landing', () => {
    const heights = (dt) => {
      const { sim, run } = lane();
      press(sim, 'jump');
      const at = [];
      for (let t = 0; t < 0.7; t += dt) {
        updateRun(sim, dt);
        at.push([Math.round(run.spoon.time * 1000), spoonHeight(run.spoon)]);
      }
      return at;
    };
    const smooth = heights(1 / 120);
    const choppy = heights(1 / 30);
    const peak = Math.max(...smooth.map(([, h]) => h));
    expect(peak).toBeCloseTo(R.jumpHeight, 0);
    // At the same moment into the jump, the height is the same however the frames fall.
    for (const [ms, h] of choppy) {
      const match = smooth.find(([m]) => m === ms);
      if (match) expect(h).toBeCloseTo(match[1], 6);
    }
    expect(spoonHeight({ action: 'jump', time: R.jumpTime / 2 })).toBe(R.jumpHeight);
  });

  it('lands after jumpTime, then needs a moment before the next jump', () => {
    const { sim, run, advance, events } = lane();
    press(sim, 'jump');
    advance(R.jumpTime + DT);
    expect(run.spoon.action).toBe('run');
    expect(events.map((e) => e.type)).toEqual(['runJump', 'runLand']);
    expect(run.spoon.recover).toBeGreaterThan(0);
  });

  it('remembers a jump pressed just before landing, and takes it as soon as the spoon is ready', () => {
    const { sim, run, advance } = lane();
    press(sim, 'jump');
    advance(R.jumpTime - 0.1);
    press(sim, 'jump');
    expect(run.spoon.queued).toBe('jump');
    advance(0.1 + R.recoverTime + 2 * DT);
    expect(run.spoon.action).toBe('jump');
    expect(run.spoon.time).toBeLessThan(0.05);
  });

  it('forgets a press made too early to matter', () => {
    const { sim, run, advance } = lane();
    press(sim, 'jump');
    advance(0.1);
    press(sim, 'jump'); // half a second before landing: longer than the buffer
    advance(R.jumpTime);
    expect(run.spoon.queued).toBe(null);
    expect(run.spoon.action).toBe('run');
  });
});

describe('sliding', () => {
  it('lowers the spoon for a fixed time, then stands it up again', () => {
    const { sim, run, advance } = lane();
    expect(spoonBox(run).top).toBe(R.spoon.height);
    press(sim, 'slide');
    advance(DT);
    expect(spoonBox(run).top).toBe(R.spoon.slideHeight);
    advance(R.slideTime - 2 * DT);
    expect(run.spoon.action).toBe('slide');
    advance(2 * DT);
    expect(run.spoon.action).toBe('run');
    expect(spoonBox(run).top).toBe(R.spoon.height);
  });

  it('never cuts a jump short: a slide pressed in the air waits for the landing', () => {
    const { sim, run, advance } = lane();
    press(sim, 'jump');
    advance(R.jumpTime - 0.08);
    const before = spoonHeight(run.spoon);
    press(sim, 'slide');
    expect(run.spoon.action).toBe('jump');
    expect(spoonHeight(run.spoon)).toBe(before);
    advance(DT);
    expect(spoonHeight(run.spoon)).toBeLessThan(before); // still coming down
    advance(0.08 + R.recoverTime + DT);
    expect(run.spoon.action).toBe('slide');
  });
});

describe('collisions', () => {
  // An obstacle whose hitbox reaches the spoon's front `inSeconds` from now.
  const ahead = (kind, inSeconds = 1) => {
    const O = R.obstacles[kind];
    return { kind, x0: R.speed * inSeconds + R.spoon.halfWidth - O.inset };
  };

  it('trips a spoon that runs straight into anything', () => {
    for (const kind of Object.keys(R.obstacles)) {
      const { run, advance, events } = lane([ahead(kind)]);
      advance(1.6);
      expect(run.hits).toBe(1);
      expect(events.find((e) => e.type === 'runHit')).toMatchObject({ kind, hits: 1, left: R.hits - 1 });
    }
  });

  it('clears a sugar cube or a puddle with a well-timed jump, but not with a slide', () => {
    for (const kind of ['sugarCube', 'puddle']) {
      const jumped = lane([ahead(kind)]);
      jumped.advance(1 - (R.jumpTime - overlapTime(kind)) / 2);
      press(jumped.sim, 'jump');
      jumped.advance(1.5);
      expect(jumped.run.hits).toBe(0);

      const slid = lane([ahead(kind)]);
      slid.advance(0.9);
      press(slid.sim, 'slide');
      slid.advance(1.5);
      expect(slid.run.hits).toBe(1);
    }
  });

  it('passes under the coffee cup with a slide, but not by jumping into it', () => {
    const slid = lane([ahead('coffeeCup')]);
    slid.advance(1 - (R.slideTime - overlapTime('coffeeCup')) / 2);
    press(slid.sim, 'slide');
    slid.advance(1.5);
    expect(slid.run.hits).toBe(0);

    const jumped = lane([ahead('coffeeCup')]);
    jumped.advance(0.85);
    press(jumped.sim, 'jump');
    jumped.advance(1.5);
    expect(jumped.run.hits).toBe(1);
  });

  it('forgives timing by about a third of a second either way', () => {
    for (const kind of Object.keys(R.obstacles)) {
      const action = R.obstacles[kind].action;
      const length = action === 'jump' ? R.jumpTime : R.slideTime;
      const ideal = 1 - (length - overlapTime(kind)) / 2;
      for (const early of [-0.13, 0.13]) {
        const { sim, run, advance } = lane([ahead(kind)]);
        advance(ideal + early);
        press(sim, action);
        advance(1.5);
        expect(run.hits, `${kind} ${early}`).toBe(0);
      }
    }
  });

  it('knocks the obstacle flat and gives a moment of safety, so one obstacle trips the spoon once', () => {
    const { run, advance } = lane([ahead('puddle', 1), ahead('sugarCube', 1.5)]);
    advance(1.2);
    expect(run.hits).toBe(1);
    expect(run.obstacles[0].hitAt).not.toBe(null);
    expect(run.spoon.safe).toBeGreaterThan(0);
    advance(0.6); // straight through the cube while still dizzy
    expect(run.hits).toBe(1);
    expect(run.obstacles[1].hitAt).toBe(null);
  });

  it('slows the spoon while it tumbles, then lets it run on', () => {
    const { run, advance } = lane([ahead('puddle', 0.5)]);
    advance(0.6);
    const tumbling = run.distance;
    advance(0.1);
    expect(run.distance - tumbling).toBeCloseTo(R.speed * R.tumblePace * 0.1, 0);
    advance(R.tumbleTime);
    const after = run.distance;
    advance(0.1);
    expect(run.distance - after).toBeCloseTo(R.speed * 0.1, 0);
  });
});

describe('a whole errand', () => {
  it.each([1 / 120, 1 / 30, CONFIG.timing.maxFrameSeconds])('can clear varied courses with human timing at a %s second step', (dt) => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = running(seed);
      const rng = createRandom(seed * 31);
      const offsets = game.state.run.obstacles.map(() => rng.range(-0.1, 0.1));
      autopilot(game, (i) => offsets[i], dt);
      expect(game.state.run.result, 'seed ' + seed).toBe('success');
      expect(game.state.run.hits, 'seed ' + seed).toBe(0);
      expect(game.state.run.clock).toBeGreaterThanOrEqual(30);
      expect(game.state.run.clock).toBeLessThanOrEqual(45);
    }
  });

  it.each(['success', 'failed'])('settles collectible points exactly once on %s, with cash and restock only for success', (result) => {
    const { sim, run, state, advance } = lane();
    run.distance = run.finish - 1;
    run.pickups = ['coin', 'packet'].map((kind) => ({ kind, x: run.finish, height: 20, takenAt: null }));
    if (result === 'failed') {
      run.hits = R.hits - 1;
      run.obstacles = [{ kind: 'puddle', x0: run.finish, roll: 0, hitAt: null }];
    }
    updateRun(sim, DT);
    expect(run.result).toBe(result);
    expect(run.summary.points).toBe(15); // one 5-point coin and one 10-point packet
    expect(state.score).toBe(15);
    expect(state.teaCash).toBe(result === 'success' ? 5 : 0);
    expect(state.extraSugar).toBe(result === 'success' ? CONFIG.shortage.restockSugar : 0);
    const settled = { score: state.score, teaCash: state.teaCash, extraSugar: state.extraSugar };
    advance(5);
    expect(state).toMatchObject(settled);
  });

  it('reaches the shop without a stumble when every obstacle is met in time, for any seed', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const game = running(seed);
      autopilot(game);
      const { run } = game.state;
      expect(run.hits, `seed ${seed}`).toBe(0);
      expect(run.result).toBe('success');
      expect(run.clock).toBeCloseTo(R.courseTime, 0);
    }
  });

  it('does not need frame-perfect timing: presses up to a tenth of a second off still clear every obstacle', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const game = running(seed);
      const wobble = createRandom(seed * 31);
      autopilot(game, () => wobble.range(-0.1, 0.1));
      expect(game.state.run.hits, `seed ${seed}`).toBe(0);
    }
  });

  it('replays the same errand from the same seed and the same presses', () => {
    const play = () => {
      const game = running(11);
      autopilot(game, (i) => (i % 4 === 1 ? 0.5 : 0)); // a few deliberate stumbles
      return JSON.stringify(game.state.run);
    };
    expect(play()).toBe(play());
  });

  it('on reaching the shop: restocks one sugar burst for the next cup, and pays a little Tea Cash and points', () => {
    const game = running(3);
    const { teaCash, score, lives } = game.state;
    autopilot(game);
    const { run } = game.state;
    expect(run.stage).toBe('finish');
    expect(run.summary).toMatchObject({ result: 'success', sugar: 1, cash: CONFIG.teaCash.runBonus });
    expect(game.state.teaCash).toBe(teaCash + CONFIG.teaCash.runBonus);
    expect(game.state.score).toBe(score + run.coins * R.coinPoints + run.packets * R.packetPoints);
    expect(game.state.extraSugar).toBe(1);
    expect(game.state.lives).toBe(lives);
  });

  it('keeps its pickups modest: everything on the course is worth less than the round before it', () => {
    const { baseTarget, targetPerRound, maxTarget } = CONFIG.rounds;
    const round = Math.min(maxTarget, baseTarget + (CONFIG.shortage.firstAfter - 1) * targetPerRound) * CONFIG.scoring.steamKill;
    for (let seed = 1; seed <= 10000; seed++) {
      const { pickups } = planCourse(createRandom(seed));
      const most = pickups.reduce((sum, p) => sum + (p.kind === 'coin' ? R.coinPoints : R.packetPoints), 0);
      expect(most, 'seed ' + seed).toBeLessThan(round);
      expect(pickups.length).toBeGreaterThan(0);
    }
  });

  it('ends after three stumbles without a restock or Tea Cash, and never costs a cup', () => {
    const game = running(4);
    const { lives, teaCash, score } = game.state;
    step(game, 30); // no presses at all
    const { run } = game.state;
    expect(run.result).toBe('failed');
    expect(run.summary).toMatchObject({ reason: 'hits', hits: R.hits, sugar: 0, cash: 0 });
    expect(run.stage).toBe('outro');
    expect(game.state.lives).toBe(lives);
    expect(game.state.extraSugar).toBe(0);
    expect(game.state.teaCash).toBe(teaCash);
    expect(game.state.score).toBe(score + run.summary.points); // whatever was picked up is kept
  });

  it('fails if the shop shuts first', () => {
    const game = running(2);
    game.state.run.left = 0.01;
    game.state.run.clock = R.timeLimit - 0.01;
    game.update(DT);
    expect(game.state.run.summary).toMatchObject({ result: 'failed', reason: 'time' });
  });

  it('pauses and resumes exactly where it was', () => {
    const game = running(5);
    step(game, 1);
    game.pause();
    expect(game.state.phase).toBe('paused');
    const frozen = JSON.stringify(game.state.run);
    step(game, 2);
    expect(JSON.stringify(game.state.run)).toBe(frozen);
    expect(game.jump()).toBe(false);
    game.togglePause();
    expect(game.state.phase).toBe('teaRun');
    step(game, 0.5);
    expect(game.state.run.clock).toBeGreaterThan(1.4);
  });

  it('can start straight away with JUMP, and heads home with it once the result has been seen', () => {
    const game = atShortage(6);
    game.chooseErrand('run');
    expect(game.state.run.stage).toBe('intro');
    expect(game.jump()).toBe(true);
    expect(game.state.run.stage).toBe('run');
    while (game.state.run.stage === 'run') game.update(DT); // no more presses: three stumbles
    expect(game.state.run.stage).toBe('outro');
    expect(game.jump()).toBe(false); // the result can't be dismissed by accident
    step(game, R.outroMin + 0.1);
    expect(game.jump()).toBe(true);
    expect(game.state.phase).toBe('playing');
  });
});

describe('returning to the tea', () => {
  it('brews the next cup with the reading’s fortune, the spoon, the cups, and the chapter untouched', () => {
    const game = atShortage(6); // a reading with no bonus round or rematch to follow
    expect([game.state.havocDue, game.state.grindDue]).toEqual([false, false]);
    game.state.spoon.polished = 2;
    const { nextFortune, round, lives, progress } = game.state;
    const chapter = { ...progress };
    game.chooseErrand('run');
    game.primaryAction();
    autopilot(game);
    step(game, R.finishTime + R.outroMin + 0.1);
    game.primaryAction();
    expect(game.state.phase).toBe('playing');
    expect(game.state.round).toBe(round + 1);
    expect(game.state.fortune).toBe(nextFortune);
    expect(game.state.spoon.polished).toBe(2);
    expect(game.state.lives).toBe(lives);
    expect(game.state.progress.chapter).toBe(chapter.chapter);
    expect(game.state.run).toBe(null);
    // The restock arrives with this cup.
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + game.state.modifiers.bonusSugar + 1);
  });

  it('then takes any hot chocolate or coffee boss the reading had decided on', () => {
    const game = atShortage(10);
    // As if the reading had also wanted the hot chocolate.
    game.state.havocDue = true;
    game.chooseErrand('run');
    game.primaryAction();
    step(game, 30);
    step(game, R.outroMin);
    game.primaryAction();
    expect(game.state.phase).toBe('chocolate');
  });

  it('leaves jump and slide behind: they do nothing to the spoon in the cup', () => {
    const game = atShortage(12);
    game.chooseErrand('skip');
    const angle = normalizeAngle(game.state.angle);
    expect(game.jump()).toBe(false);
    expect(game.slide()).toBe(false);
    step(game, 0.2);
    expect(game.state.angle).toBeCloseTo(angle, 9);
  });

  it('never changes the leaves, teas, or fortunes that follow', () => {
    const after = (choice) => {
      const game = atShortage(13);
      game.chooseErrand(choice);
      if (choice === 'run') {
        game.primaryAction();
        step(game, 30); // however the errand goes
        step(game, R.outroMin);
        game.primaryAction();
      }
      game.state.spawnTimer = 0;
      step(game, 3);
      completeRound(game);
      const { tea, nextFortune, enemies } = game.state;
      return JSON.stringify({ tea, nextFortune, enemies: enemies.map((e) => [e.angle, e.speed]) });
    };
    expect(after('run')).toBe(after('skip'));
  });
});
