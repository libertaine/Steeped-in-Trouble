// Ambient visitors: purely decorative life in the empty stage gutters.
//
// Nothing here reads or writes game state, consumes a gameplay random stream,
// or touches the DOM. The page adapter (ui/ambient.js) measures the layout,
// supplies a presentation policy, and owns the drawing surface. Coordinates
// are CSS pixels relative to that surface.

import { createRandom } from '../core/random.js';

export const AMBIENT = Object.freeze({
  maxVisitors: 1, // this increment's ceiling; the colony raises it later
  clearance: 8, // CSS px kept clear around every protected rectangle
  footprint: 9, // radius containing the whole animated ant, legs and antennae included
  minCorridor: 32, // narrowest gutter (CSS px) a visitor may use
  minLength: 96, // shortest gutter worth wandering along
  areaPerVisitor: 24_000, // CSS px² of one gutter each visitor needs (about 155 × 155)
  speed: [22, 38], // CSS px per second, chosen per path segment
  turnRate: 4.2, // radians per second toward the next waypoint
  firstVisit: [3, 7], // seconds before the first appearance on a calm screen
  cooldown: [14, 30], // seconds of absence between visits
  stay: [10, 20], // seconds of wandering before heading home
  pause: [0.4, 1.8], // seconds of an occasional stop
  pauseChance: 0.3, // per waypoint reached
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
 * full-height or full-width strip beside an exclusion, so pieces can overlap;
 * a visitor stays inside one piece for its whole visit, never crossing between.
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
 */
export function safeRegions(visible, exclusions, {
  clearance = AMBIENT.clearance, minCorridor = AMBIENT.minCorridor, minLength = AMBIENT.minLength,
  minArea = AMBIENT.areaPerVisitor, open = { left: true, right: true, top: true, bottom: true },
} = {}) {
  if (!visible || visible.w <= 0 || visible.h <= 0) return [];
  const blocked = exclusions.filter((e) => e.w > 0 && e.h > 0).map((e) => inflate(e, clearance));
  const regions = [];
  for (const r of subtract(visible, blocked)) {
    const short = Math.min(r.w, r.h), long = Math.max(r.w, r.h);
    if (short < minCorridor || long < minLength || r.w * r.h < minArea) continue;
    const portals = [];
    if (open.left && r.x <= visible.x + EDGE) portals.push('left');
    if (open.right && r.x + r.w >= visible.x + visible.w - EDGE) portals.push('right');
    if (open.top && r.y <= visible.y + EDGE) portals.push('top');
    if (open.bottom && r.y + r.h >= visible.y + visible.h - EDGE) portals.push('bottom');
    if (portals.length) regions.push({ ...r, portals });
  }
  return regions;
}

/**
 * How many visitors the measured space supports (never more than `max`).
 * Each region is counted on its own: two thin strips either side of the cup
 * are not one roomy gutter, since a visitor never crosses between them.
 */
export function capacity(regions, { max = AMBIENT.maxVisitors, areaPerVisitor = AMBIENT.areaPerVisitor } = {}) {
  let count = 0;
  for (const r of regions) count += Math.floor((r.w * r.h) / areaPerVisitor);
  return Math.min(max, count);
}

const TAU = Math.PI * 2;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * One wandering ant: absent → entering → wandering (with pauses) → leaving →
 * absent. It walks toward waypoints chosen inside its region, turning
 * smoothly with a little private wobble, and only ever moves inside that
 * region (or straight through its portal side while arriving and leaving).
 *
 * `random` is a private cosmetic generator ({ next, range, int }).
 */
export function createVisitor({ random = createRandom(), tuning = AMBIENT } = {}) {
  const ant = {
    state: 'absent', x: 0, y: 0, heading: 0, speed: 0, gait: 0,
    region: null, portal: null, timer: random.range(...tuning.firstVisit), stay: 0,
    targetX: 0, targetY: 0, segment: 0, wobble: 0, wobbleTime: 0, twitch: 0,
  };

  const inner = (r) => inflate(r, -tuning.footprint);

  function pickWaypoint() {
    const box = inner(ant.region);
    // Prefer a point a fair walk away so it doesn't dither in place.
    for (let tries = 0; tries < 4; tries++) {
      ant.targetX = random.range(box.x, box.x + box.w);
      ant.targetY = random.range(box.y, box.y + box.h);
      if (Math.hypot(ant.targetX - ant.x, ant.targetY - ant.y) > 40) break;
    }
    ant.speed = random.range(...tuning.speed);
    ant.segment = random.range(4, 7); // a change of mind if it isn't there by then
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

  function enter(regions) {
    // Larger gutters are visited more often.
    let total = 0;
    for (const r of regions) total += r.w * r.h;
    let pick = random.next() * total;
    let region = regions[regions.length - 1];
    for (const r of regions) { pick -= r.w * r.h; if (pick < 0) { region = r; break; } }
    ant.region = region;
    ant.portal = region.portals[random.int(region.portals.length)];
    const box = inner(region);
    const along = vertical(ant.portal) ? random.range(box.y, box.y + box.h) : random.range(box.x, box.x + box.w);
    [ant.x, ant.y] = portalPoint(ant.portal, along);
    // Its first waypoint lies a little way in, roughly ahead.
    ant.targetX = vertical(ant.portal) ? (ant.portal === 'left' ? box.x : box.x + box.w) : along;
    ant.targetY = vertical(ant.portal) ? along : (ant.portal === 'top' ? box.y : box.y + box.h);
    const depth = random.range(20, 60);
    if (ant.portal === 'left') ant.targetX = Math.min(box.x + box.w, box.x + depth);
    if (ant.portal === 'right') ant.targetX = Math.max(box.x, box.x + box.w - depth);
    if (ant.portal === 'top') ant.targetY = Math.min(box.y + box.h, box.y + depth);
    if (ant.portal === 'bottom') ant.targetY = Math.max(box.y, box.y + box.h - depth);
    ant.heading = Math.atan2(ant.targetY - ant.y, ant.targetX - ant.x);
    ant.speed = random.range(...tuning.speed);
    ant.segment = 8;
    ant.stay = random.range(...tuning.stay);
    ant.wobble = 0;
    ant.wobbleTime = 0;
    ant.state = 'entering';
  }

  function leave() {
    // Home is through any of the region's portals; the nearest one reads most naturally.
    const r = ant.region;
    let best = r.portals[0], bestDistance = Infinity;
    for (const p of r.portals) {
      const d = p === 'left' ? ant.x - r.x : p === 'right' ? r.x + r.w - ant.x
        : p === 'top' ? ant.y - r.y : r.y + r.h - ant.y;
      if (d < bestDistance) { bestDistance = d; best = p; }
    }
    ant.portal = best;
    [ant.targetX, ant.targetY] = portalPoint(best, vertical(best) ? ant.y : ant.x);
    ant.speed = random.range(...tuning.speed);
    ant.segment = Infinity;
    ant.state = 'leaving';
  }

  /** Remove the visitor at once (screen change, layout change, reduced motion). */
  function retire(cooldown = tuning.cooldown) {
    ant.state = 'absent';
    ant.region = null;
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
    const turn = angleDiff(desired, ant.heading);
    // Turning harder close in keeps it from circling a waypoint.
    const maxTurn = tuning.turnRate * dt * (distance < 16 ? 2.5 : 1);
    ant.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
    // Slow down for sharp turns, as an ant does.
    const pace = ant.speed * (0.45 + 0.55 * Math.max(0, Math.cos(turn)));
    const step = Math.min(pace * dt, distance);
    ant.x += Math.cos(ant.heading) * step;
    ant.y += Math.sin(ant.heading) * step;
    ant.gait = (ant.gait + step * 0.42) % TAU;
    confine();
    ant.segment -= dt;
    return distance - step < 3 || ant.segment <= 0;
  }

  return {
    ant,
    get visible() { return ant.state !== 'absent'; },
    retire,

    /**
     * Advance by dt seconds within the given safe regions. Absence only
     * counts down while there is somewhere to appear (`capacity` > 0).
     */
    step(dt, regions, room = 1) {
      if (ant.state === 'absent') {
        if (room <= 0 || !regions.length) return;
        ant.timer -= dt;
        if (ant.timer <= 0) enter(regions);
        return;
      }
      if (ant.state === 'paused') {
        ant.timer -= dt;
        ant.twitch += dt;
        ant.stay -= dt;
        if (ant.timer <= 0) {
          if (ant.stay <= 0) leave(); else { ant.state = 'wandering'; pickWaypoint(); }
        }
        return;
      }
      if (ant.state === 'wandering') ant.stay -= dt;
      const arrived = walk(dt);
      if (ant.state === 'leaving') {
        if (arrived) retire();
        return;
      }
      if (ant.state === 'entering' && arrived) { ant.state = 'wandering'; pickWaypoint(); return; }
      if (ant.state !== 'wandering') return;
      if (ant.stay <= 0) { leave(); return; }
      if (arrived) {
        if (random.next() < tuning.pauseChance) {
          ant.state = 'paused';
          ant.timer = random.range(...tuning.pause);
          ant.twitch = 0;
        } else pickWaypoint();
      }
    },

    /**
     * After a layout change: keep the visitor only if its whole region still
     * lies inside one of the new safe regions; otherwise retire it before it
     * can be drawn against the new layout.
     */
    relayout(regions) {
      if (ant.state === 'absent') return;
      const home = regions.find((r) => contains(r, ant.region) && r.portals.includes(ant.portal));
      if (!home) { retire([2, 6]); return; }
      // The new region holds the old one, so the ant is already safely inside it.
      ant.region = home;
      if (ant.state === 'leaving') leave();
    },
  };
}

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
