import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { createGame } from '../../src/core/game.js';
import { createGrind } from '../../src/gameplay/grind.js';
import { createHavoc } from '../../src/gameplay/chocolate.js';
import { awardGolden } from '../../src/gameplay/golden.js';
import { restoreLife } from '../../src/gameplay/porcelain.js';
import { hudText } from '../../src/ui/hud.js';
import { resourceView } from '../../src/ui/resources.js';
import { playingGame, placeEnemy, step, completeRound, brewNext, killOne } from './helpers.js';

const view = (game) => resourceView(game.state, hudText(game.state));
const counts = (game) => view(game).items.map((item) => item.value);

describe('live resource projection', () => {
  it('reads the initial cup and real milk/sugar consumption and jackpot refill', () => {
    const g = playingGame();
    expect(counts(g)).toEqual(['2/2', '2/2', '1/1']);
    expect(view(g).score).toBe('Score 0');
    g.pourMilk(); g.sugarBurst();
    expect(counts(g)).toEqual(['1/2', '1/2', '1/1']);
    g.pourMilk(); g.sugarBurst();
    expect(counts(g)).toEqual(['0/2', '0/2', '1/1']);
    awardGolden({ state: g.state, rng: { next: () => 0 }, emit: () => {} });
    expect(counts(g)[0]).toBe('2/2');
    expect(view(g).items[1].current).toBe(g.state.sugarLeft);
  });

  it('retains overcapacity and upgraded regeneration limits', () => {
    const g = playingGame();
    g.state.sugarLeft = 3;
    expect(view(g).items[1]).toMatchObject({ value: '3/2', note: '+ bonus' });
    g.state.spoon.sugarScoop = 2;
    completeRound(g); g.state.nextFortune = 'sugarRush'; brewNext(g);
    g.state.spawnTimer = Infinity;
    expect(view(g).items[1]).toMatchObject({ value: '4/4' });
    g.sugarBurst();
    expect(view(g).items[1].note).toMatch(/^Next \d+s$/);
    step(g, CONFIG.fortunes.sugarRushInterval + 0.1);
    expect(view(g).items[1]).toMatchObject({ value: '4/4', note: '' });
    g.state.sugarLeft = 23;
    expect(view(g).items[1]).toMatchObject({ value: '23/4', current: 23 });
  });

  it('follows actual catches, spills, repair, reinforcement, and next-cup replenishment', () => {
    const g = playingGame();
    placeEnemy(g.state, { lane: 2, radius: CONFIG.arena.rimRadius - 5, speed: 60 });
    step(g, 0.5);
    expect(view(g).items[2]).toMatchObject({ value: '0/1', note: 'exhausted' });
    expect(g.drainEvents().some((e) => e.type === 'strain')).toBe(true);
    for (const lane of [5, 9]) {
      g.state.graceTime = 0;
      placeEnemy(g.state, { lane, radius: CONFIG.arena.rimRadius - 5, speed: 60 }); step(g, 0.5);
    }
    expect(view(g)).toMatchObject({ condition: { id: 'critical' }, margin: 'Next spill breaks' });
    restoreLife({ state: g.state }, 4, 'test');
    expect(view(g)).toMatchObject({ condition: { id: 'cracked' }, margin: '2 spills to break' });
    restoreLife({ state: g.state }, 4, 'test'); restoreLife({ state: g.state }, 4, 'test');
    expect(view(g)).toMatchObject({ condition: { id: 'reinforced' }, margin: '4 spills to break' });
    g.state.spoon.strainer = 2;
    completeRound(g); brewNext(g);
    expect(view(g).items[2]).toMatchObject({ value: '3/3' });
  });

  it('uses engine progress and current-cup timers, never pending fortune', () => {
    const g = playingGame();
    killOne(g);
    expect(view(g).progress).toEqual([1, g.state.target]);
    g.state.nextFortune = 'crown';
    g.state.goldenSpoon = 4.2;
    expect(view(g).cue).toContain('GOLDEN SPOON 5s');
    expect(view(g).cue).not.toContain('The Crown');
    g.state.goldenSpoon = 0; g.state.graceTime = 1;
    expect(view(g).cue).toContain('THE CUP RECOVERS');
    g.state.graceTime = 0; g.state.goldenLeaf = { time: 3.2 };
    expect(view(g).cue).toContain('STEAM IT TO MEND 4s');
  });

  it('substitutes real boss health, resources and scalds in fight and pause', () => {
    const g = playingGame();
    Object.assign(g.state, { phase: 'grind', grind: createGrind({ milestone: false }), milkLeft: 1, sugarLeft: 0 });
    Object.assign(g.state.grind, { stage: 'fight', health: 7, scalds: 2 });
    g.state.grind.valve.stage = 'open';
    expect(view(g)).toMatchObject({ normal: false, progress: [7, CONFIG.grind.health], progressLabel: 'Machine health' });
    expect(counts(g)).toEqual(['1/2', '0/2', `2/${CONFIG.grind.scalds}`]);
    expect(view(g).cue).toContain('Valve open: shoot');
    expect(view(g).score).toBe('');
    g.pause();
    expect(view(g).score).toBe('');
    expect(counts(g)).toEqual(['1/2', '0/2', `2/${CONFIG.grind.scalds}`]);
    expect(view(g).items.some((i) => i.kind === 'strainer')).toBe(false);
    g.resume();
    expect(view(g).progressLabel).toBe('Machine health');
  });

  for (const mode of ['teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']) {
    it(`uses ${mode}'s own resources across pause and returns to the main pot`, () => {
      const g = createGame({ seed: 42, practice: mode });
      g.primaryAction();
      const before = counts(g);
      expect(view(g).normal).toBe(false);
      expect(view(g).score).toBe('');
      expect(view(g).items.every((item) => !item.kind)).toBe(true);
      g.pause(); expect(counts(g)).toEqual(before);
      expect(view(g).score).toBe('');
      g.resume(); expect(counts(g)).toEqual(before);
      // Presentation follows phase authority immediately; no remembered UI mode.
      Object.assign(g.state, { phase: 'playing', pausedFrom: null });
      expect(view(g).normal).toBe(true);
      expect(view(g).score).toBe(`Score ${g.state.score}`);
      expect(view(g).items.map((item) => item.kind)).toEqual(['milk', 'sugar', 'strainer']);
    });
  }

  it('shows chocolate tallies and flame guidance without suspended inventory', () => {
    const g = playingGame();
    Object.assign(g.state, { phase: 'chocolate', chocolate: createHavoc(createRandom(42)) });
    Object.assign(g.state.chocolate.tally, { perfect: 2, toasted: 3 });
    expect(counts(g)).toEqual(['2', '3', `${CONFIG.chocolate.duration}s`]);
    expect(view(g).cue).toContain('flames');
    expect(view(g).score).toBe('');
    expect(view(g).items.every((item) => !item.kind)).toBe(true);
    g.state.chocolate.stage = 'play'; g.pause();
    expect(view(g).score).toBe('');
    expect(counts(g)).toEqual(['2', '3', `${CONFIG.chocolate.duration}s`]);
  });

  it('substitutes price and decision status for shortage, offers, and Day choice', () => {
    const g = playingGame();
    for (const phase of ['shortage', 'arcadeOffer', 'day']) {
      g.state.phase = phase;
      expect(view(g).items.every((item) => !item.kind)).toBe(true);
      expect(view(g).items[0].label).toBe('Tea Cash');
      expect(view(g).progress).toBeNull();
    }
  });
});
