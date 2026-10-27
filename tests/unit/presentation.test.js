import { describe, expect, it } from 'vitest';
import { createLoop, frameDelta } from '../../src/core/timing.js';
import { createEffects } from '../../src/rendering/effects.js';
import { createTea } from '../../src/rendering/tea.js';
import { hudText, offerCards, spoonKitText } from '../../src/ui/hud.js';
import { OFFER_AT, createGame } from '../../src/core/game.js';
import { brewNext, completeRound, playingGame } from './helpers.js';

describe('frame timing', () => {
  it('converts frame intervals to seconds', () => {
    expect(frameDelta(1016, 1000)).toBeCloseTo(0.016);
  });

  it('caps long gaps so a background tab cannot cause a simulation jump', () => {
    expect(frameDelta(60_000, 0)).toBe(0.04);
  });

  it('ignores negative or invalid intervals', () => {
    expect(frameDelta(900, 1000)).toBe(0);
    expect(frameDelta(Number.NaN, 0)).toBe(0);
  });
});

describe('animation loop', () => {
  function fakeFrames() {
    const queue = new Map();
    let id = 0;
    return {
      requestFrame: (cb) => (queue.set(++id, cb), id),
      cancelFrame: (handle) => queue.delete(handle),
      now: () => 0,
      get pending() {
        return queue.size;
      },
      tick(time) {
        const callbacks = [...queue.values()];
        queue.clear();
        for (const cb of callbacks) cb(time);
      },
    };
  }

  it('never runs two loops when started twice', () => {
    const frames = fakeFrames();
    const steps = [];
    const loop = createLoop((dt) => steps.push(dt), frames);
    loop.start();
    loop.start();
    expect(frames.pending).toBe(1);
    frames.tick(16);
    frames.tick(32);
    expect(steps).toHaveLength(2);
  });

  it('stops cleanly and can restart', () => {
    const frames = fakeFrames();
    const loop = createLoop(() => {}, frames);
    loop.start();
    loop.stop();
    expect(loop.running).toBe(false);
    expect(frames.pending).toBe(0);
    loop.start();
    expect(frames.pending).toBe(1);
  });
});

describe('HUD text', () => {
  it('shows the ready state', () => {
    const text = hudText(createGame({ seed: 1 }).state);
    expect(text).toMatchObject({
      hudStatus: 'READY TO BREW',
      hudScore: 'SCORE 0000',
      hudLives: 'CUPS ♥ ♥ ♥ ',
      roundNum: '01',
      killCount: '0 / 16',
      mainBtn: 'Brew the first cup →',
      fortuneName: 'Not yet written',
    });
  });

  it('shows lost lives and the fortune being read', () => {
    const game = playingGame();
    game.state.lives = 2;
    completeRound(game);
    const text = hudText(game.state);
    expect(text.hudLives).toBe('CUPS ♥ ♥ ♡ ');
    expect(text.hudStatus).toBe('READING THE LEAVES');
    expect(text.fortuneLabel).toBe('Fortune for the next cup');
    expect(text.fortuneName).toBeTruthy();
  });

  it('shows the active fortune in a small omen pill during play only', () => {
    const game = playingGame();
    expect(hudText(game.state).hudOmen).toBe('');
    completeRound(game);
    game.state.nextFortune = 'sugarRush';
    expect(hudText(game.state).hudOmen).toBe('');
    brewNext(game);
    expect(hudText(game.state).hudOmen).toBe('✦ Sugar Rush · sugar regrows · this cup');
    game.sugarBurst();
    expect(hudText(game.state).hudOmen).toMatch(/next lump \ds$/);
  });

  it('shows the strainer, the spoon’s upgrades, and the Golden Spoon', () => {
    const game = playingGame();
    expect(hudText(game.state)).toMatchObject({ hudStrainer: 'STRAINER 1/1', strainerCount: '1 / 1' });
    expect(spoonKitText(game.state)).toBe('An ordinary silver spoon.');
    Object.assign(game.state.spoon, { polished: 1, strainer: 2 });
    game.state.strainerLeft = 2;
    expect(hudText(game.state).hudStrainer).toBe('STRAINER 2/3');
    expect(spoonKitText(game.state)).toBe('✦ Polished ●○○ · ◎ Strainer ●●');
    game.state.goldenSpoon = 4.2;
    expect(hudText(game.state).hudStatus).toBe('✦ GOLDEN SPOON 5s');
    expect(spoonKitText(game.state)).toMatch(/golden, for now$/);
  });

  it('says when the cup is recovering from a spill', () => {
    const game = playingGame();
    game.state.graceTime = 0.5;
    expect(hudText(game.state).hudStatus).toBe('THE CUP RECOVERS');
  });

  it('offers upgrade cards once the fortune is revealed, and asks for a choice', () => {
    const game = playingGame();
    completeRound(game);
    expect(offerCards(game.state)).toBeNull();
    expect(hudText(game.state).mainBtn).toBe('Choose a spoon upgrade (1 / 2)');
    game.state.readingTime = OFFER_AT;
    game.state.offer = ['polished', 'strainer'];
    game.state.spoon.polished = 1;
    expect(offerCards(game.state)).toEqual([
      { id: 'polished', title: 'Polished Spoon ●●○', info: 'Steam travels 20% faster.' },
      { id: 'strainer', title: 'Strainer Attachment ●○', info: 'Catch one more escaping leaf every cup.' },
    ]);
    game.chooseUpgrade(0);
    expect(offerCards(game.state)).toBeNull();
  });

  it('keeps The Leaves Lie’s secret until it confesses', () => {
    const game = playingGame();
    completeRound(game);
    game.state.nextFortune = 'lie';
    expect(hudText(game.state).fortuneName).toBe('Something Wonderful');
    game.state.readingTime = 10;
    expect(hudText(game.state).fortuneName).toBe('The Leaves Lie');
  });
});

describe('effects', () => {
  it('creates particles for kills and a flash for spills without touching game state', () => {
    const effects = createEffects({ random: () => 0.5 });
    const event = Object.freeze({ type: 'kill', radius: 100, angle: 0, sugar: false });
    effects.handle(event);
    expect(effects.fx.particles).toHaveLength(9);
    effects.handle({ type: 'escape', angle: 0 });
    expect(effects.fx.flash).toBe(0.5);
    effects.update(1);
    expect(effects.fx.particles).toHaveLength(0);
    expect(effects.fx.flash).toBe(0);
  });

  it('lets The Leaves Lie play one harmless prank during its round', () => {
    const game = playingGame();
    const effects = createEffects();
    effects.handle({ type: 'roundStart', fortune: 'lie' });
    const before = JSON.stringify(game.state);
    const said = new Set();
    for (let i = 0; i < 60 * 15; i++) {
      effects.update(1 / 60, game.state);
      if (effects.fx.whisper) said.add(effects.fx.whisper.text);
    }
    expect(JSON.stringify(game.state)).toBe(before);
    expect(said.size).toBeGreaterThan(1); // the quote, then the prank's message
  });

  it('glints and scatters leaf fragments when the strainer catches a leaf', () => {
    const effects = createEffects({ random: () => 0.5 });
    effects.handle({ type: 'strain', angle: 1, left: 0, capacity: 1 });
    expect(effects.fx.glints).toHaveLength(1);
    expect(effects.fx.particles.length).toBeGreaterThan(20);
    effects.update(0.1);
    expect(effects.fx.whisper.text).toMatch(/tea strainer/); // explained the first time
    effects.update(1);
    expect(effects.fx.glints).toHaveLength(0);
  });

  it('makes the spoon briefly enormous for The Leaves Lie, then puts it back', () => {
    const game = playingGame();
    const effects = createEffects();
    const before = JSON.stringify(game.state);
    effects.prank('bigSpoon');
    let biggest = 1;
    for (let i = 0; i < 60 * 4; i++) {
      effects.update(1 / 60, game.state);
      biggest = Math.max(biggest, effects.fx.spoonScale);
    }
    expect(biggest).toBeGreaterThan(2.5);
    expect(effects.fx.spoonScale).toBe(1);
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it('clears particles when a round starts', () => {
    const effects = createEffects();
    effects.handle({ type: 'milk', angle: 0 });
    effects.handle({ type: 'roundStart' });
    expect(effects.fx.particles).toHaveLength(0);
  });
});

describe('living tea', () => {
  const EVENTS = ['roundStart', 'steam', 'sugar', 'sugarRegen', 'milk', 'kill', 'drift', 'escape', 'strain', 'recoil',
    'goldenAppear', 'goldenCatch', 'goldenGone', 'goldenSpoon', 'goldenSpoonEnd', 'prismaticAppear', 'prismaticCatch',
    'prismaticGone', 'nova', 'reading', 'reveal', 'retract', 'upgrade', 'gameover']
    .map((type) => ({
      type, angle: 1, cloud: 1, radius: 120, sugar: type === 'kill', twin: true, fortune: 'golden', reward: 'jackpot',
      id: 'polished', level: 1, count: 32,
    }));
  const PRANKS = ['tint', 'bigBubble', 'sugarShower', 'whirlpool', 'biscuit', 'bigSpoon', 'nothing']
    .map((kind) => ({ type: 'prank', kind, color: '#2f7fe0' }));

  it('reacts to every event without touching game state and keeps its effects bounded', () => {
    const game = playingGame();
    const before = JSON.stringify(game.state);
    const { liquid, handle, update } = createTea({ random: () => 0.5 });
    for (let i = 0; i < 600; i++) {
      for (const event of [...EVENTS, ...PRANKS]) handle(event);
      update(1 / 60, game.state);
    }
    expect(JSON.stringify(game.state)).toBe(before);
    expect(liquid.ripples.length).toBeLessThanOrEqual(40);
    expect(liquid.crystals.length).toBeLessThanOrEqual(320);
    expect(Number.isFinite(liquid.flow)).toBe(true);
  });

  it('settles to a standstill while paused', () => {
    const game = playingGame();
    const { liquid, update } = createTea();
    game.pause();
    for (let i = 0; i < 120; i++) update(1 / 60, game.state);
    const { time, flow } = liquid;
    update(1 / 60, game.state);
    expect(liquid.time).toBe(time);
    expect(liquid.flow).toBe(flow);
  });
});
