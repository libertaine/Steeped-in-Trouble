import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { OFFER_AT, readingReadyAt } from '../../src/core/game.js';
import { FORTUNES } from '../../src/gameplay/fortunes.js';
import { hudText, offerCards } from '../../src/ui/hud.js';
import { completeRound, playingGame } from './helpers.js';

describe('ceremony and reading choices share the existing game authority', () => {
  it('keeps normal offer timing and applies exactly one choice without another confirmation', () => {
    const game = playingGame();
    completeRound(game);
    Object.assign(game.state, { nextFortune: 'veil', offer: ['polished', 'strainer'], readingTime: OFFER_AT - 0.01 });
    expect(offerCards(game.state)).toBeNull();
    expect(game.chooseUpgrade(0)).toBe(false);
    game.update(0.02);
    expect(readingReadyAt(game.state)).toBe(OFFER_AT);
    expect(offerCards(game.state)).toHaveLength(2);
    expect(hudText(game.state).compactEffect).toBe(FORTUNES.veil.effect);
    expect(game.chooseUpgrade(1)).toBe(true);
    expect(game.chooseUpgrade(0)).toBe(false);
    expect(game.state).toMatchObject({ phase: 'playing', round: 2, fortune: 'veil', spoon: { strainer: 1, polished: 0 } });
    expect(game.drainEvents().filter(e => e.type === 'upgrade')).toHaveLength(1);
  });

  it('preserves reveal and retraction events and protects the whole Lie glyph change', () => {
    const game = playingGame();
    completeRound(game);
    Object.assign(game.state, { nextFortune: 'lie', offer: ['polished', 'strainer'], readingTime: 0 });
    game.drainEvents();
    game.update(CONFIG.fortunes.revealAt);
    expect(game.drainEvents().map(e => e.type)).toEqual(['reveal']);
    expect(game.chooseUpgrade(0)).toBe(false);
    expect(hudText(game.state).readingAnnouncement).not.toContain('The Leaves Lie');
    game.update(CONFIG.fortunes.lieRetractAt - CONFIG.fortunes.revealAt);
    expect(game.drainEvents().map(e => e.type)).toEqual(['retract']);
    expect(game.chooseUpgrade(1)).toBe(false);
    expect(hudText(game.state).compactEffect).toBe('');
    game.state.readingTime = readingReadyAt(game.state);
    expect(hudText(game.state).readingAnnouncement).toContain(FORTUNES.lie.effect);
    expect(game.chooseUpgrade(1)).toBe(true);
    expect(game.state.fortune).toBe('lie');
  });

  it('consumes early Enter on a Lie without an offer, then continues normally', () => {
    const game = playingGame();
    completeRound(game);
    Object.assign(game.state, { nextFortune: 'lie', offer: null, readingTime: OFFER_AT });
    expect(game.confirm()).toBe(true);
    expect(game.state.phase).toBe('reading');
    game.state.readingTime = readingReadyAt(game.state);
    expect(game.confirm()).toBe(true);
    expect(game.state).toMatchObject({ phase: 'playing', fortune: 'lie' });
  });

  it('keeps the completed cup separate from its pending fortune and includes earned secrets', () => {
    const game = playingGame();
    completeRound(game);
    Object.assign(game.state, { fortune: 'star', nextFortune: 'sugarRush', readingTime: 10, secrets: ['notADropWasted'] });
    const text = hudText(game.state);
    expect(text.activeFortune).toContain(FORTUNES.star.effect);
    expect(text.compactFortune).toBe('Next cup: Sugar Rush');
    expect(text.readingQuote).toContain(FORTUNES.sugarRush.quote);
    expect(text.compactEffect).toBe(FORTUNES.sugarRush.effect);
    expect(text.readingSecrets).toContain('Not a drop wasted.');
    expect(text.hudOmen).toBe('');
  });
});
