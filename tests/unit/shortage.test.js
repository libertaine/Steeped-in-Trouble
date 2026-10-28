import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { scheduleNextShortage, shortageDue } from '../../src/gameplay/shortage.js';
import { createProgress } from '../../src/gameplay/progress.js';
import { hudText, errandView, pageMode } from '../../src/ui/hud.js';
import { answerShortage, atShortage, brewNext, completeRound, finishBonus, playTo, playingGame, step } from './helpers.js';

const S = CONFIG.shortage;
const C = CONFIG.teaCash;

/** Finish the round in hand with a single shot (nothing may carry the last leaf away). */
function finishRound(game) {
  game.state.current = null;
  game.state.modifiers = { ...game.state.modifiers, laneDrift: false };
  completeRound(game);
}

/** Leave a reading, noting whether the tea tin turned out to be empty. */
function leaveReading(game, { win = false } = {}) {
  game.state.offer = null;
  game.primaryAction();
  const shortage = game.state.phase === 'shortage';
  answerShortage(game);
  finishBonus(game, { win });
  return shortage;
}

/** Play a pot to the start of `round`; the machine is beaten if `win`. Returns the rounds after which the tea ran out. */
function playPot(game, round, { win = false } = {}) {
  const shortages = [];
  while (game.state.round < round) {
    finishRound(game);
    const at = game.state.round;
    if (leaveReading(game, { win })) shortages.push(at);
  }
  return shortages;
}

describe('when the tea runs out', () => {
  it('first happens straight after round 9’s reading, once Chapter 2 is under way, and once a pot', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = playingGame({ seed });
      expect(playPot(game, 16, { win: true }), `seed ${seed}`).toEqual([S.firstAfter]);
    }
  });

  it('waits for Chapter 2 if the machine is still at large', () => {
    const game = playingGame({ seed: 8 });
    expect(playPot(game, 12)).toEqual([]); // the machine keeps escaping: Chapter 1 throughout
    expect(game.state.shortageAfter).toBe(S.firstAfter); // still waiting
  });

  it('never shares a reading with a milestone boss, and comes at the first reading after one', () => {
    const state = {
      round: 9, shortageAfter: 9, progress: { chapter: 2, starts: [1, 6] }, grindAfter: 9,
    };
    expect(shortageDue(state)).toBe(false); // a (future) milestone is due here
    state.grindAfter = null;
    expect(shortageDue(state)).toBe(true);
    state.progress = createProgress();
    expect(shortageDue(state)).toBe(false); // Chapter 1
  });

  it('comes after the reading’s upgrade choice, and before any hot chocolate decided at the same reading', () => {
    const game = playingGame({ seed: 5 });
    playTo(game, 9, { win: true });
    finishRound(game);
    expect(game.state.offer).not.toBe(null); // round 9 offers an upgrade
    expect(game.state.havocDue).toBe(true);
    game.primaryAction(); // an offer waits for a choice
    expect(game.state.phase).toBe('reading');
    game.state.readingTime = 10;
    const chosen = game.state.offer[0];
    game.chooseUpgrade(0);
    expect(game.state.phase).toBe('shortage');
    expect(game.state.spoon[chosen]).toBe(1);
    answerShortage(game, 'skip');
    expect(game.state.phase).toBe('chocolate');
  });

  it('can be made to come again by setting a repeat interval, without changing the event itself', () => {
    const state = { round: 9, shortageAfter: 9 };
    scheduleNextShortage(state);
    expect(state.shortageAfter).toBe(S.repeatEvery ? 9 + S.repeatEvery : null);
  });

  it('keeps the reading’s fortune, the spoon, the chapter, and the cups while the player decides', () => {
    const game = atShortage(11);
    const kept = ({ nextFortune, spoon, progress, lives, round, goldenSpoon }) =>
      JSON.stringify({ nextFortune, spoon, progress, lives, round, goldenSpoon });
    const before = kept(game.state);
    step(game, 20); // nothing happens while the tin is empty
    expect(game.state.phase).toBe('shortage');
    expect(kept(game.state)).toBe(before);
  });

  it('waits a moment before the choice can be made, so a key still held from the reading can’t make it', () => {
    const game = playingGame({ seed: 6 });
    playTo(game, 9, { win: true });
    finishRound(game);
    game.state.offer = null;
    game.primaryAction();
    expect(game.state.phase).toBe('shortage');
    expect(game.chooseErrand('skip')).toBe(false);
    expect(game.confirm()).toBe(false); // Enter doesn't choose
    expect(errandView(game.state)).toBe(null);
    step(game, S.chooseAt + 0.05);
    expect(errandView(game.state)).not.toBe(null);
    expect(game.chooseErrand('skip')).toBe(true);
  });
});

describe('the three answers', () => {
  it('buy: spends Tea Cash, never points, and adds a sugar burst to the next normal cup', () => {
    const game = atShortage(6);
    const { teaCash, score } = game.state;
    expect(teaCash).toBeGreaterThanOrEqual(S.teaPrice);
    expect(game.chooseErrand('buy')).toBe(true);
    expect(game.state.teaCash).toBe(teaCash - S.teaPrice);
    expect(game.state.score).toBe(score);
    expect(game.chooseErrand('buy')).toBe(false); // no double payment or second restock
    expect(game.state.teaCash).toBe(teaCash - S.teaPrice);
    expect(game.state.phase).toBe('playing');
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + game.state.modifiers.bonusSugar + S.restockSugar);
  });

  it('buy: is refused without enough Tea Cash, and the other answers still work', () => {
    const game = atShortage(6);
    game.state.teaCash = S.teaPrice - 1;
    expect(errandView(game.state).buy.enabled).toBe(false);
    expect(game.chooseErrand('buy')).toBe(false);
    expect(game.state.phase).toBe('shortage');
    expect(game.state.teaCash).toBe(S.teaPrice - 1);
    expect(game.chooseErrand('skip')).toBe(true);
    expect(game.state.phase).toBe('playing');
  });

  it('skip: carries on as normal, with nothing gained or lost', () => {
    const game = atShortage(6);
    const { teaCash, score, lives } = game.state;
    game.chooseErrand('skip');
    expect(game.state).toMatchObject({ phase: 'playing', teaCash, score, lives, extraSugar: 0 });
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + game.state.modifiers.bonusSugar);
  });

  it('run: sets off for the shop', () => {
    const game = atShortage(6);
    expect(game.chooseErrand('run')).toBe(true);
    expect(game.state.phase).toBe('teaRun');
    expect(pageMode(game.state)).toBe('run');
  });

  it('ignores anything that is not one of the answers', () => {
    const game = atShortage(6);
    expect(game.chooseErrand('steal')).toBe(false);
    expect(game.state.phase).toBe('shortage');
  });

  it('keeps a restock for the next normal cup, even with a coffee boss in between', () => {
    const game = atShortage(1); // round 9's reading also wants a rematch
    expect(game.state.grindDue).toBe(true);
    game.chooseErrand('buy');
    expect(game.state.phase).toBe('grind');
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound); // the boss brings its own sugar
    finishBonus(game);
    expect(game.state.phase).toBe('playing');
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound + game.state.modifiers.bonusSugar + S.restockSugar);
    expect(game.state.extraSugar).toBe(0);
  });
});

describe('Tea Cash', () => {
  it('starts every pot at zero and earns a little for each completed round', () => {
    const game = playingGame({ seed: 2 });
    expect(game.state.teaCash).toBe(0);
    finishRound(game);
    expect(game.state.teaCash).toBe(C.round);
    brewNext(game);
    finishRound(game);
    expect(game.state.teaCash).toBe(2 * C.round);
  });

  it('pays extra for beating the milestone boss, but not for losing to it', () => {
    const won = playingGame({ seed: 3 });
    playTo(won, 6, { win: true });
    expect(won.state.teaCash).toBe(5 * C.round + C.milestone);
    const lost = playingGame({ seed: 3 });
    playTo(lost, 6);
    expect(lost.state.teaCash).toBe(5 * C.round);
  });

  it('is enough to buy tea by the first shortage, beaten machine or not', () => {
    for (let seed = 1; seed <= 10; seed++) expect(atShortage(seed).state.teaCash).toBeGreaterThanOrEqual(S.teaPrice);
    // The least it can be: nine rounds and no boss money.
    expect(S.firstAfter * C.round).toBeGreaterThanOrEqual(S.teaPrice);
  });

  it('is never part of the score', () => {
    const game = playingGame({ seed: 4 });
    finishRound(game);
    expect(game.state.score).toBe(CONFIG.scoring.steamKill);
    expect(game.state.teaCash).toBe(C.round);
  });

  it('resets with a new pot', () => {
    const game = atShortage(6);
    game.chooseErrand('skip');
    expect(game.state.teaCash).toBeGreaterThan(0);
    game.state.lives = 0;
    game.state.phase = 'gameover';
    game.restart();
    expect(game.state.teaCash).toBe(0);
    expect(game.state.shortageAfter).toBe(S.firstAfter);
  });

  it('shows in the side panel, and the panel looks ahead to the next cup during the shortage', () => {
    const game = atShortage(6);
    const text = hudText(game.state);
    expect(text.teaCash).toBe(String(game.state.teaCash));
    expect(text.hudStatus).toBe('THE TEA SHORTAGE');
    expect(text.roundNum).toBe('09½');
    expect(text.fortuneLabel).toBe('Fortune for the next cup');
    expect(text.hudAuto).toBe('');
  });
});

describe('a fresh game', () => {
  it('has no shortage in its first rounds', () => {
    const game = createGame({ seed: 1 });
    game.primaryAction();
    expect(game.state).toMatchObject({ teaCash: 0, shortageDue: false, shortage: null, run: null, shortageAfter: S.firstAfter });
  });
});
