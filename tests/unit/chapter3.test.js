// Chapter 3 — The Cup Has Gone Fungal: opened by beating The Mycelium
// Manager, and always introduced with a cup of Mushroom Tea.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { teasOnTap } from '../../src/gameplay/progress.js';
import { answerShortage, completeRound, finishBonus, finishManager } from './helpers.js';

/** Play a fresh pot through readings, beating every boss unless `escape` names the Manager. */
function play(seed, { until, day = 'keep', manager = 'win', pinned } = {}) {
  const game = createGame({ seed, tea: pinned });
  game.primaryAction();
  const cups = [];
  while (game.state.round < until) {
    const s = game.state;
    cups.push({ round: s.round, tea: s.tea, chapter: s.progress.chapter, age: s.teaAge });
    s.current = null;
    s.modifiers = { ...s.modifiers, laneDrift: false };
    completeRound(game);
    s.offer = null;
    game.primaryAction();
    answerShortage(game);
    if (s.phase === 'manager') finishManager(game, { win: manager === 'win' });
    finishBonus(game, { win: true });
    game.chooseInterlude(false);
    game.chooseDay(day);
  }
  cups.push({ round: game.state.round, tea: game.state.tea, chapter: game.state.progress.chapter, age: game.state.teaAge });
  return { game, cups };
}

describe('Chapter 3', () => {
  it('opens with the cup after the Manager is beaten, and that cup is always Mushroom Tea', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const day of ['keep', 'fresh']) {
        const { cups } = play(seed, { until: 11, day });
        const first = cups.at(-1);
        expect(first, `seed ${seed}, ${day}`).toMatchObject({ round: 11, chapter: 3, tea: 'mushroom', age: 1 });
        expect(cups.slice(0, 10).every((c) => c.tea !== 'mushroom')).toBe(true);
      }
    }
  });

  it('introduces Mushroom Tea gently: its learning stage', () => {
    const { game } = play(5, { until: 11 });
    expect(game.state.modifiers.puffballChance).toBe(CONFIG.puffballs.chance[0]);
    const opened = game.drainEvents().find((e) => e.type === 'roundStart' && e.round === 11);
    expect(opened).toMatchObject({ chapter: 3, opens: true, tea: 'mushroom', debut: true });
  });

  it('then brews Mushroom Tea in the ordinary rotation: never twice running, never missing for long', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { cups } = play(seed, { until: 40 });
      const later = cups.filter((c) => c.round > 11);
      for (let i = 1; i < later.length; i++) expect(later[i].tea === 'mushroom' && later[i - 1].tea === 'mushroom').toBe(false);
      const served = later.filter((c) => c.tea === 'mushroom').map((c) => c.round);
      expect(served.length).toBeGreaterThan(1);
      for (const [i, round] of [11, ...served].entries()) {
        if (i) expect(round - [11, ...served][i - 1]).toBeLessThanOrEqual(CONFIG.teas.maxAbsence + 1);
      }
      for (const c of cups) expect(teasOnTap({ chapter: c.chapter, starts: [1, 6, 11].slice(0, c.chapter) }, c.round)).toContain(c.tea);
    }
  });

  it('waits while the Manager keeps getting away, and the tea stays as it was', () => {
    const { game, cups } = play(3, { until: 20, manager: 'escape' });
    expect(game.state.progress.chapter).toBe(2);
    expect(cups.every((c) => c.tea !== 'mushroom')).toBe(true);
    expect(game.state.managerAfter).toBeGreaterThan(18);
  });

  it('counts the Mushroom Tea cups it brews, for the Strange Happenings', () => {
    const { game, cups } = play(8, { until: 30 });
    expect(game.state.mushroomCups).toBe(cups.filter((c) => c.tea === 'mushroom').length);
    const pinned = play(8, { until: 6, pinned: 'mushroom' });
    expect(pinned.game.state.mushroomCups).toBe(6); // every cup, when pinned
  });

  it('keeps a pinned Mushroom Tea pot pinned through the chapters', () => {
    const { cups } = play(2, { until: 14, pinned: 'mushroom' });
    expect(cups.every((c) => c.tea === 'mushroom')).toBe(true);
    expect(cups.at(-1).chapter).toBe(3);
  });
});

describe('saving around the unlock', () => {
  it('restores the Manager’s reading, and the introduction still follows the fight', () => {
    const { game } = play(6, { until: 10 });
    game.state.current = null;
    game.state.modifiers = { ...game.state.modifiers, laneDrift: false };
    game.state.spawnTimer = 1e6;
    completeRound(game);
    expect(game.state.managerDue).toBe(true);
    const restored = createGame({ checkpoint: game.exportCheckpoint() });
    for (const g of [game, restored]) {
      g.state.offer = null;
      g.primaryAction();
      answerShortage(g);
      finishManager(g, { win: true });
      g.chooseInterlude(false);
      g.chooseDay('keep');
    }
    expect(restored.state).toMatchObject({ round: 11, tea: 'mushroom', progress: { chapter: 3, starts: [1, 6, 11] } });
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(game.state));
    expect(restored.exportRandom()).toEqual(game.exportRandom());
  });

  it('restores the reading after the introductory cup, and plays on identically', () => {
    const { game } = play(6, { until: 11 });
    game.state.current = null;
    game.state.modifiers = { ...game.state.modifiers, laneDrift: false };
    game.state.spawnTimer = 1e6;
    completeRound(game);
    const saved = game.exportCheckpoint();
    expect(saved.state).toMatchObject({ round: 11, tea: 'mushroom', mushroomCups: 1 });
    const restored = createGame({ checkpoint: saved });
    for (const g of [game, restored]) {
      g.state.offer = null;
      g.primaryAction();
      answerShortage(g);
      finishBonus(g, { win: true });
      g.chooseInterlude(false);
      g.chooseDay('keep');
    }
    expect(restored.state.tea).toBe(game.state.tea);
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(game.state));
  });
});
