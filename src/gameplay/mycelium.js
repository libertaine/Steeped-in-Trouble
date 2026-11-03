// The Mycelium Manager: a mushroom in a lanyard, with a clipboard, who rises
// out of the cup between rounds once Chapter 2 is under way. Where The Daily
// Grind tests timing, the Manager tests territory and priorities:
//
//   - Roots grow out from its base along the lanes, one per lane, each with a
//     glowing tip. Each steam dart that reaches the tip cuts the root back a
//     little way (a long one takes several), and a root shields any memo
//     behind its tip; milk stops every root under the cloud growing; sugar
//     clears three lanes of roots at once.
//   - Memos (paper puffballs) drift out towards the rim. Popping one blows
//     its spores back down the lane into the Manager: the only way to hurt
//     it. A memo left alone files itself on the rim as a sticky note.
//   - All-hands meetings: every lane with a root past the meeting line, or a
//     sticky note, is invited, and when the ring reaches the rim the spoon
//     is scalded if it sits in one. The invitation is fixed when it goes
//     out: during the warning lanes can be uninvited (by cutting their
//     roots) but never added, and inviteList() always leaves two adjacent
//     safe lanes within easy reach, so no scald is ever unavoidable.
//
// The scald rules, the clock and the rewards are The Daily Grind's. The first
// encounter introduces one thing at a time (roots, then memos, then the first
// meeting); rematches add a twist each (twistsFor()). Like the Grind it has
// its own random generator, so the normal rounds play out the same with or
// without it. Functions receive `sim` = { state, rng, emit }.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { LANES, LANE_STEP, angleDifference, laneAngle, laneOf, wrapLane } from './arena.js';
import { spoonLane } from './player.js';
import { restoreLife } from './porcelain.js';
import { isNearCloud, spendDart } from './weapons.js';

/** Salts the Manager's own random generator from the pot's seed. */
export const MANAGER_SALT = 0x6d1c311a;

const M = CONFIG.manager;
const G = CONFIG.grind;
const RIM = CONFIG.arena.rimRadius;
const { radialTolerance, laneTolerance } = CONFIG.collision;

/** Roots that reach beyond this radius invite their lane to the next meeting. */
export const MEETING_LINE = M.bodyRadius + M.meetingLine * (RIM - M.bodyRadius);
const TIP_MAX = RIM - 10; // a root never quite leaves the cup
const FILED_AT = RIM - 8; // where a memo files itself

/** How annoyed the Manager is, 0–1: the share of its health it has lost. */
export const fury = (m) => 1 - m.health / M.health;

/** A [calm, furious] pair, at the Manager's current fury. */
const by = ([calm, furious], f) => calm + (furious - calm) * f;

/** A lane's signed distance from another, the short way round: −8 … 7. */
const offset = (lane, from) => {
  const d = wrapLane(lane - from);
  return d >= LANES / 2 ? d - LANES : d;
};

// ── When it happens ──────────────────────────────────────────────────────

// Until it is beaten the Manager is Chapter 2's milestone: state.managerAfter
// holds the round it is guaranteed to follow (Chapter 2's fifth cup at first,
// then M.retryAfter rounds after each escape). Beating it opens Chapter 3;
// after that it returns now and then as a rematch, with a new twist each time.

/** At a reading: is the milestone encounter (the first, or a retry after an escape) due? */
export function managerMilestoneDue(state) {
  return state.managerAfter !== null && state.round >= state.managerAfter;
}

/**
 * At a reading, once Hot Chocolate Havoc and The Daily Grind are settled: is
 * a rematch due? Only once the Manager has been beaten (Chapter 3), never
 * beside another encounter (it simply waits for a later reading).
 */
export function managerRematchDue(state, rng) {
  if (state.progress.chapter < 3 || state.havocDue || state.grindDue) return false;
  return state.round - state.lastManager >= M.minGap && rng.next() < M.chance;
}

/**
 * What changes, appearance by appearance. The milestone (and any retry of
 * it) is appearance 1; each rematch is the next. Health and the clock never
 * change: only the combination does.
 *   reorg      — roots sprout in adjacent pairs, memos come cc'd in pairs
 *   backToBack — every meeting has a second, smaller one straight after
 *   synergy    — cutting a root drops a memo from its base
 */
const SINGLE = ['reorg', 'backToBack', 'synergy'];
const PAIRS = [['reorg', 'backToBack'], ['backToBack', 'synergy'], ['synergy', 'reorg']];
export function twistsFor(appearance) {
  if (appearance <= 1) return [];
  if (appearance <= 1 + SINGLE.length) return [SINGLE[appearance - 2]];
  return [...PAIRS[(appearance - 2 - SINGLE.length) % PAIRS.length]];
}

// ── State ────────────────────────────────────────────────────────────────

/** A fresh encounter. `milestone` if beating it opens the next chapter; `appearance` picks its twists. */
export function createManager({ milestone = false, appearance = 1 } = {}) {
  const start = milestone ? M.lesson : M.rematch;
  return {
    milestone,
    appearance,
    twists: twistsFor(appearance),
    stage: 'intro', // intro → fight → outro
    time: 0, // seconds in the current stage
    left: G.duration, // seconds of fighting left
    clock: 0, // seconds of fighting so far
    health: M.health,
    scalds: 0,
    safe: 0, // seconds before another scald can land
    flinch: 0, // seconds of wobbling after a hit
    roots: [], // { lane, stage: 'sprout' | 'grow', time, tip, frozen }
    memos: [], // { id, lane, angle, radius, speed }
    puffs: [], // spores on their way back to the Manager: { lane, angle, radius }
    notes: [], // lanes with a sticky note, oldest first
    meeting: null, // { stage: 'warn' | 'burst', wave, time, length, lanes, reach, struck }
    rootTimer: start.root,
    memoTimer: start.memo,
    meetingTimer: start.meeting,
    meetings: 0,
    nextId: 1,
    said: [], // lines already spoken this encounter
    rage: 0, // 0, 1 (half health), 2 (a fifth left)
    tally: { memos: 0, roots: 0, notes: 0 },
    result: null, // 'victory' or 'escaped', once it is over
    summary: null,
  };
}

/** The encounter in progress (or paused), or null. */
export function managerInProgress(state) {
  const inIt = state?.phase === PHASE.MANAGER || (state?.phase === PHASE.PAUSED && state.pausedFrom === PHASE.MANAGER);
  return inIt ? state.manager : null;
}

const has = (m, twist) => m.twists.includes(twist);
const rootIn = (m, lane) => m.roots.find((r) => r.lane === lane);

/** Say a line, at most once an encounter: the Manager talks, but not all the time. */
function say({ state, emit }, line) {
  const m = state.manager;
  if (m.said.includes(line)) return;
  m.said.push(line);
  emit('managerSay', { line });
}

// ── Who is invited ───────────────────────────────────────────────────────

/** Lanes the Manager has claimed right now: a root past the meeting line, or a sticky note. */
export function claimedLanes(m) {
  const lanes = new Set(m.notes);
  for (const r of m.roots) if (r.tip >= MEETING_LINE) lanes.add(r.lane);
  return [...lanes].sort((a, b) => a - b);
}

/**
 * The lanes a meeting actually invites, from those claimed, as seen from the
 * spoon's lane. Pure. However much has been claimed, two adjacent lanes
 * within M.pocketReach of the spoon stay safe: the pair needing the fewest
 * lanes let off, and among those the one nearest a short walk away (so
 * standing still is not what the guarantee rewards). Never more than
 * M.maxInvited lanes are invited; the farthest from the spoon are let off first.
 * @param {number[]} claimed
 * @param {number} spoon the spoon's lane
 * @returns {number[]} invited lanes, ascending
 */
export function inviteList(claimed, spoon) {
  const invited = new Set(claimed.map(wrapLane));
  let pocket = null;
  for (let a = -M.pocketReach; a < M.pocketReach; a++) {
    const pair = [wrapLane(spoon + a), wrapLane(spoon + a + 1)];
    const cost = pair.filter((lane) => invited.has(lane)).length;
    const walk = Math.abs(Math.abs(a + 0.5) - M.pocketWalk);
    if (!pocket || cost < pocket.cost || (cost === pocket.cost && walk < pocket.walk)) pocket = { pair, cost, walk };
  }
  for (const lane of pocket.pair) invited.delete(lane);
  const farthest = [...invited].sort((x, y) => Math.abs(offset(y, spoon)) - Math.abs(offset(x, spoon)) || offset(x, spoon) - offset(y, spoon));
  while (invited.size > M.maxInvited) invited.delete(farthest.shift());
  return [...invited].sort((a, b) => a - b);
}

/** The lanes a meeting has warned about (empty unless one is coming). */
export function invitedLanes(m) {
  return m.meeting?.lanes ?? [];
}

const nearSpoon = (state, lane) => Math.abs(angleDifference(laneAngle(lane), state.angle)) < LANE_STEP * G.hitHalfWidth;

// ── Roots ────────────────────────────────────────────────────────────────

function sproutRoots({ state, rng, emit }) {
  const m = state.manager;
  const free = [];
  for (let lane = 0; lane < LANES; lane++) if (!rootIn(m, lane)) free.push(lane);
  if (!free.length || m.roots.length >= M.maxRoots) return;
  const lane = free[rng.int(free.length)];
  const lanes = [lane];
  // The Reorg: roots come in adjacent pairs.
  if (has(m, 'reorg') && m.roots.length + 2 <= M.maxRoots && !rootIn(m, wrapLane(lane + 1))) lanes.push(wrapLane(lane + 1));
  for (const l of lanes) m.roots.push({ lane: l, stage: 'sprout', time: 0, tip: M.bodyRadius, frozen: false });
  emit('rootSprout', { lanes });
}

function updateRoots(sim, dt) {
  const m = sim.state.manager;
  const speed = by(M.rootSpeed, fury(m));
  for (const r of m.roots) {
    r.time += dt;
    if (r.stage === 'sprout') {
      if (r.time >= M.rootSprout) Object.assign(r, { stage: 'grow', time: 0 });
      continue;
    }
    // Milk: no root under the cloud grows while it lasts.
    r.frozen = isNearCloud(sim.state.clouds, laneAngle(r.lane), CONFIG.milk.slowHalfWidthLanes);
    if (!r.frozen) r.tip = Math.min(TIP_MAX, r.tip + speed * dt);
  }
  if (m.meeting?.stage === 'warn') return; // nothing new sprouts while an invitation is out
  m.rootTimer -= dt;
  if (m.rootTimer > 0) return;
  m.rootTimer = by(M.rootGap, fury(m));
  sproutRoots(sim);
}

// ── Memos ────────────────────────────────────────────────────────────────

function addMemo(m, lane, speed) {
  if (m.memos.length >= M.maxMemos) return false;
  m.memos.push({ id: m.nextId++, lane, angle: laneAngle(lane), radius: M.bodyRadius + 6, speed });
  return true;
}

/**
 * A memo sets out a little way round from the spoon, so reaching it takes a
 * decision, and usually along one of the roots there: a neglected root
 * shields the memo behind its tip, so offence starts with defence.
 */
function releaseMemos(sim) {
  const { state, rng, emit } = sim;
  const m = state.manager;
  const [near, far] = M.memoReach;
  const spoon = spoonLane(state);
  const around = [];
  for (let d = near; d <= far; d++) around.push(wrapLane(spoon - d), wrapLane(spoon + d));
  const rooted = around.filter((lane) => rootIn(m, lane)?.stage === 'grow');
  const pool = rooted.length && rng.next() < M.memoAlongRoots ? rooted : around;
  const lane = pool[rng.int(pool.length)];
  const lanes = has(m, 'reorg') ? [lane, wrapLane(lane + 1)] : [lane]; // cc'd
  const speed = by(M.memoSpeed, fury(m));
  const sent = lanes.filter((l) => addMemo(m, l, speed));
  if (!sent.length) return;
  emit('memo', { lanes: sent });
  say(sim, 'perMyLastSpore');
}

function updateMemos(sim, dt) {
  const { state, emit } = sim;
  const m = state.manager;
  for (let i = m.memos.length - 1; i >= 0; i--) {
    const memo = m.memos[i];
    const slow = isNearCloud(state.clouds, memo.angle, CONFIG.milk.slowHalfWidthLanes) ? CONFIG.milk.slowFactor : 1;
    memo.radius += memo.speed * slow * dt;
    if (memo.radius < FILED_AT) continue;
    m.memos.splice(i, 1);
    if (!m.notes.includes(memo.lane)) m.notes.push(memo.lane);
    m.tally.notes++;
    emit('memoFiled', { lane: memo.lane });
  }
  if (m.meeting?.stage === 'warn') return; // and no new memos while it is
  m.memoTimer -= dt;
  if (m.memoTimer > 0) return;
  m.memoTimer = by(M.memoGap, fury(m)) * m.twists.reduce((scale, twist) => scale * (M.twistMemoGap[twist] ?? 1), 1);
  releaseMemos(sim);
}

function updatePuffs(sim, dt) {
  const m = sim.state.manager;
  for (let i = m.puffs.length - 1; i >= 0; i--) {
    const puff = m.puffs[i];
    puff.radius -= M.puffSpeed * dt;
    if (puff.radius > M.bodyRadius) continue;
    m.puffs.splice(i, 1);
    damage(sim, M.memoDamage, puff);
    if (m.stage !== 'fight') return;
  }
}

// ── Darts ────────────────────────────────────────────────────────────────

const strikes = (target, shot) => Math.abs(target.radius - shot.radius) < radialTolerance
  && Math.abs(angleDifference(target.angle, shot.angle)) < LANE_STEP * laneTolerance;

function popMemo({ state, emit }, memo, shot) {
  const m = state.manager;
  m.memos.splice(m.memos.indexOf(memo), 1);
  m.puffs.push({ lane: memo.lane, angle: memo.angle, radius: memo.radius });
  m.tally.memos++;
  state.score += M.memoPoints;
  emit('memoPop', { lane: memo.lane, angle: memo.angle, radius: memo.radius, sugar: shot.sugar });
}

/** Steam cuts a root back a little way; sugar, or a short enough root, clears it. */
function cutRoot(sim, root, shot) {
  const { state, emit } = sim;
  const m = state.manager;
  const tip = root.tip;
  root.tip -= shot.sugar ? Infinity : M.cutBack;
  const cleared = root.tip <= M.bodyRadius;
  emit('rootCut', { lane: root.lane, angle: laneAngle(root.lane), tip, cleared, sugar: shot.sugar });
  if (!cleared) return;
  m.roots.splice(m.roots.indexOf(root), 1);
  m.tally.roots++;
  state.score += M.rootPoints;
  say(sim, 'whoApproved');
  // Synergy: the Manager makes the most of it.
  if (has(m, 'synergy') && addMemo(m, root.lane, by(M.memoSpeed, fury(m)))) emit('memo', { lanes: [root.lane], synergy: true });
}

/**
 * Each dart meets whatever it reaches first on its way in: a memo beyond the
 * root's tip, the tip itself, or the Manager (a harmless thump). Steam is
 * spent on what it hits; sugar carries on through.
 */
function resolveShots(sim) {
  const { state, emit } = sim;
  const m = state.manager;
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const shot = state.shots[i];
    const root = rootIn(m, laneOf(shot.angle));
    const memo = m.memos.find((target) => strikes(target, shot));
    let hit = true;
    if (memo && (!root || memo.radius > root.tip)) popMemo(sim, memo, shot);
    else if (root && shot.radius <= root.tip + radialTolerance) cutRoot(sim, root, shot);
    else if (shot.radius <= M.bodyRadius) {
      emit('thump', { angle: shot.angle, sugar: shot.sugar });
      state.shots.splice(i, 1);
      spendDart(state, shot, true); // like the Grind's clank: it reached the boss
      continue;
    } else hit = false;
    if (hit && !shot.sugar) {
      state.shots.splice(i, 1);
      spendDart(state, shot, true);
    }
  }
}

// ── Meetings ─────────────────────────────────────────────────────────────

function callMeeting(sim, wave, lanes, length) {
  const m = sim.state.manager;
  m.meeting = { stage: 'warn', wave, time: 0, length, lanes, reach: M.bodyRadius, struck: false };
  sim.emit('meetingCall', { wave, lanes: [...lanes], time: length });
}

function updateMeeting(sim, dt) {
  const { state, emit } = sim;
  const m = state.manager;
  const a = m.meeting;
  if (!a) {
    m.meetingTimer -= dt;
    if (m.meetingTimer > 0) return;
    m.meetings++;
    const lanes = inviteList(claimedLanes(m), spoonLane(state));
    callMeeting(sim, 1, lanes, Math.max(M.minWarn, by(M.warn, fury(m))));
    if (m.meetings === 1) say(sim, 'circleBack');
    return;
  }
  a.time += dt;
  if (a.stage === 'warn') {
    // Lanes can be let off (by cutting their roots), but never added.
    if (a.wave === 1) {
      const claimed = new Set(claimedLanes(m));
      const before = a.lanes.length;
      a.lanes = a.lanes.filter((lane) => claimed.has(lane));
      if (a.lanes.length < before) emit('uninvited', { lanes: [...a.lanes] });
    }
    if (a.time < a.length) return;
    Object.assign(a, { stage: 'burst', time: 0 });
    emit('meetingBurst', { wave: a.wave, lanes: [...a.lanes] });
    return;
  }
  a.reach = Math.min(RIM, a.reach + M.ringSpeed * dt);
  if (!a.struck && a.reach >= RIM - 8) {
    a.struck = true;
    const lane = a.lanes.find((l) => nearSpoon(state, l));
    if (lane !== undefined) scald(sim, lane);
    if (m.stage !== 'fight') return;
    if (a.wave === 1) {
      m.notes = []; // the notes were discussed
      if (has(m, 'backToBack')) {
        // Back-to-Back Meetings: straight into another, around wherever the spoon is hiding.
        const spoon = spoonLane(state);
        const W = M.secondWave;
        const around = [];
        for (let d = -W.halfWidth; d <= W.halfWidth; d++) around.push(wrapLane(spoon + d));
        callMeeting(sim, 2, inviteList(around, spoon), W.delay);
        return;
      }
    }
    m.meeting = null;
    m.meetingTimer = by(M.meetingGap, fury(m));
  }
}

// ── Hits, both ways ──────────────────────────────────────────────────────

/** The meeting's ring reaches the spoon in an invited lane. The Daily Grind's scald rules. */
function scald(sim, lane) {
  const { state, emit } = sim;
  const m = state.manager;
  if (m.safe > 0) return false;
  m.scalds++;
  m.safe = G.safeTime;
  emit('scald', { angle: laneAngle(lane), by: 'meeting', scalds: m.scalds, left: G.scalds - m.scalds });
  if (m.scalds >= G.scalds) finish(sim, 'escaped', 'scalds');
  return true;
}

function damage(sim, amount, puff) {
  const { state, emit } = sim;
  const m = state.manager;
  m.health = Math.max(0, m.health - amount);
  m.flinch = 0.35;
  emit('managerHit', { angle: puff.angle, health: m.health, damage: amount });
  const rage = fury(m) >= 0.8 ? 2 : fury(m) >= 0.5 ? 1 : 0;
  if (rage > m.rage && m.health > 0) {
    m.rage = rage;
    emit('managerRage', { level: rage });
  }
  if (m.health === 0) finish(sim, 'victory');
}

/** Advance the fight: roots, memos, darts, spores, the meeting, and the clock. Call after updateShots(). */
export function updateManager(sim, dt) {
  const m = sim.state.manager;
  m.clock += dt;
  m.safe = Math.max(0, m.safe - dt);
  m.flinch = Math.max(0, m.flinch - dt);
  updateRoots(sim, dt);
  updateMemos(sim, dt);
  resolveShots(sim);
  updatePuffs(sim, dt);
  if (m.stage !== 'fight') return;
  updateMeeting(sim, dt);
  if (m.stage !== 'fight') return;
  m.left = Math.max(0, m.left - dt);
  if (m.left === 0) finish(sim, 'escaped', 'time');
}

// ── The end ──────────────────────────────────────────────────────────────

/** Victory or escape, rewarded exactly as The Daily Grind is. */
function finish(sim, result, reason = null) {
  const { state, emit } = sim;
  const m = state.manager;
  m.stage = 'outro';
  m.time = 0;
  m.result = result;
  m.meeting = null;
  m.memos = [];
  m.puffs = [];
  state.shots = [];
  state.volleys = {};
  const summary = {
    result, reason, perfect: false, cup: false, bonus: 0, cash: 0, scalds: m.scalds,
    memos: m.tally.memos, roots: m.tally.roots, time: m.clock,
  };
  if (result === 'victory') {
    summary.bonus = G.points;
    if (m.milestone) {
      summary.cash = CONFIG.teaCash.milestone;
      state.teaCash += summary.cash;
    }
    state.goldenSpoon = Math.max(state.goldenSpoon, G.goldenSpoon);
    if (m.scalds === 0) {
      summary.perfect = true;
      if (restoreLife(sim, G.maxLives, 'manager')) summary.cup = true;
      else summary.bonus += G.fullCupPoints;
    }
    state.score += summary.bonus;
  }
  m.summary = summary;
  say(sim, result === 'victory' ? 'pinInIt' : 'takeOffline');
  emit(result === 'victory' ? 'managerDefeat' : 'managerEscape', summary);
}
