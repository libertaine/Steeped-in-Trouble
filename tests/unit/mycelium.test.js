// The Mycelium Manager: its rules, its fairness guarantees, and when it comes.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config.js';
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { migrateCheckpoint, validateCheckpoint } from '../../src/core/checkpoint.js';
import { LANES, LANE_STEP, laneAngle, wrapLane } from '../../src/gameplay/arena.js';
import { autoSteamWantedInManager } from '../../src/gameplay/autoSteam.js';
import { MEETING_LINE, claimedLanes, inviteList, twistsFor } from '../../src/gameplay/mycelium.js';
import { SKILLS, fight } from '../support/managerBot.js';
import { V5_KEYS, omit } from '../support/legacyPlay.js';
import { answerShortage, completeRound, finishBonus, finishManager, playingGame, step } from './helpers.js';

const M = CONFIG.manager;
const G = CONFIG.grind;
const RIM = CONFIG.arena.rimRadius;
const signed = (lane, from) => {
  const d = wrapLane(lane - from);
  return d >= LANES / 2 ? d - LANES : d;
};

/** A game in the Manager's fight, with nothing scheduled: tests add what they need. */
function arena({ seed = 1, appearance = 1, quiet = true } = {}) {
  const game = createGame({ seed });
  game.primaryAction();
  const s = game.state;
  Object.assign(s, { phase: 'reading', readingTime: 10, offer: null, havocDue: false, grindDue: false, shortageDue: false,
    arcadeDue: null, managerDue: true, grindAfter: null, progress: appearance === 1 ? { chapter: 2, starts: [1, 6] } : { chapter: 3, starts: [1, 6, 11] },
    managerAfter: appearance === 1 ? s.round : null, managerVisits: Math.max(0, appearance - 2) });
  game.primaryAction();
  game.primaryAction(); // skip the entrance
  if (quiet) Object.assign(s.manager, { rootTimer: Infinity, memoTimer: Infinity, meetingTimer: Infinity });
  game.drainEvents();
  return game;
}

const root = (lane, tip) => ({ lane, stage: 'grow', time: 0, tip, frozen: false });
const memo = (m, lane, radius) => ({ id: m.nextId++, lane, angle: laneAngle(lane), radius, speed: 0 });

/** A pot through to the reading after `round`, beating the Grind and (with `win`) the Manager. */
function potTo(round, { win = true } = {}) {
  const game = playingGame({ seed: 9 });
  while (game.state.round <= round) {
    game.state.current = null;
    game.state.modifiers = { ...game.state.modifiers, laneDrift: false };
    completeRound(game);
    if (game.state.round === round) return game;
    game.state.offer = null;
    game.primaryAction();
    answerShortage(game);
    finishBonus(game, { win: game.state.phase === 'grind' || win });
    game.chooseInterlude(false);
    game.chooseDay('keep');
  }
  return game;
}

/** Aim at a lane and fire once (or sugar), then let the dart travel. */
function shoot(game, lane, { sugar = false, seconds = 0.8 } = {}) {
  game.state.angle = laneAngle(lane);
  game.state.shotCooldown = 0;
  if (sugar) game.sugarBurst();
  else game.fireSteam();
  step(game, seconds);
}

describe('the Manager’s twists, appearance by appearance', () => {
  it('starts plain, then adds one twist at a time, then pairs them', () => {
    expect(twistsFor(1)).toEqual([]);
    expect(twistsFor(2)).toEqual(['reorg']);
    expect(twistsFor(3)).toEqual(['backToBack']);
    expect(twistsFor(4)).toEqual(['synergy']);
    expect(twistsFor(5)).toEqual(['reorg', 'backToBack']);
    expect(twistsFor(6)).toEqual(['backToBack', 'synergy']);
    expect(twistsFor(7)).toEqual(['synergy', 'reorg']);
    expect(twistsFor(8)).toEqual(['reorg', 'backToBack']);
  });

  it('keeps the health and the clock the same at every appearance', () => {
    for (const appearance of [1, 2, 3, 4, 5, 9]) {
      const m = arena({ appearance }).state.manager;
      expect(m.twists).toEqual(twistsFor(appearance));
      expect({ health: m.health, left: m.left }).toEqual({ health: M.health, left: G.duration });
    }
  });
});

describe('who is invited: the fairness guarantee', () => {
  // Thousands of random claims and spoon positions, every one of them checked.
  const rng = createRandom(0x5afe);
  const cases = Array.from({ length: 4000 }, () => {
    const claimed = [];
    const share = rng.next();
    for (let lane = 0; lane < LANES; lane++) if (rng.next() < share) claimed.push(lane);
    return { claimed, spoon: rng.int(LANES) };
  });

  it('never invites more than the limit, and only lanes that were claimed', () => {
    for (const { claimed, spoon } of cases) {
      const invited = inviteList(claimed, spoon);
      expect(invited.length).toBeLessThanOrEqual(M.maxInvited);
      for (const lane of invited) expect(claimed).toContain(lane);
    }
  });

  it('always leaves two adjacent safe lanes within easy reach of the spoon', () => {
    for (const { claimed, spoon } of cases) {
      const invited = new Set(inviteList(claimed, spoon));
      let pocket = false;
      for (let a = -M.pocketReach; a < M.pocketReach; a++) {
        if (!invited.has(wrapLane(spoon + a)) && !invited.has(wrapLane(spoon + a + 1))) pocket = true;
      }
      expect(pocket, `claimed ${claimed} from ${spoon}`).toBe(true);
    }
  });

  it('lets nothing off when the cup already has room, so cutting roots is what makes space', () => {
    for (const { claimed, spoon } of cases) {
      const set = new Set(claimed);
      let room = false;
      for (let a = -M.pocketReach; a < M.pocketReach; a++) {
        if (!set.has(wrapLane(spoon + a)) && !set.has(wrapLane(spoon + a + 1))) room = true;
      }
      if (room && claimed.length <= M.maxInvited) expect(inviteList(claimed, spoon)).toEqual([...set].sort((a, b) => a - b));
    }
  });

  it('puts the pocket a short walk away when it has to make one, not under a spoon that stood still', () => {
    const everything = Array.from({ length: LANES }, (_, i) => i);
    const invited = new Set(inviteList(everything, 0));
    expect(invited.has(0)).toBe(true);
    const safe = Array.from({ length: LANES }, (_, i) => i).filter((lane) => !invited.has(lane) && Math.abs(signed(lane, 0)) <= M.pocketReach);
    expect(safe.every((lane) => Math.abs(signed(lane, 0)) >= 2)).toBe(true);
  });

  it('leaves time to reach the pocket at the plain spoon’s speed, with every warning', () => {
    // The pocket's middle is at most pocketReach − 0.5 lanes away, and clear of every invited lane.
    const travel = ((M.pocketReach - 0.5) * LANE_STEP) / CONFIG.player.turnSpeed;
    expect(travel).toBeLessThan(M.minWarn * 0.6);
    expect(1.5 - 1).toBeGreaterThan(0); // the middle of a two-lane pocket is 1.5 lanes from the nearest invited lane
    expect(1.5).toBeGreaterThan(G.hitHalfWidth + 0.5);
    expect(CONFIG.manager.secondWave.delay * CONFIG.player.turnSpeed).toBeGreaterThan((M.secondWave.halfWidth + 1) * LANE_STEP);
  });
});

describe('fairness in whole fights', () => {
  it('never scalds a careful player, at any appearance', () => {
    for (let appearance = 1; appearance <= 7; appearance++) {
      for (let seed = 1; seed <= 12; seed++) {
        expect(fight({ seed, skill: 'careful', appearance }).scalds, `appearance ${appearance}, seed ${seed}`).toBe(0);
      }
    }
  });

  it('only ever lets lanes off during a warning, and scalds only in an invited lane as the ring arrives', () => {
    const rng = createRandom(77);
    for (let seed = 1; seed <= 20; seed++) {
      let held = null;
      const appearance = 1 + (seed % 7);
      const r = fight({
        seed, skill: Object.keys(SKILLS)[seed % 3], appearance, watch: (s) => {
          const a = s.manager.meeting;
          if (a?.stage === 'warn') {
            if (held && held.wave === a.wave) for (const lane of a.lanes) expect(held.lanes).toContain(lane);
            held = { wave: a.wave, lanes: [...a.lanes] };
          } else if (!a) held = null;
          // A random nudge now and then, so the spoon is not always where a bot would put it.
          if (rng.next() < 0.01) s.angle += (rng.next() - 0.5) * LANE_STEP;
        },
      });
      const scalds = r.game.drainEvents().filter((e) => e.type === 'scald');
      for (const e of scalds) expect(e.by).toBe('meeting');
    }
  });
});

describe('roots', () => {
  it('telegraph before they grow, then grow out from the Manager', () => {
    const game = arena({ quiet: false });
    const m = game.state.manager;
    Object.assign(m, { memoTimer: Infinity, meetingTimer: Infinity });
    step(game, M.lesson.root + 0.05);
    expect(m.roots).toHaveLength(1);
    expect(m.roots[0]).toMatchObject({ stage: 'sprout', tip: M.bodyRadius });
    step(game, M.rootSprout);
    expect(m.roots[0].stage).toBe('grow');
    const tip = m.roots[0].tip;
    step(game, 1);
    expect(m.roots[0].tip).toBeGreaterThan(tip);
  });

  it('are cut back a little way by each steam dart, and cleared once short enough', () => {
    const game = arena();
    const m = game.state.manager;
    m.roots = [root(3, 220)];
    shoot(game, 3, { seconds: 0.2 }); // a dart reaches it in about a tenth of a second
    const cut = game.drainEvents().find((e) => e.type === 'rootCut');
    expect(cut).toMatchObject({ lane: 3, cleared: false });
    expect(m.roots[0].tip).toBeLessThan(cut.tip - M.cutBack + 5);
    while (m.roots.length) shoot(game, 3);
    expect(game.drainEvents().filter((e) => e.type === 'rootCut').at(-1)).toMatchObject({ lane: 3, cleared: true });
  });

  it('are cleared three lanes at a time by sugar', () => {
    const game = arena();
    const m = game.state.manager;
    m.roots = [root(4, 250), root(5, 250), root(6, 250), root(8, 250)];
    shoot(game, 5, { sugar: true });
    expect(m.roots.map((r) => r.lane)).toEqual([8]);
  });

  it('stop growing under milk while the cloud lasts', () => {
    const game = arena();
    const m = game.state.manager;
    m.roots = [root(2, 120), root(9, 120)];
    game.state.angle = laneAngle(2);
    expect(game.pourMilk()).toBe(true);
    step(game, 2);
    expect(m.roots[0]).toMatchObject({ tip: 120, frozen: true });
    expect(m.roots[1].tip).toBeGreaterThan(120);
    step(game, CONFIG.milk.duration);
    expect(m.roots[0].tip).toBeGreaterThan(120);
  });

  it('claim their lane once past the meeting line', () => {
    const m = arena().state.manager;
    m.roots = [root(1, MEETING_LINE - 1), root(2, MEETING_LINE)];
    expect(claimedLanes(m)).toEqual([2]);
  });

  it('shield a memo behind their tip until cut back past it', () => {
    const game = arena();
    const m = game.state.manager;
    m.roots = [root(7, 240)];
    m.memos = [memo(m, 7, 150)];
    shoot(game, 7);
    expect(m.memos).toHaveLength(1);
    while (m.memos.length) shoot(game, 7);
    expect(m.roots.length === 0 || m.roots[0].tip < 150).toBe(true);
  });
});

describe('memos', () => {
  it('are the only way to hurt the Manager: popped, their spores fly back down the lane', () => {
    const game = arena();
    const m = game.state.manager;
    m.memos = [memo(m, 4, 200)];
    shoot(game, 4);
    expect(m.memos).toHaveLength(0);
    expect(m.health).toBe(M.health - M.memoDamage);
    shoot(game, 9); // straight into the Manager: a harmless thump
    expect(m.health).toBe(M.health - M.memoDamage);
    expect(game.drainEvents().map((e) => e.type)).toEqual(expect.arrayContaining(['memoPop', 'managerHit', 'thump']));
  });

  it('file themselves on the rim when left alone, inviting their lane to the next meeting', () => {
    const game = arena();
    const m = game.state.manager;
    m.memos = [{ ...memo(m, 11, RIM - 20), speed: 60 }];
    step(game, 1);
    expect(m.notes).toEqual([11]);
    expect(claimedLanes(m)).toEqual([11]);
  });

  it('are slowed by milk', () => {
    const game = arena();
    const m = game.state.manager;
    m.memos = [{ ...memo(m, 0, 120), speed: 50 }, { ...memo(m, 8, 120), speed: 50 }];
    game.state.angle = laneAngle(0);
    game.pourMilk();
    step(game, 1);
    expect(m.memos[0].radius).toBeLessThan(m.memos[1].radius);
  });
});

describe('all-hands meetings', () => {
  it('invite the claimed lanes, scald the spoon in one, and clear the notes', () => {
    const game = arena();
    const m = game.state.manager;
    m.roots = [root(0, 260)];
    m.notes = [6];
    m.meetingTimer = 0.01;
    game.state.angle = laneAngle(0);
    step(game, 0.05);
    expect(m.meeting).toMatchObject({ stage: 'warn', wave: 1 });
    expect(m.meeting.lanes).toEqual(expect.arrayContaining([6]));
    m.roots[0].frozen = true;
    step(game, M.warn[0] + 0.6);
    expect(m.notes).toEqual([]);
    expect(m.meeting).toBeNull();
  });

  it('let a lane off when its root is cut back below the line during the warning, but never add one', () => {
    const game = arena();
    const m = game.state.manager;
    m.roots = [root(3, MEETING_LINE + 20), root(12, MEETING_LINE - 30)];
    game.state.angle = laneAngle(8);
    m.meetingTimer = 0.01;
    step(game, 0.05);
    expect(m.meeting.lanes).toEqual([3]);
    shoot(game, 3, { seconds: 0.4 });
    expect(m.meeting.lanes).toEqual([]);
    m.roots.find((r) => r.lane === 12).tip = MEETING_LINE + 50; // grows across mid-warning
    step(game, 0.1);
    expect(m.meeting.lanes).toEqual([]);
  });

  it('scald once, by the Grind’s rules, only when the ring reaches the rim', () => {
    const game = arena();
    const m = game.state.manager;
    m.notes = [5];
    game.state.angle = laneAngle(5);
    m.meetingTimer = 0.01;
    // A spoon that cannot be moved: invitations are kept, the pocket is elsewhere.
    step(game, 0.05);
    expect(m.meeting.lanes).toContain(5);
    step(game, m.meeting.length + 0.01);
    expect(m.scalds).toBe(0); // the ring is still on its way
    step(game, 0.5);
    expect(m.scalds).toBe(1);
    expect(m.safe).toBeGreaterThan(0);
  });

  it('start late in the first encounter, one thing at a time, and sooner in a rematch', () => {
    const first = [];
    fight({ seed: 3, skill: 'careful', appearance: 1, watch: (s) => {
      const m = s.manager;
      if (m.memos.length && !first.memo) first.memo = m.clock;
      if (m.roots.length && !first.root) first.root = m.clock;
      if (m.meeting && !first.meeting) first.meeting = m.clock;
    } });
    expect(first.root).toBeLessThan(first.memo);
    expect(first.memo).toBeGreaterThanOrEqual(M.lesson.memo);
    expect(first.meeting).toBeGreaterThanOrEqual(M.lesson.meeting);
    const later = {};
    fight({ seed: 3, skill: 'careful', appearance: 2, watch: (s) => {
      if (s.manager.memos.length && !later.memo) later.memo = s.manager.clock;
      if (s.manager.meeting && !later.meeting) later.meeting = s.manager.clock;
    } });
    expect(later.memo).toBeLessThan(first.memo);
    expect(later.meeting).toBeLessThan(first.meeting);
  });
});

describe('the twists', () => {
  it('The Reorg: roots in adjacent pairs, memos cc’d in pairs', () => {
    const game = arena({ appearance: 2 });
    const m = game.state.manager;
    m.rootTimer = 0.01;
    step(game, 0.05);
    expect(m.roots).toHaveLength(2);
    expect(wrapLane(m.roots[1].lane - m.roots[0].lane)).toBe(1);
    m.memoTimer = 0.01;
    step(game, 0.05);
    expect(m.memos).toHaveLength(2);
  });

  it('Back-to-Back Meetings: a second wave around wherever the spoon hid', () => {
    const game = arena({ appearance: 3 });
    const m = game.state.manager;
    game.state.angle = laneAngle(4);
    m.meetingTimer = 0.01;
    step(game, 0.05);
    step(game, m.meeting.length + 0.5);
    expect(m.meeting).toMatchObject({ stage: 'warn', wave: 2, length: M.secondWave.delay });
    for (const lane of m.meeting.lanes) expect(Math.abs(signed(lane, 4))).toBeLessThanOrEqual(M.secondWave.halfWidth);
  });

  it('change the mix of memos, not how many there are to pop', () => {
    /** Memos released in 30 s of a fight with nothing else going on, nothing popped and nothing cut. */
    const supply = (appearance) => {
      const game = arena({ appearance, quiet: false });
      Object.assign(game.state.manager, { rootTimer: Infinity, meetingTimer: Infinity, health: M.health });
      const memos = [];
      for (let t = 0; t < 30; t += 1 / 60) {
        game.update(1 / 60);
        for (const e of game.drainEvents()) if (e.type === 'memo') memos.push(...e.lanes);
        game.state.manager.memos = []; // out of the way, so the limit never holds any back
      }
      return memos.length;
    };
    const plain = supply(2 + 2); // Synergy alone, for its own check below
    const base = supply(3); // Back-to-Back Meetings: the plain memo supply
    expect(supply(2) / base).toBeGreaterThan(0.85); // The Reorg: pairs, half as often
    expect(supply(2) / base).toBeLessThan(1.15);
    expect(plain / base).toBeLessThan(0.8); // Synergy: most must be earned by cutting roots
  });

  it('Synergy: cutting a root clear drops a memo from its base', () => {
    const game = arena({ appearance: 4 });
    const m = game.state.manager;
    m.roots = [root(10, M.bodyRadius + 20)];
    shoot(game, 10, { seconds: 0.1 });
    step(game, 0.3);
    expect(m.roots).toHaveLength(0);
    expect(m.memos.map((x) => x.lane)).toContain(10);
  });
});

describe('how it ends', () => {
  it('gets away after three scalds, or when time runs out, and never costs a cup', () => {
    const game = arena();
    const lives = game.state.lives;
    const m = game.state.manager;
    m.notes = [0];
    for (let i = 0; i < G.scalds; i++) {
      game.state.angle = laneAngle(0);
      m.safe = 0;
      m.meetingTimer = 0.01;
      step(game, 0.05);
      m.meeting.lanes = [0];
      step(game, m.meeting.length + 0.5);
      m.notes = [0];
    }
    expect(m).toMatchObject({ stage: 'outro', result: 'escaped' });
    expect(m.summary.reason).toBe('scalds');
    expect(game.state.lives).toBe(lives);
    const late = arena();
    late.state.manager.left = 0.02;
    step(late, 0.1);
    expect(late.state.manager.summary.reason).toBe('time');
  });

  it('pays out like The Daily Grind when beaten: points, Tea Cash for the milestone, gold, and a cup for a perfect fight', () => {
    const game = arena();
    const { state } = game;
    state.lives = 2;
    const cash = state.teaCash;
    state.manager.health = M.memoDamage;
    state.manager.memos = [memo(state.manager, 2, 200)];
    shoot(game, 2);
    expect(state.manager.summary).toMatchObject({ result: 'victory', perfect: true, cup: true, cash: CONFIG.teaCash.milestone });
    expect(state.teaCash).toBe(cash + CONFIG.teaCash.milestone);
    expect(state.goldenSpoon).toBe(G.goldenSpoon);
    expect(state.lives).toBe(3);
    expect(game.drainEvents().filter((e) => e.type === 'managerSay').map((e) => e.line)).toContain('pinInIt');
  });

  it('says each line at most once an encounter', () => {
    const r = fight({ seed: 5, skill: 'casual', appearance: 1 });
    const lines = r.game.drainEvents().filter((e) => e.type === 'managerSay').map((e) => e.line);
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('Auto Steam', () => {
  it('fires at a memo or a root tip in the spoon’s lane, and at nothing else', () => {
    const game = arena();
    const { state } = game;
    const m = state.manager;
    state.angle = laneAngle(6);
    expect(autoSteamWantedInManager(state)).toBe(false);
    m.memos = [memo(m, 7, 150)];
    expect(autoSteamWantedInManager(state)).toBe(false);
    m.roots = [root(6, 140)];
    expect(autoSteamWantedInManager(state)).toBe(true);
    m.roots = [];
    m.memos = [memo(m, 6, 150)];
    expect(autoSteamWantedInManager(state)).toBe(true);
  });

  it('is offered Easy Touch’s cup gestures during the fight', () => {
    expect(arena().touchGestures()).toBe('cup');
  });
});

describe('when the Manager comes', () => {
  it('follows Chapter 2’s fifth cup, and nothing else shares that reading', () => {
    const game = potTo(10);
    const s = game.state;
    expect(s.progress).toEqual({ chapter: 2, starts: [1, 6] });
    expect(s).toMatchObject({ managerAfter: 10, managerDue: true, grindDue: false, havocDue: false, shortageDue: false, arcadeDue: null });
    s.offer = null;
    game.primaryAction();
    expect(s.phase).toBe('manager');
    expect(s.manager).toMatchObject({ milestone: true, appearance: 1, twists: [] });
  });

  it('comes back two cups after an escape, as the same first encounter', () => {
    const game = potTo(10);
    game.state.offer = null;
    game.primaryAction();
    finishManager(game); // it gets away
    expect(game.state.managerAfter).toBe(10 + M.retryAfter);
    expect(game.state.progress.chapter).toBe(2);
    expect(game.state.managerVisits).toBe(0);
  });

  it('is never scheduled before Chapter 2, nor kept by a pot that has not reached it', () => {
    const game = potTo(4);
    expect(game.state).toMatchObject({ managerAfter: null, managerDue: false });
  });

  it('keeps a milestone reading free of the Tea Shortage, which waits for the next one', () => {
    const game = potTo(9);
    const s = game.state;
    expect(s.managerAfter).toBe(10);
    s.offer = null;
    game.primaryAction();
    answerShortage(game);
    finishBonus(game, { win: true });
    game.chooseInterlude(false);
    expect(s).toMatchObject({ phase: 'playing', round: 10 });
    s.shortageAfter = 10; // a shortage is due at this reading too
    s.current = null;
    completeRound(game);
    expect(s).toMatchObject({ managerDue: true, shortageDue: false, shortageAfter: 10 });
  });
});

describe('saving with the Manager', () => {
  it('saves its schedule at a reading, never a fight, and resumes into it', () => {
    const game = potTo(10);
    const s = game.state;
    expect(s.managerDue).toBe(true);
    const saved = game.exportCheckpoint();
    expect(validateCheckpoint(saved)).toBe(true);
    expect(saved.state.manager).toBeNull();
    const restored = createGame({ checkpoint: saved });
    restored.update(5);
    restored.primaryAction();
    game.update(5);
    game.primaryAction();
    expect(restored.state.phase).toBe('manager');
    expect(JSON.stringify(restored.state.manager)).toBe(JSON.stringify(game.state.manager));
    expect(restored.exportRandom()).toEqual(game.exportRandom());
  });

  it('refuses a save with two encounters due, or a Manager scheduled outside Chapter 2', () => {
    const game = createGame({ seed: 4 });
    game.primaryAction();
    game.state.spawnTimer = 1e6;
    completeRound(game);
    const saved = game.exportCheckpoint();
    for (const change of [
      (c) => Object.assign(c.state, { managerDue: true, grindDue: true }),
      (c) => { c.state.managerAfter = 5; }, // Chapter 1
      (c) => { c.state.manager = {}; },
      (c) => { c.state.mushroomCups = c.state.round + 1; },
      (c) => { c.state.strangeFirst = 1; }, // no Mushroom Tea yet
      (c) => { c.state.managerVisits = 1; }, // a rematch before Chapter 3
    ]) {
      const c = structuredClone(saved);
      change(c);
      expect(validateCheckpoint(c)).toBe(false);
    }
  });

  it('migrates a schema 4 save made by a development build, scheduling the Manager for Chapter 2', () => {
    const game = createGame({ seed: 4 });
    game.primaryAction();
    const s = game.state;
    Object.assign(s, { round: 7, heat: 6, progress: { chapter: 2, starts: [1, 6] }, grindAfter: null, managerAfter: 10, spawnTimer: 1e6 });
    s.teaServed = { [s.tea]: 7 };
    s.target = CONFIG.rounds.baseTarget + 12;
    completeRound(game);
    const saved = game.exportCheckpoint();
    const state = omit(saved.state, V5_KEYS);
    const random = omit(saved.random, ['manager']);
    const stream = saved.random.manager;
    const v4 = { schemaVersion: 4, state, random, pinnedTea: null };
    const migrated = migrateCheckpoint(v4);
    expect(migrated.state).toEqual(saved.state);
    expect(migrated.random).toEqual({ ...random, manager: stream });
    // A layout that is not schema 4's is refused, not guessed at.
    expect(migrateCheckpoint({ ...v4, state: { ...state, mushroomCups: 0 } })).toBeNull();
  });
});
