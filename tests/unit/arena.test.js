import { describe, expect, it } from 'vitest';
import {
  LANES, LANE_STEP, TAU, angleDifference, laneAngle, laneOf, normalizeAngle, toCanvasPoint, wrapLane,
} from '../../src/gameplay/arena.js';
import { CONFIG } from '../../src/config.js';

describe('lanes and angles', () => {
  it('has 16 lanes, with lane 0 at the top of the cup', () => {
    expect(LANES).toBe(16);
    expect(laneAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(laneOf(-Math.PI / 2)).toBe(0);
  });

  it('numbers lanes clockwise', () => {
    expect(laneOf(0)).toBe(4); // pointing right
    expect(laneOf(Math.PI / 2)).toBe(8); // bottom
    expect(laneOf(Math.PI)).toBe(12); // left
  });

  it('round-trips every lane through its angle', () => {
    for (let lane = 0; lane < LANES; lane++) expect(laneOf(laneAngle(lane))).toBe(lane);
  });

  it('snaps to the nearest lane centre', () => {
    expect(laneOf(laneAngle(3) + LANE_STEP * 0.49)).toBe(3);
    expect(laneOf(laneAngle(3) + LANE_STEP * 0.51)).toBe(4);
  });

  it('wraps angles and lanes in both directions', () => {
    expect(normalizeAngle(-0.5)).toBeCloseTo(TAU - 0.5);
    expect(normalizeAngle(TAU * 3 + 1)).toBeCloseTo(1);
    expect(wrapLane(-1)).toBe(15);
    expect(wrapLane(16)).toBe(0);
    expect(wrapLane(-17)).toBe(15);
    expect(laneOf(laneAngle(15) + TAU * 5)).toBe(15);
    expect(laneOf(laneAngle(-1))).toBe(15);
  });

  it('measures the short way round the cup', () => {
    expect(angleDifference(0.1, TAU - 0.1)).toBeCloseTo(0.2);
    expect(angleDifference(TAU - 0.1, 0.1)).toBeCloseTo(-0.2);
  });

  it('maps polar positions onto the logical canvas around the cup centre', () => {
    const top = toCanvasPoint(CONFIG.arena.rimRadius, laneAngle(0));
    expect(top.x).toBeCloseTo(CONFIG.arena.centerX);
    expect(top.y).toBeCloseTo(CONFIG.arena.centerY - CONFIG.arena.rimRadius);
  });
});
