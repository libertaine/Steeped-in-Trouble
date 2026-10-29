import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createRandom } from '../../src/core/random.js';
import { aimPour, createDailyPour, planRoute, startPour, throwPaper, updateDailyPour } from '../../src/gameplay/dailyPour.js';

const P = CONFIG.dailyPour;
function route(seed = 42) {
  const state = { dailyPour: createDailyPour(createRandom(seed)), score: 123, teaCash: 17, extraSugar: 0 };
  const events = [];
  const sim = { state, emit: (type, data) => events.push({ type, ...data }) };
  const m = state.dailyPour;
  return { state, sim, m, events, advance: (dt) => updateDailyPour(sim, dt) };
}
function deliverAll(r, dt = 1 / 60) {
  startPour(r.m);
  for (const h of r.m.houses.filter((h) => h.subscriber)) {
    const at = (h.x - P.targets[h.aim].ahead) / P.speed;
    while (r.m.clock < at - 1e-9) r.advance(Math.min(dt, at - r.m.clock));
    aimPour(r.m, h.aim);
    expect(throwPaper(r.sim)).toBe(true);
  }
  while (r.m.stage === 'play') r.advance(dt);
}

describe('The Daily Pour route', () => {
  it('uses deterministic, varied routes with valid, separated targets and generous opening mailboxes', () => {
    expect(planRoute(createRandom(4))).toEqual(planRoute(createRandom(4)));
    expect(planRoute(createRandom(4))).not.toEqual(planRoute(createRandom(5)));
    for (let seed = 0; seed < 100; seed++) {
      const houses = planRoute(createRandom(seed));
      expect(houses).toHaveLength(9);
      expect(houses.filter((h) => h.subscriber)).toHaveLength(7);
      expect(houses.slice(0, 2).every((h) => h.aim === 'near' && h.radius === 55)).toBe(true);
      for (const [i, h] of houses.entries()) {
        expect(P.targets[h.aim]).toBeDefined();
        expect(h.x).toBeLessThan(P.speed * P.duration);
        if (i) expect(h.x - houses[i - 1].x).toBeGreaterThan(350);
      }
    }
  });

  it('advances intro → play → outro without needing successful deliveries', () => {
    const r = route();
    expect(throwPaper(r.sim)).toBe(false);
    expect(aimPour(r.m, 'far')).toBe(false);
    r.advance(P.introTime);
    expect(r.m.stage).toBe('play');
    r.advance(P.duration);
    expect(r.m.stage).toBe('outro');
    expect(r.m.summary).toMatchObject({ success: false, perfect: false, points: 0, cash: 0 });
    expect(r.state).toMatchObject({ score: 123, teaCash: 17, extraSugar: 0 });
  });

  it('scores only after arrival, rejects mashing, and cannot deliver twice to one house', () => {
    const r = route(); startPour(r.m); r.advance(P.firstAt);
    expect(throwPaper(r.sim)).toBe(true);
    for (let i = 0; i < 20; i++) expect(throwPaper(r.sim)).toBe(false);
    expect(r.m.delivered).toBe(0);
    r.advance(P.targets.near.flight);
    expect(r.m.delivered).toBe(1);
    expect(r.m.houses[0].delivered).toBe(true);
    expect(r.events.filter((e) => e.type === 'paperDelivery')).toHaveLength(1);
    expect(r.m.papers).toBe(r.m.scheduled + P.sparePapers - 1);
  });

  it.each(['too early', 'too late', 'wrong aim'])('misses with %s rather than awarding proximity points', (kind) => {
    const r = route(); startPour(r.m);
    r.advance(P.firstAt + (kind === 'too early' ? -0.8 : kind === 'too late' ? 0.8 : 0));
    if (kind === 'wrong aim') aimPour(r.m, 'far');
    throwPaper(r.sim); r.advance(1);
    expect(r.m.delivered).toBe(0);
    expect(r.m.misses).toBe(1);
    expect(r.m.flights[0]?.outcome ?? 'miss').toBe('miss');
  });

  it('locks the landing point and aim at release even while the next aim changes', () => {
    const r = route(); startPour(r.m); r.advance(P.firstAt);
    throwPaper(r.sim); aimPour(r.m, 'far'); r.advance(0.7);
    expect(r.m.delivered).toBe(1);
    expect(r.m.aim).toBe('far');
    aimPour(r.m); expect(r.m.aim).toBe('near');
  });

  it.each(['near', 'far'])('makes the marked non-subscriber a predictable %s gag with no delivery or deduction', (aim) => {
    const r = route(); startPour(r.m);
    const h = r.m.houses.find((h) => h.dog);
    r.advance((h.x - P.targets[aim].ahead) / P.speed);
    aimPour(r.m, aim); throwPaper(r.sim); r.advance(1);
    expect(r.m.delivered).toBe(0);
    expect(aim === 'near' ? r.m.dogs : r.m.windows).toBe(1);
    expect(r.m.flights[0].outcome).toBe(aim === 'near' ? 'dog' : 'window');
    expect(r.state.teaCash).toBe(17);
  });

  it('limits the paper bag even after every cooldown expires', () => {
    const r = route(); startPour(r.m);
    const count = r.m.papers;
    for (let i = 0; i < count; i++) { expect(throwPaper(r.sim)).toBe(true); r.advance(1); }
    expect(r.m.papers).toBe(0); expect(throwPaper(r.sim)).toBe(false);
  });

  it('awards the perfect route once, without restocking tea', () => {
    const r = route(); deliverAll(r);
    expect(r.m.summary).toMatchObject({ success: true, perfect: true, points: 225, cash: 5 });
    expect(r.state).toMatchObject({ score: 348, teaCash: 22, extraSugar: 0 });
    r.advance(100);
    expect(r.state.score).toBe(348); expect(r.state.teaCash).toBe(22);
    expect(r.events.filter((e) => e.type === 'pourFinish')).toHaveLength(1);
  });

  it('awards modest success at 60% and still finishes a hopeless route', () => {
    for (const delivered of [0, 4, 5, 6]) {
      const r = route(); startPour(r.m); r.m.delivered = delivered;
      r.advance(P.duration);
      expect(r.m.summary.success).toBe(delivered >= 5);
      expect(r.m.summary.cash).toBe(delivered >= 5 ? 5 : 0);
      expect(r.m.summary.points).toBe(delivered * 25);
      expect(r.state.extraSugar).toBe(0);
    }
  });

  it('settles a throw still flying at the end before showing results', () => {
    const r = route(); startPour(r.m); r.advance(P.duration - 0.1);
    throwPaper(r.sim); r.advance(0.1);
    expect(r.m.stage).toBe('play'); expect(r.m.summary).toBeNull();
    r.advance(1); expect(r.m.stage).toBe('outro'); expect(r.m.misses).toBe(1);
  });

  it('reproduces outcomes and rewards across display rates', () => {
    const results = [30, 60, 144].map((fps) => {
      const r = route(); deliverAll(r, 1 / fps);
      return { houses: r.m.houses, summary: r.m.summary, score: r.state.score, cash: r.state.teaCash };
    });
    expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2]);
  });
});
