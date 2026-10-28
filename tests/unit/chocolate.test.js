import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { laneAngle } from '../../src/gameplay/arena.js';
import { firstHavocRound, havocDue, toastStage } from '../../src/gameplay/chocolate.js';
import { turnSpeed } from '../../src/gameplay/player.js';
import { hudText } from '../../src/ui/hud.js';
import { completeRound, finishBonus, playingGame, step } from './helpers.js';

const C = CONFIG.chocolate;
const RIM = CONFIG.arena.rimRadius;

/** A game at the end of round 1, with a bonus round due. */
function readingWithBonus(seed = 1) {
  const game = playingGame({ seed });
  completeRound(game);
  game.state.offer = null;
  game.state.havocDue = true;
  game.drainEvents();
  return game;
}

/** A game in the toasting stage with an empty cup and no surprise spawns. */
function toastingGame(seed = 1) {
  const game = readingWithBonus(seed);
  game.primaryAction(); // into the hot chocolate
  game.primaryAction(); // skip the intro
  const c = game.state.chocolate;
  c.marshmallows = [];
  c.spawnTimer = Infinity;
  c.giantTimer = null;
  game.drainEvents();
  return game;
}

function placeMarshmallow(state, props = {}) {
  const lane = props.lane ?? 0;
  const m = {
    id: 1, lane, angle: laneAngle(lane), radius: 200, home: 45, speed: 0, size: C.size, cook: 0, heat: 0,
    burned: false, giant: false, mini: false, hits: 0, push: 0, hop: Infinity, seed: 0, bump: 0, age: 1, ...props,
  };
  state.chocolate.marshmallows.push(m);
  return m;
}

/** Fire one flame down a lane and let it land; `wait` is how long to let things cool afterwards. */
function flameAt(game, lane, wait = 0.3) {
  game.state.angle = laneAngle(lane);
  game.state.shotCooldown = 0;
  expect(game.fireSteam()).toBe(true);
  step(game, wait);
}

const types = (game) => game.drainEvents().map((e) => e.type);

describe('when Hot Chocolate Havoc happens', () => {
  it('guarantees the first bonus after round 3, 4, or 5', () => {
    const seen = new Set();
    for (let seed = 0; seed < 200; seed++) {
      const after = firstHavocRound(createRandom(seed));
      expect(after).toBeGreaterThanOrEqual(3);
      expect(after).toBeLessThanOrEqual(5);
      seen.add(after);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('comes after that round in a real match, and not before', () => {
    const game = playingGame({ seed: 4 });
    const after = game.state.havocAfter;
    for (let round = 1; round <= after; round++) {
      completeRound(game);
      expect(game.state.havocDue).toBe(round === after);
      game.state.offer = null;
      game.primaryAction();
      if (round < after) expect(game.state.phase).toBe('playing');
    }
    expect(game.state.phase).toBe('chocolate');
    expect(game.state.round).toBe(after); // the bonus is not a numbered round
  });

  it('later on, comes now and then, but never within three rounds of the last', () => {
    const rng = createRandom(9);
    const state = { havocAfter: null, lastHavoc: 4, round: 4 };
    const rounds = [];
    for (state.round = 5; state.round < 400; state.round++) {
      if (havocDue(state, rng)) {
        rounds.push(state.round);
        state.lastHavoc = state.round;
      }
    }
    const gaps = rounds.map((r, i) => r - (rounds[i - 1] ?? 4));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(C.minGap);
    expect(rounds.length).toBeGreaterThan(40); // occasional, not never
    expect(rounds.length).toBeLessThan(130); // and not every time it may
  });
});

describe('the bonus round, start to finish', () => {
  it('runs prophecy → toasting → summary → the next cup', () => {
    const game = readingWithBonus();
    game.primaryAction();
    expect(game.state.phase).toBe('chocolate');
    expect(game.state.chocolate.stage).toBe('intro');
    expect(types(game)).toEqual(['chocolateStart']);
    step(game, C.introTime + 0.05);
    expect(game.state.chocolate.stage).toBe('play');
    expect(game.state.chocolate.marshmallows.length).toBeGreaterThanOrEqual(C.openingBatch);
    step(game, C.duration);
    expect(game.state.chocolate.stage).toBe('outro');
    expect(game.state.chocolate.summary).toBeTruthy();
    game.primaryAction(); // too soon: the summary can't be dismissed by accident
    expect(game.state.phase).toBe('chocolate');
    step(game, C.outroMin);
    expect(game.confirm()).toBe(true);
    expect(game.state.phase).toBe('playing');
    expect(game.state.round).toBe(2);
    expect(game.state.chocolate).toBeNull();
  });

  it('lets Enter skip the intro, but not interrupt the toasting', () => {
    const game = readingWithBonus();
    game.primaryAction();
    expect(game.confirm()).toBe(true);
    expect(game.state.chocolate.stage).toBe('play');
    expect(game.confirm()).toBe(false);
    expect(game.state.chocolate.stage).toBe('play');
  });

  it('pauses and resumes during the toasting', () => {
    const game = toastingGame();
    const m = placeMarshmallow(game.state, { speed: 20 });
    game.togglePause();
    expect(game.state.phase).toBe('paused');
    const r = m.radius;
    step(game, 1);
    expect(m.radius).toBe(r);
    expect(game.state.chocolate.left).toBe(C.duration);
    game.togglePause();
    expect(game.state.phase).toBe('chocolate');
    step(game, 0.5);
    expect(m.radius).toBeGreaterThan(r);
  });

  it('shows the bonus in the HUD without counting it as a round', () => {
    const game = toastingGame();
    const hud = hudText(game.state);
    expect(hud.roundNum).toBe('01½');
    expect(hud.hudStatus).toMatch(/^HOT CHOCOLATE HAVOC/);
    expect(hud.fortuneLabel).toBe('Fortune for the next cup');
  });
});

describe('toasting marshmallows', () => {
  it('toasts with well-spaced flames until perfect, then collects it at once', () => {
    const game = toastingGame();
    const m = placeMarshmallow(game.state);
    const score = game.state.score;
    flameAt(game, 0, 0.6);
    expect(toastStage(m)).toBe('raw');
    flameAt(game, 0, 0.6);
    expect(toastStage(m)).toBe('toasted');
    flameAt(game, 0, 0.6);
    expect(game.state.chocolate.marshmallows).toContain(m);
    flameAt(game, 0, 0.6);
    expect(game.state.chocolate.marshmallows).not.toContain(m);
    expect(game.state.score - score).toBe(C.points.perfect);
    expect(game.state.chocolate.tally.perfect).toBe(1);
    expect(types(game)).toContain('perfect');
  });

  it('toasts perfectly with flames about 0.3 s apart', () => {
    const game = toastingGame();
    const m = placeMarshmallow(game.state);
    for (let i = 0; i < C.perfectAt; i++) flameAt(game, 0, 0.31);
    expect(m.burned).toBe(false);
    expect(game.state.chocolate.tally.perfect).toBe(1);
  });

  it('burns a marshmallow that gets too much heat too fast, as holding fire does', () => {
    const game = toastingGame();
    const m = placeMarshmallow(game.state);
    for (let i = 0; i < C.perfectAt; i++) flameAt(game, 0, CONFIG.chocolate.flameCooldown);
    expect(m.burned).toBe(true);
    expect(toastStage(m)).toBe('burned');
    expect(types(game)).toContain('burn');
    // Another flame crumbles it to ash.
    step(game, 0.3);
    flameAt(game, 0);
    expect(game.state.chocolate.marshmallows).not.toContain(m);
    expect(game.state.chocolate.tally.crumbled).toBe(1);
  });

  it('really does burn them when the fire button is simply held down', () => {
    const game = toastingGame();
    const m = placeMarshmallow(game.state);
    game.state.angle = laneAngle(0);
    step(game, 1, { left: false, right: false, fire: true });
    expect(m.burned || game.state.chocolate.tally.crumbled > 0).toBe(true);
    expect(game.state.chocolate.tally.perfect).toBe(0);
  });

  it('scoops marshmallows up at the rim and scores them by how well done they are', () => {
    const game = toastingGame();
    const raw = placeMarshmallow(game.state, { lane: 2, radius: RIM - 5 });
    const toasted = placeMarshmallow(game.state, { lane: 6, radius: RIM - 5, cook: 2 });
    const burned = placeMarshmallow(game.state, { lane: 10, radius: RIM - 5, cook: 2, burned: true });
    const score = game.state.score;
    step(game, 0.05);
    expect(game.state.chocolate.marshmallows).not.toContain(raw);
    expect(game.state.chocolate.marshmallows).not.toContain(toasted);
    expect(game.state.chocolate.marshmallows).not.toContain(burned);
    expect(game.state.score - score).toBe(C.points.raw + C.points.toasted + C.points.burned);
    expect(game.state.chocolate.tally).toMatchObject({ raw: 1, toasted: 1, burned: 1 });
  });

  it('never costs a cup, however many reach the rim', () => {
    const game = toastingGame();
    game.state.lives = 1;
    for (let lane = 0; lane < 16; lane++) placeMarshmallow(game.state, { lane, radius: RIM - 20, speed: 60 });
    step(game, 2);
    expect(game.state.lives).toBe(1);
    expect(game.state.phase).toBe('chocolate');
    expect(types(game)).not.toContain('escape');
  });

  it('inflates the giant marshmallow until it bursts into little ones', () => {
    const game = toastingGame();
    const giant = placeMarshmallow(game.state, { lane: 4, radius: 150, size: C.giantSize, giant: true });
    for (let i = 1; i < C.giantHits; i++) {
      flameAt(game, 4, 0.4);
      expect(giant.hits).toBe(i);
      expect(giant.burned).toBe(false); // no amount of fire burns it
    }
    expect(giant.size).toBeGreaterThan(C.giantSize);
    flameAt(game, 4, 0.4);
    const { marshmallows } = game.state.chocolate;
    expect(marshmallows).not.toContain(giant);
    expect(marshmallows.filter((m) => m.mini)).toHaveLength(C.giantMinis);
    expect(types(game)).toContain('catastrophe');
  });

  it('rewards a great round with bonus points and a sugar burst for the next cup', () => {
    const game = toastingGame();
    game.state.chocolate.tally.perfect = C.greatPerfects;
    const score = game.state.score;
    game.state.chocolate.left = 0.01;
    step(game, 0.05);
    expect(game.state.chocolate.summary).toMatchObject({ grade: 'great', bonus: C.greatBonus, sugar: 1 });
    expect(game.state.score - score).toBe(C.greatBonus);
    game.state.chocolate.time = 5;
    game.primaryAction();
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + game.state.modifiers.bonusSugar + 1);
  });
});

describe('the spoon in the hot chocolate', () => {
  it('fires flames down the aimed lane; Polished Spoon flames fly faster and further', () => {
    const plain = toastingGame();
    flameAt(plain, 3, 0);
    const [flame] = plain.state.chocolate.flames;
    expect(flame.angle).toBeCloseTo(laneAngle(3));
    const polished = toastingGame();
    polished.state.spoon.polished = 2;
    flameAt(polished, 3, 0);
    const [shiny] = polished.state.chocolate.flames;
    expect(shiny.speed).toBeGreaterThan(flame.speed);
    expect(shiny.reach).toBeGreaterThan(flame.reach);
  });

  it('keeps Quick Stir', () => {
    const game = toastingGame();
    game.state.spoon.quickStir = 2;
    const before = game.state.angle;
    step(game, 0.5, { left: false, right: true, fire: false });
    expect(game.state.angle - before).toBeCloseTo(turnSpeed(game.state) * 0.5, 5);
  });

  it('keeps every second of the Golden Spoon, whose flames scorch less', () => {
    const game = readingWithBonus();
    game.state.goldenSpoon = 4;
    game.primaryAction();
    game.primaryAction();
    game.state.chocolate.marshmallows = [];
    game.state.chocolate.spawnTimer = Infinity;
    game.state.chocolate.giantTimer = null;
    const m = placeMarshmallow(game.state);
    // Held fire, at the Golden Spoon's quicker rate: perfect, not burned.
    game.state.angle = laneAngle(0);
    step(game, 1.5, { left: false, right: false, fire: true });
    expect(game.state.chocolate.tally.perfect).toBe(1);
    expect(m.burned).toBe(false);
    expect(game.state.goldenSpoon).toBe(4);
    finishBonus(game);
    expect(game.state.phase).toBe('playing');
    expect(game.state.goldenSpoon).toBeGreaterThan(3.9);
  });
});

describe('returning to the tea', () => {
  it('keeps the upgrade chosen at the reading, the next fortune, and the cups', () => {
    const game = playingGame({ seed: 2 });
    completeRound(game);
    game.state.havocDue = true;
    game.state.lives = 2;
    const fortune = game.state.nextFortune;
    step(game, 3); // until the offer opens
    const pick = game.state.offer[0];
    expect(game.chooseUpgrade(0)).toBe(true);
    expect(game.state.phase).toBe('chocolate');
    expect(game.state.spoon[pick]).toBe(1);
    finishBonus(game);
    expect(game.state.phase).toBe('playing');
    expect(game.state.round).toBe(2);
    expect(game.state.fortune).toBe(fortune);
    expect(game.state.spoon[pick]).toBe(1);
    expect(game.state.lives).toBe(2);
    expect(game.state.target).toBe(CONFIG.rounds.baseTarget + CONFIG.rounds.targetPerRound);
  });

  it('plays the next cup exactly as it would have gone without the bonus', () => {
    const play = (bonus) => {
      const game = createGame({ seed: 77 });
      game.primaryAction();
      completeRound(game);
      game.state.offer = null;
      game.state.havocDue = bonus;
      game.primaryAction();
      if (bonus) {
        step(game, 3, { left: true, right: false, fire: true });
        finishBonus(game);
      }
      step(game, 4, { left: false, right: true, fire: true });
      const { enemies, kills, fortune, round } = game.state;
      return JSON.stringify({ enemies, kills, fortune, round });
    };
    expect(play(true)).toBe(play(false));
  });
});
