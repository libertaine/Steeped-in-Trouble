import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import {
  BASE_MODIFIERS, FORTUNES, FORTUNE_PRIORITY, drawFortune, fortuneWeights, glyphPoint, modifiersFor, selectFortune,
} from '../../src/gameplay/fortunes.js';
import { findSecrets } from '../../src/gameplay/secrets.js';
import { TEAS, teaFortuneNudges } from '../../src/gameplay/teas.js';
import { hudText } from '../../src/ui/hud.js';
import { createEffects } from '../../src/rendering/effects.js';
import { brewNext, completeRound, killOne, placeEnemy, playingGame, step } from './helpers.js';

const RIM = CONFIG.arena.rimRadius;

/** Round 1 played, then the next cup brewed under Karma through the real reading hand-off. */
function karmaCup({ seed = 1, tea = 'house' } = {}) {
  const game = playingGame({ seed, tea });
  completeRound(game);
  game.state.nextFortune = 'karma';
  brewNext(game);
  game.state.spawnTimer = Infinity;
  game.drainEvents();
  return game;
}

/** A leaf about to reach the rim in `lane`, rising at `speed`. */
function atRim(game, lane = 0, speed = 60) {
  const leaf = placeEnemy(game.state, { lane, radius: RIM - 4, speed });
  Object.assign(leaf, { kind: 'leaf', home: 40, backwash: 0, glide: null });
  return leaf;
}

/** Let a leaf bounce off the rim and settle back into the tea. */
function bounce(game, leaf) {
  step(game, 0.05);
  expect(leaf.karma).toBe('bounced');
  step(game, 1.5);
  expect(leaf.backwash).toBe(0);
}

const types = (game) => game.drainEvents().map((e) => e.type);

describe('Karma: the fortune', () => {
  it('is in the weighted draw, but never a pattern reading or the fallback', () => {
    expect(FORTUNES.karma).toMatchObject({ name: 'Karma', subtitle: 'What Goes Around…', tag: 'rim rebounds', tone: 'good' });
    expect(FORTUNES.karma.quote).toBe('The leaves have been warned. They chose not to listen.');
    expect(FORTUNE_PRIORITY).toEqual(['veil', 'crown', 'spiral', 'star']);
    expect(FORTUNE_PRIORITY).not.toContain('karma');
    for (const leafLanes of [[], [0, 0, 0, 1], [0, 4, 8, 12]]) {
      expect(selectFortune({ milkKills: 0, leafLanes })).not.toBe('karma');
    }
    expect(fortuneWeights({ milkKills: 0, leafLanes: [] }).karma).toBe(CONFIG.karma.weight);
  });

  it('comes up about 2–5% of the time across representative rounds, and never dominates', () => {
    const lanes = { star: [0, 4, 8, 12], crown: [0, 0, 1, 1, 2, 5], spiral: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
    const records = [];
    for (const leafLanes of Object.values(lanes)) {
      for (const escapes of [0, 1, 2]) {
        for (const tea of ['house', 'herbal']) {
          records.push({ milkKills: 0, milkUses: escapes, sugarUses: 1, escapes, nearMisses: escapes, leafLanes,
            nudges: teaFortuneNudges(tea) });
        }
      }
    }
    records.push({ milkKills: 4, milkUses: 2, sugarUses: 0, escapes: 0, nearMisses: 0, leafLanes: [3, 7] });
    const rng = createRandom(2026);
    let karma = 0;
    let draws = 0;
    for (const record of records) {
      let mine = 0;
      for (let i = 0; i < 4000; i++) if (drawFortune(record, rng) === 'karma') mine++;
      expect(mine / 4000).toBeGreaterThan(0.012);
      expect(mine / 4000).toBeLessThan(0.06);
      karma += mine;
      draws += 4000;
    }
    expect(karma / draws).toBeGreaterThan(0.02);
    expect(karma / draws).toBeLessThan(0.05);
  });

  it('changes only its own modifier', () => {
    expect(modifiersFor('karma')).toEqual({ ...BASE_MODIFIERS, karma: true });
    for (const id of Object.keys(FORTUNES)) if (id !== 'karma') expect(modifiersFor(id).karma).toBe(false);
  });

  it('draws a circular return arrow inside the cup', () => {
    for (let i = 0; i < 40; i++) expect(Math.hypot(glyphPoint('karma', i, 40).x, glyphPoint('karma', i, 40).y)).toBeLessThan(RIM);
  });

  it('is announced in the HUD and the panel, so the bounces have an explanation', () => {
    const game = karmaCup();
    const hud = hudText(game.state);
    expect(hud.hudOmen).toContain('Karma · rim rebounds');
    expect(hud.fortuneName).toBe('Karma');
    expect(hud.fortuneDetail).toContain('cannot cost you a cup');
  });
});

describe('Karma at the rim', () => {
  it('bounces a leaf back on first contact: no cup, no strainer, no near miss', () => {
    const game = karmaCup();
    const { lives, score } = game.state;
    const leaf = atRim(game);
    step(game, 0.05);
    expect(game.state.enemies).toContain(leaf);
    expect(leaf).toMatchObject({ karma: 'bounced' });
    expect(leaf.backwash).toBeGreaterThan(0);
    expect(game.state).toMatchObject({ lives, score, strainerLeft: 1, graceTime: 0, kills: 0 });
    expect(game.state.roundStats).toMatchObject({ karmaBounces: 1, karmaPuffs: 0, nearMisses: 0, escapes: 0 });
    const events = types(game);
    expect(events).toContain('karmaBounce');
    for (const type of ['escape', 'strain', 'recoil', 'kill']) expect(events).not.toContain(type);
    step(game, 0.4);
    expect(leaf.radius).toBeLessThan(RIM - 60);
  });

  it('never re-triggers while the leaf is still recoiling', () => {
    const game = karmaCup();
    const leaf = atRim(game);
    step(game, 1 / 60);
    expect(leaf.backwash).toBeGreaterThan(0);
    leaf.radius = RIM; // shoved straight back to the rim mid-recoil
    step(game, 1 / 60);
    expect(game.state.enemies).toContain(leaf);
    expect(game.state.roundStats).toMatchObject({ karmaBounces: 1, karmaPuffs: 0 });
  });

  it('makes a bounced leaf vanish on its next contact: cleared, but not a kill', () => {
    const game = karmaCup();
    const leaf = atRim(game);
    bounce(game, leaf);
    const before = structuredClone({ score: game.state.score, residue: game.state.residue, stats: game.state.roundStats });
    game.drainEvents();
    leaf.radius = RIM - 2;
    step(game, 1 / 60);
    expect(game.state.enemies).not.toContain(leaf);
    expect(game.state.kills).toBe(1);
    expect(game.state.score).toBe(before.score);
    expect(game.state.residue).toEqual(before.residue);
    expect(game.state.lives).toBe(CONFIG.lives);
    expect(game.state.strainerLeft).toBe(1);
    expect(game.state.roundStats).toEqual({ ...before.stats, karmaPuffs: 1 });
    const events = types(game);
    expect(events).toContain('karmaPuff');
    for (const type of ['escape', 'strain', 'recoil', 'kill', 'karmaBounce']) expect(events).not.toContain(type);
  });

  it('gives no accuracy or secret credit for a vanishing leaf', () => {
    const game = karmaCup();
    for (let i = 0; i < 9; i++) killOne(game, i);
    const stats = structuredClone(game.state.roundStats);
    for (let lane = 0; lane < 6; lane++) {
      const leaf = atRim(game, lane);
      bounce(game, leaf);
      leaf.radius = RIM - 2;
      step(game, 1 / 60);
    }
    const after = game.state.roundStats;
    expect(after).toMatchObject({ volleys: stats.volleys, wastedVolleys: stats.wastedVolleys, steamKills: stats.steamKills,
      milkKills: stats.milkKills, karmaPuffs: 6 });
    expect(findSecrets(after)).toEqual(findSecrets(stats));
    expect(game.state.residue).toHaveLength(9);
  });

  it('still lets the player destroy a bounced leaf for full, ordinary credit', () => {
    const game = karmaCup();
    const leaf = atRim(game);
    step(game, 0.05);
    expect(leaf.karma).toBe('bounced');
    leaf.speed = 0; // holds still in the tea after its bounce
    const { score } = game.state;
    game.state.angle = leaf.angle;
    game.state.shotCooldown = 0;
    game.fireSteam();
    step(game, 0.6);
    expect(game.state.enemies).not.toContain(leaf);
    expect(game.state.score).toBe(score + CONFIG.scoring.steamKill);
    expect(game.state.residue).toHaveLength(1);
    expect(game.state.roundStats).toMatchObject({ steamKills: 1, karmaPuffs: 0 });
    expect(types(game)).toContain('kill');
  });

  it('holds with the strainer empty, the grace period over, one cup left, and leaves arriving together', () => {
    const game = karmaCup();
    Object.assign(game.state, { strainerLeft: 0, graceTime: 0, lives: 1 });
    const leaves = [0, 1, 2, 3, 4].map((lane) => atRim(game, lane));
    step(game, 1 / 60);
    expect(game.state.phase).toBe('playing');
    expect(leaves.every((l) => l.karma === 'bounced')).toBe(true);
    expect(game.state.roundStats.karmaBounces).toBe(5);
    step(game, 1.5);
    game.drainEvents();
    for (const leaf of leaves) leaf.radius = RIM - 2;
    step(game, 1 / 60);
    // Five leaves, five vanishings: each counted exactly once.
    expect(game.state).toMatchObject({ lives: 1, kills: 5, enemies: [] });
    expect(types(game).filter((t) => t === 'karmaPuff')).toHaveLength(5);
  });

  it('finishes the round from Karma removals, once, even when they arrive together', () => {
    const game = karmaCup();
    const leaves = [0, 5, 10].map((lane) => atRim(game, lane));
    step(game, 1 / 60);
    step(game, 1.5);
    game.state.kills = game.state.target - 1;
    game.drainEvents();
    for (const leaf of leaves) leaf.radius = RIM - 2;
    step(game, 1 / 60);
    expect(game.state.phase).toBe('reading');
    expect(game.state.kills).toBe(game.state.target);
    expect(types(game).filter((t) => t === 'reading')).toHaveLength(1);
  });
});

describe('Karma for a whole cup', () => {
  it.each(Object.keys(TEAS))('protects an idle player for a full cup of %s, which still ends on its own', (tea) => {
    const game = karmaCup({ seed: 3, tea });
    game.state.spawnTimer = 0.5;
    let t = 0;
    while (game.state.phase === 'playing' && t < 240) {
      step(game, 1);
      t += 1;
    }
    expect(game.state.phase).toBe('reading');
    expect(game.state.lives).toBe(CONFIG.lives);
    expect(game.state.strainerLeft).toBe(1);
    expect(game.state.roundStats).toMatchObject({ escapes: 0, nearMisses: 0, steamKills: 0, volleys: 0 });
    expect(game.state.roundStats.karmaPuffs).toBe(game.state.target);
  });

  it('awards no points for a cup cleared entirely by Karma', () => {
    const game = karmaCup({ seed: 3 });
    const { score } = game.state;
    game.state.spawnTimer = 0.5;
    for (let t = 0; t < 240 && game.state.phase === 'playing'; t++) step(game, 1);
    expect(game.state.phase).toBe('reading');
    expect(game.state.score).toBe(score);
    expect(game.state.residue).toEqual([]);
  });

  it('lasts exactly one cup: the next one spills as usual', () => {
    const game = karmaCup();
    completeRound(game);
    game.state.nextFortune = 'star';
    brewNext(game);
    expect(game.state.modifiers.karma).toBe(false);
    game.state.spawnTimer = Infinity;
    atRim(game);
    step(game, 0.05);
    expect(game.state.strainerLeft).toBe(0);
    expect(game.state.roundStats).toMatchObject({ nearMisses: 1, karmaBounces: 0 });
    atRim(game, 4);
    step(game, 0.05);
    expect(game.state.lives).toBe(CONFIG.lives - 1);
  });

  it('is gone after a restart', () => {
    const game = karmaCup();
    game.state.phase = 'gameover';
    game.restart();
    expect(game.state.modifiers.karma).toBe(false);
  });

  it('leaves The Daily Grind’s own damage rules alone', () => {
    const game = karmaCup();
    completeRound(game);
    game.state.grindDue = true;
    game.state.offer = null;
    game.state.shortageDue = false;
    game.state.havocDue = false;
    game.primaryAction();
    expect(game.state.phase).toBe('grind');
    expect(game.state.modifiers.karma).toBe(false);
  });

  it('plays the same leaves as any other cup: the draw stream is untouched', () => {
    const a = createGame({ seed: 9, tea: 'house' });
    const b = createGame({ seed: 9, tea: 'house' });
    for (const g of [a, b]) {
      g.primaryAction();
      g.state.spawnTimer = Infinity;
      completeRound(g);
    }
    a.state.nextFortune = 'karma';
    b.state.nextFortune = null;
    for (const g of [a, b]) { brewNext(g); g.state.spawnTimer = 0; step(g, 3); }
    expect(a.state.enemies.map((e) => [e.angle, e.speed])).toEqual(b.state.enemies.map((e) => [e.angle, e.speed]));
  });
});

describe('Karma effects', () => {
  it('flashes the rim and puffs, with fewer particles under reduced motion', () => {
    const effects = createEffects({ random: () => 0.5 });
    effects.handle({ type: 'karmaBounce', angle: 0, radius: RIM - 3, count: 1 });
    expect(effects.fx.rebounds).toEqual([expect.objectContaining({ kind: 'bounce', angle: 0 })]);
    expect(effects.fx.whisper ?? effects.fx).toBeTruthy();
    const loud = effects.fx.particles.length;
    effects.handle({ type: 'karmaPuff', angle: 0, radius: RIM - 3 });
    expect(effects.fx.rebounds.map((r) => r.kind)).toEqual(['bounce', 'puff']);
    effects.update(1);
    expect(effects.fx.rebounds).toEqual([]);
    const calm = createEffects({ random: () => 0.5 });
    calm.fx.tea.reduced = true;
    calm.handle({ type: 'karmaBounce', angle: 0, radius: RIM - 3, count: 1 });
    expect(calm.fx.particles.length).toBeLessThan(loud);
  });
});
