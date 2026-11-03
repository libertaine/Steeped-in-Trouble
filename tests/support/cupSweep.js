// Late-game difficulty measurements (issue #13): real cups, played by a
// scripted player at a chosen chapter, Heat and skill. It presses only the
// game's own controls, with a reaction delay and the odd slip of aim, so
// "skill" is speed and accuracy, never hidden knowledge. Seeded throughout.
import { createGame } from '../../src/core/game.js';
import { createRandom } from '../../src/core/random.js';
import { angleDifference, laneOf, wrapLane } from '../../src/gameplay/arena.js';
import { CONFIG } from '../../src/config.js';
import { completeRound } from '../unit/helpers.js';

const DT = 1 / 60;
const RIM = CONFIG.arena.rimRadius;
const DANGER = RIM * 0.7; // a leaf this far out needs dealing with now

/**
 * How each kind of player plays: reaction (s), aim slips, when they reach for
 * milk and sugar, and what they look at: the leaf nearest the rim, or (when
 * struggling) the leaf nearest the spoon, which is how people fall behind.
 */
export const PLAYERS = Object.freeze({
  strong: { reaction: 0.15, slip: 0.03, milkAt: 3, sugarAt: 3, pick: 'rim' },
  casual: { reaction: 0.3, slip: 0.12, milkAt: 3, sugarAt: 4, pick: 'rim' },
  struggling: { reaction: 0.5, slip: 0.25, milkAt: 4, sugarAt: 5, pick: 'near' },
});

/** The spoon a pot has by Day 2: most of the upgrades (cups 11–20). */
export const LATE_SPOON = Object.freeze({ polished: 2, quickStir: 2, sugarScoop: 1, strainer: 1 });

/**
 * Play cup `round` of a pot in `chapter` at `heat`, through a real reading
 * hand-off so the cup starts with the chapter, Heat and tea rules it would
 * have. Lives are not limited: we count them.
 * @returns {{ tea, livesLost, escapes, nearMisses, time, crowded, window, rushes }} time: seconds of play
 */
export function playCup({ seed, chapter, heat, round, player, spoon = LATE_SPOON }) {
  const P = PLAYERS[player];
  const game = createGame({ seed });
  game.primaryAction();
  const s = game.state;
  s.current = null;
  completeRound(game);
  Object.assign(s, {
    offer: null, nextFortune: null, heat: heat - 1, round: round - 1, spoon: { ...spoon },
    progress: chapter === 3 ? { chapter: 3, starts: [1, 6, 11] } : { chapter: 2, starts: [1, 6] },
    grindAfter: null, managerAfter: null, havocDue: false, grindDue: false, managerDue: false, shortageDue: false,
    arcadeDue: null, dayPending: false, lives: 1e6,
  });
  if (heat === 0) s.heat = 0; // nextHeat() adds one; a Fresh Brew cup starts at none
  game.primaryAction();
  if (s.phase !== 'playing' || s.round !== round) throw new Error(`no cup: ${s.phase}`);
  if (heat === 0) s.heat = 0;
  const hands = createRandom(seed ^ 0x5eeb);
  const lives = s.lives;
  let target = null;
  let thought = 0;
  let aim = null;
  let crowdedTime = 0;
  let busyTime = 0;
  let reach = 0; // the nearest leaf's share of the way to the rim, summed over time
  let peak = 0; // and its highest
  const windows = [];
  let rushes = 0;
  let t = 0;
  for (; t < 240 && s.phase === 'playing'; t += DT) {
    thought -= DT;
    if (!s.enemies.includes(target) || thought <= 0) {
      const score = (e) => (P.pick === 'rim' ? e.radius : -Math.abs(angleDifference(e.angle, s.angle)));
      const next = s.enemies.reduce((a, e) => (!a || score(e) > score(a) ? e : a), null);
      if (next && next !== target && next.radius > DANGER) windows.push((RIM - next.radius) / Math.max(1, next.speed));
      target = next;
      aim = target && hands.next() < P.slip ? wrapLane(laneOf(target.angle) + (hands.next() < 0.5 ? -1 : 1)) : null;
      thought = P.reaction;
    }
    const danger = s.enemies.filter((e) => e.radius > DANGER).length;
    if (danger >= 2) crowdedTime += DT;
    if (s.enemies.length >= 3) busyTime += DT;
    const near = s.enemies.reduce((m, e) => Math.max(m, e.radius / RIM), 0);
    reach += near * DT;
    peak = Math.max(peak, near);
    if (danger >= P.milkAt && s.milkLeft > 0) game.pourMilk();
    if (danger >= P.sugarAt && s.sugarLeft > 0) game.sugarBurst();
    let input = { left: false, right: false, fire: false };
    if (target) {
      const lane = aim ?? laneOf(target.angle);
      const turn = angleDifference(-Math.PI / 2 + lane * (Math.PI / 8), s.angle);
      const there = laneOf(s.angle) === lane;
      input = { left: !there && turn < 0, right: !there && turn > 0, fire: there };
    }
    game.update(DT, input);
    rushes += game.drainEvents().filter((e) => e.type === 'rush').length;
  }
  const stats = s.roundStats;
  return {
    tea: s.tea, livesLost: lives - s.lives, escapes: stats.escapes, nearMisses: stats.nearMisses, time: t,
    crowded: crowdedTime, busy: busyTime, reach, peak, window: windows.length ? Math.min(...windows) : Infinity, rushes,
  };
}

/**
 * Many cups, summarised: per cup, the share of cups that cost a cup, the
 * escapes and cups lost, the share of play with two or more leaves in the
 * danger zone, and the tightest reaction window (seconds) seen.
 */
export function measure({ chapter, heats, players = Object.keys(PLAYERS), seeds = 20, firstSeed = 1 }) {
  const rows = {};
  for (const player of players) {
    let cups = 0, lost = 0, escapes = 0, crowded = 0, busy = 0, reach = 0, peak = 0, time = 0, costly = 0, rushes = 0;
    const tight = [];
    for (const heat of heats) {
      for (let i = 0; i < seeds; i++) {
        const round = 11 + (heat % 10);
        const r = playCup({ seed: firstSeed + i + 100 * heat, chapter, heat, round, player });
        cups++;
        lost += r.livesLost;
        escapes += r.escapes;
        crowded += r.crowded;
        busy += r.busy;
        reach += r.reach;
        peak += r.peak;
        time += r.time;
        rushes += r.rushes;
        if (r.livesLost > 0) costly++;
        if (Number.isFinite(r.window)) tight.push(r.window);
      }
    }
    tight.sort((a, b) => a - b);
    rows[player] = {
      cups, costly: costly / cups, lostPerCup: lost / cups, escapesPerCup: escapes / cups, seconds: time / cups,
      crowded: crowded / Math.max(1e-9, time), busy: busy / Math.max(1e-9, time), reach: reach / Math.max(1e-9, time),
      peak: peak / cups, window10: tight[Math.floor(tight.length * 0.1)] ?? Infinity, rushesPerCup: rushes / cups,
    };
  }
  return rows;
}
