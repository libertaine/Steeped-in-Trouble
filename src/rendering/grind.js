// Draws The Daily Grind: a furious little copper-and-chrome espresso machine
// standing in a cup of coffee, its safety valve, its beans, its pressure
// warnings and jets, and the cards before and after the fight. Like the rest
// of the renderer it reads state and never changes it.

import { CONFIG } from '../config.js';
import { LANE_STEP, TAU, angleDifference, laneAngle, toCanvasPoint as polar } from '../gameplay/arena.js';
import { fury, threatenedLanes } from '../gameplay/grind.js';

const { centerX: CX, centerY: CY, rimRadius: OUTER } = CONFIG.arena;
const G = CONFIG.grind;
const GOLD = '#ffd45e';
const CREMA = '#e0b48a';
const MONO = 'ui-monospace,monospace';
const VALVE = '#ffcf6a';
const DANGER = '#ff4a2a';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => t * t * (3 - 2 * t);

/** How hard the machine is straining right now, 0–1: swelling, then holding, then letting go. */
function pressureOf(g) {
  const a = g.attack;
  if (a?.kind !== 'pressure') return 0;
  if (a.stage === 'build') return clamp(a.time / a.length, 0, 1) * 0.7;
  if (a.stage === 'warn') return 0.7 + 0.3 * clamp(a.time / a.length, 0, 1);
  return 1 - clamp(a.time / a.length, 0, 1);
}

/** Where the valve is on its collar: on its lane, or partway round to it. */
function valveAngle(g) {
  const v = g.valve;
  const to = laneAngle(v.lane);
  if (v.stage !== 'turning') return to;
  const from = laneAngle(v.from);
  return from + angleDifference(to, from) * smoothstep(clamp(v.time / v.length, 0, 1));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ circle: Function, text: Function, laneBeam: Function, highQuality: () => boolean }} tools
 *   the renderer's own drawing helpers
 */
export function createGrindPainter(ctx, { circle, text, laneBeam, highQuality }) {
  /** The machine's presence: rising in, standing, collapsing, or vanishing in steam. */
  function presence(g) {
    if (g.stage === 'intro') {
      const u = clamp((g.time - 0.7) / 1.3, 0, 1);
      const pop = u < 1 ? smoothstep(u) * (1 + 0.18 * Math.sin(u * Math.PI)) : 1;
      return { scale: 0.25 + 0.75 * pop, alpha: clamp(u * 3, 0, 1), sink: 40 * (1 - smoothstep(u)), tilt: 0, dead: false };
    }
    if (g.stage === 'outro' && g.result === 'victory') {
      const u = clamp((g.time - 0.5) / 0.9, 0, 1);
      return { scale: 1 - 0.25 * u, alpha: 1 - smoothstep(u), sink: 55 * smoothstep(u), tilt: 0.35 * smoothstep(u), dead: true };
    }
    if (g.stage === 'outro') {
      const u = clamp(g.time / 0.9, 0, 1);
      return { scale: 1 - 0.6 * u, alpha: 1 - u, sink: -30 * u, tilt: -1.2 * u * u, dead: false };
    }
    return { scale: 1, alpha: 1, sink: 0, tilt: 0, dead: false };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function chrome(x0, x1) {
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, '#6e7b80');
    grad.addColorStop(0.3, '#f4f8f8');
    grad.addColorStop(0.55, '#a9b6ba');
    grad.addColorStop(1, '#5c686c');
    return grad;
  }

  function beanShape(x, y, rotation, size, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#5a321a';
    ctx.strokeStyle = '#21110a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.68, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#c89a6a';
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.moveTo(-size * 0.75, 0);
    ctx.bezierCurveTo(-size * 0.25, -size * 0.35, size * 0.25, size * 0.35, size * 0.75, 0);
    ctx.stroke();
    ctx.restore();
  }

  // ── Beneath the machine ────────────────────────────────────────────────

  /** The pressure warnings: the threatened lanes glow red, faster as the burst nears. */
  function drawWarnings(g, time) {
    const lanes = threatenedLanes(g);
    const a = g.attack;
    if (!lanes.length || a.stage !== 'warn') return;
    const u = clamp(a.time / a.length, 0, 1);
    const blink = 0.6 + 0.4 * Math.sin(time * (9 + 22 * u));
    ctx.save();
    for (const lane of lanes) {
      const angle = laneAngle(lane);
      ctx.globalAlpha = (0.1 + 0.2 * u) * blink;
      ctx.fillStyle = DANGER;
      ctx.beginPath();
      ctx.arc(CX, CY, OUTER - 3, angle - LANE_STEP * 0.42, angle + LANE_STEP * 0.42);
      ctx.arc(CX, CY, G.bodyRadius, angle + LANE_STEP * 0.42, angle - LANE_STEP * 0.42, true);
      ctx.closePath();
      ctx.fill();
      // A warning triangle where the jet will hit the rim.
      const p = polar(OUTER - 26, angle);
      ctx.globalAlpha = 0.55 + 0.45 * blink;
      ctx.fillStyle = '#ffd0b8';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 8);
      ctx.lineTo(p.x + 7, p.y + 5);
      ctx.lineTo(p.x - 7, p.y + 5);
      ctx.closePath();
      ctx.fill();
      text('!', p.x, p.y + 1, 9, '#b0200a', 'center', MONO, 'bold ');
    }
    ctx.restore();
  }

  /** The burst: hot coffee shooting down every warned lane to the rim. */
  function drawJets(g, time) {
    const a = g.attack;
    if (a?.kind !== 'pressure' || a.stage !== 'burst') return;
    const fadeOut = 1 - clamp((a.time / a.length - 0.6) / 0.4, 0, 1);
    ctx.save();
    ctx.lineCap = 'round';
    for (const lane of a.lanes) {
      const angle = laneAngle(lane);
      const from = polar(G.bodyRadius - 4, angle);
      const to = polar(a.reach, angle);
      const wobble = Math.sin(time * 40 + lane) * 1.5;
      for (const [color, width, alpha] of [['#3b200e', 16, 0.85], ['#a8673a', 9, 0.9], ['#f0d0a0', 2.5, 0.8]]) {
        ctx.globalAlpha = alpha * fadeOut;
        ctx.strokeStyle = color;
        ctx.lineWidth = width + wobble;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      if (a.reach >= OUTER - 10) circle(to.x, to.y, 10 + 4 * Math.sin(time * 30 + lane), '#c8915a', 0, true, 0.6 * fadeOut);
    }
    ctx.restore();
  }

  /** The chrome collar round the machine, and the safety valve on it. */
  function drawCollar(g, time, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    circle(CX, CY, G.bodyRadius, '#3a2a20', 7, false, 0.6 * alpha);
    circle(CX, CY, G.bodyRadius, '#9aa7ab', 3.5, false, alpha);
    circle(CX, CY, G.bodyRadius - 1.5, '#eef4f4', 1, false, 0.7 * alpha);
    for (let lane = 0; lane < 16; lane++) {
      const p = polar(G.bodyRadius, laneAngle(lane));
      circle(p.x, p.y, 1.6, '#5c686c', 0, true, alpha);
    }
    ctx.restore();
  }

  function drawValve(g, time, alpha) {
    const v = g.valve;
    const open = v.stage === 'open';
    const angle = valveAngle(g);
    const p = polar(G.bodyRadius, angle);
    const closing = open ? clamp((v.length - v.time) / 0.5, 0, 1) : 0;
    if (open && g.stage === 'fight') {
      // Hit here: the lane lights up gold, and the valve glows and vents.
      laneBeam(v.lane, 1.4 + 0.6 * Math.sin(time * 8), VALVE);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      circle(p.x, p.y, 20 + 3 * Math.sin(time * 12), '#ff7a2a', 0, true, (0.25 + 0.15 * Math.sin(time * 12)) * alpha);
      ctx.restore();
      for (let k = 0; k < 4; k++) {
        const u = (time * 2.2 + k / 4) % 1;
        const q = polar(G.bodyRadius + 12 + u * 34, angle + Math.sin(u * 7 + k) * 0.03);
        circle(q.x, q.y, 2.5 + u * 5, '#f4ece0', 0, true, 0.45 * (1 - u) * alpha);
      }
      // A ring on the rim where the spoon should be.
      const rim = polar(OUTER - 4, laneAngle(v.lane));
      circle(rim.x, rim.y, 13 + 2 * Math.sin(time * 8), VALVE, 2, false, (0.5 + 0.4 * closing) * alpha);
    } else if (v.stage === 'turning' && g.stage === 'fight') {
      // Where it's heading: a faint marker on the rim.
      const rim = polar(OUTER - 4, laneAngle(v.lane));
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -time * 12;
      circle(rim.x, rim.y, 11, VALVE, 1.4, false, 0.45 * alpha);
      ctx.restore();
    }
    // The valve itself: a brass wheel on a stubby pipe, spinning as it turns.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#7a6a5a';
    ctx.fillRect(-6, -4, 10, 8);
    ctx.rotate(v.stage === 'turning' ? time * 9 : open ? Math.sin(time * 30) * 0.15 : 0);
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 1.4;
    ctx.fillStyle = open ? '#ffb34a' : '#c8952e';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#5a3a14';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 2.5, Math.sin(a) * 2.5);
      ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      ctx.stroke();
    }
    ctx.fillStyle = open ? '#ff3a1a' : '#a8321a';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBeans(g) {
    for (const b of g.beans) {
      const p = polar(b.radius, b.angle);
      circle(p.x + 1.5, p.y + 2.5, G.beanSize * 0.95, '#0a0402', 0, true, 0.45 * b.alpha);
      beanShape(p.x, p.y, b.spin, G.beanSize, b.alpha);
    }
  }

  // ── The machine ────────────────────────────────────────────────────────

  function drawEye(x, y, look, angry, squint, dead) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#f6efe2';
    ctx.strokeStyle = angry > 0.5 ? '#c8321a' : '#c9d2d4';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#2a1208';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (dead) {
      ctx.moveTo(-5, -5);
      ctx.lineTo(5, 5);
      ctx.moveTo(5, -5);
      ctx.lineTo(-5, 5);
    } else if (squint) {
      const s = Math.sign(x);
      ctx.moveTo(-6 * s, -5);
      ctx.lineTo(4 * s, 0);
      ctx.lineTo(-6 * s, 5);
    } else {
      // The needle is the pupil, and it watches the spoon.
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(look) * 8, Math.sin(look) * 8);
    }
    ctx.stroke();
    if (!dead && !squint) {
      ctx.fillStyle = '#a8200a';
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The gauge on top. It mostly reads PSI. */
  function drawGauge(g, f, p, time, dead) {
    ctx.save();
    ctx.translate(0, -66);
    ctx.fillStyle = '#9aa7ab';
    ctx.fillRect(-2.5, 8, 5, 10);
    ctx.fillStyle = '#f6efe2';
    ctx.strokeStyle = '#6e7b80';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#e0401a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, -0.6, 0.6);
    ctx.stroke();
    const reading = dead ? 0.05 : clamp(0.25 + 0.45 * f + 0.35 * p, 0, 1.05) + Math.sin(time * 37) * 0.04 * (f + p);
    const needle = Math.PI * 0.8 + reading * Math.PI * 1.4;
    ctx.strokeStyle = '#2a1208';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(needle) * 10, Math.sin(needle) * 10);
    ctx.stroke();
    ctx.restore();
    const tooMuch = !dead && (p > 0.75 || (f > 0.5 && Math.sin(time * 1.7) > 0.3));
    if (tooMuch && Math.sin(time * 14) > -0.3) {
      ctx.fillStyle = '#1c0a04e6';
      roundRect(-31, -96, 62, 15, 7);
      ctx.fill();
      text('TOO MUCH', 0, -88, 11, '#ff6a4a', 'center', MONO, 'bold ');
    }
  }

  /** A puff of steam that, now and then, looks very cross. */
  function drawAngryPuff(f, time) {
    const cycle = (time + 2.3) % 7;
    if (f < 0.3 || cycle > 1.8) return;
    const u = cycle / 1.8;
    const a = Math.sin(Math.PI * u);
    ctx.save();
    ctx.translate(48 + 10 * u, -92 - 18 * u);
    ctx.globalAlpha = 0.75 * a;
    ctx.fillStyle = '#e8dccb';
    for (const [x, y, r] of [[-10, 2, 9], [0, -4, 11], [11, 1, 9], [3, 6, 8]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#5a3a2a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.lineTo(-2, -3);
    ctx.moveTo(8, -6);
    ctx.lineTo(3, -3);
    ctx.moveTo(-4, 5);
    ctx.quadraticCurveTo(1, 1, 6, 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawMachine(g, state, time) {
    const f = fury(g);
    const look = presence(g);
    if (look.alpha <= 0.01) return;
    const p = pressureOf(g);
    const flinch = g.flinch / 0.3;
    const dying = look.dead ? clamp(1 - g.time / 0.9, 0, 1) : 0;
    const shake = (0.3 + 2.2 * f) + 4 * flinch + 6 * dying;
    const jx = (Math.sin(time * 61) * 0.6 + Math.sin(time * 37) * 0.4) * shake;
    const jy = Math.cos(time * 53) * shake * 0.4;
    const frantic = f > 0.75 && g.stage === 'fight';
    const hop = frantic ? Math.abs(Math.sin(time * 7)) * 10 * (f - 0.75) * 4 : 0;
    const spoonLook = state.angle;

    ctx.save();
    ctx.translate(CX + jx, CY + 4 + jy - hop + look.sink);
    ctx.rotate(look.tilt + (frantic ? Math.sin(time * 7) * 0.06 : 0));
    ctx.scale(look.scale * (1 + 0.06 * p), look.scale * (1 - 0.03 * p));
    ctx.globalAlpha = look.alpha;

    // Its shadow in the coffee.
    ctx.fillStyle = '#080301';
    ctx.globalAlpha = 0.5 * look.alpha;
    ctx.beginPath();
    ctx.ellipse(4, 44, 62, 16, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = look.alpha;

    // The steam wand, behind the body: it points at the spoon, suspiciously.
    const aim = spoonLook - look.tilt;
    ctx.save();
    ctx.rotate(aim);
    ctx.strokeStyle = '#4a5458';
    ctx.lineWidth = 1.2;
    roundRect(20, -4, 52, 8, 4);
    ctx.fillStyle = '#c3cdd0';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5c686c';
    roundRect(66, -5.5, 10, 11, 3);
    ctx.fill();
    ctx.restore();

    // The body: copper, rounded, riveted, and getting redder.
    const copper = ctx.createLinearGradient(-50, 0, 50, 0);
    copper.addColorStop(0, '#6a3018');
    copper.addColorStop(0.25, '#d98b4f');
    copper.addColorStop(0.45, '#f4bb84');
    copper.addColorStop(0.7, '#b4602e');
    copper.addColorStop(1, '#5a2812');
    ctx.fillStyle = copper;
    ctx.strokeStyle = '#3a1608';
    ctx.lineWidth = 2;
    roundRect(-50, -44, 100, 84, 13);
    ctx.fill();
    ctx.stroke();
    const heat = 0.3 * f + 0.45 * flinch + 0.25 * p;
    if (heat > 0.02) {
      ctx.globalAlpha = look.alpha * heat;
      ctx.fillStyle = '#ff2a0a';
      roundRect(-50, -44, 100, 84, 13);
      ctx.fill();
      ctx.globalAlpha = look.alpha;
    }

    // Chrome bands with rivets.
    for (const [y, h] of [[-44, 9], [30, 10]]) {
      ctx.fillStyle = chrome(-50, 50);
      roundRect(-50, y, 100, h, 4);
      ctx.fill();
      ctx.fillStyle = '#4a5458';
      for (let x = -40; x <= 40; x += 16) {
        ctx.beginPath();
        ctx.arc(x, y + h / 2, 1.3, 0, TAU);
        ctx.fill();
      }
    }

    // Steam vents, puffing harder as the pressure rises.
    for (const side of [-1, 1]) {
      ctx.fillStyle = chrome(side * 32 - 5, side * 32 + 5);
      ctx.fillRect(side * 32 - 4, -56, 8, 13);
      for (let k = 0; k < 3; k++) {
        const u = (time * (0.9 + 1.4 * (f + p)) + k / 3 + (side > 0 ? 0.5 : 0)) % 1;
        circle(side * 32 + Math.sin(u * 5 + k) * 4, -60 - u * (26 + 20 * p), 2.5 + u * (5 + 5 * p), '#efe6da', 0, true,
          (0.2 + 0.35 * f + 0.4 * p) * (1 - u) * look.alpha);
      }
    }

    // A cup-warmer rail, with two little cups that rattle.
    ctx.strokeStyle = '#c3cdd0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, -50);
    ctx.lineTo(20, -50);
    ctx.stroke();
    for (const x of [-11, 9]) {
      const rattle = Math.sin(time * 33 + x) * (0.6 + 2.4 * f);
      ctx.fillStyle = '#f4efe6';
      roundRect(x - 5 + rattle * 0.3, -58 - Math.abs(rattle) * 0.4, 10, 8, 2);
      ctx.fill();
    }

    drawGauge(g, f, p, time, look.dead);

    // Angry brows and gauge eyes.
    const squint = g.flinch > 0.05;
    for (const side of [-1, 1]) {
      drawEye(side * 21, -16, spoonLook, f + p, squint, look.dead);
      ctx.strokeStyle = '#2a1208';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      const tilt = 6 + 6 * (f + 0.6 * p);
      ctx.beginPath();
      ctx.moveTo(side * 34, -33 - tilt * 0.4);
      ctx.lineTo(side * 9, -30 + tilt * 0.4);
      ctx.stroke();
    }

    // The group head and a wobbling portafilter: its mouth, more or less.
    ctx.fillStyle = chrome(-20, 20);
    roundRect(-20, 4, 40, 11, 3);
    ctx.fill();
    ctx.save();
    ctx.translate(0, 18);
    ctx.rotate(Math.sin(time * (6 + 14 * f)) * (0.06 + 0.25 * f) + (look.dead ? 0.5 : 0));
    ctx.fillStyle = '#8a979c';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#1e1410';
    roundRect(12, -3, 34, 7, 3.5);
    ctx.fill();
    ctx.restore();
    // It drips while it is angry, and pours during a burst.
    const drip = (time * 1.6) % 1;
    if (p > 0.8) {
      ctx.fillStyle = '#5a3418';
      ctx.fillRect(-3, 30, 6, 16);
    } else if (f > 0.2) {
      circle(0, 30 + drip * 14, 2.2, '#5a3418', 0, true, look.alpha * (1 - drip));
    }

    drawAngryPuff(g.stage === 'fight' ? f : 0, time);
    ctx.restore();
  }

  // ── Readouts and cards ─────────────────────────────────────────────────

  /** A small health meter over the machine, the fight clock round the cup, and the scald meter. */
  function drawReadouts(g, time) {
    if (g.stage !== 'fight') return;
    const appear = clamp(g.time / 0.6, 0, 1);
    // Health.
    const y = CY - 124;
    ctx.save();
    ctx.globalAlpha = appear;
    text('THE DAILY GRIND', CX, y - 13, 10, CREMA, 'center', MONO, 'bold ');
    ctx.fillStyle = '#1a0c06cc';
    roundRect(CX - 72, y - 5, 144, 10, 5);
    ctx.fill();
    const share = g.health / G.health;
    const fill = ctx.createLinearGradient(CX - 70, 0, CX + 70, 0);
    fill.addColorStop(0, '#ff3a1a');
    fill.addColorStop(1, '#ffb34a');
    ctx.fillStyle = g.flinch > 0.15 ? '#fff4e0' : fill;
    roundRect(CX - 70, y - 3, 140 * share, 6, 3);
    ctx.fill();
    ctx.strokeStyle = '#d9a464';
    ctx.lineWidth = 1;
    roundRect(CX - 72, y - 5, 144, 10, 5);
    ctx.stroke();
    ctx.restore();

    // The clock: an arc round the outside of the cup that runs down.
    const left = g.left / G.duration;
    const hurry = g.left < 6;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = hurry ? '#ff7a4a' : '#d9a464';
    ctx.globalAlpha = appear * (hurry ? 0.55 + 0.35 * Math.sin(time * 10) : 0.5);
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER + 33, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    ctx.restore();

    // Scalds: three little cups, bottom left. A scalded one tips over and steams.
    const x0 = 50;
    const y0 = 714;
    ctx.save();
    ctx.globalAlpha = appear;
    text('SCALDS', x0 + 36, y0 - 28, 13, '#f0c4a8', 'center', MONO, 'bold ');
    for (let i = 0; i < G.scalds; i++) {
      const hit = i < g.scalds;
      const x = x0 + i * 36;
      ctx.save();
      ctx.translate(x, y0);
      if (hit) ctx.rotate(0.5);
      ctx.fillStyle = hit ? '#ff7a4a' : '#f4efe6';
      ctx.strokeStyle = hit ? '#8a2a10' : '#9aa7ab';
      ctx.lineWidth = 1.8;
      roundRect(-10, -9, 20, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(11, 0, 5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.restore();
      if (hit) {
        const u = (time * 0.8 + i / 3) % 1;
        circle(x + Math.sin(u * 6) * 2, y0 - 14 - u * 18, 2.5 + u * 4, '#f4ece0', 0, true, 0.4 * (1 - u) * appear);
      }
    }
    ctx.restore();
  }

  function card(y0, h, alpha, time, edge = '#d9a464') {
    ctx.save();
    ctx.globalAlpha = alpha * 0.93;
    ctx.fillStyle = '#1c0f08';
    roundRect(CX - 222, y0, 444, h, 12);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = alpha * (0.6 + 0.25 * Math.sin(time * 3));
    ctx.stroke();
    ctx.restore();
  }

  /** THE DAILY GRIND, slammed down under the machine. */
  function drawTitle(appear, fade, time) {
    if (appear <= 0 || fade <= 0) return;
    const pop = 1 + 0.4 * (1 - smoothstep(appear));
    ctx.save();
    ctx.globalAlpha = appear * fade;
    ctx.translate(CX, CY + 132);
    ctx.rotate(Math.sin(time * 5) * 0.02);
    ctx.scale(pop, pop);
    if (highQuality()) {
      ctx.shadowColor = '#ff6a1a';
      ctx.shadowBlur = 22;
    }
    text('THE DAILY GRIND', 0, 0, 36, '#ffd9b0', 'center', 'Georgia,serif', 'bold ');
    ctx.restore();
  }

  function drawCards(g, time) {
    const t = g.time;
    if (g.stage === 'intro') {
      const words = clamp(Math.min((t - 0.15) / 0.4, (3.2 - t) / 0.4), 0, 1);
      if (words > 0) {
        card(CY - 252, 74, words, time);
        ctx.save();
        ctx.globalAlpha = words;
        text('THE CUP ANNOUNCES', CX, CY - 232, 12, '#e8b48a', 'center', MONO);
        text('“Someone ordered trouble. Double shot.”', CX, CY - 202, 20, '#f5dfb6', 'center', 'Georgia,serif', 'italic ');
        ctx.restore();
      }
      const title = clamp((t - 2.1) / 0.25, 0, 1);
      drawTitle(title, 1, time);
      if (title > 0) {
        ctx.save();
        ctx.globalAlpha = clamp((t - 2.6) / 0.4, 0, 1);
        text('Steam the safety valve while it’s open.', CX, CY + 168, 16, '#f3d6b0', 'center', 'Georgia,serif', 'italic ');
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(time * 2.5);
      text('ENTER — SKIP', CX, CY + 200, 10, '#e8c9a0', 'center', MONO);
      ctx.restore();
      return;
    }
    if (g.stage === 'fight') {
      drawTitle(clamp(t / 0.2, 0, 1), clamp((1.4 - t) / 0.4, 0, 1), time);
      return;
    }
    const s = g.summary;
    const a = clamp((t - 1.1) / 0.4, 0, 1);
    if (!s || a <= 0) return;
    const win = s.result === 'victory';
    const y0 = CY - 104;
    const h = win ? 214 : 178;
    card(y0, h, a, time, win ? (s.perfect ? GOLD : '#e8a96a') : '#a88a72');
    ctx.save();
    ctx.globalAlpha = a;
    if (win) {
      text('THE MACHINE IS OUT OF ORDER', CX, y0 + 20, 12, '#f0c48a', 'center', MONO);
      text(`+${s.bonus}`, CX, y0 + 54, 34, s.perfect ? GOLD : '#ffe1b8', 'center', 'Georgia,serif', 'bold ');
      text('✶ A Golden Spoon for the next cup', CX, y0 + 86, 14, '#ffe9a0', 'center', MONO);
      if (s.perfect) {
        text('PERFECT BREW — “Not a single drop spilled.”', CX, y0 + 112, 14, GOLD, 'center', 'Georgia,serif', 'bold italic ');
        text(s.cup ? 'A cup is restored.' : `Your cups are full, so +${G.fullCupPoints} instead.`, CX, y0 + 132, 13, '#ffe9a0', 'center', MONO);
      } else {
        text(`${s.valveHits} valve hits · ${s.beans} beans cracked · ${s.scalds} scald${s.scalds === 1 ? '' : 's'}`,
          CX, y0 + 116, 13, '#f3d6b0', 'center', MONO);
      }
      text(g.milestone ? 'Something new is steeping. The next brew awaits…' : 'That was a surprisingly aggressive cup of coffee.',
        CX, y0 + 160, 14, g.milestone ? '#ffe9a0' : '#e8dcc0', 'center', 'Georgia,serif', 'italic ');
    } else {
      text(s.reason === 'time' ? 'IT CLOCKS OFF AND LEAVES' : 'THE MACHINE ESCAPES', CX, y0 + 20, 12, '#d8bfa0', 'center', MONO);
      text('“You’ll be hearing from my manager.”', CX, y0 + 62, 22, '#f5dfb6', 'center', 'Georgia,serif', 'italic ');
      text(`It still had ${g.health} of ${G.health} pressure left.`, CX, y0 + 104, 13, '#d8bfa0', 'center', MONO);
      text(g.milestone ? `It will be back after ${G.retryAfter} more cups. Your cups are safe.`
        : 'Your cups, your spoon, and the next fortune are safe.', CX, y0 + 134, 14, '#e8dcc0', 'center', 'Georgia,serif', 'italic ');
    }
    ctx.globalAlpha = a * clamp((t - G.outroMin) / 0.4, 0, 1) * (0.65 + 0.35 * Math.sin(time * 2.5));
    text('ENTER — BACK TO THE TEA', CX, y0 + h - 22, 10, '#e8c9a0', 'center', MONO);
    ctx.restore();
  }

  /** When it escapes: a cloud of coffee-coloured steam where it stood. */
  function drawEscapeCloud(g) {
    if (g.stage !== 'outro' || g.result !== 'escaped') return;
    const u = clamp(g.time / 1.6, 0, 1);
    const a = Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.5);
    for (let k = 0; k < 9; k++) {
      const angle = (k / 9) * TAU + u;
      const r = 20 + 50 * smoothstep(u);
      circle(CX + Math.cos(angle) * r, CY - 10 + Math.sin(angle) * r * 0.7 - 30 * u, 26 + 20 * u,
        k % 2 ? '#b08a6a' : '#d8c0a8', 0, true, 0.35 * a);
    }
  }

  function drawFlying(fx) {
    for (const b of fx.flyingBeans ?? []) beanShape(b.x, b.y, b.spin, G.beanSize, Math.min(1, b.time / 0.4));
    for (const pod of fx.pods ?? []) {
      ctx.save();
      ctx.translate(pod.x, pod.y);
      ctx.rotate(pod.spin);
      ctx.globalAlpha = Math.min(1, pod.time / 0.3);
      ctx.fillStyle = '#b8c0c4';
      ctx.strokeStyle = '#4a5458';
      ctx.lineWidth = 1.2;
      roundRect(-8, -5, 16, 10, 4);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#8a2a10';
      ctx.beginPath();
      ctx.moveTo(-3, -5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-2, 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  return {
    /** Beneath the darts and the machine: the collar, warnings, jets, beans, and the valve. */
    drawField(g, time) {
      const alpha = presence(g).alpha;
      drawWarnings(g, time);
      drawJets(g, time);
      drawCollar(g, time, alpha);
      drawBeans(g);
      drawValve(g, time, alpha);
    },
    /** The machine itself, and anything it has flung. */
    drawMachine(g, state, fx, time) {
      drawMachine(g, state, time);
      drawEscapeCloud(g);
      drawFlying(fx);
    },
    /** The health meter, clock, scalds, and the cards before and after. */
    drawOverlay(g, time) {
      drawReadouts(g, time);
      drawCards(g, time);
    },
  };
}
