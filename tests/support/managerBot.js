// A scripted player for The Mycelium Manager, for fairness tests and balance
// sweeps. It only presses the game's own controls (turn, steam, milk, sugar),
// with a reaction delay, so its skill levels are about judgement and speed,
// never about reading hidden state.
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { LANES, angleDifference, laneAngle, laneOf, wrapLane } from '../../src/gameplay/arena.js';
import { MEETING_LINE } from '../../src/gameplay/mycelium.js';

const DT = 1 / 60;

/**
 * careful: dodges every meeting, cuts roots before they cross the line, pops memos
 * casual:  slower, and goes after memos first; dodges once the warning is half gone
 * reckless: ignores roots and meetings; only pops memos
 * Every style sometimes lines up one lane off (slip) and stays there until it next thinks.
 */
export const SKILLS = Object.freeze({
  careful: { reaction: 0.2, slip: 0.08, cutAt: MEETING_LINE - 40, dodge: 0, memoFirst: false, milk: true, sugar: true },
  casual: { reaction: 0.4, slip: 0.25, cutAt: MEETING_LINE - 10, dodge: 0.5, memoFirst: true, milk: false, sugar: false },
  reckless: { reaction: 0.3, slip: 0.15, cutAt: Infinity, dodge: Infinity, memoFirst: true, milk: false, sugar: false },
});

const distance = (lane, angle) => Math.abs(angleDifference(laneAngle(lane), angle));

/** The nearest lane, from the spoon, that the meeting has not invited (and keeps clear of its neighbours). */
export function safeLane(state, invited) {
  const set = new Set(invited);
  let best = null;
  for (let lane = 0; lane < LANES; lane++) {
    if (set.has(lane)) continue;
    // Prefer a lane with safe neighbours, so the spoon need not stop on a boundary.
    const snug = !set.has(wrapLane(lane - 1)) || !set.has(wrapLane(lane + 1));
    const d = distance(lane, state.angle) + (snug ? 0 : 0.2);
    if (!best || d < best.d) best = { lane, d };
  }
  return best?.lane ?? laneOf(state.angle);
}

/** What the bot wants this moment: a lane to face, and whether to fire, pour or burst. */
function decide(state, skill) {
  const m = state.manager;
  const a = m.meeting;
  if (a && a.stage === 'warn' && a.lanes.length && a.time >= skill.dodge * a.length) {
    return { lane: safeLane(state, a.lanes), fire: false };
  }
  if (a && a.stage === 'burst' && skill.dodge !== Infinity) return { lane: laneOf(state.angle), fire: false };
  const roots = m.roots.filter((r) => r.tip >= skill.cutAt).sort((x, y) => y.tip - x.tip);
  const memos = [...m.memos].sort((x, y) => distance(x.lane, state.angle) - distance(y.lane, state.angle));
  const root = roots[0] ? { lane: roots[0].lane, kind: 'root' } : null;
  const memo = memos[0] ? { lane: memos[0].lane, kind: 'memo' } : null;
  const target = skill.memoFirst ? memo ?? root : root ?? memo;
  if (!target) return { lane: laneOf(state.angle), fire: false };
  const crowded = m.roots.filter((r) => r.tip >= skill.cutAt).length >= 3;
  return { lane: target.lane, fire: true, milk: skill.milk && crowded, sugar: skill.sugar && target.kind === 'root' && crowded };
}

/**
 * Fight one encounter from its first frame with `skill`.
 * @param {{ seed: number, skill: keyof SKILLS, appearance?: number, milestone?: boolean, watch?: (state) => void }} options
 * @returns {{ result: string, scalds: number, time: number, memos: number, roots: number, game: object }}
 */
export function fight({ seed, skill, appearance = 1, milestone = appearance === 1, watch }) {
  const S = SKILLS[skill];
  const hands = createRandom(seed ^ 0xb0771e);
  const game = createGame({ seed });
  game.primaryAction();
  const s = game.state;
  // Straight to the reading before the Manager, through the real hand-off.
  Object.assign(s, { phase: 'reading', readingTime: 10, offer: null, havocDue: false, grindDue: false,
    shortageDue: false, arcadeDue: null, managerDue: true, progress: { chapter: milestone ? 2 : 3, starts: milestone ? [1, 6] : [1, 6, 11] },
    managerAfter: milestone ? s.round : null, managerVisits: milestone ? 0 : appearance - 2, grindAfter: null });
  game.primaryAction();
  if (s.phase !== 'manager') throw new Error(`no Manager: ${s.phase}`);
  game.primaryAction(); // skip the entrance
  let plan = { lane: laneOf(s.angle), fire: false };
  let thought = 0;
  for (let t = 0; t < 60 && s.manager.stage === 'fight'; t += DT) {
    thought -= DT;
    if (thought <= 0) {
      plan = decide(s, S);
      if (plan.fire && hands.next() < S.slip) plan = { ...plan, lane: wrapLane(plan.lane + (hands.next() < 0.5 ? -1 : 1)) };
      thought = S.reaction;
    }
    const turn = angleDifference(laneAngle(plan.lane), s.angle);
    const there = Math.abs(turn) < 0.06;
    if (plan.milk) game.pourMilk();
    if (plan.sugar && there) game.sugarBurst();
    game.update(DT, { left: !there && turn < 0, right: !there && turn > 0, fire: there && plan.fire });
    watch?.(s);
  }
  const m = s.manager;
  return { result: m.result, scalds: m.scalds, time: m.clock, memos: m.tally.memos, roots: m.tally.roots, game };
}
