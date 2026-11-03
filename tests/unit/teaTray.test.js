// The Tea Tray (#14): one-cup treats that keep a late upgrade offer a choice.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { PHASE } from '../../src/core/state.js';
import { migrateCheckpoint, validateCheckpoint } from '../../src/core/checkpoint.js';
import { TRAY, fillFromTray, usableTray } from '../../src/gameplay/teaTray.js';
import { UPGRADES, createSpoon, strainerCapacity } from '../../src/gameplay/upgrades.js';
import { sugarCapacity } from '../../src/gameplay/weapons.js';
import { offerCards } from '../../src/ui/hud.js';
import { answerShortage, completeRound, finishGrind, playingGame, playTo } from './helpers.js';
import { V5_KEYS, omit } from '../support/legacyPlay.js';

const FULL = Object.freeze(Object.fromEntries(Object.entries(UPGRADES).map(([id, u]) => [id, u.max])));
const reading = (round, extra = {}) => ({ round, nextFortune: 'star', grindDue: false, ...extra });

/** A pot at an offer reading with the spoon already as good as it gets (or as `spoon` says). */
function offerReading({ seed = 1, spoon = FULL } = {}) {
  const game = playingGame({ seed });
  game.state.spoon = { ...spoon };
  game.state.spawnTimer = 1e6; // checkpoints refuse the test-only Infinity
  completeRound(game);
  game.update(5); // past the reveal, so the offer can be taken
  game.drainEvents();
  return game;
}

/** Take the offered card with this id, then play into the next normal cup. */
function take(game, id) {
  const index = game.state.offer.indexOf(id);
  expect(index, `${id} on offer`).toBeGreaterThanOrEqual(0);
  expect(game.chooseUpgrade(index)).toBe(true);
}

describe('filling an offer from the Tea Tray', () => {
  it('leaves an offer of upgrades alone while two or more can still improve', () => {
    expect(fillFromTray(reading(5), ['polished', 'strainer'])).toEqual(['polished', 'strainer']);
  });

  it('fills a one-upgrade offer beside the upgrade, and an empty one entirely', () => {
    expect(fillFromTray(reading(19), ['quickStir'])).toHaveLength(CONFIG.upgrades.choices);
    expect(fillFromTray(reading(19), ['quickStir'])[0]).toBe('quickStir');
    const empty = fillFromTray(reading(21), []);
    expect(empty).toHaveLength(2);
    expect(new Set(empty).size).toBe(2);
    for (const id of empty) expect(TRAY[id]).toBeDefined();
  });

  it('rotates through the treats offer by offer, without random numbers', () => {
    const seen = [21, 23, 25, 27].map((round) => fillFromTray(reading(round), []));
    expect(seen).toEqual([21, 23, 25, 27].map((round) => fillFromTray(reading(round), []))); // repeatable
    expect(new Set(seen.flat())).toEqual(new Set(Object.keys(TRAY))); // every treat comes round
  });

  it('never offers a spare strainer before Karma, nor a golden moment before The Daily Grind', () => {
    expect(usableTray(reading(21, { nextFortune: 'karma' }))).not.toContain('trayCatch');
    expect(usableTray(reading(21, { grindDue: true }))).not.toContain('trayGolden');
    const both = reading(21, { nextFortune: 'karma', grindDue: true });
    for (let round = 21; round < 40; round += 2) {
      const offer = fillFromTray({ ...both, round }, []);
      expect(offer).toHaveLength(2); // milk and sugar always help
      expect(offer).not.toContain('trayCatch');
      expect(offer).not.toContain('trayGolden');
    }
  });
});

describe('the Tea Tray in a pot', () => {
  it('offers two cards with a fully upgraded spoon, under the Tea Tray heading', () => {
    const game = offerReading();
    expect(game.state.offer).toHaveLength(2);
    const cards = offerCards(game.state);
    expect(cards.every((card) => card.tray)).toBe(true);
    for (const card of cards) expect(card.info).toMatch(/next cup/);
  });

  it('serves a spare jug at the next cup only, and leaves the spoon as it was', () => {
    const game = offerReading();
    const spoon = { ...game.state.spoon };
    take(game, forceOffer(game, 'trayMilk'));
    expect(game.state.spoon).toEqual(spoon); // no permanent power
    expect(game.state.round).toBe(2);
    expect(game.state.tray).toBeNull();
    expect(game.state.milkLeft).toBe(CONFIG.milk.perRound + 1);
    const event = game.drainEvents().find((e) => e.type === 'upgrade');
    expect(event).toMatchObject({ id: 'trayMilk', tray: true, name: 'A Spare Jug' });
    playTo(game, 3); // the cup after: back to the usual jug
    expect(game.state.milkLeft).toBe(CONFIG.milk.perRound);
  });

  it('serves each treat as the next cup starts', () => {
    const cases = {
      trayCatch: (s) => expect(s.strainerLeft).toBe(strainerCapacity(s.spoon) + 1),
      traySugar: (s) => expect(s.sugarLeft).toBe(sugarCapacity(s) + 1),
      trayGolden: (s) => expect(s.goldenSpoon).toBe(CONFIG.teaTray.goldenSpoon),
    };
    for (const [id, check] of Object.entries(cases)) {
      const game = offerReading();
      take(game, forceOffer(game, id));
      expect(game.state.phase).toBe('playing');
      check(game.state);
      if (id === 'trayGolden') expect(game.drainEvents().some((e) => e.type === 'goldenSpoon')).toBe(true);
    }
  });

  it('waits through a bonus round for the next normal cup', () => {
    const game = offerReading();
    game.state.grindDue = true; // The Daily Grind follows this reading
    take(game, forceOffer(game, 'trayMilk'));
    expect(game.state.phase).toBe('grind');
    expect(game.state.tray).toBe('trayMilk');
    expect(game.state.milkLeft).toBe(CONFIG.milk.perRound); // the machine gets the usual jug
    finishGrind(game);
    expect(game.state.phase).toBe('playing');
    expect(game.state.milkLeft).toBe(CONFIG.milk.perRound + 1);
    expect(game.state.tray).toBeNull();
  });

  it('is cleared by a new match', () => {
    const game = offerReading();
    game.state.grindDue = true;
    take(game, forceOffer(game, 'traySugar'));
    game.state.phase = PHASE.GAME_OVER;
    expect(game.restart()).toBe(true);
    expect(game.state.tray).toBeNull();
    expect(game.state.sugarLeft).toBe(CONFIG.sugar.perRound);
  });

  it('still offers an upgrade first while one can improve', () => {
    const game = offerReading({ spoon: { ...FULL, quickStir: UPGRADES.quickStir.max - 1 } });
    expect(game.state.offer[0]).toBe('quickStir');
    expect(TRAY[game.state.offer[1]]).toBeDefined();
  });

  it('draws the same offers for the same seed', () => {
    const offers = (seed) => {
      const game = createGame({ seed });
      game.primaryAction();
      game.state.spoon = { ...FULL };
      const seen = [];
      for (let round = 1; round <= 9; round++) {
        completeRound(game);
        seen.push(game.state.offer);
        game.update(5);
        if (game.state.offer) game.chooseUpgrade(0);
        else game.primaryAction();
        answerShortage(game);
        finishGrind(game, { win: true });
        game.chooseInterlude(false);
        game.chooseDay('keep');
      }
      return seen;
    };
    expect(offers(7)).toEqual(offers(7));
  });
});

/** Put a treat on offer (tests of one treat should not depend on the rotation). */
function forceOffer(game, id) {
  game.state.offer = [id, ...Object.keys(TRAY).filter((other) => other !== id)].slice(0, CONFIG.upgrades.choices);
  return id;
}

describe('saving a reading with the Tea Tray on offer', () => {
  it('saves and restores a tray offer exactly', () => {
    const game = offerReading();
    game.state.spawnTimer = 1e6;
    const saved = game.exportCheckpoint();
    expect(saved).not.toBeNull();
    expect(validateCheckpoint(saved)).toBe(true);
    expect(saved.state.tray).toBeNull();
    const restored = createGame({ checkpoint: saved });
    expect(restored.state.offer).toEqual(game.state.offer);
  });

  it('refuses a waiting treat, unknown cards, or a tray card ahead of an upgrade', () => {
    const game = offerReading({ spoon: { ...FULL, polished: 0 } });
    const saved = game.exportCheckpoint();
    expect(validateCheckpoint(saved)).toBe(true);
    const bad = [
      (c) => { c.state.tray = 'trayMilk'; }, // treats are only ever taken after the save
      (c) => { c.state.offer = ['trayTeaCash']; },
      (c) => { c.state.offer = ['trayMilk', 'trayMilk']; },
      (c) => { c.state.offer = ['trayMilk', 'polished']; },
      (c) => { c.state.offer = ['quickStir', 'trayMilk']; }, // quickStir is already at its limit
    ];
    for (const change of bad) {
      const c = structuredClone(saved);
      change(c);
      expect(validateCheckpoint(c)).toBe(false);
    }
  });

  it('migrates a schema 3 save, upgrades-only offer and all, with an empty tray', () => {
    const game = offerReading({ spoon: createSpoon() });
    const saved = game.exportCheckpoint();
    expect(saved.state.tray).toBeNull();
    const state = omit(saved.state, ['tray', ...V5_KEYS]);
    const random = omit(saved.random, ['manager']);
    const stream = saved.random.manager;
    const v3 = { ...saved, schemaVersion: 3, state, random };
    const migrated = migrateCheckpoint(v3);
    expect(migrated.state).toEqual(saved.state);
    expect(migrated.random).toEqual({ ...random, manager: stream });
    expect(migrateCheckpoint({ ...v3, state: { ...state, tray: null } })).toBeNull(); // schema 3 never had it
  });
});
