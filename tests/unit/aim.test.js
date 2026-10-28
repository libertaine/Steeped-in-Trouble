import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { LANE_STEP, angleDifference, laneAngle, wrapLane } from '../../src/gameplay/arena.js';
import { createEffects } from '../../src/rendering/effects.js';
import { aimedLane } from '../../src/rendering/renderer.js';
import { playingGame } from './helpers.js';

/** Fire one steam shot from an exact spoon angle; returns the new darts and the event. */
function fireFrom(game, angle) {
  game.state.angle = angle;
  game.state.shotCooldown = 0;
  const before = game.state.shots.length;
  game.fireSteam();
  return { darts: game.state.shots.slice(before), event: game.drainEvents().find((e) => e.type === 'steam') };
}

describe('the aim highlight', () => {
  it('always shows the lane the steam actually takes, all the way round the rim', () => {
    const game = playingGame();
    // Fine steps, plus angles just either side of every boundary between lanes.
    const angles = [];
    for (let a = 0; a < Math.PI * 2; a += 0.013) angles.push(a);
    for (let lane = 0; lane < CONFIG.arena.lanes; lane++) {
      const edge = laneAngle(lane) + LANE_STEP / 2;
      angles.push(edge - 1e-6, edge + 1e-6);
    }
    for (const angle of angles) {
      game.state.angle = angle;
      const shown = aimedLane(game.state);
      const { darts, event } = fireFrom(game, angle);
      expect(event.lane).toBe(shown);
      expect(Math.abs(angleDifference(darts[0].angle, laneAngle(shown)))).toBeLessThan(1e-9);
      game.state.shots = [];
    }
  });

  it('marks the primary lane under Double Trouble, where both darts start', () => {
    const game = playingGame();
    game.state.modifiers = { ...game.state.modifiers, twinSteam: true };
    const angle = laneAngle(5) + LANE_STEP * 0.4;
    game.state.angle = angle;
    const shown = aimedLane(game.state);
    const { darts } = fireFrom(game, angle);
    expect(darts).toHaveLength(2);
    for (const dart of darts) expect(dart.angle).toBeCloseTo(laneAngle(shown), 9);
  });

  it('flashes the lanes that fired: one for steam, three for sugar, all for a Steam Nova', () => {
    const game = playingGame();
    const effects = createEffects({ random: () => 0.5 });
    game.state.angle = laneAngle(15) + LANE_STEP * 0.3;
    game.fireSteam();
    game.sugarBurst();
    for (const event of game.drainEvents()) effects.handle(event);
    const [steam, sugar] = effects.fx.aimPulses;
    expect(steam.lanes).toEqual([15]);
    expect(sugar.lanes).toEqual([wrapLane(14), 15, wrapLane(16)]);
    effects.handle({ type: 'nova', count: 16, angle: 0 });
    expect(effects.fx.aimPulses.at(-1).lanes).toHaveLength(CONFIG.arena.lanes);
    effects.update(1);
    expect(effects.fx.aimPulses).toHaveLength(0);
  });
});
