// Ambient visitors: purely decorative life in the empty stage gutters.
//
// Nothing here reads or writes game state, consumes a gameplay random stream,
// or touches the DOM. The page adapter (ui/ambient.js) measures the layout,
// supplies a presentation policy, and owns the drawing surface. Coordinates
// are CSS pixels relative to that surface.

import { createRandom } from '../core/random.js';

export const AMBIENT = Object.freeze({
  maxVisitors: 6, // prototype ceiling on the roomiest displays
  slots: 12, // ants ever allocated; nothing, not even a debug override, exceeds it
  // Total safe area (CSS px²) → population ceiling. Prototype values, tuned by eye.
  budget: Object.freeze([[420_000, 6], [250_000, 4], [150_000, 3], [0, 2]]),
  lowQuality: 2, // ceiling in Low graphics
  phoneSide: 500, // a touch-first device whose whole screen's short side is at most this is a phone
  phoneLandscape: 2, // ceiling on a phone held sideways; a portrait phone has none
  narrowPortrait: 500, // an upright viewport at most this wide has none either, whatever the device
  clearance: 8, // CSS px kept clear around every protected rectangle
  footprint: 9, // radius containing the whole animated ant, legs and antennae included
  minCorridor: 32, // narrowest gutter (CSS px) a visitor may use
  minLength: 96, // shortest gutter worth wandering along
  areaPerVisitor: 24_000, // CSS px² of one gutter each visitor needs (about 155 × 155)
  spacing: 14, // nearest two ants' centres ever come: bodies never overlap
  speed: [22, 38], // CSS px per second, chosen per path segment
  turnRate: 4.2, // radians per second toward the next waypoint
  firstVisit: [3, 7], // seconds before the first appearance on a calm screen
  cooldown: [14, 30], // seconds of absence between one ant's visits
  stay: [10, 20], // seconds of wandering before heading home
  pause: [0.4, 1.8], // seconds of an occasional stop
  pauseChance: 0.3, // per waypoint reached
  spell: [40, 80], // seconds the colony keeps turning up before it quietens
  empty: [24, 48], // seconds of empty gutters once the last ant has gone
  stagger: [2, 18], // seconds after a spell starts before each later ant arrives
  arrivalGap: [1, 3], // seconds at least between two arrivals: never a procession
  social: Object.freeze({
    every: [6, 14], // seconds between chances of a social moment
    chance: 0.6, // that a chance becomes one; otherwise everyone just wanders
    follow: [6, 12], // seconds one ant trails another
    lag: [0.7, 1.5], // how far behind (seconds of the leader's path) it walks
    keep: 26, // closer than this (centre to centre) a follower waits for its leader to move on
    catchUp: 70, // farther than this it hurries straight after the leader's latest steps
    breakOff: 0.05, // per trail point reached: it loses interest and wanders off
    greet: [0.8, 1.6], // seconds two ants stand face to face
    meet: 15, // centre distance when greeting: antennae just touch
    approach: 6, // seconds allowed to reach each other before giving up
    drift: [5, 9], // seconds a few ants travel the same way
    reach: 200, // farthest apart (CSS px) two ants can be to start meeting or drifting
    followReach: 110, // farthest a leader can be: a follower must be able to catch up
    lose: 150, // a follower left this far behind gives up
  }),
  crumb: Object.freeze({
    every: [40, 90], // seconds of an active, populated colony between chances of a crumb
    chance: 0.5, // that a chance brings one
    near: [45, 100], // how far from a wandering ant it turns up
    notice: 80, // an available ant this close may notice it
    noticeRate: 0.8, // chance per second of noticing, while that close
    linger: [15, 25], // seconds an unnoticed crumb lies there before it is gone
    fade: 0.6, // seconds to appear, or to disappear unclaimed
    approach: 8, // seconds allowed to reach it before losing interest
    investigate: [0.8, 1.8], // seconds spent looking it over
    lift: 0.25, // seconds to lift it into the jaws: it never jumps there
    pace: 0.75, // carrying speed, as a share of its usual pace
    pauseChance: 0.25, // per carrying waypoint: a stop to shift its grip
    radius: 2.4, // the crumb's outline stays within this of its centre
    mouth: 6.2, // a carried crumb's centre, ahead of the ant's; mouth + radius stays inside the footprint
  }),
  cube: Object.freeze({
    every: [720, 1200], // seconds of eligible time (High, room for three, a roomy region) between opportunities
    window: 90, // seconds an opportunity waits for free ants and space before it is skipped
    retry: 2, // seconds between tries within that window
    four: 0.5, // chance of a team of four, when four can be had (otherwise three)
    half: 10, // half the cube's side: a 20 px cube beside a 12 px ant
    radius: 18, // the cube's whole drawing (sides, shadow and lift included) stays within this of its centre
    reach: 32, // the whole procession (cube, every carrier's legs and antennae, stumbles, sway) stays within this
    corridor: 96, // narrowest region side a procession may use, whatever an ant on its own could
    length: 220, // shortest long side: room for a journey worth the name
    margin: 6, // the cube turns up this much deeper than its reach: room to gather round it
    near: [40, 120], // how far from a free ant it turns up
    recruit: 400, // farthest a present ant can be to be called over; the rest come in through a portal
    clear: 38, // every other ant keeps its centre this far from the procession's
    keep: 25, // a carrier walking over keeps this far from the cube until it steps in
    stage: 27, // where a carrier stands, on its place's side, before stepping in
    settle: 0.5, // seconds to step in from there and take hold
    spacing: 11, // carriers' closest centres: the 14 px rule's controlled exception within the team
    stumble: 6, // the farthest a carrier strays from its place (a stumble, falling behind)
    sway: 1.5, // the cube's side-to-side sway as they heave
    speed: [11, 16], // CSS px per second along the route, chosen per leg (heaving takes a quarter off on average)
    accel: 12, // CSS px/s² gathering speed (three times that stopping)
    turnRate: 1.1, // radians per second turning the cube round a corner
    along: [80, 240], // first leg's length, along its gutter
    journey: [140, 280], // a preferred whole route; never a longer one (a short one is better than a long trek)
    fade: 0.8, // seconds to appear, or to disappear when given up
    lift: 0.6, // seconds of the shared lift before setting off
    gather: 24, // seconds allowed to gather round before giving up
    lifetime: 150, // a backstop: no procession lasts longer
    nudge: 0.6, // seconds between asks that an ant in the way step aside
    shoo: 4, // seconds held up before the ant in the way is sent home
    stuck: 12, // seconds held up before the cube is given up
    quirk: [4, 9], // seconds between chances of a small mistake
    quirkChance: 0.6, // that a chance becomes one
    hesitate: 0.4, // chance of stopping to reconsider before a turn
  }),
});

const QUIRKS = ['wrong-way', 'reconsider', 'straggler', 'reposition'];

/**
 * The carriers' places round the cube, in the cube's frame (x along the way
 * it travels, y across it): [x, y, facing], facing relative to the travel
 * heading. One pulls in front, facing the cube and walking backwards; two
 * lift at the sides, turned in to it; with four, one more pushes behind.
 * Every place is at least 19 px from every other, so the team keeps clear
 * of one another, strays included, without the 14 px rule (see
 * AMBIENT.cube.spacing).
 */
export function formation(size, tuning = AMBIENT) {
  const h = tuning.cube.half;
  const front = [h + 5.5, 0, Math.PI], side = h + 4.5;
  if (size === 3) return [front, [-4, side, -0.5], [-4, -side, 0.5]];
  return [front, [-2, side, -0.5], [-2, -side, 0.5], [-(h + 5.5), 0, 0]];
}

/** Whether a region is roomy enough for a procession: a corridor wide and long enough, and room for three ants. */
export function cubeRoom(r, tuning = AMBIENT) {
  const k = tuning.cube;
  return Math.min(r.w, r.h) >= k.corridor && Math.max(r.w, r.h) >= k.length
    && regionCapacity(r, tuning.areaPerVisitor) >= 3 && r.portals.length > 0;
}

/**
 * A procession's way out of `region` from (x, y), for its centre: an
 * optional first leg along the portal side (`along` px, clamped), then
 * straight out through `portal` to a point just beyond it where the whole
 * procession is clipped. Every point but the last lies in the region shrunk
 * by the procession's reach, so the procession stays inside it; on the way
 * out it stays level with the region. Writes up to two points into `out`
 * (a Float64Array of 4) and returns how many.
 */
export function planRoute(region, x, y, portal, along, out, tuning = AMBIENT) {
  const k = tuning.cube, b = inflate(region, -k.reach);
  const side = portal === 'left' || portal === 'right';
  const lo = side ? b.y : b.x, hi = side ? b.y + b.h : b.x + b.w;
  const from = side ? y : x;
  const to = Math.max(lo, Math.min(hi, from + along));
  let n = 0;
  if (Math.abs(to - from) >= 30) {
    out[0] = side ? x : to;
    out[1] = side ? to : y;
    n = 1;
  }
  const lateral = Math.abs(to - from) >= 30 ? to : from;
  const beyond = k.reach + 2;
  out[n * 2] = portal === 'left' ? region.x - beyond : portal === 'right' ? region.x + region.w + beyond : lateral;
  out[n * 2 + 1] = portal === 'top' ? region.y - beyond : portal === 'bottom' ? region.y + region.h + beyond : lateral;
  return n + 1;
}

// Scenes calm enough for a visitor. Decisions, adventures, bosses and game over are not.
const CALM = new Set(['ready', 'playing', 'reading']);

/**
 * What the ambient layer may do on this frame.
 *   'off'    — no visitor at all; any current one is retired.
 *   'hidden' — a modal covers the stage: keep the visitor's place, draw nothing.
 *   'frozen' — paused, unfocused, hidden tab or a rewind: draw it standing still.
 *   'run'    — animate.
 */
export function ambientPolicy({ phase, pausedFrom = null, offer = false, reduced = false,
  blocked = false, holding = false, hidden = false, focused = true } = {}) {
  if (reduced) return 'off';
  const scene = phase === 'paused' ? pausedFrom : phase;
  if (!CALM.has(scene) || (scene === 'reading' && offer)) return 'off';
  if (blocked) return 'hidden';
  if (hidden || !focused || holding || phase === 'paused') return 'frozen';
  return 'run';
}

const rect = (x, y, w, h) => ({ x, y, w, h });

export function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

const FIT = 1e-6; // rounding allowance when a footprint touches a region's side

/**
 * Whether the box (x - d, y - d, 2d × 2d) lies inside `r`; with `portal`,
 * it may also reach past that side of `r` (into clipped space beyond it),
 * but no other.
 */
function holds(r, x, y, d, portal = null) {
  return (x - d >= r.x - FIT || portal === 'left') && (x + d <= r.x + r.w + FIT || portal === 'right')
    && (y - d >= r.y - FIT || portal === 'top') && (y + d <= r.y + r.h + FIT || portal === 'bottom');
}

/** Inflate a rectangle by d on every side (negative d shrinks it). */
export function inflate(r, d) {
  return rect(r.x - d, r.y - d, r.w + 2 * d, r.h + 2 * d);
}

/**
 * Free space left in `area` once every exclusion is removed. Each piece is a
 * full-height or full-width strip beside an exclusion, so pieces can overlap
 * (safeRegions() makes them disjoint).
 */
export function subtract(area, exclusions) {
  let pieces = [area];
  for (const e of exclusions) {
    const next = [];
    for (const r of pieces) {
      if (!intersects(r, e)) { next.push(r); continue; }
      const right = r.x + r.w, bottom = r.y + r.h, eRight = e.x + e.w, eBottom = e.y + e.h;
      if (e.x > r.x) next.push(rect(r.x, r.y, e.x - r.x, r.h));
      if (eRight < right) next.push(rect(eRight, r.y, right - eRight, r.h));
      if (e.y > r.y) next.push(rect(r.x, r.y, r.w, e.y - r.y));
      if (eBottom < bottom) next.push(rect(r.x, eBottom, r.w, bottom - eBottom));
    }
    pieces = withoutContained(next);
  }
  return pieces;
}

// Drop pieces wholly inside another (keeping one of any duplicates); they add nothing.
function withoutContained(pieces) {
  return pieces.filter((r, i) => !pieces.some((o, j) => j !== i && contains(o, r)
    && (!contains(r, o) || j < i)));
}

const EDGE = 0.5;

/**
 * The safe regions a visitor may use. `visible` is the on-screen part of the
 * surface (already intersected with its clipping ancestors and the viewport);
 * `exclusions` are protected rectangles (the game canvas, panels, controls).
 * Each region records its portals: the sides lying on an open visible edge,
 * through which a visitor can walk in from (and out to) clipped space.
 * `open` names the visible edges that are real borders (the playfield frame
 * or the screen edge); an edge that is only a seam beside the HUD or a button
 * row would show an ant popping out of thin air, so it is not a portal.
 *
 * Regions never overlap. The largest usable piece is taken first and cut out
 * of the rest, then the largest of what remains, and so on: two strips
 * meeting round a panel's corner become one strip and the remainder of the
 * other, so no space is counted twice and ants in different regions can
 * never meet in shared space. A seam between two regions is never a portal.
 */
export function safeRegions(visible, exclusions, {
  clearance = AMBIENT.clearance, minCorridor = AMBIENT.minCorridor, minLength = AMBIENT.minLength,
  minArea = AMBIENT.areaPerVisitor, open = { left: true, right: true, top: true, bottom: true },
} = {}) {
  if (!visible || visible.w <= 0 || visible.h <= 0) return [];
  const blocked = exclusions.filter((e) => e.w > 0 && e.h > 0).map((e) => inflate(e, clearance));
  const portalsOf = (r) => {
    const portals = [];
    if (open.left && r.x <= visible.x + EDGE) portals.push('left');
    if (open.right && r.x + r.w >= visible.x + visible.w - EDGE) portals.push('right');
    if (open.top && r.y <= visible.y + EDGE) portals.push('top');
    if (open.bottom && r.y + r.h >= visible.y + visible.h - EDGE) portals.push('bottom');
    return portals;
  };
  const usable = (r) => Math.min(r.w, r.h) >= minCorridor && Math.max(r.w, r.h) >= minLength
    && r.w * r.h >= minArea && portalsOf(r).length > 0;
  const regions = [];
  let pieces = subtract(visible, blocked);
  for (;;) {
    let best = null;
    for (const r of pieces) if (usable(r) && (!best || r.w * r.h > best.w * best.h)) best = r;
    if (!best) return regions;
    regions.push({ ...best, portals: portalsOf(best) });
    const taken = best;
    pieces = withoutContained(pieces.flatMap((r) => (r === taken ? [] : subtract(r, [taken]))));
  }
}

/** How many visitors one region can host by itself. */
export const regionCapacity = (r, areaPerVisitor = AMBIENT.areaPerVisitor) => Math.floor((r.w * r.h) / areaPerVisitor);

/**
 * How many visitors the measured space supports (never more than `max`).
 * Each region is counted on its own: two thin strips either side of the cup
 * are not one roomy gutter, since a visitor never crosses between them.
 */
export function capacity(regions, { max = AMBIENT.slots, areaPerVisitor = AMBIENT.areaPerVisitor } = {}) {
  let count = 0;
  for (const r of regions) count += regionCapacity(r, areaPerVisitor);
  return Math.min(max, count);
}

/**
 * 'portrait' or 'landscape' on a phone, otherwise null. `device` is
 * { viewport, screen } in CSS px ({ w, h } each) and `touch`, whether the
 * primary pointer is touch (input/settings.js hasPrimaryTouch()).
 *
 * A phone is a touch-first device whose whole screen is phone-sized; the
 * viewport only says which way up it is held. Neither the window nor touch
 * decides it alone: a short or narrow desktop window still has a desktop
 * screen, and a touch laptop or tablet has a larger one. Both follow their
 * measured geometry instead.
 */
export function phoneShape({ viewport, screen, touch = false } = {}, { phoneSide = AMBIENT.phoneSide } = {}) {
  if (!viewport || !touch || !(Math.min(screen?.w, screen?.h) <= phoneSide)) return null;
  return viewport.h > viewport.w ? 'portrait' : 'landscape';
}

/**
 * An upright viewport no wider than a phone (`narrowPortrait` CSS px), on
 * any device: a narrow desktop window lays the cup out as a phone does.
 */
export function narrowPortrait(viewport, { narrowPortrait: widest = AMBIENT.narrowPortrait } = {}) {
  return !!viewport && viewport.h > viewport.w && viewport.w <= widest;
}

/**
 * The display's population ceiling, before region capacity: none on a
 * portrait phone or in a narrow portrait viewport, where the cup fills the
 * width and an ant would only crowd it; otherwise scaled by the total safe
 * area, and at most two on a phone held sideways. `device` is as for
 * phoneShape(). `override` (debug profiling) replaces the scaled ceiling,
 * never the portrait rules or the slot count.
 */
export function displayBudget(regions, device, { tuning = AMBIENT, override } = {}) {
  const shape = phoneShape(device, tuning);
  if (shape === 'portrait' || narrowPortrait(device?.viewport, tuning)) return 0;
  let ceiling = 0;
  if (Number.isFinite(override)) ceiling = override;
  else {
    let area = 0;
    for (const r of regions) area += r.w * r.h;
    for (const [least, n] of tuning.budget) if (area >= least) { ceiling = n; break; }
    ceiling = Math.min(ceiling, tuning.maxVisitors);
    if (shape === 'landscape') ceiling = Math.min(ceiling, tuning.phoneLandscape);
  }
  return Math.max(0, Math.min(tuning.slots, Math.floor(ceiling)));
}

/** This frame's population: the measured room, and no more than two in Low graphics. */
export function populationLimit(room, quality = 'high', tuning = AMBIENT) {
  return quality === 'low' ? Math.min(room, tuning.lowQuality) : room;
}

const TAU = Math.PI * 2;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const TRAIL = 12; // recent positions kept for a follower: 12 × 0.2 s
const TRAIL_EVERY = 0.2;
const UNBLOCK = 0.35; // seconds stuck behind another ant before choosing something else
const GREET_WAIT = 3; // seconds one greeter waits for the other to arrive
const SOCIAL = new Set(['follow', 'greet', 'drift']); // modes shared with other ants

/**
 * One wandering ant: absent → entering → wandering (with pauses) → leaving →
 * absent. It walks toward waypoints chosen inside its region, turning
 * smoothly with a little private wobble, and only ever moves inside that
 * region (or straight through its portal side while arriving and leaving).
 *
 * Within a colony (`peers`, the colony's ant records, itself included) it
 * also keeps its distance, never stepping nearer than `spacing` to another
 * ant, prefers waypoints away from the others, and can be given a social
 * `mode`: 'follow' a leader's recent path, 'greet' a partner face to face, or
 * 'drift' the same way as a few others. Every mode ends by itself and the
 * ant goes back to wandering alone, which is the default.
 *
 * On its own it can also 'forage': walk up to a crumb the colony offers it,
 * look it over, lift it (`cargo`) and 'carry' it home through the nearest
 * portal at a slower pace, with the odd stop to shift its grip.
 *
 * Called to a sugar cube, it can 'gather': walk round the cube (never over
 * it) to the spot beside its place in the team and wait there, facing it,
 * `ready`. Once it steps in it is 'haul'ing, and the colony's procession
 * moves it; it does not walk by itself until it is released.
 *
 * `random` is a private cosmetic generator ({ next, range, int }).
 * `obstacle` ({ active, x, y }) is the colony's sugar-cube procession, which
 * every other ant keeps `cube.clear` from (a carrier walking over, `cube.keep`).
 */
export function createVisitor({ random = createRandom(), tuning = AMBIENT, peers = null, obstacle = null } = {}) {
  const ant = {
    state: 'absent', x: 0, y: 0, heading: 0, speed: 0, gait: 0,
    region: null, portal: null, timer: random.range(...tuning.firstVisit), stay: 0,
    targetX: 0, targetY: 0, segment: 0, wobble: 0, wobbleTime: 0, twitch: 0, blocked: 0,
    mode: 'solo', partner: null, social: 0, lag: 0, meetX: 0, meetY: 0, driftX: 0, driftY: 0, waited: 0,
    trail: new Float64Array(TRAIL * 2), trailHead: 0, trailCount: 0, trailTime: 0,
    crumb: null, cargo: false, // the crumb it is after or carrying, and whether it holds it
    ready: false, still: false, tries: 0, // beside its place at the cube; held still by the procession; blocked walking over
  };
  const others = peers ?? [];
  const social = tuning.social;
  const crumbs = tuning.crumb;
  const cube = tuning.cube;
  const sugar = obstacle ?? { active: false, x: 0, y: 0, heading: 0 };
  // How far this ant keeps from the procession: walking over to it, or not part of it.
  const berth = () => (ant.mode === 'gather' ? cube.keep : cube.clear);

  const inner = (r) => inflate(r, -tuning.footprint);
  const clampX = (x) => Math.max(ant.region.x + tuning.footprint, Math.min(ant.region.x + ant.region.w - tuning.footprint, x));
  const clampY = (y) => Math.max(ant.region.y + tuning.footprint, Math.min(ant.region.y + ant.region.h - tuning.footprint, y));

  // Distance from (x, y) to the nearest other ant, or to where one is heading.
  function crowd(x, y) {
    let nearest = Infinity;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === ant || o.state === 'absent') continue;
      nearest = Math.min(nearest, Math.hypot(o.x - x, o.y - y), Math.hypot(o.targetX - x, o.targetY - y));
    }
    // A sugar-cube procession counts as crowded out to its berth.
    if (sugar.active) nearest = Math.min(nearest, Math.max(0, Math.hypot(sugar.x - x, sugar.y - y) - berth()));
    return nearest;
  }

  function nearestOther() {
    let nearest = null, best = Infinity;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === ant || o.state === 'absent') continue;
      const d = Math.hypot(o.x - ant.x, o.y - ant.y);
      if (d < best) { best = d; nearest = o; }
    }
    return nearest;
  }

  // Would a step from (fromX, fromY) to (x, y) bring it within `spacing` of
  // another ant, or within its berth of a sugar-cube procession? Stepping
  // away is always allowed.
  function cramped(x, y, fromX, fromY) {
    const near = tuning.spacing * tuning.spacing;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === ant || o.state === 'absent') continue;
      const after = (o.x - x) ** 2 + (o.y - y) ** 2;
      if (after < near && after < (o.x - fromX) ** 2 + (o.y - fromY) ** 2) return true;
    }
    return sugar.active && nearCube(x, y, fromX, fromY);
  }

  function nearCube(x, y, fromX, fromY) {
    const after = Math.hypot(sugar.x - x, sugar.y - y);
    return after < berth() && after < Math.hypot(sugar.x - fromX, sugar.y - fromY);
  }

  // A carrying ant goes a little slower.
  const pace = () => random.range(...tuning.speed) * (ant.cargo ? crumbs.pace : 1);

  function newSegment(seconds) {
    ant.speed = pace();
    ant.segment = seconds;
  }

  // A random waypoint a fair walk away (so it doesn't dither in place), in
  // open space if there is any; with `fromX`, as far from that point as it can.
  function wander(fromX = null, fromY = 0) {
    const box = inner(ant.region);
    let bestX = ant.x, bestY = ant.y, best = -Infinity;
    for (let tries = 0; tries < 4; tries++) {
      const x = random.range(box.x, box.x + box.w), y = random.range(box.y, box.y + box.h);
      const far = Math.hypot(x - ant.x, y - ant.y) > 40;
      const score = (far ? 1000 : 0) + (fromX === null ? Math.min(crowd(x, y), 120) : Math.hypot(x - fromX, y - fromY));
      if (score > best) { best = score; bestX = x; bestY = y; }
      if (fromX === null && far && score >= 1100) break; // roomy enough: take it
    }
    ant.targetX = bestX;
    ant.targetY = bestY;
    newSegment(random.range(4, 7)); // a change of mind if it isn't there by then
  }

  // The leader's position `lag` seconds ago, a little to one side; or, far
  // behind, its latest steps at a hurry; or, too close, a moment's wait.
  function trailPoint() {
    const leader = ant.partner;
    const gap = Math.hypot(leader.x - ant.x, leader.y - ant.y);
    if (gap < social.keep) { pause(random.range(0.3, 0.8)); return; }
    const behind = gap > social.catchUp;
    const back = Math.min(leader.trailCount - 1, behind ? 0 : Math.round(ant.lag / TRAIL_EVERY));
    const i = ((leader.trailHead - 1 - back) % TRAIL + TRAIL) % TRAIL;
    const x = back >= 0 ? leader.trail[i * 2] : leader.x, y = back >= 0 ? leader.trail[i * 2 + 1] : leader.y;
    ant.targetX = clampX(x + random.range(-6, 6));
    ant.targetY = clampY(y + random.range(-6, 6));
    newSegment(random.range(1, 1.8));
    const pace = leader.speed * (behind ? random.range(1.2, 1.35) : random.range(0.9, 1.15));
    ant.speed = Math.min(tuning.speed[1] * 1.3, Math.max(tuning.speed[0], pace));
  }

  // Its side of the meeting point, half a greeting apart from its partner's.
  function meetPoint() {
    const dx = ant.x - ant.meetX, dy = ant.y - ant.meetY, d = Math.hypot(dx, dy) || 1;
    ant.targetX = clampX(ant.meetX + (dx / d) * (social.meet / 2));
    ant.targetY = clampY(ant.meetY + (dy / d) * (social.meet / 2));
    newSegment(social.approach);
  }

  // Further along the shared direction, wandering a little either side of it.
  function driftPoint() {
    const ahead = random.range(50, 110), aside = random.range(-22, 22);
    ant.targetX = clampX(ant.x + ant.driftX * ahead - ant.driftY * aside);
    ant.targetY = clampY(ant.y + ant.driftY * ahead + ant.driftX * aside);
    newSegment(random.range(3, 5));
    // At the end of the gutter the shared walk is over.
    if (Math.hypot(ant.targetX - ant.x, ant.targetY - ant.y) < 30) endSocial();
  }

  // Where it stands to pick up its crumb: just behind it, so its jaws are over it.
  function approachPoint() {
    const c = ant.crumb, dx = c.x - ant.x, dy = c.y - ant.y, d = Math.hypot(dx, dy) || 1;
    ant.targetX = clampX(c.x - (dx / d) * crumbs.mouth);
    ant.targetY = clampY(c.y - (dy / d) * crumbs.mouth);
    newSegment(3);
  }

  // The side of its region nearest to it, which is the way home.
  function nearestPortal(x = ant.x, y = ant.y) {
    const r = ant.region;
    let best = r.portals[0], bestDistance = Infinity;
    for (const p of r.portals) {
      const d = p === 'left' ? x - r.x : p === 'right' ? r.x + r.w - x
        : p === 'top' ? y - r.y : r.y + r.h - y;
      if (d < bestDistance) { bestDistance = d; best = p; }
    }
    return best;
  }

  // A carrier's next few steps toward home, a little either side of the
  // straight line; once the edge is near it simply walks out.
  function carryPoint() {
    const portal = nearestPortal();
    const [px, py] = portalPoint(portal, vertical(portal) ? ant.y : ant.x);
    const dx = px - ant.x, dy = py - ant.y, d = Math.hypot(dx, dy) || 1;
    if (d < 60) { leave(); return; }
    const ahead = Math.min(d, random.range(50, 90)), aside = random.range(-14, 14);
    ant.targetX = clampX(ant.x + (dx / d) * ahead - (dy / d) * aside);
    ant.targetY = clampY(ant.y + (dy / d) * ahead + (dx / d) * aside);
    newSegment(random.range(3, 5));
  }

  // Toward the spot beside its place in the team (meetX, meetY). If the
  // straight way there passes close by the cube (and the carriers already
  // holding it), it goes round instead: back out to a wider circle first,
  // then round it a sixth of a turn at a time, then straight in.
  function gatherPoint() {
    const tx = ant.meetX, ty = ant.meetY;
    ant.targetX = tx;
    ant.targetY = ty;
    if (sugar.active) {
      const dx = tx - ant.x, dy = ty - ant.y, length = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sugar.x - ant.x) * dx + (sugar.y - ant.y) * dy) / length));
      if (t > 0 && t < 1 && Math.hypot(ant.x + dx * t - sugar.x, ant.y + dy * t - sugar.y) < cube.keep + 8) {
        const from = Math.atan2(ant.y - sugar.y, ant.x - sugar.x), diff = angleDiff(Math.atan2(ty - sugar.y, tx - sugar.x), from);
        const wide = cube.keep + 16;
        const via = Math.hypot(ant.x - sugar.x, ant.y - sugar.y) < wide - 4 ? from : from + Math.sign(diff) * Math.min(Math.abs(diff), 1.05);
        ant.targetX = clampX(sugar.x + Math.cos(via) * wide);
        ant.targetY = clampY(sugar.y + Math.sin(via) * wide);
      }
    }
    newSegment(4);
  }

  function pickWaypoint() {
    if (ant.mode === 'gather') gatherPoint();
    else if (ant.mode === 'follow') trailPoint();
    else if (ant.mode === 'greet') meetPoint();
    else if (ant.mode === 'drift') driftPoint();
    else if (ant.mode === 'forage') approachPoint();
    else if (ant.mode === 'carry') carryPoint();
    else wander();
  }

  /** Give up on a crumb it has not picked up (out of time, crumb gone, heading home). */
  function endForage() {
    const c = ant.crumb;
    if (c && c.claim === ant) c.claim = null;
    ant.crumb = null;
    ant.mode = 'solo';
    if (ant.state === 'wandering' || ant.state === 'paused') { ant.state = 'wandering'; wander(); }
  }

  // Its jaws close on the crumb; the colony eases the crumb up into them.
  function pickUp() {
    const c = ant.crumb;
    c.state = 'carried';
    c.lift = 0;
    c.fromX = c.x;
    c.fromY = c.y;
    c.turn = c.angle - ant.heading;
    ant.cargo = true;
    ant.mode = 'carry';
    ant.stay = Math.max(ant.stay, 30); // home is where it is going now; this is only a backstop
    ant.state = 'wandering';
    carryPoint();
  }

  /** Back to wandering alone, heading away from whoever it was with. */
  function endSocial() {
    const from = ant.partner;
    const mode = ant.mode;
    ant.mode = 'solo';
    ant.partner = null;
    if (ant.state !== 'wandering' && ant.state !== 'paused') return;
    ant.state = 'wandering';
    if (from) wander(from.x, from.y);
    else if (mode !== 'solo') wander();
  }

  // A point just outside the portal side, fully clipped, level with `along`.
  function portalPoint(portal, along) {
    const r = ant.region, f = tuning.footprint, box = inner(r);
    const across = Math.max(box.x, Math.min(box.x + box.w, along));
    const down = Math.max(box.y, Math.min(box.y + box.h, along));
    if (portal === 'left') return [r.x - f - 2, down];
    if (portal === 'right') return [r.x + r.w + f + 2, down];
    if (portal === 'top') return [across, r.y - f - 2];
    return [across, r.y + r.h + f + 2];
  }

  const vertical = (portal) => portal === 'left' || portal === 'right';

  // Its first waypoint lies a little way in from the portal, level with `along`.
  function entryTarget(along) {
    const box = inner(ant.region), depth = random.range(20, 60);
    const p = ant.portal;
    ant.targetX = p === 'left' ? Math.min(box.x + box.w, box.x + depth) : p === 'right' ? Math.max(box.x, box.x + box.w - depth) : along;
    ant.targetY = p === 'top' ? Math.min(box.y + box.h, box.y + depth) : p === 'bottom' ? Math.max(box.y, box.y + box.h - depth) : along;
  }

  /**
   * Walk in to `region` from just beyond one of its portals, at a point clear
   * of every other ant. Returns false (staying absent) if there is none.
   * With `near` ({ x, y }), through the portal side nearest that point, and
   * not far along it (a helper coming to its place at a sugar cube).
   */
  function enterRegion(region, near = null) {
    ant.region = region;
    ant.portal = near ? nearestPortal(near.x, near.y) : region.portals[random.int(region.portals.length)];
    const box = inner(region);
    const lo = vertical(ant.portal) ? box.y : box.x, hi = vertical(ant.portal) ? box.y + box.h : box.x + box.w;
    const level = near && (vertical(ant.portal) ? near.y : near.x);
    let along = 0, best = -1;
    for (let tries = 0; tries < 3; tries++) {
      const candidate = near ? Math.max(lo, Math.min(hi, level + random.range(-90, 90))) : random.range(lo, hi);
      const [x, y] = portalPoint(ant.portal, candidate);
      const room = crowd(x, y);
      if (room > best) { best = room; along = candidate; }
      if (room === Infinity) break;
    }
    if (best < tuning.spacing * 2) { ant.region = null; return false; }
    [ant.x, ant.y] = portalPoint(ant.portal, along);
    entryTarget(along);
    ant.heading = Math.atan2(ant.targetY - ant.y, ant.targetX - ant.x);
    newSegment(8);
    ant.stay = random.range(...tuning.stay);
    ant.wobble = 0;
    ant.wobbleTime = 0;
    ant.blocked = 0;
    ant.mode = 'solo';
    ant.partner = null;
    ant.trailCount = 0;
    ant.trailTime = 0;
    ant.state = 'entering';
    return true;
  }

  function enter(regions) {
    // Larger gutters are visited more often.
    let total = 0;
    for (const r of regions) total += r.w * r.h;
    let pick = random.next() * total;
    let region = regions[regions.length - 1];
    for (const r of regions) { pick -= r.w * r.h; if (pick < 0) { region = r; break; } }
    return enterRegion(region);
  }

  // Heading home drops any plan, but a carrier keeps its crumb.
  function leave(shift = 0) {
    if (ant.mode === 'forage') endForage();
    ant.mode = 'solo';
    ant.partner = null;
    // Home is through any of the region's portals; the nearest one reads most naturally.
    const best = nearestPortal();
    ant.portal = best;
    [ant.targetX, ant.targetY] = portalPoint(best, (vertical(best) ? ant.y : ant.x) + shift);
    ant.speed = pace();
    ant.segment = Infinity;
    ant.state = 'leaving';
  }

  /** Remove the visitor at once (screen change, layout change, reduced motion), and anything it carries. */
  function retire(cooldown = tuning.cooldown) {
    if (ant.crumb?.claim === ant && !ant.cargo) ant.crumb.claim = null;
    ant.state = 'absent';
    ant.region = null;
    ant.mode = 'solo';
    ant.partner = null;
    ant.crumb = null;
    ant.cargo = false;
    ant.timer = random.range(...cooldown);
  }

  // Keep the whole ant inside its region; arriving and leaving it may also
  // stand beyond its portal side, where the surface edge clips it.
  function confine() {
    const r = ant.region, f = tuning.footprint;
    let left = r.x + f, right = r.x + r.w - f, top = r.y + f, bottom = r.y + r.h - f;
    if (ant.state !== 'wandering' && ant.state !== 'paused') {
      if (ant.portal === 'left') left = r.x - f - 2;
      if (ant.portal === 'right') right = r.x + r.w + f + 2;
      if (ant.portal === 'top') top = r.y - f - 2;
      if (ant.portal === 'bottom') bottom = r.y + r.h + f + 2;
    }
    ant.x = Math.max(left, Math.min(right, ant.x));
    ant.y = Math.max(top, Math.min(bottom, ant.y));
  }

  function turnToward(angle, dt, rate = tuning.turnRate) {
    const turn = angleDiff(angle, ant.heading);
    const maxTurn = rate * dt;
    ant.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
    return turn;
  }

  function walk(dt) {
    const dx = ant.targetX - ant.x, dy = ant.targetY - ant.y;
    const distance = Math.hypot(dx, dy);
    // A slowly drifting wobble keeps the path irregular without jitter.
    ant.wobbleTime -= dt;
    if (ant.wobbleTime <= 0) {
      ant.wobble = random.range(-1.4, 1.4);
      ant.wobbleTime = random.range(0.25, 0.7);
    }
    const desired = Math.atan2(dy, dx) + (distance > 24 ? ant.wobble * 0.5 : 0);
    // Turning harder close in keeps it from circling a waypoint.
    const turn = turnToward(desired, dt, tuning.turnRate * (distance < 16 ? 2.5 : 1));
    // Slow down for sharp turns, as an ant does.
    const pace = ant.speed * (0.45 + 0.55 * Math.max(0, Math.cos(turn)));
    const step = Math.min(pace * dt, distance);
    const fromX = ant.x, fromY = ant.y;
    ant.x += Math.cos(ant.heading) * step;
    ant.y += Math.sin(ant.heading) * step;
    confine();
    ant.segment -= dt;
    if (cramped(ant.x, ant.y, fromX, fromY)) {
      // Someone is in the way: stand and turn rather than walk into them.
      ant.x = fromX;
      ant.y = fromY;
      ant.blocked += dt;
      return ant.segment <= 0;
    }
    ant.blocked = 0;
    ant.gait = (ant.gait + step * 0.42) % TAU;
    return distance - step < 3 || ant.segment <= 0;
  }

  // Stuck behind another ant for a moment: do something else instead.
  function unblock() {
    ant.blocked = 0;
    if (ant.mode === 'gather') {
      // Nearly there: it steps in from where it stands. Farther off, it waits
      // its turn, then tries a step aside, by turns: two helpers in each
      // other's way never just stand there.
      if (Math.hypot(ant.meetX - ant.x, ant.meetY - ant.y) < 14) { ant.ready = true; pause(Infinity); }
      else if (ant.tries++ % 2 === 0) pause(random.range(0.3, 0.8));
      else { const o = nearestOther(); if (o) sidestep(o); else gatherPoint(); }
    } else if ((ant.state === 'entering' || ant.state === 'leaving') && nearProcession() && giveWay());
    else if (ant.state === 'entering') entryTarget(vertical(ant.portal) ? ant.y : ant.x);
    else if (ant.state === 'leaving') leave(random.range(-40, 40));
    else if (ant.mode === 'follow' || ant.mode === 'forage') pause(random.range(0.3, 0.8)); // waiting its turn
    else if (ant.mode === 'carry') carryPoint(); // a way round
    else if (ant.mode !== 'solo') endSocial();
    else {
      // Step away from whoever is in the way rather than try another path past
      // them (a follower waiting close behind would otherwise hold it there);
      // a procession close by is what is in the way, if anything is.
      const o = sugar.active && Math.hypot(sugar.x - ant.x, sugar.y - ant.y) < cube.clear + 12 ? sugar : nearestOther();
      if (o) sidestep(o); else wander();
    }
  }

  const nearProcession = () => sugar.active && Math.hypot(sugar.x - ant.x, sugar.y - ant.y) < cube.clear + 12;

  // On its way in or out with a procession in the way: step aside first,
  // wandering, and carry on afterwards (a leaving ant sets off home again a
  // few seconds later). Only once wholly inside its region, so it never
  // jumps back from beyond a portal. Returns whether it did.
  function giveWay() {
    if (!holds(ant.region, ant.x, ant.y, tuning.footprint)) return false;
    if (ant.state === 'leaving') ant.stay = random.range(2, 4);
    ant.state = 'wandering';
    ant.blocked = 0;
    stepAside();
    return true;
  }

  // Out of a procession's way: to the side of its line of travel this ant is
  // already on, a little behind; or, if a wall leaves no room there, back
  // behind it.
  function stepAside() {
    const h = sugar.heading, side = Math.cos(h) * (ant.y - sugar.y) - Math.sin(h) * (ant.x - sugar.x) >= 0 ? 1 : -1;
    let angle = h + side * (Math.PI / 2 + random.range(0, 0.5)), d = random.range(40, 70);
    let x = clampX(ant.x + Math.cos(angle) * d), y = clampY(ant.y + Math.sin(angle) * d);
    if (Math.abs(Math.cos(h) * (y - sugar.y) - Math.sin(h) * (x - sugar.x)) < cube.clear + 4) {
      angle = h + Math.PI + random.range(-0.3, 0.3);
      d = random.range(50, 80);
      x = clampX(ant.x + Math.cos(angle) * d);
      y = clampY(ant.y + Math.sin(angle) * d);
    }
    ant.targetX = x;
    ant.targetY = y;
    newSegment(4);
  }

  // A few steps away from `o` ({ x, y }), a little to one side.
  function sidestep(o) {
    const angle = Math.atan2(ant.y - o.y, ant.x - o.x) + random.range(-1, 1), d = random.range(30, 70);
    ant.targetX = clampX(ant.x + Math.cos(angle) * d);
    ant.targetY = clampY(ant.y + Math.sin(angle) * d);
    newSegment(3);
  }

  function pause(seconds) {
    ant.state = 'paused';
    ant.timer = seconds;
    ant.twitch = 0;
    ant.waited = 0;
  }

  // Lay down the recent path a follower walks along.
  function record(dt) {
    ant.trailTime -= dt;
    if (ant.trailTime > 0) return;
    ant.trailTime += TRAIL_EVERY;
    ant.trail[ant.trailHead * 2] = ant.x;
    ant.trail[ant.trailHead * 2 + 1] = ant.y;
    ant.trailHead = (ant.trailHead + 1) % TRAIL;
    ant.trailCount = Math.min(TRAIL, ant.trailCount + 1);
  }

  // A social moment ends with its time, or as soon as its partner is gone
  // (a follower left far behind has lost its leader too).
  function checkSocial(dt) {
    if (ant.mode === 'solo' || ant.mode === 'carry' || ant.mode === 'gather') return; // a gatherer is the colony's to release
    if (ant.mode === 'forage') {
      // Interest lasts while it walks over, and while the crumb is still there for it.
      if (ant.state !== 'paused') ant.social -= dt;
      const c = ant.crumb;
      if (c.state !== 'lying' || c.claim !== ant || c.region !== ant.region || ant.social <= 0) endForage();
      return;
    }
    ant.social -= dt;
    const p = ant.partner;
    const lost = p && (p.state === 'absent' || p.state === 'leaving' || p.region !== ant.region
      || (ant.mode === 'greet' && ant.state !== 'paused' && p.mode !== 'greet')
      || (ant.mode === 'follow' && Math.hypot(p.x - ant.x, p.y - ant.y) > social.lose));
    if (lost || (ant.social <= 0 && !(ant.mode === 'greet' && ant.state === 'paused'))) endSocial();
  }

  function arrive() {
    if (ant.mode === 'gather') {
      // Beside its place: wait there, facing the cube, until the colony steps it in.
      if (Math.hypot(ant.meetX - ant.x, ant.meetY - ant.y) < 6) { ant.ready = true; pause(Infinity); }
      else gatherPoint();
      return;
    }
    if (ant.mode === 'greet') { pause(random.range(...social.greet)); return; }
    if (ant.mode === 'follow') {
      if (random.next() < social.breakOff) endSocial(); // loses interest
      // Stop-and-go, never in lockstep; but no dawdling once it has fallen behind.
      else if (random.next() < 0.4 && Math.hypot(ant.partner.x - ant.x, ant.partner.y - ant.y) < social.catchUp) {
        pause(random.range(0.2, 0.7));
      }
      else trailPoint();
      return;
    }
    if (ant.mode === 'drift') { driftPoint(); return; }
    if (ant.mode === 'forage') {
      // Close enough to look it over, or another step nearer.
      const c = ant.crumb;
      if (Math.hypot(c.x - ant.x, c.y - ant.y) <= crumbs.mouth + 4) pause(random.range(...crumbs.investigate));
      else approachPoint();
      return;
    }
    if (ant.mode === 'carry') {
      if (random.next() < crumbs.pauseChance) pause(random.range(0.3, 0.8));
      else carryPoint();
      return;
    }
    if (random.next() < tuning.pauseChance) pause(random.range(...tuning.pause));
    else wander();
  }

  return {
    ant,
    get visible() { return ant.state !== 'absent'; },
    retire,
    enterRegion,

    /** Join a social moment ('follow' | 'greet' | 'drift'); the colony sets it up. */
    socialize(mode, { partner = null, seconds = 1, lag = 0, meetX = 0, meetY = 0, driftX = 0, driftY = 0 } = {}) {
      Object.assign(ant, { mode, partner, social: seconds, lag, meetX, meetY, driftX, driftY, waited: 0 });
      ant.state = 'wandering';
      pickWaypoint();
    },

    /** Go after a crumb the colony offers it: walk over, look it over, pick it up. */
    forage(crumb) {
      Object.assign(ant, { mode: 'forage', partner: null, crumb, social: crumbs.approach, state: 'wandering' });
      crumb.claim = ant;
      ant.stay = Math.max(ant.stay, 15);
      approachPoint();
    },

    /** Drop any social moment and carry on alone (Low graphics, a layout change); crumbs are not social. */
    calm() {
      if (!SOCIAL.has(ant.mode)) return;
      ant.mode = 'solo';
      ant.partner = null;
      if (ant.state === 'wandering' || ant.state === 'paused') { ant.state = 'wandering'; wander(); }
    },

    /** Head home now (too many ants for the space, or a lower ceiling). */
    dismiss() {
      if (ant.state !== 'absent' && ant.state !== 'leaving') leave();
    },

    /**
     * Advance by dt seconds within the given safe regions. Absence only
     * counts down while there is somewhere to appear (`room` > 0); a colony
     * schedules arrivals itself and steps only present ants.
     */
    step(dt, regions, room = 1) {
      if (ant.state === 'absent') {
        if (room <= 0 || !regions?.length) return;
        ant.timer -= dt;
        if (ant.timer <= 0 && !enter(regions)) ant.timer = 0.5;
        return;
      }
      if (ant.mode === 'haul') return; // the procession moves it
      record(dt);
      checkSocial(dt);
      if (ant.state === 'paused') {
        ant.twitch += dt;
        ant.stay -= dt;
        if (ant.mode === 'gather' && ant.ready) {
          // Waiting beside its place, antennae going, turned to the cube.
          if (sugar.active) turnToward(Math.atan2(sugar.y - ant.y, sugar.x - ant.x), dt);
          return;
        }
        if (ant.mode === 'forage') {
          // Turn to the crumb, look it over, then take it once facing it.
          const c = ant.crumb;
          const turn = turnToward(Math.atan2(c.y - ant.y, c.x - ant.x), dt);
          ant.timer -= dt;
          if (ant.timer <= 0 && Math.abs(turn) < 0.3) pickUp();
          return;
        }
        if (ant.mode === 'greet') {
          // Face the partner, and wait (a little) for it to arrive.
          const p = ant.partner;
          turnToward(Math.atan2(p.y - ant.y, p.x - ant.x), dt);
          if (p.mode === 'greet' && p.state !== 'paused' && ant.waited < GREET_WAIT) { ant.waited += dt; return; }
        }
        ant.timer -= dt;
        if (ant.timer <= 0) {
          if (ant.stay <= 0) leave();
          else if (ant.mode === 'greet') endSocial();
          else { ant.state = 'wandering'; pickWaypoint(); }
        }
        return;
      }
      if (ant.state === 'wandering' && ant.mode !== 'gather') ant.stay -= dt;
      const arrived = walk(dt);
      if (ant.blocked > UNBLOCK) { unblock(); return; }
      if (ant.state === 'leaving') {
        if (arrived) retire();
        return;
      }
      if (ant.state === 'entering' && arrived) { ant.state = 'wandering'; pickWaypoint(); return; }
      if (ant.state !== 'wandering') return;
      if (ant.stay <= 0) { leave(); return; }
      // A follower that has caught up waits for its leader to move on.
      if (ant.mode === 'follow' && Math.hypot(ant.partner.x - ant.x, ant.partner.y - ant.y) < social.keep) {
        pause(random.range(0.3, 0.8));
        return;
      }
      if (arrived) arrive();
    },

    /** Walk over to the spot beside its place in a sugar-cube team, (x, y), and wait there. */
    gather(x, y) {
      Object.assign(ant, { mode: 'gather', partner: null, meetX: x, meetY: y, ready: false, still: false, tries: 0 });
      ant.stay = Math.max(ant.stay, cube.gather + 10); // the colony releases it; this is only a backstop
      if (ant.state !== 'entering') ant.state = 'wandering'; // a newcomer walks on in from the edge
      gatherPoint();
      if (ant.state === 'entering') ant.segment = 12;
    },

    /**
     * Free of the cube (given up, or its team broken up): wander off away
     * from (x, y) for a little while, then home. One already on its way out
     * past the portal walks on out.
     */
    release(x, y) {
      ant.mode = 'solo';
      ant.ready = false;
      ant.still = false;
      ant.stay = random.range(4, 10);
      if (ant.state === 'absent') return;
      if (ant.state === 'leaving') { leave(); return; }
      ant.state = 'wandering';
      wander(x, y);
    },

    /** Step out of the way of the sugar-cube procession it is holding up, whatever it was doing on its own. */
    makeWay() {
      if (!sugar.active) return;
      if (ant.state === 'entering' || ant.state === 'leaving') { if (ant.mode === 'solo') giveWay(); return; }
      if (ant.state !== 'wandering' && ant.state !== 'paused') return;
      if (SOCIAL.has(ant.mode)) endSocial();
      else if (ant.mode === 'forage') endForage();
      if (ant.mode !== 'solo' && ant.mode !== 'carry') return;
      ant.state = 'wandering';
      ant.blocked = 0;
      ant.stay = Math.max(ant.stay, 3); // not off home straight back across its path
      stepAside();
    },

    /**
     * After a layout change, keep the visitor where it stands if its whole
     * footprint still lies inside one of the new safe regions (or, arriving
     * or leaving, reaches only past a portal side that region still has);
     * otherwise retire it at once, before it can be drawn against the new
     * layout, crumb and all. A kept ant does not move: it keeps its target
     * if that is still safe, or gets a safe one in its new region (its
     * region is convex, so the straight way there stays inside it), and any
     * plan goes on (a partner that has gone ends a social moment by itself,
     * as does a crumb the colony has dropped). A hauling ant's place is the
     * procession's to keep.
     */
    relayout(regions) {
      if (ant.state === 'absent') return;
      const f = tuning.footprint;
      const travelling = ant.state === 'entering' || ant.state === 'leaving';
      let home = null;
      for (const r of regions) {
        if (holds(r, ant.x, ant.y, f) || (travelling && r.portals.includes(ant.portal) && holds(r, ant.x, ant.y, f, ant.portal))) {
          home = r;
          break;
        }
      }
      if (!home) { retire([2, 6]); return; }
      ant.region = home;
      if (ant.mode === 'haul') return;
      const box = inner(home);
      const safe = (x, y) => x >= box.x - FIT && x <= box.x + box.w + FIT && y >= box.y - FIT && y <= box.y + box.h + FIT;
      if (travelling && !home.portals.includes(ant.portal)) {
        // Wholly inside a region without its old portal: arrived, or home another way.
        if (ant.state === 'leaving') leave();
        else { ant.state = 'wandering'; pickWaypoint(); }
        return;
      }
      if (ant.state === 'leaving') {
        // Out through the same side, level with where it was heading if that is still clear.
        [ant.targetX, ant.targetY] = portalPoint(ant.portal, vertical(ant.portal) ? ant.targetY : ant.targetX);
        return;
      }
      if (ant.mode === 'greet' || ant.mode === 'gather') { ant.meetX = clampX(ant.meetX); ant.meetY = clampY(ant.meetY); }
      if (ant.state === 'entering') {
        if (!safe(ant.targetX, ant.targetY)) entryTarget(vertical(ant.portal) ? ant.y : ant.x);
        return;
      }
      if (!safe(ant.targetX, ant.targetY)) { ant.targetX = clampX(ant.targetX); ant.targetY = clampY(ant.targetY); }
    },
  };
}

const KINDS = ['follow', 'greet', 'drift'];

/**
 * A small colony: up to `tuning.slots` visitors sharing one private random
 * stream, so a seed reproduces the whole scene.
 *
 * It comes and goes in spells: while active, ants arrive one at a time at
 * independent, staggered moments, each through a region with room to spare
 * and away from the others; then it quietens, the last ant leaves, and the
 * gutters stay empty for a while. Now and then two or three ants in the
 * same region share a short social moment (one follows another, two meet,
 * or a few drift the same way); one at a time, and never in Low graphics.
 *
 * Once in a while, too, a crumb turns up near a wandering ant: one crumb at
 * a time, in one region. An ant on its own that passes close may notice it,
 * walk over, look it over and carry it home; if none does, it is gone again
 * after a while. The crumb is drawn by drawCrumb() from `crumb`.
 *
 * Rarer still, a sugar cube turns up in a roomy region and a team of three
 * or four carries it out (see `cube` and the procession below); never with
 * a crumb about, and never in Low graphics.
 */
export function createColony({ random = createRandom(), tuning = AMBIENT } = {}) {
  const K = tuning.cube;
  // The procession, as the obstacle every other ant keeps clear of, and the way it is going.
  const sugar = { active: false, x: 0, y: 0, heading: 0 };
  const ants = [];
  const visitors = [];
  for (let i = 0; i < tuning.slots; i++) {
    const visitor = createVisitor({ random, tuning, peers: ants, obstacle: sugar });
    visitors.push(visitor);
    ants.push(visitor.ant);
  }
  /**
   * The one sugar cube and its team. `phase`: 'none'; 'gather' (it has
   * turned up and the team walks over and steps in); 'lift'; 'carry' along
   * its route (or 'turn' at a corner); 'fade' (given up, carriers gone).
   * (x, y) and `angle`, `alpha`, `lift` are what drawCube() draws; the
   * route position (px, py) is the procession's centre before its sway.
   */
  const cube = {
    phase: 'none', x: 0, y: 0, angle: 0, alpha: 0, lift: 0, size: 0, region: null, portal: null,
    px: 0, py: 0, heading: 0, turnTo: 0, speed: 0, cruise: 0, heave: 0, sway: 0, twist: 0, wantTwist: 0,
    route: new Float64Array(4), legs: 0, leg: 0, exiting: false, hurry: false, age: 0,
    hesitate: 0, blocked: 0, nudge: 0, blocker: -1,
    quirk: null, quirkTime: 0, quirkLength: 0, quirkMember: -1, quirkTimer: 0, lastQuirk: null,
    members: new Int8Array(4), // ant indices, by place
    pending: new Uint8Array(4), pendingTimer: new Float64Array(4), // newcomers still to come in through a portal
    settle: new Float64Array(4), fromX: new Float64Array(4), fromY: new Float64Array(4), fromH: new Float64Array(4),
    offX: new Float64Array(4), offY: new Float64Array(4), turn: new Float64Array(4), // each carrier's stray from its place
    wantX: new Float64Array(4), wantY: new Float64Array(4), wantTurn: new Float64Array(4), rate: new Float64Array(4),
    places: formation(4, tuning),
  };
  const PLACES = { 3: formation(3, tuning), 4: formation(4, tuning) };
  let cubeTimer = random.range(...K.every);
  let cubeWindow = 0; // > 0 while an opportunity waits for free ants and space
  let cubeRetry = 0;
  let cubeForced = null; // ?debug: { size, quirk, time }
  let opportunities = 0, skipped = 0; // for the pacing report
  let quirkForced = null;
  const pool = new Int8Array(tuning.slots); // scratch: ants that could be called over, nearest first
  const stageAt = { x: 0, y: 0 }; // scratch: where a newcomer is heading
  const poolDistance = new Float64Array(tuning.slots);
  let spell = 'empty';
  let spellTimer = random.range(...tuning.firstVisit);
  let socialTimer = random.range(...tuning.social.every);
  let forced = null; // ?debug: the next social moment, and its kind
  let count = 0;
  let gap = 0; // until the next arrival may come
  let rush = 0; // ?debug: summoned arrivals, which come close together
  let lastLimit = -1;
  let crowded = true; // re-check population against regions and the ceiling
  // The one crumb: 'none', 'lying' where it turned up, or 'carried' in an ant's jaws.
  const crumb = {
    state: 'none', x: 0, y: 0, angle: 0, alpha: 0, region: null, claim: null, life: 0,
    lift: 1, fromX: 0, fromY: 0, turn: 0, shape: new Float64Array(CRUMB_POINTS),
  };
  let crumbTimer = random.range(...tuning.crumb.every);
  let crumbForced = false; // ?debug: one now, whenever ants allow it

  function startSpell() {
    spell = 'active';
    spellTimer = random.range(...tuning.spell);
    // One ant turns up almost at once; the rest at their own moments.
    const first = random.int(ants.length);
    for (let i = 0; i < ants.length; i++) {
      if (ants[i].state === 'absent') ants[i].timer = i === first ? random.range(0, 1) : random.range(...tuning.stagger);
    }
  }

  const occupants = (region) => {
    let n = 0;
    for (let i = 0; i < ants.length; i++) if (ants[i].state !== 'absent' && ants[i].region === region) n++;
    return n;
  };

  // A region with room to spare, larger and emptier ones more often; none
  // walks in where a sugar cube is being carried (its own newcomers apart).
  const spare = (r) => (cube.phase !== 'none' && r === cube.region ? 0
    : r.w * r.h * Math.max(0, regionCapacity(r, tuning.areaPerVisitor) - occupants(r)));
  function chooseRegion(regions) {
    let total = 0;
    for (const r of regions) total += spare(r);
    if (total <= 0) return null;
    let pick = random.next() * total;
    for (const r of regions) {
      pick -= spare(r);
      if (pick < 0) return r;
    }
    return null;
  }

  // Too many for the ceiling or for a region: the latest extras head home. A
  // sugar-cube team counts in full; if it alone is too many, it heads straight out.
  function enforce(limit, regions) {
    if (teamOut() && cube.size > limit) hurry();
    let kept = teamOut() ? cube.size : 0;
    for (let i = 0; i < ants.length; i++) {
      const ant = ants[i];
      if (ant.state === 'absent' || ant.state === 'leaving' || isMember(i)) continue;
      let before = 0;
      for (let j = 0; j < i; j++) {
        if (ants[j].region === ant.region && ants[j].state !== 'absent' && ants[j].state !== 'leaving') before++;
      }
      const home = regions.includes(ant.region) ? regionCapacity(ant.region, tuning.areaPerVisitor) : 0;
      if (kept >= limit || before >= home) visitors[i].dismiss();
      else kept++;
    }
  }

  const settled = (ant) => (ant.state === 'wandering' || ant.state === 'paused')
    && ant.mode === 'solo' && !ant.cargo && ant.stay > 4;

  // Free for a crumb: settled, and nobody's leader either (a follower's
  // moment is not interrupted).
  function free(ant) {
    if (!settled(ant)) return false;
    for (let i = 0; i < ants.length; i++) if (ants[i].partner === ant) return false;
    return true;
  }

  // A crumb turns up a little way from a free ant, well inside its region
  // (room for the whole ant to stand over it) and clear of everyone.
  function placeCrumb() {
    const k = tuning.crumb;
    const start = random.int(ants.length);
    for (let n = 0; n < ants.length; n++) {
      const a = ants[(start + n) % ants.length];
      if (!free(a)) continue;
      const box = inflate(a.region, -(tuning.footprint + k.mouth + k.radius));
      if (box.w <= 0 || box.h <= 0) continue;
      for (let tries = 0; tries < 6; tries++) {
        const angle = random.next() * TAU, d = random.range(...k.near);
        const x = a.x + Math.cos(angle) * d, y = a.y + Math.sin(angle) * d;
        if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
        let clear = true;
        for (let i = 0; i < ants.length && clear; i++) {
          const o = ants[i];
          if (o.state !== 'absent' && Math.hypot(o.x - x, o.y - y) < tuning.spacing * 2) clear = false;
        }
        if (!clear) continue;
        Object.assign(crumb, { state: 'lying', x, y, angle: random.next() * TAU, alpha: 0, region: a.region,
          claim: null, life: random.range(...k.linger), lift: 1 });
        for (let i = 0; i < CRUMB_POINTS; i++) crumb.shape[i] = random.range(0.72, 1);
        return true;
      }
    }
    return false;
  }

  function dropCrumb() {
    crumb.state = 'none';
    crumb.claim = null;
    crumb.region = null;
  }

  function stepCrumb(dt) {
    const k = tuning.crumb;
    if (crumb.state === 'none') {
      // Only while the colony is out and settling in, and never beside a sugar cube.
      if (spell !== 'active' || count === 0 || cube.phase !== 'none') return;
      crumbTimer -= dt;
      if (crumbTimer > 0 && !crumbForced) return;
      if (crumbForced || random.next() < k.chance) {
        if (!placeCrumb()) { crumbTimer = crumbForced ? 0.5 : 3; return; }
      }
      crumbForced = false;
      crumbTimer = random.range(...k.every);
      return;
    }
    if (crumb.state === 'carried') {
      const a = crumb.claim;
      if (a.state === 'absent' || !a.cargo) { dropCrumb(); return; } // home, or gone with its carrier
      // Held in the jaws, turning with the ant; eased up into them at first.
      crumb.lift = Math.min(1, crumb.lift + dt / k.lift);
      const mx = a.x + Math.cos(a.heading) * k.mouth, my = a.y + Math.sin(a.heading) * k.mouth;
      crumb.x = crumb.fromX + (mx - crumb.fromX) * crumb.lift;
      crumb.y = crumb.fromY + (my - crumb.fromY) * crumb.lift;
      crumb.angle = a.heading + crumb.turn;
      return;
    }
    // Lying: it fades in, waits to be noticed, and fades away if nobody comes (or the colony quietens).
    if (!crumb.claim) {
      crumb.life -= dt;
      if (spell !== 'active') crumb.life = Math.min(crumb.life, 0);
    }
    if (crumb.life > 0 || crumb.claim) crumb.alpha = Math.min(1, crumb.alpha + dt / k.fade);
    else {
      crumb.alpha -= dt / k.fade;
      if (crumb.alpha <= 0) { dropCrumb(); return; }
    }
    if (crumb.claim || crumb.life <= 0 || crumb.alpha < 1) return;
    for (let i = 0; i < ants.length; i++) {
      const a = ants[i];
      if (a.region !== crumb.region || !free(a) || Math.hypot(a.x - crumb.x, a.y - crumb.y) > k.notice) continue;
      if (random.next() < k.noticeRate * dt) { visitors[i].forage(crumb); return; }
    }
  }

  // The closest two settled ants sharing a region, close enough to follow;
  // whichever is ahead of the other (by its heading) leads.
  function gatherFollow() {
    let leader = -1, follower = -1, closest = tuning.social.followReach;
    for (let i = 0; i < ants.length; i++) {
      const a = ants[i];
      if (!settled(a)) continue;
      for (let j = i + 1; j < ants.length; j++) {
        const b = ants[j];
        if (!settled(b) || b.region !== a.region) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > closest) continue;
        closest = d;
        const bAhead = Math.cos(a.heading) * (b.x - a.x) + Math.sin(a.heading) * (b.y - a.y) > 0;
        [leader, follower] = bAhead ? [j, i] : [i, j];
      }
    }
    if (leader < 0) return false;
    const s = tuning.social;
    visitors[follower].socialize('follow', { partner: ants[leader], seconds: random.range(...s.follow), lag: random.range(...s.lag) });
    return true;
  }

  // Find ants for a social moment; false if nobody suitable is about.
  function gather(kind) {
    if (kind === 'follow') return gatherFollow();
    const start = random.int(ants.length);
    for (let n = 0; n < ants.length; n++) {
      const a = ants[(start + n) % ants.length];
      if (!settled(a)) continue;
      for (let m = 1; m < ants.length; m++) {
        const j = (start + n + m) % ants.length;
        const b = ants[j];
        if (!settled(b) || b.region !== a.region) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > tuning.social.reach || (kind === 'greet' && d < 40)) continue;
        const s = tuning.social;
        if (kind === 'greet') {
          const meetX = (a.x + b.x) / 2, meetY = (a.y + b.y) / 2, seconds = s.approach;
          visitors[(start + n) % ants.length].socialize('greet', { partner: b, seconds, meetX, meetY });
          visitors[j].socialize('greet', { partner: a, seconds, meetX, meetY });
        } else {
          // Along the gutter: the pair, and one more nearby if it is free.
          const r = a.region;
          const sign = random.next() < 0.5 ? -1 : 1;
          const driftX = r.w >= r.h ? sign : 0, driftY = r.w >= r.h ? 0 : sign;
          const join = (k) => visitors[k].socialize('drift', { seconds: random.range(...s.drift), driftX, driftY });
          join((start + n) % ants.length);
          join(j);
          for (let k = 0; k < ants.length; k++) {
            const c = ants[k];
            if (settled(c) && c.region === r && Math.hypot(c.x - a.x, c.y - a.y) <= tuning.social.reach) { join(k); break; }
          }
        }
        return true;
      }
    }
    return false;
  }

  // ---- The sugar-cube procession ----------------------------------------
  //
  // One group controller moves the whole team: a route position (px, py),
  // a heading and a speed are shared, and every carrier stands at a fixed
  // place round the cube (formation()), plus a small bounded stray of its
  // own. Carriers never walk, path-find or collide while hauling, so the
  // team cannot jostle itself into a deadlock; only the walk over to the
  // cube is ordinary walking. The whole procession stays within `reach` of
  // its route position, and the route keeps that inside the region shrunk
  // by `reach`, so containment is one box check against the region.

  const teamOut = () => cube.phase !== 'none' && cube.phase !== 'fade';

  function isMember(i) {
    if (!teamOut()) return false;
    for (let m = 0; m < cube.size; m++) if (cube.members[m] === i) return true;
    return false;
  }

  // Newcomers on their way in for the team: reserved, and counted against the ceiling.
  function pendingCount() {
    if (cube.phase !== 'gather') return 0;
    let n = 0;
    for (let m = 0; m < cube.size; m++) n += cube.pending[m];
    return n;
  }

  function isPending(i) {
    if (cube.phase !== 'gather') return false;
    for (let m = 0; m < cube.size; m++) if (cube.pending[m] && cube.members[m] === i) return true;
    return false;
  }

  function syncSugar() {
    sugar.active = cube.phase !== 'none';
    sugar.x = cube.px;
    sugar.y = cube.py;
    sugar.heading = cube.phase === 'turn' ? cube.turnTo : cube.heading;
  }

  function roomyRegion(regions) {
    for (let i = 0; i < regions.length; i++) if (cubeRoom(regions[i], tuning)) return true;
    return false;
  }

  function nearestPortalOf(r, x, y) {
    let best = r.portals[0], bestDistance = Infinity;
    for (const p of r.portals) {
      const d = p === 'left' ? x - r.x : p === 'right' ? r.x + r.w - x : p === 'top' ? y - r.y : r.y + r.h - y;
      if (d < bestDistance) { bestDistance = d; best = p; }
    }
    return best;
  }

  function journey(x, y, legs) {
    let d = 0;
    for (let k = 0; k < legs; k++) {
      const nx = cube.route[k * 2], ny = cube.route[k * 2 + 1];
      d += Math.hypot(nx - x, ny - y);
      x = nx;
      y = ny;
    }
    return d;
  }

  // The free ants in region `r` close enough to (x, y) to be called over,
  // nearest first, into `pool`; returns how many of them the team takes.
  function recruit(r, x, y, size) {
    let n = 0;
    for (let i = 0; i < ants.length; i++) {
      const a = ants[i];
      if (a.region !== r || !free(a)) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d > K.recruit) continue;
      let q = n++ - 1;
      while (q >= 0 && poolDistance[q] > d) { pool[q + 1] = pool[q]; poolDistance[q + 1] = poolDistance[q]; q--; }
      pool[q + 1] = i;
      poolDistance[q + 1] = d;
    }
    return Math.min(n, size);
  }

  // Nobody where the cube lands, and everyone not called over well clear of it.
  function clearOf(x, y, called) {
    for (let i = 0; i < ants.length; i++) {
      const o = ants[i];
      if (o.state === 'absent') continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < K.keep + 6) return false;
      let member = false;
      for (let m = 0; m < called; m++) if (pool[m] === i) member = true;
      if (!member && d < K.clear + 2) return false;
    }
    return true;
  }

  // Where place `m` is for the current heading, before any stray or sway.
  function placeX(m) {
    const p = cube.places[m];
    return cube.px + Math.cos(cube.heading) * p[0] - Math.sin(cube.heading) * p[1];
  }
  function placeY(m) {
    const p = cube.places[m];
    return cube.py + Math.sin(cube.heading) * p[0] + Math.cos(cube.heading) * p[1];
  }
  // The spot a carrier walks to first: on its place's side of the cube, clear of it.
  function stageX(m) {
    const p = cube.places[m], a = cube.heading + Math.atan2(p[1], p[0]), r = cube.region, f = tuning.footprint;
    return Math.max(r.x + f, Math.min(r.x + r.w - f, cube.px + Math.cos(a) * K.stage));
  }
  function stageY(m) {
    const p = cube.places[m], a = cube.heading + Math.atan2(p[1], p[0]), r = cube.region, f = tuning.footprint;
    return Math.max(r.y + f, Math.min(r.y + r.h - f, cube.py + Math.sin(a) * K.stage));
  }

  // The places that suit where the called ants stand: the shortest walks overall.
  const perm = new Int8Array(4), bestPerm = new Int8Array(4);
  let bestCost = Infinity;
  function permute(k, called, used, cost) {
    if (cost >= bestCost) return;
    if (k === cube.size) { bestCost = cost; bestPerm.set(perm); return; }
    for (let p = 0; p < cube.size; p++) {
      if (used & (1 << p)) continue;
      perm[k] = p;
      const walk = k < called ? Math.hypot(stageX(p) - ants[pool[k]].x, stageY(p) - ants[pool[k]].y) : 0;
      permute(k + 1, called, used | (1 << p), cost + walk);
    }
  }

  /**
   * A sugar cube turns up near a free ant in a roomy region, deep enough
   * for the whole procession to gather round it and clear of everyone. The
   * free ants nearest it make up its team; if they are too few, newcomers
   * come in through a portal, within the population ceiling and the
   * region's capacity. At least one ant must already be close by.
   */
  function startCube(regions, limit, size) {
    let absent = 0;
    for (let i = 0; i < ants.length; i++) if (ants[i].state === 'absent') absent++;
    const start = random.int(ants.length);
    for (let n = 0; n < ants.length; n++) {
      const a = ants[(start + n) % ants.length];
      if (!free(a) || !regions.includes(a.region) || !cubeRoom(a.region, tuning)) continue;
      const r = a.region;
      const spot = inflate(r, -(K.reach + K.margin));
      if (spot.w <= 0 || spot.h <= 0) continue;
      const wanted = random.range(...K.journey);
      let found = false, bestX = 0, bestY = 0, bestPortal = null, bestAlong = 0, bestScore = Infinity;
      for (let tries = 0; tries < 8; tries++) {
        const angle = random.next() * TAU, d = random.range(...K.near);
        const x = a.x + Math.cos(angle) * d, y = a.y + Math.sin(angle) * d;
        const portal = r.portals[random.int(r.portals.length)];
        const along = random.range(...K.along) * (random.next() < 0.5 ? -1 : 1);
        if (x < spot.x || x > spot.x + spot.w || y < spot.y || y > spot.y + spot.h) continue;
        const called = recruit(r, x, y, size);
        const newcomers = size - called;
        if (called < 1 || newcomers > absent || count + newcomers > limit
          || occupants(r) + newcomers > regionCapacity(r, tuning.areaPerVisitor) || !clearOf(x, y, called)) continue;
        const length = journey(x, y, planRoute(r, x, y, portal, along, cube.route, tuning));
        const score = Math.abs(length - wanted);
        if (length <= K.journey[1] && score < bestScore) { found = true; bestScore = score; bestX = x; bestY = y; bestPortal = portal; bestAlong = along; }
      }
      if (!found) continue;
      launch(r, bestX, bestY, bestPortal, bestAlong, size, recruit(r, bestX, bestY, size));
      return true;
    }
    return false;
  }

  function launch(r, x, y, portal, along, size, called) {
    Object.assign(cube, { phase: 'gather', size, region: r, portal, px: x, py: y, x, y, alpha: 0, lift: 0, speed: 0,
      heave: 0, sway: 0, twist: 0, wantTwist: 0, age: 0, leg: 0, exiting: false, hurry: false, hesitate: 0, blocked: 0,
      nudge: 0, blocker: -1, quirk: null, quirkMember: -1, quirkTimer: random.range(...K.quirk) * 0.5, lastQuirk: null });
    cube.legs = planRoute(r, x, y, portal, along, cube.route, tuning);
    cube.heading = Math.atan2(cube.route[1] - y, cube.route[0] - x);
    cube.angle = cube.heading;
    cube.places = PLACES[size];
    for (let m = 0; m < 4; m++) {
      cube.offX[m] = cube.offY[m] = cube.turn[m] = cube.wantX[m] = cube.wantY[m] = cube.wantTurn[m] = 0;
      cube.rate[m] = 10;
      cube.settle[m] = 0;
      cube.pending[m] = 0;
    }
    bestCost = Infinity;
    permute(0, called, 0, 0);
    // Called ants walk over; newcomers for the other places come in a moment later, one by one.
    let next = 0;
    for (let k = 0; k < size; k++) {
      const m = bestPerm[k];
      if (k < called) {
        cube.members[m] = pool[k];
        continue;
      }
      while (ants[next].state !== 'absent') next++;
      cube.members[m] = next++;
      cube.pending[m] = 1;
      cube.pendingTimer[m] = random.range(0.3, 1.8);
    }
    syncSugar();
    for (let m = 0; m < size; m++) if (!cube.pending[m]) visitors[cube.members[m]].gather(stageX(m), stageY(m));
  }

  function endCube() {
    cube.phase = 'none';
    cube.alpha = 0;
    cube.region = null;
    cube.exiting = false;
    cube.quirk = null;
    sugar.active = false;
  }

  // Let the carriers go: off on their own again (or on out, if they were already leaving).
  function releaseTeam() {
    for (let m = 0; m < cube.size; m++) {
      if (cube.pending[m]) continue;
      const i = cube.members[m];
      if (ants[i].state !== 'absent' && (ants[i].mode === 'haul' || ants[i].mode === 'gather')) visitors[i].release(cube.px, cube.py);
    }
    crowded = true;
  }

  /** Give the cube up where it is: the team wanders off and it fades away. */
  function abandon() {
    if (!teamOut()) return;
    releaseTeam();
    cube.phase = 'fade';
  }

  // Home: the whole procession is beyond the portal, out of sight.
  function finish() {
    for (let m = 0; m < cube.size; m++) visitors[cube.members[m]].retire();
    endCube();
    crowded = true;
  }

  /** Too many ants for the ceiling: no more dawdling, straight out the nearest way (or, still gathering, give up). */
  function hurry() {
    if (!teamOut() || cube.hurry) return;
    cube.hurry = true;
    endQuirk();
    if (cube.phase === 'gather') { abandon(); return; }
    if (!cube.exiting) direct(cube.region);
  }

  // A new route from here, straight out through the region's nearest portal.
  function direct(r) {
    cube.portal = nearestPortalOf(r, cube.px, cube.py);
    cube.legs = planRoute(r, cube.px, cube.py, cube.portal, 0, cube.route, tuning);
    cube.leg = 0;
    if (cube.exiting) {
      cube.exiting = false;
      for (let m = 0; m < cube.size; m++) ants[cube.members[m]].state = 'wandering';
    }
    if (cube.phase === 'carry' || cube.phase === 'turn') startLeg();
  }

  // Set off along the next leg, turning to face it first if need be.
  function startLeg() {
    const tx = cube.route[cube.leg * 2], ty = cube.route[cube.leg * 2 + 1];
    cube.turnTo = Math.atan2(ty - cube.py, tx - cube.px);
    cube.cruise = random.range(...K.speed);
    if (cube.leg === cube.legs - 1) {
      // The way out: its carriers are leaving now, through that portal.
      cube.exiting = true;
      for (let m = 0; m < cube.size; m++) {
        const a = ants[cube.members[m]];
        a.state = 'leaving';
        a.portal = cube.portal;
      }
    }
    cube.phase = Math.abs(angleDiff(cube.turnTo, cube.heading)) > 1e-3 ? 'turn' : 'carry';
  }

  // Move a carrier to (x, y) facing `heading`, legs going as far as it moved.
  function setMember(a, x, y, heading, dt) {
    const moved = Math.hypot(x - a.x, y - a.y);
    a.x = x;
    a.y = y;
    a.heading = heading;
    a.gait = (a.gait + moved * 0.42) % TAU;
    a.still = moved < 0.005 && dt > 0;
    if (a.still) a.twitch += dt; else a.twitch = 0;
  }

  const approach = (value, target, step) => (value < target ? Math.min(target, value + step) : Math.max(target, value - step));

  // Everyone at their places for this frame's route position, heading and strays.
  function place(dt) {
    const h = cube.heading, ch = Math.cos(h), sh = Math.sin(h);
    cube.sway = K.sway * Math.sin(cube.heave * 0.5);
    cube.x = cube.px - sh * cube.sway;
    cube.y = cube.py + ch * cube.sway;
    cube.twist = approach(cube.twist, cube.wantTwist, 0.4 * dt);
    cube.angle = h + cube.twist + 0.04 * Math.sin(cube.heave * 0.7);
    for (let m = 0; m < cube.size; m++) {
      const a = ants[cube.members[m]], p = cube.places[m];
      cube.offX[m] = approach(cube.offX[m], cube.wantX[m], cube.rate[m] * dt);
      cube.offY[m] = approach(cube.offY[m], cube.wantY[m], cube.rate[m] * dt);
      cube.turn[m] = approach(cube.turn[m], cube.wantTurn[m], 5 * dt);
      const sx = p[0] + cube.offX[m], sy = p[1] + cube.offY[m];
      setMember(a, cube.x + ch * sx - sh * sy, cube.y + sh * sx + ch * sy, h + p[2] + cube.turn[m], dt);
    }
  }

  // It fades in; each called ant walks over, and once beside its place steps in and takes hold.
  function stepGather(dt) {
    cube.alpha = Math.min(1, cube.alpha + dt / K.fade);
    if (cube.age > K.gather) { abandon(); return; }
    let placed = 0;
    const ease = (t) => t * t * (3 - 2 * t);
    for (let m = 0; m < cube.size; m++) {
      const i = cube.members[m], a = ants[i];
      if (cube.pending[m]) {
        cube.pendingTimer[m] -= dt;
        if (cube.pendingTimer[m] > 0) continue;
        stageAt.x = stageX(m);
        stageAt.y = stageY(m);
        if (visitors[i].enterRegion(cube.region, stageAt)) {
          cube.pending[m] = 0;
          count++;
          visitors[i].gather(stageX(m), stageY(m));
        } else cube.pendingTimer[m] = 0.5; // no clear way in just now
        continue;
      }
      if (a.state === 'absent') { abandon(); return; }
      if (a.mode === 'gather' && a.ready) {
        a.mode = 'haul';
        a.state = 'wandering';
        cube.settle[m] = 0;
        cube.fromX[m] = a.x;
        cube.fromY[m] = a.y;
        cube.fromH[m] = a.heading;
      }
      if (a.mode !== 'haul') continue;
      if (cube.settle[m] < 1) {
        cube.settle[m] = Math.min(1, cube.settle[m] + dt / K.settle);
        const e = ease(cube.settle[m]), heading = cube.heading + cube.places[m][2];
        setMember(a, cube.fromX[m] + (placeX(m) - cube.fromX[m]) * e, cube.fromY[m] + (placeY(m) - cube.fromY[m]) * e,
          cube.fromH[m] + angleDiff(heading, cube.fromH[m]) * e, dt);
      } else setMember(a, a.x, a.y, a.heading, dt);
      if (cube.settle[m] >= 1) placed++;
    }
    if (placed === cube.size && cube.alpha >= 1) { cube.phase = 'lift'; cube.lift = 0; }
  }

  // Together they lift it a little, and then they are off.
  function stepLift(dt) {
    cube.lift = Math.min(1, cube.lift + dt / K.lift);
    place(dt);
    if (cube.lift >= 1) startLeg();
  }

  // A corner: a moment's stop (now and then a longer think), then the whole team turns the cube round.
  function stepTurn(dt) {
    if (cube.hesitate > 0) { cube.hesitate -= dt; place(dt); return; }
    const diff = angleDiff(cube.turnTo, cube.heading), step = K.turnRate * dt;
    if (Math.abs(diff) <= step) { cube.heading = cube.turnTo; cube.phase = 'carry'; }
    else cube.heading += Math.sign(diff) * step;
    place(dt);
  }

  // The first ant (not of the team) that a step of the procession to (x, y) would bring within `radius`.
  function inTheWay(x, y, radius) {
    for (let i = 0; i < ants.length; i++) {
      const o = ants[i];
      if (o.state === 'absent' || isMember(i)) continue;
      const after = Math.hypot(o.x - x, o.y - y);
      if (after < radius && after < Math.hypot(o.x - cube.px, o.y - cube.py)) return i;
    }
    return -1;
  }

  // Held up by ant `i`: ask it to step aside now and then, send it home after
  // a while, and give the cube up rather than wait for ever.
  function heldUp(dt, i) {
    cube.blocked += dt;
    if (cube.blocker !== i) { cube.blocker = i; cube.nudge = 0; }
    cube.nudge -= dt;
    if (cube.nudge <= 0) { cube.nudge = K.nudge; visitors[i].makeWay(); }
    if (cube.blocked > K.shoo) visitors[i].dismiss();
    if (cube.blocked > K.stuck) abandon();
  }

  function stepCarry(dt) {
    quirks(dt);
    const last = cube.leg === cube.legs - 1;
    const tx = cube.route[cube.leg * 2], ty = cube.route[cube.leg * 2 + 1];
    const dx = tx - cube.px, dy = ty - cube.py, d = Math.hypot(dx, dy) || 1e-9;
    // A heave-and-pause rhythm, slower still while something is amiss, easing into each corner.
    const q = cube.quirk;
    let want = cube.cruise * (0.75 + 0.25 * Math.sin(cube.heave));
    if (q === 'reconsider' || q === 'reposition') want = 0;
    else if (q === 'wrong-way') want *= 0.4;
    else if (q === 'straggler') want *= 0.85;
    if (!last && d < 14) want *= Math.max(0.25, d / 14);
    // Someone a little way ahead: slow down, and ask them to move.
    const ahead = inTheWay(cube.px + (dx / d) * 8, cube.py + (dy / d) * 8, K.clear);
    if (ahead >= 0) { want = 0; heldUp(dt, ahead); } else cube.blocked = 0;
    if (cube.phase === 'fade') return;
    cube.speed = approach(cube.speed, want, (want < cube.speed ? 3 : 1) * K.accel * dt); // quicker to stop than to start
    let step = Math.min(cube.speed * dt, d);
    if (step > 0 && inTheWay(cube.px + (dx / d) * step, cube.py + (dy / d) * step, K.clear) >= 0) { step = 0; cube.speed = 0; }
    cube.px += (dx / d) * step;
    cube.py += (dy / d) * step;
    cube.heave += step * 0.3;
    place(dt);
    if (d - step > 1e-3) return;
    if (last) { finish(); return; }
    cube.leg++;
    cube.hesitate = cube.hurry ? 0 : random.next() < K.hesitate ? random.range(0.6, 1.4) : random.range(0.15, 0.35);
    startLeg();
  }

  function endQuirk() {
    cube.quirk = null;
    cube.wantTwist = 0;
    for (let m = 0; m < 4; m++) { cube.wantX[m] = cube.wantY[m] = cube.wantTurn[m] = 0; cube.rate[m] = 10; }
  }

  // Now and then, one small lapse in coordination at a time.
  function quirks(dt) {
    if (cube.quirk) {
      cube.quirkTime -= dt;
      const m = cube.quirkMember;
      // Second thoughts: the stray carrier turns back to its place, or catches up.
      if (cube.quirk === 'wrong-way' && cube.quirkTime < 0.5) { cube.wantX[m] = cube.wantY[m] = cube.wantTurn[m] = 0; cube.wantTwist = 0; }
      if (cube.quirk === 'straggler' && cube.quirkTime < cube.quirkLength * 0.45) { cube.wantX[m] = 0; cube.rate[m] = 8; }
      if (cube.quirkTime <= 0) endQuirk();
      return;
    }
    if (cube.hurry) return;
    cube.quirkTimer -= dt;
    if (cube.quirkTimer > 0) return;
    // Not until everyone is back in their place from the last one.
    for (let m = 0; m < cube.size; m++) if (Math.abs(cube.offX[m]) + Math.abs(cube.offY[m]) + Math.abs(cube.turn[m]) > 0.05) return;
    cube.quirkTimer = random.range(...K.quirk);
    let kind = quirkForced;
    quirkForced = null;
    if (!kind && random.next() < K.quirkChance) {
      kind = QUIRKS[random.int(QUIRKS.length)];
      if (kind === cube.lastQuirk) kind = QUIRKS[(QUIRKS.indexOf(kind) + 1) % QUIRKS.length];
    }
    if (kind) startQuirk(kind);
  }

  function startQuirk(kind) {
    cube.quirk = kind;
    cube.lastQuirk = kind;
    let m = -1;
    if (kind === 'wrong-way') {
      // A carrier at the side (or behind) lets go, turns and tugs the wrong way a moment.
      m = 1 + random.int(cube.size - 1);
      const p = cube.places[m], s = p[1] > 0 ? 1 : p[1] < 0 ? -1 : random.next() < 0.5 ? -1 : 1;
      cube.wantX[m] = p[1] === 0 ? -4 : -3;
      cube.wantY[m] = p[1] === 0 ? 0 : s * 4;
      cube.wantTurn[m] = s * 2.5;
      cube.wantTwist = s * 0.08;
      cube.quirkLength = random.range(1.1, 1.6);
    } else if (kind === 'straggler') {
      // One at the side falls a little behind, then hurries to catch up.
      m = 1 + random.int(2);
      cube.wantX[m] = -K.stumble;
      cube.rate[m] = 4;
      cube.quirkLength = random.range(1.6, 2.4);
    } else if (kind === 'reconsider') {
      // Everyone stops and looks about, as if the route were in doubt.
      for (let k = 0; k < cube.size; k++) cube.wantTurn[k] = random.range(-0.35, 0.35);
      cube.quirkLength = random.range(0.9, 1.6);
    } else {
      // The cube stops while they shuffle their grip.
      for (let k = 0; k < cube.size; k++) {
        cube.wantX[k] = random.range(-1.5, 1.5);
        cube.wantY[k] = random.range(-1.5, 1.5);
        cube.wantTurn[k] = random.range(-0.2, 0.2);
        cube.rate[k] = 6;
      }
      cube.quirkLength = random.range(0.6, 1.0);
    }
    cube.quirkMember = m;
    cube.quirkTime = cube.quirkLength;
  }

  // Now and then (counting only eligible time: High, room for three, a roomy
  // region) a chance of a cube; it waits a while for free ants and space,
  // and is skipped if they never come.
  function opportunity(dt, regions, limit, allowed) {
    if (cubeForced && (cubeForced.time += dt) > 60) cubeForced = null;
    if (!allowed || limit < 3 || !roomyRegion(regions)) return;
    if (!cubeForced) {
      if (cubeWindow <= 0) {
        cubeTimer -= dt;
        if (cubeTimer > 0) return;
        cubeWindow = K.window;
        cubeRetry = 0;
        opportunities++;
      }
      cubeWindow -= dt;
      if (cubeWindow <= 0) { skipped++; cubeTimer = random.range(...K.every); return; } // skipped this time
    }
    cubeRetry -= dt;
    if (cubeRetry > 0) return;
    cubeRetry = cubeForced ? 0.5 : K.retry;
    if (spell !== 'active' || count === 0 || crumb.state !== 'none') return;
    const fixed = cubeForced?.size ?? null;
    const size = fixed ?? (random.next() < K.four ? 4 : 3);
    if (!startCube(regions, limit, size) && (fixed || size !== 4 || !startCube(regions, limit, 3))) return;
    quirkForced = cubeForced?.quirk ?? null;
    cubeForced = null;
    cubeWindow = 0;
    cubeTimer = random.range(...K.every);
  }

  function stepCube(dt, regions, limit, allowed) {
    if (cube.phase === 'none') { opportunity(dt, regions, limit, allowed); return; }
    cube.age += dt;
    if (cube.phase === 'fade') {
      cube.alpha -= dt / K.fade;
      if (cube.alpha <= 0) endCube();
      return;
    }
    if (cube.age > K.lifetime) { abandon(); return; }
    if (cube.phase === 'gather') stepGather(dt);
    else if (cube.phase === 'lift') stepLift(dt);
    else if (cube.phase === 'turn') stepTurn(dt);
    else stepCarry(dt);
    if (cube.phase !== 'none') syncSugar();
  }

  // Whether the rest of the route is still safe in `home` (refitting the way out to it).
  function routeSafe(home) {
    if (!home.portals.includes(cube.portal)) return false;
    const b = inflate(home, -K.reach);
    const inside = (x, y) => x >= b.x - FIT && x <= b.x + b.w + FIT && y >= b.y - FIT && y <= b.y + b.h + FIT;
    for (let k = cube.leg; k < cube.legs - 1; k++) if (!inside(cube.route[k * 2], cube.route[k * 2 + 1])) return false;
    const k = (cube.legs - 1) * 2, side = cube.portal === 'left' || cube.portal === 'right';
    const lateral = side ? cube.route[k + 1] : cube.route[k];
    if (side ? lateral < b.y - FIT || lateral > b.y + b.h + FIT : lateral < b.x - FIT || lateral > b.x + b.w + FIT) return false;
    const beyond = K.reach + 2;
    if (cube.portal === 'left') cube.route[k] = home.x - beyond;
    else if (cube.portal === 'right') cube.route[k] = home.x + home.w + beyond;
    else if (cube.portal === 'top') cube.route[k + 1] = home.y - beyond;
    else cube.route[k + 1] = home.y + home.h + beyond;
    return true;
  }

  /**
   * After a layout change: the procession stays, where it is, only if its
   * whole reach (cube, team, strays and sway) still lies inside one new
   * region (or, on its way out, past only a portal side that region still
   * has) and every carrier is still there; its route is kept if still
   * safe, or replaced by a safe one straight out. If the team was broken
   * up but the cube is still in the clear, it is given up and fades; if it
   * no longer fits, it is gone at once (carriers that do not fit have
   * already been retired by the visitor rule; the rest wander off).
   */
  function relayoutCube(regions) {
    if (cube.phase === 'none') return;
    if (cube.phase === 'fade') {
      let ok = false;
      for (const r of regions) ok ||= holds(r, cube.x, cube.y, K.radius, cube.exiting ? cube.portal : null);
      if (!ok) endCube();
      return;
    }
    let home = null;
    for (const r of regions) {
      if (holds(r, cube.px, cube.py, K.reach)
        || (cube.exiting && r.portals.includes(cube.portal) && holds(r, cube.px, cube.py, K.reach, cube.portal))) { home = r; break; }
    }
    let intact = !!home;
    for (let m = 0; m < cube.size && intact; m++) {
      if (cube.pending[m]) continue;
      const a = ants[cube.members[m]];
      if (a.state === 'absent' || a.region !== home) intact = false;
    }
    if (!intact) {
      if (home) abandon();
      else { releaseTeam(); endCube(); }
      return;
    }
    cube.region = home;
    if (!routeSafe(home)) direct(home);
  }

  function mingle(dt, allowed) {
    let busy = false;
    for (let i = 0; i < ants.length; i++) {
      if (!SOCIAL.has(ants[i].mode)) continue;
      if (allowed) busy = true; else visitors[i].calm();
    }
    // Nothing new starts while a sugar cube has everyone's attention.
    if (!allowed || busy || cube.phase !== 'none') return;
    socialTimer -= dt;
    if (socialTimer > 0) return;
    const go = forced !== null || random.next() < tuning.social.chance;
    const kind = forced && forced !== true ? forced : KINDS[random.int(KINDS.length)];
    // Nobody suitable about: look again shortly.
    if (go && !gather(kind)) { socialTimer = 2; return; }
    forced = null;
    socialTimer = random.range(...tuning.social.every);
  }

  return {
    ants,
    crumb,
    cube,
    get count() { return count; },
    /** Sugar-cube opportunities so far, and those skipped for want of free ants or space (pacing report). */
    get opportunities() { return { opportunities, skipped }; },
    get spell() { return spell; },

    /**
     * Advance by dt seconds. `limit` is this frame's population ceiling (it
     * already includes region capacity, the display budget and quality).
     */
    step(dt, regions, limit, { social = true } = {}) {
      if (limit !== lastLimit) { lastLimit = limit; crowded = true; }
      if (crowded) { crowded = false; enforce(limit, regions); }
      if (spell === 'empty') {
        if (limit > 0 && regions.length) {
          spellTimer -= dt;
          if (spellTimer <= 0) startSpell();
        }
      } else if (spell === 'active') {
        spellTimer -= dt;
        if (spellTimer <= 0) spell = 'quiet';
      } else if (count === 0) {
        spell = 'empty';
        spellTimer = random.range(...tuning.empty);
      }
      count = 0;
      for (let i = 0; i < ants.length; i++) if (ants[i].state !== 'absent') count++;
      gap -= dt;
      const reserved = pendingCount(); // newcomers on their way to a sugar cube
      for (let i = 0; i < ants.length; i++) {
        const ant = ants[i];
        if (ant.state !== 'absent') { visitors[i].step(dt); continue; }
        if (spell !== 'active' || count + reserved >= limit || !regions.length || isPending(i)) continue;
        ant.timer -= dt;
        if (ant.timer > 0 || gap > 0) continue;
        const region = chooseRegion(regions);
        if (region && visitors[i].enterRegion(region)) {
          count++;
          gap = rush > 0 ? 0.35 : random.range(...tuning.arrivalGap);
          rush = Math.max(0, rush - 1);
        } else ant.timer = 0.5; // no clear way in just now
      }
      mingle(dt, social);
      stepCube(dt, regions, limit, social);
      stepCrumb(dt);
    },

    /**
     * After a layout change: keep every ant whose footprint still fits a new
     * region, where it stands (retiring the rest at once); keep a lying crumb
     * that still lies deep enough inside one (a carried one goes with its
     * carrier); and keep a sugar-cube procession whose whole reach still
     * fits, or cancel it (see relayoutCube).
     */
    relayout(regions) {
      for (const visitor of visitors) visitor.relayout(regions);
      if (crumb.state === 'lying') {
        const k = tuning.crumb, deep = tuning.footprint + k.mouth + k.radius;
        let home = null;
        for (const r of regions) if (holds(r, crumb.x, crumb.y, deep)) { home = r; break; }
        if (home) crumb.region = home;
        else dropCrumb();
      } else if (crumb.state === 'carried' && crumb.claim.state === 'absent') dropCrumb();
      relayoutCube(regions);
      crowded = true;
    },

    /** Everyone gone at once (screen change, reduced motion), back after a quiet while. */
    retire() {
      for (const visitor of visitors) visitor.retire();
      dropCrumb();
      endCube();
      count = 0;
      spell = 'empty';
      spellTimer = random.range(...tuning.cooldown);
    },

    /** ?debug: start a spell now and bring `n` arrivals forward. Space and policy still apply. */
    summon(n = 1) {
      if (spell !== 'active') { spell = 'active'; spellTimer = random.range(...tuning.spell); }
      let k = 0;
      for (let i = 0; i < ants.length && k < n; i++) {
        if (ants[i].state === 'absent') { ants[i].timer = 0; k++; }
      }
      rush = k;
      gap = 0;
    },

    /** ?debug: the next social moment, now (optionally of one kind), whenever ants allow it. */
    socialize(kind = null) {
      forced = KINDS.includes(kind) ? kind : true;
      socialTimer = 0;
    },

    /** ?debug: a crumb now, near a wandering ant, as soon as one is free (never a second one). */
    crumble() {
      crumbForced = true;
    },

    /**
     * ?debug: a sugar cube as soon as the colony allows it (High, free ants,
     * a roomy region, no crumb about), within the next minute; optionally a
     * team of `size` (3 or 4) and, early in the carrying, a given `quirk`
     * ('wrong-way' | 'reconsider' | 'straggler' | 'reposition').
     */
    sweeten({ size = null, quirk = null } = {}) {
      cubeForced = { size: size === 3 || size === 4 ? size : null, quirk: QUIRKS.includes(quirk) ? quirk : null, time: 0 };
    },
  };
}

const CRUMB_POINTS = 7; // corners of a crumb's irregular outline

const BODY = '#7a4a2c';
const LEGS = '#5e3820';
const SHINE = '#b07a4e';
const LEG_REACH = [3.8, 0.5, -4.2]; // resting foot positions along the body: front, middle, rear

/**
 * Paint one ant at (x, y) facing `heading` (radians). Lengths are CSS px;
 * the whole drawing stays within AMBIENT.footprint of its centre.
 * `gait` drives the tripod leg swing; `moving` false holds the legs still.
 */
export function drawAnt(ctx, { x, y, heading, gait = 0, moving = true, twitch = 0 }, { quality = 'high' } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.strokeStyle = LEGS;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.9;
  const swing = moving ? Math.sin(gait) : 0;
  ctx.beginPath();
  // Three legs a side from the thorax, front ones reaching forward and rear
  // ones back; alternate tripods swing in opposition.
  for (let i = 0; i < 3; i++) {
    const base = 0.9 - i * 0.7;
    for (let side = -1; side <= 1; side += 2) {
      const phase = (i % 2 === 0 ? 1 : -1) * side * swing;
      const foot = LEG_REACH[i] + phase * 1.4;
      if (quality === 'low') {
        ctx.moveTo(base, 0);
        ctx.lineTo(foot, side * 5.2);
      } else {
        // Femur out to a raised knee, then the tibia down to the foot.
        ctx.moveTo(base, side * 0.7);
        ctx.lineTo(base + (foot - base) * 0.35, side * 3.3);
        ctx.lineTo(foot, side * 5.4);
      }
    }
  }
  // Antennae: an elbowed pair angled outward, twitching when it stops.
  const flick = moving ? 0 : Math.sin(twitch * 9) * 0.4;
  for (let side = -1; side <= 1; side += 2) {
    ctx.moveTo(4.6, side * 0.5);
    ctx.lineTo(6.0, side * (1.9 + flick * side * 0.5));
    ctx.lineTo(7.6, side * (2.9 + flick));
  }
  ctx.stroke();
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(-3.9, 0, 3.0, 2.2, 0, 0, TAU); // gaster
  ctx.moveTo(1.4, 0);
  ctx.ellipse(0.2, 0, 1.6, 1.1, 0, 0, TAU); // thorax
  ctx.moveTo(4.9, 0);
  ctx.ellipse(3.7, 0, 1.3, 1.25, 0, 0, TAU); // head
  ctx.fill();
  if (quality !== 'low') {
    ctx.fillStyle = SHINE;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(-4.3, -0.8, 1.2, 0.6, -0.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

const CRUMB = '#c99a5b';
const CRUMB_SHADE = '#9c6f3c';
const CRUMB_LIGHT = '#e8c88f';

/**
 * Paint a crumb at (x, y), turned by `angle`, at `alpha`: a small irregular
 * piece of biscuit (`shape` holds its corners' radii as shares of the
 * crumb's radius), or a plain dot in Low quality. The whole drawing stays
 * within AMBIENT.crumb.radius of its centre.
 */
export function drawCrumb(ctx, { x, y, angle = 0, alpha = 1, shape = null }, { quality = 'high', radius = AMBIENT.crumb.radius } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = CRUMB;
  ctx.strokeStyle = CRUMB_SHADE;
  ctx.lineWidth = 0.6;
  ctx.lineJoin = 'round'; // no mitred corner pokes past the radius
  ctx.beginPath();
  if (quality === 'low' || !shape) ctx.arc(0, 0, radius * 0.8, 0, TAU);
  else {
    // Inset by the stroke's half-width, so the outline stays inside the radius.
    const r = radius - 0.3;
    for (let i = 0; i < shape.length; i++) {
      const a = (i / shape.length) * TAU, d = r * shape[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.closePath();
  }
  ctx.fill();
  if (quality !== 'low' && shape) {
    ctx.stroke();
    ctx.fillStyle = CRUMB_LIGHT;
    ctx.beginPath();
    ctx.arc(-0.5, -0.5, 0.55, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

const SUGAR = '#fbf7ee';
const SUGAR_SIDE = '#d9cfbd';
const SUGAR_EDGE = '#b5a993';
const SUGAR_GRAIN = '#e4dccd';
const SUGAR_SHADOW = '#3b2a1c';
const DEPTH_X = 1.1, DEPTH_Y = 2.4; // its sides show toward the bottom right: light from the top left
// Sugar grains on the top face, in the cube's own frame (shares of its half side): x, y.
const GRAINS = Object.freeze([-0.45, -0.3, 0.3, 0.2, -0.1, 0.5, 0.55, -0.5]);

// The cube's outline about (ox, oy), turned by (c, s): a square of half side h.
function cubeOutline(ctx, c, s, h, ox, oy) {
  for (let k = 0; k < 4; k++) {
    const lx = k === 0 || k === 3 ? h : -h, ly = k < 2 ? h : -h;
    const px = ox + lx * c - ly * s, py = oy + lx * s + ly * c;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Paint the sugar cube at (x, y), turned by `angle`, at `alpha`: a white,
 * gently shaded cube seen from above, its sides showing toward the bottom
 * right, with a soft shadow that draws apart as it is lifted (`lift`, 0–1).
 * Low quality is the top and one flat side colour: no shadow, edge or
 * grains. The whole drawing stays within AMBIENT.cube.radius of (x, y).
 */
export function drawCube(ctx, { x, y, angle = 0, alpha = 1, lift = 0 }, { quality = 'high', half = AMBIENT.cube.half } = {}) {
  if (alpha <= 0) return;
  const c = Math.cos(angle), s = Math.sin(angle), h = half, opacity = Math.min(1, alpha);
  ctx.save();
  ctx.translate(x, y);
  if (quality !== 'low') {
    ctx.globalAlpha = opacity * 0.22;
    ctx.fillStyle = SUGAR_SHADOW;
    ctx.beginPath();
    cubeOutline(ctx, c, s, h, 0.8 + 0.8 * lift, 1.2 + 1.2 * lift);
    ctx.fill();
  }
  ctx.globalAlpha = opacity;
  // Lifted, the whole cube rises a little off its shadow.
  const ox = -0.4 * lift, oy = -1.0 * lift;
  // Its sides: each edge facing the bottom right, drawn down to the ground.
  ctx.fillStyle = SUGAR_SIDE;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const mx = k === 3 ? h : k === 1 ? -h : 0, my = k === 0 ? h : k === 2 ? -h : 0; // edge k's midpoint
    if ((mx * c - my * s) * DEPTH_X + (mx * s + my * c) * DEPTH_Y <= 0) continue;
    const ax = k === 0 || k === 3 ? h : -h, ay = k < 2 ? h : -h; // corner k
    const bx = k === 0 || k === 1 ? -h : h, by = k === 0 || k === 3 ? h : -h; // corner k + 1
    const x1 = ox + ax * c - ay * s, y1 = oy + ax * s + ay * c, x2 = ox + bx * c - by * s, y2 = oy + bx * s + by * c;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 + DEPTH_X, y2 + DEPTH_Y);
    ctx.lineTo(x1 + DEPTH_X, y1 + DEPTH_Y);
    ctx.closePath();
  }
  ctx.fill();
  // The top.
  ctx.fillStyle = SUGAR;
  ctx.beginPath();
  cubeOutline(ctx, c, s, h, ox, oy);
  ctx.fill();
  if (quality !== 'low') {
    ctx.strokeStyle = SUGAR_EDGE;
    ctx.lineWidth = 0.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = SUGAR_GRAIN;
    ctx.beginPath();
    for (let i = 0; i < GRAINS.length; i += 2) {
      const gx = GRAINS[i] * h, gy = GRAINS[i + 1] * h;
      const px = ox + gx * c - gy * s, py = oy + gx * s + gy * c;
      ctx.moveTo(px + 0.6, py);
      ctx.arc(px, py, 0.6, 0, TAU);
    }
    ctx.fill();
  }
  ctx.restore();
}
