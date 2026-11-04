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
});

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
 * `random` is a private cosmetic generator ({ next, range, int }).
 */
export function createVisitor({ random = createRandom(), tuning = AMBIENT, peers = null } = {}) {
  const ant = {
    state: 'absent', x: 0, y: 0, heading: 0, speed: 0, gait: 0,
    region: null, portal: null, timer: random.range(...tuning.firstVisit), stay: 0,
    targetX: 0, targetY: 0, segment: 0, wobble: 0, wobbleTime: 0, twitch: 0, blocked: 0,
    mode: 'solo', partner: null, social: 0, lag: 0, meetX: 0, meetY: 0, driftX: 0, driftY: 0, waited: 0,
    trail: new Float64Array(TRAIL * 2), trailHead: 0, trailCount: 0, trailTime: 0,
    crumb: null, cargo: false, // the crumb it is after or carrying, and whether it holds it
  };
  const others = peers ?? [];
  const social = tuning.social;
  const crumbs = tuning.crumb;

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
  // another ant? Stepping away from one is always allowed.
  function cramped(x, y, fromX, fromY) {
    const near = tuning.spacing * tuning.spacing;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === ant || o.state === 'absent') continue;
      const after = (o.x - x) ** 2 + (o.y - y) ** 2;
      if (after < near && after < (o.x - fromX) ** 2 + (o.y - fromY) ** 2) return true;
    }
    return false;
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
  function nearestPortal() {
    const r = ant.region;
    let best = r.portals[0], bestDistance = Infinity;
    for (const p of r.portals) {
      const d = p === 'left' ? ant.x - r.x : p === 'right' ? r.x + r.w - ant.x
        : p === 'top' ? ant.y - r.y : r.y + r.h - ant.y;
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

  function pickWaypoint() {
    if (ant.mode === 'follow') trailPoint();
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
   */
  function enterRegion(region) {
    ant.region = region;
    ant.portal = region.portals[random.int(region.portals.length)];
    const box = inner(region);
    let along = 0, best = -1;
    for (let tries = 0; tries < 3; tries++) {
      const candidate = vertical(ant.portal) ? random.range(box.y, box.y + box.h) : random.range(box.x, box.x + box.w);
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
    if (ant.state === 'entering') entryTarget(vertical(ant.portal) ? ant.y : ant.x);
    else if (ant.state === 'leaving') leave(random.range(-40, 40));
    else if (ant.mode === 'follow' || ant.mode === 'forage') pause(random.range(0.3, 0.8)); // waiting its turn
    else if (ant.mode === 'carry') carryPoint(); // a way round
    else if (ant.mode !== 'solo') endSocial();
    else {
      // Step away from whoever is in the way rather than try another path past
      // them (a follower waiting close behind would otherwise hold it there).
      const o = nearestOther();
      if (o) sidestep(o); else wander();
    }
  }

  // A few steps away from `o`, a little to one side.
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
    if (ant.mode === 'solo' || ant.mode === 'carry') return;
    if (ant.mode === 'forage') {
      // Interest lasts while it walks over, and while the crumb is still there for it.
      if (ant.state !== 'paused') ant.social -= dt;
      if (ant.crumb.state !== 'lying' || ant.crumb.claim !== ant || ant.social <= 0) endForage();
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
      record(dt);
      checkSocial(dt);
      if (ant.state === 'paused') {
        ant.twitch += dt;
        ant.stay -= dt;
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
      if (ant.state === 'wandering') ant.stay -= dt;
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

    /**
     * After a layout change: keep the visitor only if its whole region still
     * lies inside one of the new safe regions; otherwise retire it before it
     * can be drawn against the new layout, crumb and all. Any social moment
     * ends; a crumb it is after or carrying stays with it (the colony drops a
     * lying crumb whose region has gone, and the forager then gives up).
     */
    relayout(regions) {
      if (ant.state === 'absent') return;
      const home = regions.find((r) => contains(r, ant.region) && r.portals.includes(ant.portal));
      if (!home) { retire([2, 6]); return; }
      // The new region holds the old one, so the ant is already safely inside it.
      ant.region = home;
      if (SOCIAL.has(ant.mode)) { ant.mode = 'solo'; ant.partner = null; }
      if (ant.state === 'leaving') leave();
      else if (ant.mode === 'carry' && ant.state === 'wandering') carryPoint(); // toward the nearest portal now
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
 */
export function createColony({ random = createRandom(), tuning = AMBIENT } = {}) {
  const ants = [];
  const visitors = [];
  for (let i = 0; i < tuning.slots; i++) {
    const visitor = createVisitor({ random, tuning, peers: ants });
    visitors.push(visitor);
    ants.push(visitor.ant);
  }
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

  // A region with room to spare, larger and emptier ones more often.
  function chooseRegion(regions) {
    let total = 0;
    for (const r of regions) total += r.w * r.h * Math.max(0, regionCapacity(r, tuning.areaPerVisitor) - occupants(r));
    if (total <= 0) return null;
    let pick = random.next() * total;
    for (const r of regions) {
      pick -= r.w * r.h * Math.max(0, regionCapacity(r, tuning.areaPerVisitor) - occupants(r));
      if (pick < 0) return r;
    }
    return null;
  }

  // Too many for the ceiling or for a region: the latest extras head home.
  function enforce(limit, regions) {
    let kept = 0;
    for (let i = 0; i < ants.length; i++) {
      const ant = ants[i];
      if (ant.state === 'absent' || ant.state === 'leaving') continue;
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
      // Only while the colony is out and settling in.
      if (spell !== 'active' || count === 0) return;
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

  function mingle(dt, allowed) {
    let busy = false;
    for (let i = 0; i < ants.length; i++) {
      if (!SOCIAL.has(ants[i].mode)) continue;
      if (allowed) busy = true; else visitors[i].calm();
    }
    if (!allowed || busy) return;
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
    get count() { return count; },
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
      for (let i = 0; i < ants.length; i++) {
        const ant = ants[i];
        if (ant.state !== 'absent') { visitors[i].step(dt); continue; }
        if (spell !== 'active' || count >= limit || !regions.length) continue;
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
      stepCrumb(dt);
    },

    /**
     * Keep ants whose region survives a layout change; retire the rest; end
     * social moments. A lying crumb stays only if its region does; a carried
     * one goes with its carrier.
     */
    relayout(regions) {
      for (const visitor of visitors) visitor.relayout(regions);
      if (crumb.state === 'lying') {
        const home = regions.find((r) => contains(r, crumb.region));
        if (home) crumb.region = home;
        else dropCrumb();
      } else if (crumb.state === 'carried' && crumb.claim.state === 'absent') dropCrumb();
      crowded = true;
    },

    /** Everyone gone at once (screen change, reduced motion), back after a quiet while. */
    retire() {
      for (const visitor of visitors) visitor.retire();
      dropCrumb();
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
