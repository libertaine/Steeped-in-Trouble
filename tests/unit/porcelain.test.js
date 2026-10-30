import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { laneAngle, normalizeAngle } from '../../src/gameplay/arena.js';
import { awardGolden } from '../../src/gameplay/golden.js';
import { rollGoldenLeaf, spawnGoldenLeaf, updateGoldenLeaf } from '../../src/gameplay/goldenLeaf.js';
import {
  activeCracks, crackCup, createPorcelain, cupCondition, fractureSeed, restoreLife,
} from '../../src/gameplay/porcelain.js';
import { fractureShape, shardBounds } from '../../src/rendering/porcelain.js';
import { createEffects } from '../../src/rendering/effects.js';
import { hudText } from '../../src/ui/hud.js';
import { brewNext, completeRound, placeEnemy, playingGame, step } from './helpers.js';
import { undefended } from '../support/legacyPlay.js';
import legacy from '../fixtures/pot-0.16.0.json' with { type: 'json' };

const G = CONFIG.golden;
const kinds = (state) => state.porcelain.fractures.map((f) => f.kind);

/** A genuine damaging escape down `lane`; the grace period is allowed to pass. */
function spill(game, lane) {
  const s = game.state;
  Object.assign(s, { strainerLeft: 0, graceTime: 0 });
  placeEnemy(s, { lane, radius: CONFIG.arena.rimRadius - 5, speed: 60 });
  const lives = s.lives;
  for (let i = 0; i < 60 && s.lives === lives; i++) game.update(1 / 60);
  if (s.phase === 'playing') step(game, CONFIG.grace.duration + 0.05);
  return game.drainEvents();
}

/** Call up this cup's Golden Leaf now, through the real update. */
function offerLeaf(game) {
  game.state.goldenLeafTimer = 0.001;
  game.update(1 / 60);
  return game.state.goldenLeaf;
}

function steamLeaf(game) {
  const s = game.state;
  s.angle = s.goldenLeaf.home;
  s.shotCooldown = 0;
  game.fireSteam();
  for (let i = 0; i < 90 && s.goldenLeaf; i++) game.update(1 / 60);
  return game.drainEvents();
}

const lifeRoll = { next: () => G.jackpotChance + G.goldenSpoonChance + G.lifeChance / 2 };

describe('the cup’s condition', () => {
  it('names each life count, and keeps the numbers in the simulation', () => {
    expect([4, 3, 2, 1, 0].map((n) => cupCondition(n).label)).toEqual([
      'REINFORCED', 'CUP STABLE', 'PORCELAIN CRACKED', 'STRUCTURAL FAILURE IMMINENT', 'SHATTERED']);
    const game = playingGame();
    expect(game.state.lives).toBe(3);
    expect(game.state.porcelain).toEqual({ serial: 0, fractures: [] });
    expect(hudText(game.state)).toMatchObject({ hudLives: 'CUP STABLE', cupStatus: 'Cup condition: Cup stable.' });
  });

  it('cracks where a leaf spills, one crack per lost cup, and calls the second critical', () => {
    const game = playingGame();
    const events = spill(game, 5);
    const escape = events.find((e) => e.type === 'escape');
    expect(escape).toMatchObject({ lives: 2, fracture: { id: 0, kind: 'crack' } });
    expect(game.state.porcelain.fractures[0].angle).toBeCloseTo(normalizeAngle(laneAngle(5)));
    expect(hudText(game.state).hudLives).toBe('PORCELAIN CRACKED');
    spill(game, 12);
    expect(game.state.lives).toBe(1);
    expect(kinds(game.state)).toEqual(['crack', 'crack']);
    expect(game.state.porcelain.fractures[1].angle).toBeCloseTo(normalizeAngle(laneAngle(12)));
    expect(hudText(game.state)).toMatchObject({ hudLives: 'STRUCTURAL FAILURE IMMINENT',
      cupStatus: 'Cup condition: Structural failure imminent: one more spill breaks the cup.' });
  });

  it('never cracks for the strainer, the recovering cup, Karma, or a kill', () => {
    const game = playingGame();
    game.state.strainerLeft = 1;
    placeEnemy(game.state, { lane: 2, radius: CONFIG.arena.rimRadius - 5, speed: 60 });
    step(game, 0.5);
    expect(game.drainEvents().some((e) => e.type === 'strain')).toBe(true);
    game.state.graceTime = 1;
    placeEnemy(game.state, { lane: 4, radius: CONFIG.arena.rimRadius - 5, speed: 60 });
    step(game, 0.3);
    expect(game.drainEvents().some((e) => e.type === 'recoil')).toBe(true);
    game.state.modifiers = { ...game.state.modifiers, karma: true };
    Object.assign(game.state, { graceTime: 0, strainerLeft: 0 });
    placeEnemy(game.state, { lane: 6, radius: CONFIG.arena.rimRadius - 5, speed: 60 });
    step(game, 3);
    completeRound(game);
    expect(game.state.lives).toBe(3);
    expect(game.state.porcelain.fractures).toEqual([]);
  });

  it('only chips the glaze when a bonus fourth cup is lost', () => {
    const game = playingGame();
    expect(awardGolden({ state: game.state, rng: lifeRoll, emit: () => {} })).toMatchObject({ reward: 'life' });
    expect(game.state.lives).toBe(4);
    expect(hudText(game.state).hudLives).toBe('REINFORCED');
    spill(game, 3);
    expect(game.state.lives).toBe(3);
    expect(kinds(game.state)).toEqual(['chip']);
    expect(hudText(game.state).hudLives).toBe('CUP STABLE');
    spill(game, 9);
    expect(kinds(game.state)).toEqual(['chip', 'crack']);
  });

  it('breaks on the last cup, and a new pot brings a whole cup', () => {
    const game = playingGame();
    for (const lane of [1, 6]) spill(game, lane);
    const events = spill(game, 11);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['escape', 'gameover']));
    expect(game.state.phase).toBe('gameover');
    expect(kinds(game.state)).toEqual(['crack', 'crack', 'crack']);
    expect(hudText(game.state).hudLives).toBe('SHATTERED');
    game.restart();
    expect(game.state).toMatchObject({ lives: 3, porcelain: { serial: 0, fractures: [] } });
  });

  it('keeps every leaf path and every spill exactly as 0.16.0 did', () => {
    for (const [seed, expected] of Object.entries(legacy.undefended)) {
      const game = createGame({ seed: Number(seed) });
      game.primaryAction();
      expect(undefended(game)).toEqual(expected);
    }
  });

  it('keeps history bounded, and never forgets an active crack', () => {
    const state = { lives: 3, porcelain: createPorcelain() };
    for (let i = 0; i < 40; i++) {
      state.lives--;
      crackCup(state, i * 0.7);
      restoreLife({ state }, 3, 'goldenLeaf');
    }
    state.lives = 1;
    crackCup(state, 1);
    crackCup(state, 2);
    expect(state.porcelain.fractures.length).toBeLessThanOrEqual(CONFIG.porcelain.maxFractures);
    expect(activeCracks(state.porcelain)).toBe(2);
    expect(state.porcelain.serial).toBe(42);
  });
});

describe('crack shapes', () => {
  it('are fixed by each fracture, drawn from no gameplay stream', () => {
    const f = { id: 3, kind: 'crack', angle: 1.2, seed: fractureSeed(3, 1.2) };
    expect(fractureShape(f)).toEqual(fractureShape({ ...f }));
    expect(fractureShape(f)).not.toEqual(fractureShape({ ...f, seed: fractureSeed(4, 1.2) }));
    expect(fractureSeed(3, 1.2)).toBe(fractureSeed(3, 1.2 + Math.PI * 2));
    const game = playingGame({ seed: 4 });
    const before = JSON.stringify(game.exportRandom());
    spill(game, 7);
    fractureShape(game.state.porcelain.fractures[0]);
    shardBounds(game.state.porcelain);
    expect(JSON.stringify(game.exportRandom())).toBe(before);
  });

  it('stay within the porcelain and a sliver of tea, and branch further only when critical', () => {
    const rim = CONFIG.arena.rimRadius;
    for (let id = 0; id < 50; id++) {
      const shape = fractureShape({ id, kind: 'crack', angle: id, seed: fractureSeed(id, id) });
      const points = [shape.main, ...shape.branches.map((b) => b.path)].flat();
      for (const [r] of points) expect(r >= rim - 16 && r <= rim + 36).toBe(true);
      expect(shape.branches.some((b) => b.level === 2)).toBe(true);
    }
  });
});

describe('the Golden Leaf', () => {
  const stub = (values) => {
    let i = 0;
    return { draws: () => i, next: () => values[i++ % values.length], range: (a, b) => a + values[i++ % values.length] * (b - a) };
  };

  it('is never offered to an undamaged cup, and never draws for one', () => {
    const rng = stub([0]);
    expect(rollGoldenLeaf({ lives: 3 }, rng)).toBeNull();
    expect(rollGoldenLeaf({ lives: 4 }, rng)).toBeNull();
    expect(rng.draws()).toBe(0);
  });

  it('is offered to a cracked cup at the configured chance, drawing twice either way', () => {
    const under = stub([CONFIG.goldenLeaf.chance - 1e-9, 0.5]);
    expect(rollGoldenLeaf({ lives: 2 }, under)).toBeCloseTo((CONFIG.goldenLeaf.delayMin + CONFIG.goldenLeaf.delayMax) / 2);
    const at = stub([CONFIG.goldenLeaf.chance, 0.5]);
    expect(rollGoldenLeaf({ lives: 1 }, at)).toBeNull();
    expect(under.draws()).toBe(2);
    expect(at.draws()).toBe(2);
  });

  it('comes up about as often as configured, once a cup at most', () => {
    const rng = createRandom(77);
    let offered = 0;
    for (let i = 0; i < 20000; i++) if (rollGoldenLeaf({ lives: 2 }, rng) !== null) offered++;
    expect(offered / 20000).toBeCloseTo(CONFIG.goldenLeaf.chance, 2);
    const game = playingGame({ seed: 2 });
    spill(game, 4);
    offerLeaf(game);
    game.drainEvents();
    step(game, CONFIG.goldenLeaf.life + 0.2);
    expect(game.state.goldenLeaf).toBeNull();
    expect(game.state.goldenLeafTimer).toBeNull();
    step(game, 20);
    expect(game.drainEvents().filter((e) => e.type === 'goldenLeafAppear')).toEqual([]);
  });

  it('sinks if missed, at no cost', () => {
    const game = playingGame({ seed: 3 });
    spill(game, 4);
    offerLeaf(game);
    const before = { lives: game.state.lives, score: game.state.score, kills: game.state.kills, porcelain: structuredClone(game.state.porcelain) };
    step(game, CONFIG.goldenLeaf.life + 0.1);
    expect(game.drainEvents().find((e) => e.type === 'goldenLeafGone')).toMatchObject({ mended: false });
    expect({ lives: game.state.lives, score: game.state.score, kills: game.state.kills, porcelain: game.state.porcelain }).toEqual(before);
  });

  it('mends one crack with gold when steamed, restoring exactly one cup and nothing else', () => {
    const game = playingGame({ seed: 5 });
    spill(game, 4);
    spill(game, 10);
    const leaf = offerLeaf(game);
    expect(leaf.radius).toBeGreaterThan(100);
    const s = game.state;
    const before = { score: s.score, kills: s.kills, target: s.target, residue: s.residue.length, tea: s.tea, fortune: s.fortune,
      steamKills: s.roundStats.steamKills, enemies: s.enemies.length, chapter: s.progress.chapter, offer: s.offer };
    const events = steamLeaf(game);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['goldenLeafCatch', 'mend']));
    expect(events.find((e) => e.type === 'mend')).toMatchObject({ source: 'goldenLeaf', id: 1, lives: 2 });
    expect(s.lives).toBe(2);
    expect(kinds(s)).toEqual(['crack', 'seam']);
    expect({ score: s.score, kills: s.kills, target: s.target, residue: s.residue.length, tea: s.tea, fortune: s.fortune,
      steamKills: s.roundStats.steamKills, enemies: s.enemies.length, chapter: s.progress.chapter, offer: s.offer }).toEqual(before);
    expect(s.roundStats.wastedVolleys).toBe(0); // a hit, like any bonus target
    expect(s.modifiers.enemySpeedMultiplier).toBe(1);
  });

  it('gives way if the cup is mended some other way first, and can never lift the cup above three', () => {
    const game = playingGame({ seed: 6 });
    spill(game, 4);
    offerLeaf(game);
    expect(awardGolden({ state: game.state, rng: lifeRoll, emit: () => {} }).reward).toBe('life');
    expect(game.state.lives).toBe(3);
    game.update(1 / 60);
    expect(game.state.goldenLeaf).toBeNull();
    expect(game.drainEvents().find((e) => e.type === 'goldenLeafGone')).toMatchObject({ mended: true });
    expect(restoreLife({ state: game.state }, CONFIG.lives, 'goldenLeaf')).toBe(false);
    expect(game.state.lives).toBe(3);
    expect(kinds(game.state)).toEqual(['seam']);
  });

  it('mends once per leaf: a second dart passes straight through where it was', () => {
    const game = playingGame({ seed: 7 });
    spill(game, 4);
    spill(game, 9);
    offerLeaf(game);
    const s = game.state;
    s.modifiers = { ...s.modifiers, twinSteam: true }; // Double Trouble: two darts, one volley
    const events = steamLeaf(game);
    step(game, 1);
    expect(events.filter((e) => e.type === 'mend')).toHaveLength(1);
    expect(s.lives).toBe(2);
    expect(s.roundStats.wastedVolleys).toBe(0);
  });

  it('keeps its gold seams for the rest of the pot', () => {
    const game = playingGame({ seed: 8 });
    spill(game, 4);
    offerLeaf(game);
    steamLeaf(game);
    for (let i = 0; i < 4; i++) {
      game.state.spawnTimer = Infinity;
      completeRound(game);
      brewNext(game);
    }
    expect(kinds(game.state)).toEqual(['seam']);
    expect(game.state.lives).toBe(3);
  });

  it('cannot be spawned by anything but its own stream', () => {
    const game = playingGame({ seed: 9 });
    spill(game, 4);
    const before = game.exportRandom();
    const leafRng = createRandom(123);
    spawnGoldenLeaf({ state: game.state, rng: leafRng, emit: () => {} });
    updateGoldenLeaf({ state: game.state, rng: leafRng, emit: () => {} }, 1 / 60);
    expect(game.exportRandom()).toEqual(before);
  });
});

describe('other ways back', () => {
  it('a golden cube still gives a fourth cup from a whole one, and mends a crack below that', () => {
    const whole = playingGame();
    awardGolden({ state: whole.state, rng: lifeRoll });
    expect(whole.state).toMatchObject({ lives: 4, porcelain: { fractures: [] } });
    const cracked = playingGame();
    spill(cracked, 3);
    const events = [];
    awardGolden({ state: cracked.state, rng: lifeRoll, emit: (type, data) => events.push({ type, ...data }) });
    expect(cracked.state.lives).toBe(3);
    expect(kinds(cracked.state)).toEqual(['seam']);
    expect(events).toEqual([expect.objectContaining({ type: 'mend', source: 'goldenCube' })]);
  });

  it('a Perfect Brew still restores up to four cups, and mends a crack when it does', () => {
    const state = { lives: 2, porcelain: createPorcelain() };
    crackCup(state, 1);
    state.lives = 1;
    crackCup(state, 2);
    for (const lives of [2, 3, 4]) {
      expect(restoreLife({ state }, CONFIG.grind.maxLives, 'grind')).toBe(true);
      expect(state.lives).toBe(lives);
    }
    expect(restoreLife({ state }, CONFIG.grind.maxLives, 'grind')).toBe(false);
    expect(kinds(state)).toEqual(['seam', 'seam']);
  });
});

describe('presentation', () => {
  it('flashes, shimmers and breaks without touching the game, and freezes while paused', () => {
    const game = playingGame({ seed: 10 });
    const effects = createEffects({ random: createRandom(1).next });
    const play = (events) => events.forEach((e) => effects.handle(e));
    play(spill(game, 4));
    offerLeaf(game);
    play(game.drainEvents());
    play(steamLeaf(game));
    expect(effects.fx.mends).toHaveLength(1);
    const before = JSON.stringify(game.state);
    game.pause();
    const paused = { mends: structuredClone(effects.fx.mends), clock: effects.fx.cupClock };
    effects.update(0.5, game.state);
    expect({ mends: effects.fx.mends, clock: effects.fx.cupClock }).toEqual(paused);
    game.resume();
    effects.update(2, game.state);
    expect(effects.fx.mends).toEqual([]);
    for (const lane of [2, 6, 10]) play(spill(game, lane));
    expect(effects.fx.shatter).toEqual({ age: 0 });
    effects.update(0.4, game.state);
    expect(effects.fx.shatter.age).toBeCloseTo(0.4);
    expect(JSON.stringify(game.state)).not.toBe(before);
    play([{ type: 'matchStart' }]);
    expect(effects.fx.shatter).toBeNull();
  });
});

describe('a long seeded pot', () => {
  it('keeps lives and porcelain in step through spills, leaves, cubes and repairs', () => {
    let mended = 0, spilled = 0;
    for (const seed of [11, 12, 13]) {
      const game = createGame({ seed });
      game.primaryAction();
      let repairs = 0, catches = 0, leavesThisCup = 0;
      for (let i = 0; i < 60 * 60 * 6; i++) {
        const s = game.state;
        // Defend loosely, and chase a Golden Leaf when there is one.
        const leaf = s.goldenLeaf;
        const target = leaf ? leaf.home : s.enemies.reduce((a, e) => (!a || e.radius > a.radius ? e : a), null)?.angle;
        const d = target === undefined ? 0 : Math.atan2(Math.sin(target - s.angle), Math.cos(target - s.angle));
        const idle = i % 900 >= 600 && !leaf; // a third of the time the spoon looks away
        game.update(1 / 60, idle ? undefined : { left: d < -0.05, right: d > 0.05, fire: i % 3 === 0 });
        if (game.offerOpen()) game.chooseUpgrade(0);
        else if (s.phase === 'reading' && s.readingTime > 3) game.primaryAction();
        if (s.phase === 'shortage' && s.shortage.time > 2) game.chooseErrand('skip');
        if (s.phase === 'arcadeOffer') game.chooseInterlude(false);
        if (s.phase === 'day') game.chooseDay('keep');
        // The bonus rounds play out; only their introductions and results are hurried along.
        const bonus = s.chocolate ?? s.grind;
        if (['chocolate', 'grind'].includes(s.phase) && !['play', 'fight'].includes(bonus.stage)) game.primaryAction();
        if (s.phase === 'gameover') game.primaryAction();
        for (const e of game.drainEvents()) {
          if (e.type === 'roundStart' || e.type === 'matchStart') leavesThisCup = 0;
          if (e.type === 'goldenLeafAppear') leavesThisCup++;
          if (e.type === 'goldenLeafCatch') catches++;
          if (e.type === 'mend' && e.source === 'goldenLeaf') repairs++;
          if (e.type === 'escape') spilled++;
        }
        expect(leavesThisCup).toBeLessThanOrEqual(1);
        expect(s.lives).toBeGreaterThanOrEqual(0);
        expect(s.lives).toBeLessThanOrEqual(CONFIG.grind.maxLives);
        if (s.phase !== 'gameover') expect(activeCracks(s.porcelain)).toBe(Math.max(0, CONFIG.lives - s.lives));
        expect(s.porcelain.fractures.length).toBeLessThanOrEqual(CONFIG.porcelain.maxFractures);
      }
      expect(repairs).toBe(catches);
      mended += repairs;
    }
    expect(spilled).toBeGreaterThan(10); // the pots really were tested…
    expect(mended).toBeGreaterThan(0); // …and really were mended
  });
});
