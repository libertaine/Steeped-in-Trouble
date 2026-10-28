// Draws the game from state. Rendering reads state but never changes it.
//
// All drawing uses the logical coordinate system (CONFIG.arena width × height,
// origin at the top-left); draw() scales it onto the canvas backing store.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { LANES, LANE_STEP, TAU, laneAngle, toCanvasPoint as polar } from '../gameplay/arena.js';
import { FORTUNES, glyphPoint } from '../gameplay/fortunes.js';
import { SECRETS } from '../gameplay/secrets.js';
import { COMBOS } from '../gameplay/combos.js';
import { spoonLane } from '../gameplay/player.js';
import { havocInProgress } from '../gameplay/chocolate.js';
import { grindInProgress } from '../gameplay/grind.js';
import { createGrindPainter } from './grind.js';
import { createTeaPainter } from './tea.js';

const { width: W, height: H, centerX: CX, centerY: CY, rimRadius: OUTER } = CONFIG.arena;
const { revealAt, lieRetractAt } = CONFIG.fortunes;
const CHOC = CONFIG.chocolate;
const GOLD = '#ffd45e';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => t * t * (3 - 2 * t);
const MONO = 'ui-monospace,monospace';

/**
 * The lane the aim highlight shows. It is always the lane the next shot takes,
 * because it asks the same question the weapons do (spoonLane()).
 */
export const aimedLane = (state) => spoonLane(state);

const AIM = {
  steam: '#d4ecff',
  golden: '#ffe08a',
  sugar: '#fff1c4',
  flame: '#ffb36b',
  valve: '#ffcf6a', // the coffee boss's open safety valve
  danger: '#ff5a3a', // and the lanes it is about to scald
};
const AIM_FADE = 0.12; // seconds for the highlight to cross-fade to a new lane

/** Is the spoon aiming right now (a round, the toasting, or the boss fight in progress, or paused during one)? */
function aiming(state) {
  const havoc = havocInProgress(state);
  if (havoc) return havoc.stage === 'play';
  const grind = grindInProgress(state);
  if (grind) return grind.stage === 'fight';
  return state.phase === PHASE.PLAYING || state.phase === PHASE.PAUSED;
}

function aimColor(state) {
  if (state.goldenSpoon > 0) return AIM.golden;
  return havocInProgress(state) ? AIM.flame : AIM.steam;
}

// Marshmallow colours by doneness (one step per flame), and once burned.
const COOKED = ['#fffaf2', '#f7e6c6', '#ebb86e', '#dc9c4c', '#c7792b'];
const BURNED = '#3a2417';

/** What the cup says when the havoc is over. Picked from the result, so it never changes mid-card. */
function havocQuip(summary) {
  const burned = summary.burned + summary.crumbled;
  if (summary.perfect + summary.toasted === 0) return 'The marshmallows remain uncooked. The cup is not angry, just disappointed.';
  if (burned >= 4 && burned > summary.perfect) return 'The cup would like a word about the smoke.';
  if (summary.grade === 'great') return 'The leaves are speechless. Briefly.';
  if (summary.grade === 'good') return 'A respectable toast. The cup is mildly impressed.';
  return 'Back to the tea, then.';
}

const HAVOC_REWARD = {
  great: (s) => `Master chocolatier: +${s.bonus}, and an extra sugar burst next cup`,
  good: (s) => `Nicely toasted: +${s.bonus}, and an extra sugar burst next cup`,
  modest: () => `Five perfect marshmallows earn a bonus. Next time!`,
};

/** A colour at a given opacity: '#rrggbb' or 'hsl(h, s%, l%)'. */
function fade(color, alpha) {
  if (color.startsWith('#')) return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
  return color.replace(/^hsl\((.*)\)$/, `hsla($1, ${alpha})`);
}

function pulseColor(tone, lane) {
  if (tone === 'nova') return `hsl(${Math.round((lane / LANES) * 360)}, 100%, 78%)`;
  return AIM[tone] ?? AIM.steam;
}

const OVERLAY_TEXT = {
  [PHASE.READY]: {
    heading: 'A STORM IS STEEPING',
    title: 'Steeped in Trouble',
    line: () => 'Steer the spoon • fire steam',
    hint: 'Click “Brew” or press Enter',
  },
  [PHASE.PAUSED]: {
    heading: 'THE CUP IS PAUSED',
    title: 'Take a little sip',
    line: () => 'Press P to continue',
    hint: '',
  },
  [PHASE.GAME_OVER]: {
    heading: 'THE POT IS EMPTY',
    title: 'A splendid spill',
    line: (state) => `Final score: ${state.score}`,
    hint: 'Press Enter for a new pot',
  },
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ quality?: 'high' | 'low' }} [options] graphics quality; can be changed later via renderer.quality
 */
export function createRenderer(canvas, { quality = 'high' } = {}) {
  const ctx = canvas.getContext('2d');
  let time = 0; // animation clock, independent of the simulation
  let gradients = null;
  const tea = createTeaPainter(ctx);
  const espresso = createGrindPainter(ctx, { circle, text, laneBeam, highQuality: () => renderer.quality === 'high' });
  const aim = { lane: null, prev: null, fade: 1 }; // the highlighted lane, and the one fading out

  function createGradients() {
    const glare = ctx.createLinearGradient(CX - 250, CY - 240, CX + 220, CY + 240);
    glare.addColorStop(0, '#f3ead914');
    glare.addColorStop(0.35, '#ffffff02');
    glare.addColorStop(1, '#0000001a');
    return { glare };
  }

  function line(a, b, color, width = 1, opacity = 1) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function circle(x, y, r, color, width = 1, fill = false, opacity = 1) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.restore();
  }

  function text(t, x, y, size, color, align = 'center', font = 'Georgia,serif', style = '') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${style}${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
    ctx.restore();
  }

  function leafShape(x, y, size, rotation, color, opacity = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#112a20';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.bezierCurveTo(size * 0.86, -size * 0.4, size * 0.9, size * 0.65, 0, size);
    ctx.bezierCurveTo(-size * 0.8, size * 0.53, -size * 0.9, -size * 0.4, 0, -size);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#f4e3aa70';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.83);
    ctx.lineTo(0, size * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  function drawCup() {
    circle(CX, CY, OUTER + 52, '#78948022', 16);
    circle(CX, CY, OUTER + 43, '#8ca58836', 3);
    circle(CX, CY, OUTER + 26, '#a9b68d28', 17);
    circle(CX, CY, OUTER + 15, '#eee8ce', 3);
    circle(CX, CY, OUTER + 10, '#678b6f', 14);
    circle(CX, CY, OUTER + 2, '#a9bc94', 3);

    // An abstract saucer handle, drawn with original curved vector paths.
    ctx.save();
    ctx.strokeStyle = '#b6c4a388';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(CX + OUTER + 5, CY - 77);
    ctx.bezierCurveTo(CX + OUTER + 124, CY - 124, CX + OUTER + 124, CY + 130, CX + OUTER + 4, CY + 82);
    ctx.stroke();
    ctx.strokeStyle = '#304f41';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  /** Lane guides float above the tea so the arena always stays readable. */
  function drawGuides() {
    for (let ring = 1; ring <= 4; ring++) {
      circle(CX, CY, (ring * OUTER) / 4, '#f0e2bf', ring === 4 ? 1.5 : 0.7, false, ring === 4 ? 0.32 : 0.14);
    }
    for (let i = 0; i < LANES; i++) {
      const a = laneAngle(i);
      line(polar(25, a), polar(OUTER - 3, a), '#ead9b2', 1, i % 2 === 0 ? 0.2 : 0.11);
      const p = polar(OUTER + 17, a);
      circle(p.x, p.y, 1.7, '#c7daba', 0, true, 0.55);
    }

    circle(CX, CY, 30, '#ddc18f', 1.4, false, 0.5);

    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER - 1, 0, TAU);
    ctx.clip();
    ctx.fillStyle = gradients.glare;
    ctx.fillRect(CX - OUTER, CY - OUTER, OUTER * 2, OUTER * 2);
    ctx.restore();
  }

  /** Follow the aimed lane, cross-fading from the previous one. Hidden between rounds. */
  function trackAim(state, dt) {
    const lane = aiming(state) ? aimedLane(state) : null;
    if (lane !== aim.lane) {
      aim.prev = aim.lane;
      aim.lane = lane;
      aim.fade = 0;
    }
    aim.fade = Math.min(1, aim.fade + dt / AIM_FADE);
  }

  /** A soft beam down one lane, brightest at the rim and fading towards the centre. */
  function laneBeam(lane, strength, color) {
    if (strength <= 0.01) return;
    const a = laneAngle(lane);
    const rim = polar(OUTER - 8, a);
    const hub = polar(32, a);
    const beam = ctx.createLinearGradient(rim.x, rim.y, hub.x, hub.y);
    beam.addColorStop(0, color);
    beam.addColorStop(0.5, fade(color, 0.4));
    beam.addColorStop(1, fade(color, 0));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = beam;
    ctx.lineCap = 'round';
    ctx.globalAlpha = Math.min(1, 0.13 * strength);
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(rim.x, rim.y);
    ctx.lineTo(hub.x, hub.y);
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, 0.42 * strength);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The aimed lane, highlighted beneath the action, plus a flash down each
   * lane that has just fired.
   */
  function drawAimBeams(state, fx) {
    const color = aimColor(state);
    if (aim.prev !== null && aim.fade < 1) laneBeam(aim.prev, 1 - aim.fade, color);
    if (aim.lane !== null) laneBeam(aim.lane, aim.fade, color);
    for (const pulse of fx.aimPulses ?? []) {
      const u = pulse.time / pulse.life;
      for (const lane of pulse.lanes) {
        laneBeam(lane, 2.6 * u * u, pulseColor(pulse.tone, lane));
      }
    }
  }

  /** The firing point: a bright chevron where the shot will appear, and a short arc of rim above it. */
  function rimMarker(lane, strength, color, pulse = 0) {
    if (strength <= 0.01) return;
    const a = laneAngle(lane);
    const tip = polar(OUTER - 13, a);
    ctx.save();
    ctx.globalAlpha = strength * (0.7 + 0.3 * pulse);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4 + 1.6 * pulse;
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER - 2, a - LANE_STEP * 0.26, a + LANE_STEP * 0.26);
    ctx.stroke();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(a);
    if (renderer.quality === 'high') {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 + 10 * pulse;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-6.5, 0); // points into the cup
    ctx.lineTo(1.5, -4.6);
    ctx.lineTo(-0.5, 0);
    ctx.lineTo(1.5, 4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (pulse > 0) circle(tip.x, tip.y, 6 + 16 * (1 - pulse), color, 1.6, false, pulse * strength);
  }

  function drawAimMarkers(state, fx) {
    const color = aimColor(state);
    let flash = 0;
    for (const pulse of fx.aimPulses ?? []) {
      if (pulse.lanes.includes(aim.lane)) flash = Math.max(flash, pulse.time / pulse.life);
    }
    if (aim.prev !== null && aim.fade < 1) rimMarker(aim.prev, 1 - aim.fade, color);
    if (aim.lane !== null) rimMarker(aim.lane, aim.fade, color, flash);
  }

  /** The slowed wedge under each milk cloud; the marbled wisps live in the tea. */
  function drawClouds(clouds) {
    for (const c of clouds) {
      const alpha = Math.min(1, c.time / 0.75) * Math.min(1, (c.duration - c.time) / 0.5);
      const wash = ctx.createRadialGradient(CX, CY, 20, CX, CY, OUTER - 12);
      wash.addColorStop(0, 'rgba(240,232,214,0)');
      wash.addColorStop(0.35, 'rgba(240,232,214,0.08)');
      wash.addColorStop(1, 'rgba(240,232,214,0.17)');
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      const half = LANE_STEP * 1.55 * c.spread;
      ctx.arc(CX, CY, OUTER - 12, c.angle - half, c.angle + half);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f4ecdc';
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.22;
      ctx.stroke();
      if (c.drift) {
        // The Perfect Storm: cream and amber streaks wheeling round with the current.
        ctx.clip();
        ctx.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          const r = 70 + k * 27;
          const start = c.angle - half + ((time * Math.sign(c.drift) * (0.9 + k * 0.13) + k * 0.7) % (half * 2));
          ctx.strokeStyle = k % 2 ? '#f4ecdc' : '#e8a95a';
          ctx.lineWidth = 3 + (k % 3);
          ctx.globalAlpha = alpha * (k % 2 ? 0.28 : 0.22);
          ctx.beginPath();
          ctx.arc(CX, CY, r, start, start + half * 0.55);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /** The Silver Tornado: a bright band of churned tea along the rim behind the spoon. */
  function drawWake(wake) {
    if (!wake) return;
    const from = wake.angle - wake.dir * wake.arc;
    const [a0, a1] = wake.dir > 0 ? [from, wake.angle] : [wake.angle, from];
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.16 + 0.08 * k + 0.06 * Math.sin(time * 20 + k * 2);
      ctx.strokeStyle = k === 2 ? '#ffffff' : '#d8eef0';
      ctx.lineWidth = wake.depth * (1 - k * 0.3);
      ctx.beginPath();
      ctx.arc(CX, CY, OUTER - wake.depth / 2, a0, a1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** An unexpected brew, announced at the top of the cup the first time it happens. */
  function drawDiscovery(discovery) {
    if (!discovery) return;
    const combo = COMBOS[discovery.id];
    const age = discovery.life - discovery.time;
    const a = clamp(Math.min(age / 0.25, discovery.time / 0.6), 0, 1);
    const y0 = CY - 248;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = '#10271e';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(CX - 200, y0, 400, 70, 10);
    else ctx.rect(CX - 200, y0, 400, 70);
    ctx.fill();
    ctx.strokeStyle = `hsl(${(time * 160) % 360}, 80%, 75%)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = a;
    const pop = 1 + 0.25 * Math.max(0, 1 - age / 0.3);
    text('UNEXPECTED BREW DISCOVERED!', CX, y0 + 15, 11, '#e2d4ff', 'center', MONO);
    text(combo.name, CX, y0 + 36, 21 * pop, '#f5dfb6');
    text(combo.words, CX, y0 + 57, 12, '#cbdcd0', 'center', 'Georgia,serif', 'italic ');
    ctx.restore();
  }

  /** The spoon's outline, in its own coordinates (the tip points out of the cup). */
  function spoonPath() {
    ctx.beginPath();
    ctx.moveTo(0, -21);
    ctx.lineTo(12, 9);
    ctx.quadraticCurveTo(0, 20, -12, 9);
    ctx.closePath();
  }

  /** How the spoon looks: silver, polished silver, or gold. */
  function spoonLook(state) {
    if (state.goldenSpoon > 0) {
      return { fill: '#ffe08a', edge: '#5a3c06', glow: GOLD, blur: 30, bowl: '#c08a1e', golden: true };
    }
    const shine = state.spoon.polished;
    return {
      fill: ['#e5f4e8', '#eefaf3', '#f6fdf9', '#ffffff'][shine],
      edge: '#132b2c',
      glow: shine ? '#d9fff4' : '#b4fae5',
      blur: 17 + 6 * shine,
      bowl: '#56847a',
      golden: false,
    };
  }

  /**
   * One spoon at an angle on the rim, dressed in its upgrades: a brighter
   * finish and a travelling glint (Polished Spoon), engraved chevrons (Quick
   * Stir), a deeper bowl with sugar in it (Sugar Scoop), strainer holes
   * (Strainer Attachment), and a filigree handle once it has a few of them.
   */
  function drawSpoonAt(state, angle, size, look, opacity = 1) {
    const { spoon } = state;
    const pos = polar(OUTER + 7, angle);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.scale(size, size);

    const total = spoon.polished + spoon.quickStir + spoon.sugarScoop + spoon.strainer;
    if (total >= 3 || look.golden) {
      ctx.strokeStyle = look.fill;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.bezierCurveTo(-7, -27, 6, -31, 0, -37);
      if (total >= 6 || look.golden) ctx.arc(-3, -38, 3, 0, TAU * 0.9);
      ctx.stroke();
    }

    ctx.shadowColor = look.glow;
    ctx.shadowBlur = look.blur;
    ctx.fillStyle = look.fill;
    ctx.strokeStyle = look.edge;
    ctx.lineWidth = 2;
    spoonPath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (spoon.polished || look.golden) {
      // A glint sweeps across the bowl every couple of seconds.
      ctx.save();
      spoonPath();
      ctx.clip();
      const sweep = ((time * 0.55 + angle * 0.1) % 1) * 46 - 23;
      ctx.globalAlpha = opacity * (look.golden ? 0.85 : 0.35 + 0.15 * spoon.polished);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sweep - 6, 18);
      ctx.lineTo(sweep + 6, -22);
      ctx.stroke();
      ctx.restore();
    }

    if (spoon.quickStir) {
      ctx.strokeStyle = look.golden ? '#8a6212' : '#3d6b63';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < spoon.quickStir; k++) {
        const y = -14 + k * 4.2;
        ctx.moveTo(-3.2, y + 2.4);
        ctx.lineTo(0, y);
        ctx.lineTo(3.2, y + 2.4);
      }
      ctx.stroke();
    }

    const bowlW = 4.5 + 1.3 * spoon.sugarScoop;
    const bowlH = 8 + 1.6 * spoon.sugarScoop;
    ctx.fillStyle = look.bowl;
    ctx.beginPath();
    ctx.ellipse(0, 3 + spoon.sugarScoop * 0.8, bowlW, bowlH, 0, 0, TAU);
    ctx.fill();
    if (spoon.sugarScoop) {
      ctx.fillStyle = '#fff6d8';
      for (let k = 0; k < spoon.sugarScoop * 2 + 1; k++) {
        const a = k * 2.4 + time * 0.7;
        ctx.fillRect(Math.cos(a) * bowlW * 0.45 - 1, 5 + Math.sin(a) * bowlH * 0.4 - 1, 2, 2);
      }
    }
    if (spoon.strainer) {
      ctx.strokeStyle = look.golden ? '#fff1b0' : '#dfe9ec';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 3 + spoon.sugarScoop * 0.8, bowlW + 1.6, bowlH + 1.6, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#0f2622';
      const holes = spoon.strainer * 3;
      for (let k = 0; k < holes; k++) {
        const row = Math.floor(k / 3);
        circleAt((k % 3 - 1) * 2.2, -1.5 + row * 4.5 + (k % 3 === 1 ? 1 : 0), 0.85);
      }
    }
    ctx.restore();
  }

  function circleAt(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function drawPlayer(state, fx) {
    const { angle, spoon } = state;
    const look = spoonLook(state);
    const size = (fx.spoonScale ?? 1) * (1 + 0.08 * spoon.sugarScoop);
    // The Golden Spoon flickers as it wears off, and a scalded spoon blinks while it recovers.
    const scalded = grindInProgress(state)?.safe > 0;
    const flicker = scalded ? 0.35 + 0.65 * Math.abs(Math.sin(time * 18))
      : look.golden && state.goldenSpoon < 1.5 ? 0.6 + 0.4 * Math.abs(Math.sin(time * 14)) : 1;
    // Quick Stir: afterimages trail a hurrying spoon.
    const speed = fx.tea?.spoon.speed ?? 0;
    if (spoon.quickStir && Math.abs(speed) > 0.5 && state.phase === PHASE.PLAYING) {
      for (let k = spoon.quickStir; k >= 1; k--) {
        drawSpoonAt(state, angle - Math.sign(speed) * k * 0.05, size, look, 0.16 / k);
      }
    }
    const at = polar(OUTER + 7, angle);
    if (look.golden) circle(at.x, at.y, 30 * size, GOLD, 0, true, 0.12 * flicker);
    drawSpoonAt(state, angle, size, look, flicker);
    const havoc = havocInProgress(state);
    if (havoc && havoc.stage !== 'outro') {
      // In the hot chocolate the spoon carries a little pilot flame.
      const tip = polar(OUTER - 3, angle);
      flameShape(tip.x, tip.y, angle, 2.6, look.golden ? GOLD_FLAME : FLAME, 0.9);
    }
    drawAimMarkers(state, fx);
    if (fx.upgradeGlow > 0) {
      const u = 1 - fx.upgradeGlow;
      circle(at.x, at.y, 18 + 46 * u, '#f4f8f2', 2.5 * (1 - u), false, 0.8 * (1 - u));
    }
  }

  /**
   * The tea strainer: a fine silver mesh band on the rim, one ring per catch.
   * Rings that are still ready gleam; spent ones go dull.
   */
  function drawStrainer(state) {
    const capacity = CONFIG.strainer.perRound + state.spoon.strainer;
    ctx.save();
    ctx.setLineDash([3, 2.4]);
    ctx.lineWidth = 1.4;
    for (let k = 0; k < capacity; k++) {
      const ready = k < state.strainerLeft;
      ctx.globalAlpha = ready ? 0.55 + 0.1 * Math.sin(time * 2 + k) : 0.13;
      ctx.strokeStyle = ready ? '#e7f0f2' : '#9fb0a6';
      ctx.lineDashOffset = time * (k % 2 ? -3 : 3);
      ctx.beginPath();
      ctx.arc(CX, CY, OUTER + 5 + k * 3.4, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A strainer catch: a metallic glint racing along the rim and a flash of mesh. */
  function drawGlints(glints) {
    for (const g of glints) {
      const u = 1 - g.time / g.life;
      const fade = 1 - u;
      const reach = 0.12 + 0.9 * Math.sqrt(u);
      ctx.save();
      // The whole silver trim rings once, briefly.
      if (u < 0.35) circle(CX, CY, OUTER + 6, '#f2f8fa', 3, false, 0.5 * (1 - u / 0.35));
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#e6f6ff';
      ctx.shadowBlur = 14;
      ctx.globalAlpha = fade;
      ctx.lineWidth = 5 * fade + 1;
      ctx.beginPath();
      ctx.arc(CX, CY, OUTER + 4, g.angle - reach, g.angle + reach);
      ctx.stroke();
      // Two bright sparks lead the glint around the rim.
      for (const side of [-1, 1]) {
        const tip = polar(OUTER + 4, g.angle + side * reach);
        circle(tip.x, tip.y, 3.5 * fade + 1, '#ffffff', 0, true, fade);
      }
      // The mesh itself, briefly visible where it caught the leaf.
      const c = polar(OUTER - 6, g.angle);
      ctx.shadowBlur = 0;
      ctx.translate(c.x, c.y);
      ctx.rotate(g.angle);
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.clip();
      ctx.globalAlpha = 0.85 * fade;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#dfeaee';
      ctx.beginPath();
      for (let k = -15; k <= 15; k += 4) {
        ctx.moveTo(k, -15);
        ctx.lineTo(k, 15);
        ctx.moveTo(-15, k);
        ctx.lineTo(15, k);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /** While the cup recovers from a spill, its rim pulses softly. */
  function drawRecovery(state) {
    if (state.graceTime <= 0) return;
    const left = state.graceTime / CONFIG.grace.duration;
    const pulse = 0.5 + 0.5 * Math.sin(time * 22);
    ctx.save();
    ctx.globalAlpha = (0.2 + 0.3 * pulse) * left;
    ctx.strokeStyle = '#f7e8cc';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#f0a878';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER - 3, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * A little flame, head first in the direction it travels (into the cup),
   * flickering. `palette` is outer, middle, and core colours.
   */
  function flameShape(x, y, angle, size, palette, opacity = 1) {
    const flick = 0.85 + 0.15 * Math.sin(time * 47 + x * 0.3 + y * 0.17);
    const s = size * flick;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = opacity;
    palette.forEach((color, i) => {
      const k = [1, 0.66, 0.36][i];
      const tail = s * (2.7 + 0.5 * Math.sin(time * 31 + x)) * k;
      const r = s * 0.75 * k;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tail, 0);
      ctx.quadraticCurveTo(s * 0.6 * k, -s * 1.1 * k, -r * 0.2, -r);
      ctx.arc(-r * 0.2, 0, r, -Math.PI / 2, Math.PI / 2, true);
      ctx.quadraticCurveTo(s * 0.6 * k, s * 1.1 * k, tail, 0);
      ctx.fill();
    });
    ctx.restore();
  }

  const FLAME = ['#ff6a1a', '#ffb347', '#fff3c4'];
  const GOLD_FLAME = ['#f2a516', '#ffe08a', '#ffffff'];

  /** A flame shot: it lights the chocolate beneath it and burns down as it goes. */
  function drawFlame(f) {
    const p = polar(f.radius, f.angle);
    const left = Math.max(0, 1 - f.travelled / f.reach);
    const size = 3.4 + 2.6 * Math.min(1, left * 1.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    circle(p.x, p.y, size * 3.4, f.golden ? GOLD : '#ff8a2a', 0, true, 0.13 + 0.1 * left);
    ctx.restore();
    flameShape(p.x, p.y, f.angle, size, f.golden ? GOLD_FLAME : FLAME, 0.5 + 0.5 * Math.min(1, left * 3));
  }

  /** The puffy outline of a marshmallow seen from above, centred on the origin. */
  function pillow(s) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-s, -s * 0.84, s * 2, s * 1.68, s * 0.58);
    else ctx.ellipse(0, 0, s, s * 0.84, 0, 0, TAU);
  }

  /**
   * A marshmallow: it bobs up out of the chocolate, turns slowly, and takes on
   * colour as it cooks. Heat glows orange beneath it and makes it sizzle;
   * burned ones smoke. The giant one breathes, and looks alarmed near the end.
   */
  function drawMarshmallow(m, opacity = 1) {
    const p = polar(m.radius, m.angle);
    const rise = Math.min(1, m.age / 0.45);
    const hot = clamp(m.heat / CHOC.flashPoint, 0, 1);
    const breathe = m.giant ? 1 + 0.05 * Math.sin(time * 2.2) : 1 + 0.045 * Math.sin(time * 3.1 + m.seed);
    const s = m.size * breathe * (0.35 + 0.65 * smoothstep(rise));
    const shiver = hot > 0.55 ? Math.sin(time * 70 + m.seed) * 1.4 * hot : 0;
    const spin = m.seed + time * (0.25 + 0.2 * Math.sin(m.seed)) * (m.seed > Math.PI ? 1 : -1);
    const nervous = m.giant && m.hits >= CHOC.giantHits - 3;
    ctx.save();
    ctx.translate(p.x + shiver + (nervous ? Math.sin(time * 40) * 1.2 : 0), p.y);
    ctx.globalAlpha = opacity * rise;
    // Sitting in the chocolate: a soft shadow, and the heat glowing beneath.
    ctx.fillStyle = '#0c0400';
    ctx.globalAlpha = opacity * rise * 0.45;
    ctx.beginPath();
    ctx.ellipse(2, 3.5, s * 1.08, s * 0.98, 0, 0, TAU);
    ctx.fill();
    if (hot > 0.04 && !m.burned) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = opacity * (0.18 + 0.3 * hot) * (0.8 + 0.2 * Math.sin(time * 18 + m.seed));
      ctx.fillStyle = hot > 0.68 ? '#ff4a1a' : '#ff9a3c';
      ctx.beginPath();
      ctx.arc(0, 0, s * (1.5 + 0.6 * hot), 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (m.giant) {
      // Something is different about this one.
      ctx.globalAlpha = opacity * (0.35 + 0.15 * Math.sin(time * 3));
      ctx.strokeStyle = '#ffd6f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.35, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = opacity * rise;
    ctx.save();
    ctx.rotate(spin);
    const body = m.burned ? BURNED : COOKED[Math.min(COOKED.length - 1, m.cook)];
    ctx.fillStyle = body;
    ctx.strokeStyle = m.burned ? '#120a05' : m.cook >= 2 ? '#8a5a2a' : '#b9a58e';
    ctx.lineWidth = 1.2;
    pillow(s);
    ctx.fill();
    ctx.stroke();
    // A soft, puffy highlight, warmer as it toasts; scorch marks once burned.
    ctx.fillStyle = m.burned ? '#5a3a26' : m.cook >= 2 ? '#ffe2a8' : '#ffffff';
    ctx.globalAlpha = opacity * rise * (m.burned ? 0.6 : 0.7);
    ctx.beginPath();
    ctx.ellipse(-s * 0.28, -s * 0.3, s * 0.52, s * 0.28, -0.3, 0, TAU);
    ctx.fill();
    if (m.cook >= 2 && !m.burned) {
      // Toasty freckles.
      ctx.fillStyle = '#9a5a22';
      ctx.globalAlpha = opacity * rise * 0.5;
      for (let k = 0; k < 4; k++) circleAt(Math.cos(m.seed + k * 1.7) * s * 0.55, Math.sin(m.seed * 2 + k * 2.1) * s * 0.45, s * 0.09);
    }
    ctx.restore();
    if (nervous) {
      // For a moment, it has a face. It does not look happy.
      ctx.fillStyle = '#3a2417';
      ctx.globalAlpha = opacity;
      circleAt(-s * 0.32, -s * 0.12, s * 0.09);
      circleAt(s * 0.32, -s * 0.12, s * 0.09);
      ctx.beginPath();
      ctx.ellipse(0, s * 0.3, s * 0.1, s * (0.12 + 0.04 * Math.sin(time * 9)), 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (m.burned) {
      // Smoke curling up, and an ember or two.
      for (let k = 0; k < 3; k++) {
        const u = ((time * 0.8 + k / 3 + m.seed) % 1);
        circle(p.x + Math.sin(u * 6 + k + m.seed) * 4, p.y - s - u * 26, 2.5 + u * 5, '#8a807a', 0, true, opacity * 0.35 * (1 - u));
      }
      circle(p.x + Math.cos(time * 3 + m.seed) * s * 0.4, p.y + Math.sin(time * 2 + m.seed) * s * 0.3, 1.4, '#ff7a2a', 0, true, opacity * (0.5 + 0.5 * Math.sin(time * 11 + m.seed)));
    }
  }

  /** A perfect marshmallow lifting out of the cup, sparkling. */
  function drawGhost(g) {
    const u = 1 - g.time / g.life;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(1 + 0.4 * u, 1 + 0.4 * u);
    ctx.globalAlpha = 1 - u;
    ctx.save();
    ctx.rotate(g.spin + u * 2);
    ctx.fillStyle = COOKED[COOKED.length - 1];
    ctx.strokeStyle = '#8a5a2a';
    ctx.lineWidth = 1.2;
    pillow(g.size);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe2a8';
    ctx.beginPath();
    ctx.ellipse(-g.size * 0.28, -g.size * 0.3, g.size * 0.52, g.size * 0.28, -0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
    // A four-point sparkle.
    ctx.fillStyle = '#fff8e2';
    const r = g.size * (1.2 + u);
    ctx.rotate(u * 3);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.16, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.16, 0);
    ctx.moveTo(-r, 0);
    ctx.lineTo(0, -r * 0.16);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r * 0.16);
    ctx.fill();
    ctx.restore();
  }

  function drawPopups(popups) {
    for (const p of popups) {
      const u = 1 - p.time / p.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - u) * 1.6);
      text(p.text, p.x, p.y, 14 + 4 * (1 - u), p.color, 'center', MONO, 'bold ');
      ctx.restore();
    }
  }

  /** The toasting clock: an arc round the outside of the cup that runs down. */
  function drawHavocClock(c) {
    const left = c.left / CHOC.duration;
    const hurry = c.left < 5;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = hurry ? '#ff8a5a' : '#f3c99a';
    ctx.globalAlpha = hurry ? 0.55 + 0.35 * Math.sin(time * 10) : 0.5;
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER + 33, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    ctx.restore();
    if (c.left <= 3 && c.left > 0) {
      const n = Math.ceil(c.left);
      const u = n - c.left; // 0 → 1 within each second
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - u);
      text(String(n), CX, CY, 90 + 40 * u, '#ffe9cc', 'center', 'Georgia,serif', 'bold ');
      ctx.restore();
    }
  }

  /** A card in the middle of the cup, in the chocolate's colours. */
  function chocolateCard(y0, h, alpha, edge = '#e8a96a') {
    ctx.save();
    ctx.globalAlpha = alpha * 0.92;
    ctx.fillStyle = '#2a1209';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(CX - 215, y0, 430, h, 12);
    else ctx.rect(CX - 215, y0, 430, h);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = alpha * (0.6 + 0.25 * Math.sin(time * 3));
    ctx.stroke();
    ctx.restore();
  }

  /** HOT CHOCOLATE HAVOC! It pops in, wobbles, and lingers into the first second of toasting. */
  function drawHavocTitle(appear, fade = 1) {
    if (appear <= 0 || fade <= 0) return;
    const pop = 1 + 0.35 * (1 - smoothstep(appear));
    ctx.save();
    ctx.globalAlpha = appear * fade;
    ctx.translate(CX, CY - 8);
    ctx.rotate(Math.sin(time * 4) * 0.025);
    ctx.scale(pop, pop);
    if (renderer.quality === 'high') {
      ctx.shadowColor = '#ff8a2a';
      ctx.shadowBlur = 24;
    }
    text('HOT CHOCOLATE HAVOC!', 0, 0, 34, '#ffe1b8', 'center', 'Georgia,serif', 'bold ');
    ctx.restore();
  }

  /** The prophecy, the title, and at the end the summary. */
  function drawHavocOverlay(c) {
    const t = c.time;
    if (c.stage === 'intro') {
      const prophecy = clamp(Math.min(t / 0.4, (2.4 - t) / 0.4), 0, 1);
      if (prophecy > 0) {
        chocolateCard(CY - 60, 92, prophecy);
        ctx.save();
        ctx.globalAlpha = prophecy;
        text('THE CHOCOLATE PROPHECY', CX, CY - 36, 13, '#f0c48a', 'center', MONO);
        text('“The leaves foresee a sweeter future.”', CX, CY, 20, '#f5dfb6', 'center', 'Georgia,serif', 'italic ');
        ctx.restore();
      }
      const title = clamp((t - 2.2) / 0.3, 0, 1);
      drawHavocTitle(title);
      if (title > 0) {
        ctx.save();
        ctx.globalAlpha = clamp((t - 2.6) / 0.4, 0, 1);
        text('Toast the marshmallows. Gently.', CX, CY + 36, 17, '#f3d6b0', 'center', 'Georgia,serif', 'italic ');
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(time * 2.5);
      text('ENTER — SKIP', CX, CY + 132, 10, '#e8c9a0', 'center', MONO);
      ctx.restore();
      return;
    }
    if (c.stage === 'play') {
      drawHavocClock(c);
      // Skipping the intro still shows the title, briefly.
      drawHavocTitle(clamp(c.time / 0.25, 0, 1), clamp((1.3 - c.time) / 0.4, 0, 1));
      return;
    }
    const s = c.summary;
    const a = clamp((t - 0.2) / 0.5, 0, 1);
    if (!s || a <= 0) return;
    const y0 = CY - 92;
    chocolateCard(y0, 196, a, s.grade === 'great' ? GOLD : '#e8a96a');
    ctx.save();
    ctx.globalAlpha = a;
    text('THE HAVOC SUBSIDES', CX, y0 + 20, 12, '#f0c48a', 'center', MONO);
    text(`+${s.total}`, CX, y0 + 54, 34, s.grade === 'great' ? GOLD : '#ffe1b8', 'center', 'Georgia,serif', 'bold ');
    const burned = s.burned + s.crumbled;
    text(`✦ ${s.perfect} perfect   ·   ${s.toasted} toasted   ·   ${burned} burned`, CX, y0 + 88, 14, '#f3d6b0', 'center', MONO);
    text(HAVOC_REWARD[s.grade](s), CX, y0 + 114, 14, s.grade === 'modest' ? '#d8bfa0' : '#ffe9a0');
    text(havocQuip(s), CX, y0 + 142, 14, '#e8dcc0', 'center', 'Georgia,serif', 'italic ');
    ctx.globalAlpha = a * clamp((t - CHOC.outroMin) / 0.4, 0, 1) * (0.65 + 0.35 * Math.sin(time * 2.5));
    text('ENTER — BACK TO THE TEA', CX, y0 + 176, 10, '#e8c9a0', 'center', MONO);
    ctx.restore();
  }

  /** A big moment in the hot chocolate, announced at the top of the cup. */
  function drawBanner(banner) {
    if (!banner) return;
    const age = banner.life - banner.time;
    const a = clamp(Math.min(age / 0.2, banner.time / 0.6), 0, 1);
    const y0 = CY - 250;
    const pop = 1 + 0.3 * Math.max(0, 1 - age / 0.35);
    ctx.save();
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = '#2a1209';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(CX - 210, y0, 420, 66, 10);
    else ctx.rect(CX - 210, y0, 420, 66);
    ctx.fill();
    ctx.strokeStyle = '#ffd6f0';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.globalAlpha = a;
    text(banner.title, CX, y0 + 25, 22 * pop, '#fff4e6', 'center', 'Georgia,serif', 'bold ');
    text(banner.words, CX, y0 + 50, 13, '#f3d6b0', 'center', 'Georgia,serif', 'italic ');
    ctx.restore();
  }

  function drawEnemy(e) {
    const p = polar(e.radius, e.angle);
    const scale = e.size * (1 + Math.sin(time * 7 + e.wiggle) * 0.08);
    const rotation = e.angle + Math.PI / 2 + Math.sin(time * 3 + e.wiggle) * 0.3;
    // A soft shadow lifts the leaf off the tea so it never melts into the currents.
    circle(p.x + 1.5, p.y + 2.5, scale * 1.15, '#0c0501', 0, true, e.alpha * 0.4);
    leafShape(p.x, p.y, scale, rotation, '#dcb877', e.alpha);
    circle(p.x, p.y, scale + 4, '#ead199', 0.65, false, e.alpha * 0.3);
    if (e.backwash > 3) {
      // Washed back: a creamy streak on the rim side of the leaf.
      const tail = polar(e.radius + scale + Math.min(40, e.backwash * 0.45), e.angle);
      const head = polar(e.radius + scale * 0.6, e.angle);
      line(head, tail, '#f6efe2', 3.5, Math.min(0.6, e.backwash / 60) * e.alpha);
    }
  }

  /**
   * A spinning isometric sugar cube with a ring that runs down as it melts.
   * `faces(shine)` returns the top, left, and right face colours.
   */
  function sugarCube(cube, { size, glow, edge, ring, faces, spin = 1.6 }) {
    const p = polar(cube.radius, cube.angle);
    const left = cube.time / cube.life;
    const blink = left < 0.3 ? 0.65 + 0.35 * Math.sin(time * 30) : 1; // hurry!
    const pulse = 1 + 0.08 * Math.sin(time * 6);
    const s = size * pulse;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(p.x, p.y);
    if (renderer.quality === 'high') {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 22;
    } else {
      circle(0, 0, s + 9, glow, 0, true, 0.18);
    }
    // The faces catch the light as it turns.
    ctx.rotate(Math.sin(time * spin) * 0.35);
    const top = [[0, -s], [s * 0.87, -s * 0.5], [0, 0], [-s * 0.87, -s * 0.5]];
    const leftFace = [[-s * 0.87, -s * 0.5], [0, 0], [0, s], [-s * 0.87, s * 0.5]];
    const rightFace = [[s * 0.87, -s * 0.5], [0, 0], [0, s], [s * 0.87, s * 0.5]];
    const colors = faces(0.5 + 0.5 * Math.sin(time * 3));
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    [top, leftFace, rightFace].forEach((face, i) => {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      face.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
    // The time left, as a ring that empties.
    ctx.save();
    ctx.globalAlpha = 0.75 * blink;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s + 11, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    ctx.restore();
  }

  /** Golden Opportunity: the golden sugar cube. */
  function drawGolden(cube) {
    sugarCube(cube, {
      size: 13, glow: GOLD, edge: '#7a5410', ring: '#ffe9a0',
      faces: (shine) => ['#fff1b0', shine > 0.5 ? '#f2c13e' : '#d9a52a', shine > 0.5 ? '#d9a52a' : '#f2c13e'],
    });
  }

  /** The Prismatic Sugar Cube: smaller, quicker, and every colour at once. */
  function drawPrismatic(cube) {
    const hue = (time * 240) % 360;
    sugarCube(cube, {
      size: 10, glow: `hsl(${hue}, 100%, 70%)`, edge: '#ffffff', ring: `hsl(${(hue + 180) % 360}, 100%, 82%)`, spin: 4,
      faces: () => [0, 120, 240].map((offset, i) => `hsl(${(hue + offset) % 360}, 95%, ${82 - i * 10}%)`),
    });
  }

  function drawShot(s, polish) {
    const p = polar(s.radius, s.angle);
    // Carried on by the cream: a pale streak behind the dart.
    if (s.cream) line(p, polar(s.radius + 30, s.angle - s.veer * 0.06), '#f6efe2', 4, 0.5);
    if (s.golden && !s.sugar) {
      line(p, polar(s.radius + 16 + 6 * polish, s.angle), '#ffe9a0', 3, 0.45);
      ctx.save();
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 12;
      circle(p.x, p.y, 4.5, '#fff2b8', 0, true, 1);
      ctx.restore();
      circle(p.x, p.y, 9, GOLD, 1.2, false, 0.55);
      if (s.veer) circle(p.x, p.y, 1.6, '#ffffff', 0, true, 0.6 + 0.4 * Math.sin(time * 25 + s.veer));
    } else if (s.nova) {
      // Steam Nova: each lane's dart takes its own colour of the rainbow.
      const hue = ((s.angle / TAU) * 360 + time * 120) % 360;
      line(p, polar(s.radius + 22 + 6 * polish, s.angle), `hsl(${hue}, 100%, 78%)`, 3, 0.5);
      circle(p.x, p.y, 4.5, `hsl(${hue}, 100%, 88%)`, 0, true, 1);
      circle(p.x, p.y, 9, `hsl(${hue}, 100%, 65%)`, 1.2, false, 0.6);
    } else if (s.sugar) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#faf1cc';
      ctx.shadowColor = '#fff3a9';
      ctx.shadowBlur = 13;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    } else {
      // Polished Spoon: brighter darts with luminous trails.
      if (polish) line(p, polar(s.radius + 8 + 8 * polish, s.angle), '#e4fff7', 2.4, 0.18 + 0.1 * polish);
      circle(p.x, p.y, 4 + 0.3 * polish, polish ? '#e9fff8' : '#cbfff2', 0, true, 0.9);
      circle(p.x, p.y, 9, '#b2eac7', 1, false, 0.3 + 0.1 * polish);
      if (s.veer) circle(p.x, p.y, 1.6, '#ffffff', 0, true, 0.6 + 0.4 * Math.sin(time * 25 + s.veer));
    }
  }

  /** Where leaf i settles while the leaves are read. The Leaves Lie pretends to be a crown, then confesses. */
  function readingTarget(state, i, count) {
    if (state.nextFortune !== 'lie') return glyphPoint(state.nextFortune, i, count);
    const crown = glyphPoint('crown', i, count);
    const question = glyphPoint('lie', i, count);
    const m = smoothstep(clamp((state.readingTime - lieRetractAt) / 0.7, 0, 1));
    return { x: crown.x + (question.x - crown.x) * m, y: crown.y + (question.y - crown.y) * m };
  }

  function drawResidue(state) {
    const { residue, phase } = state;
    for (let i = 0; i < residue.length; i++) {
      const leaf = residue[i];
      const start = polar(leaf.radius, leaf.angle);
      let { x, y } = start;
      let size = leaf.size;
      let opacity = 0.75;
      let color = '#819c6b';
      if (phase === PHASE.READING) {
        // Leaves glide from where they fell into the fortune's glyph.
        const smooth = smoothstep(clamp((state.readingTime - 0.3) / 1.7, 0, 1));
        const g = readingTarget(state, i, residue.length);
        x = start.x + (CX + g.x - start.x) * smooth;
        y = start.y + (CY + g.y - start.y) * smooth;
        size += 1.7 * smooth;
        opacity = 0.7 + 0.28 * smooth;
        // On the reveal, each leaf lights up in turn, a ripple running along the glyph.
        const lit = clamp((state.readingTime - revealAt) * 3 - (i / residue.length) * 1.5, 0, 1);
        if (lit > 0) {
          const f = FORTUNES[readingFortune(state)];
          const twinkle = 0.75 + 0.25 * Math.sin(time * 4 + i);
          circle(x, y, size * 1.9, f.color, 0, true, 0.16 * lit * twinkle);
          color = f.color;
          opacity = 0.98;
        }
      } else if (phase !== PHASE.PLAYING) {
        opacity = 0.38;
      }
      leafShape(x, y, size, leaf.spin + time * 0.13, color, opacity);
    }
  }

  /** The fortune the reading currently shows (The Leaves Lie poses as The Crown at first). */
  function readingFortune(state) {
    return state.nextFortune === 'lie' && state.readingTime < lieRetractAt ? 'crown' : state.nextFortune;
  }

  /** A short message under the cup: fortune quotes, golden cube news, pranks. */
  function drawWhisper(whisper) {
    if (!whisper) return;
    const age = whisper.life - whisper.time;
    const alpha = clamp(Math.min(age / 0.3, whisper.time / 0.6), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    text(whisper.text, CX, H - 32 + 4 * (1 - Math.min(1, age / 0.3)), 17, whisper.color, 'center', 'Georgia,serif', 'italic ');
    ctx.restore();
  }

  /** The fortune card: a shimmer, the name, its little joke, and how to carry on. */
  function drawFortuneCard(state, fx) {
    const t = state.readingTime;
    const a = clamp((t - (revealAt - 0.5)) / 0.6, 0, 1);
    if (a <= 0.01) return;
    const lying = state.nextFortune === 'lie';
    const shownId = readingFortune(state);
    const f = FORTUNES[shownId];
    const x0 = CX - 205;
    const y0 = CY + 148;
    const w = 410;
    const h = 112;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#10271ee0';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 12);
    else ctx.rect(x0, y0, w, h);
    ctx.fill();
    // Good omens glow gold, troublesome ones smoulder, odd ones shift colour.
    const tone = lying && t < lieRetractAt ? 'good' : f.tone;
    const edge = tone === 'trouble' ? '#e88a62' : tone === 'odd' ? `hsl(${(time * 90) % 360},70%,78%)` : '#e8c77a';
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = a * (0.55 + 0.25 * Math.sin(time * 3));
    ctx.stroke();
    // A shimmer sweeps once across the card as it appears.
    const sweep = (t - revealAt) / 0.7;
    if (sweep > 0 && sweep < 1) {
      ctx.clip();
      const sx = x0 - 60 + (w + 120) * sweep;
      const band = ctx.createLinearGradient(sx - 50, 0, sx + 50, 0);
      band.addColorStop(0, 'rgba(255,240,200,0)');
      band.addColorStop(0.5, 'rgba(255,240,200,0.22)');
      band.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = band;
      ctx.fillRect(x0, y0, w, h);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = a;
    const confessed = lying && t >= lieRetractAt;
    const heading = confessed ? 'THE LEAVES… RECONSIDER' : 'THE LEAVES FORETELL';
    text(heading, CX, y0 + 17, 11, '#bcdbbc', 'center', MONO);
    const name = lying && !confessed ? fx.fib.claim : FORTUNES[state.nextFortune].name;
    const quote = lying ? (confessed ? fx.fib.retraction : 'The leaves have never been more certain.') : f.quote;
    let nx = CX;
    let ny = y0 + 44;
    if (fx.glitch > 0) {
      nx += (Math.random() - 0.5) * 10 * fx.glitch;
      ny += (Math.random() - 0.5) * 6 * fx.glitch;
      text(name.toUpperCase(), nx + 3, ny, 25, '#ff6fd0');
      text(name.toUpperCase(), nx - 3, ny, 25, '#5fe3ff');
    } else if (tone === 'trouble') {
      nx += Math.sin(time * 37) * 0.8; // a faint, ominous tremble
    }
    const nameColor = confessed ? `hsl(${(time * 90) % 360},65%,80%)` : lying ? FORTUNES.crown.color : f.color;
    text(name.toUpperCase(), nx, ny, 25, nameColor);
    text(quote, CX, y0 + 72, 15, '#e8dcc0', 'center', 'Georgia,serif', 'italic ');
    const ready = clamp((t - revealAt - 0.4) / 0.5, 0, 1);
    ctx.globalAlpha = a * ready * (0.65 + 0.35 * Math.sin(time * 2.5));
    const next = state.offer ? 'CHOOSE A SPOON UPGRADE — 1 OR 2' : 'ENTER — BREW THE NEXT CUP';
    text(next, CX, y0 + 96, 10, state.offer ? '#f0d494' : '#bad8c9', 'center', MONO);
    ctx.restore();
  }

  function drawParticles(particles) {
    for (const p of particles) circle(p.x, p.y, p.size, p.color, 0, true, p.time / p.life);
  }

  /** A secret the leaves noticed: a small banner at the top of the cup during the reading. */
  function drawSecrets(state) {
    const a = clamp((state.readingTime - 0.4) / 0.5, 0, 1);
    if (a <= 0.01 || !state.secrets.length) return;
    const y0 = CY - 246;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#10271ee6';
    const h = 26 + state.secrets.length * 38;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(CX - 150, y0, 300, h, 10);
    else ctx.rect(CX - 150, y0, 300, h);
    ctx.fill();
    ctx.strokeStyle = '#c79bff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = a * (0.5 + 0.3 * Math.sin(time * 2.4));
    ctx.stroke();
    ctx.globalAlpha = a;
    text('THE LEAVES ARE IMPRESSED.', CX, y0 + 17, 11, '#e2d4ff', 'center', MONO);
    state.secrets.forEach((id, i) => {
      const y = y0 + 38 + i * 38;
      text(SECRETS[id].words, CX, y, 16, '#f5dfb6', 'center', 'Georgia,serif', 'italic ');
      text(SECRETS[id].reward, CX, y + 17, 11, '#cbbde6', 'center', MONO);
    });
    ctx.restore();
  }

  function drawOverlay(state, fx) {
    if (state.phase === PHASE.PLAYING) return;
    const copy = OVERLAY_TEXT[state.phase];
    if (copy) {
      ctx.save();
      ctx.fillStyle = 'rgba(12,27,24,.67)';
      ctx.beginPath();
      ctx.arc(CX, CY, 191, 0, TAU);
      ctx.fill();
      circle(CX, CY, 190, '#c2dbb3', 1, false, 0.42);
      text(copy.heading, CX, CY - 58, 14, '#d3e9d9', 'center', 'ui-monospace,monospace');
      text(copy.title, CX, CY - 10, 30, '#f5dfb6');
      text(copy.line(state), CX, CY + 31, 15, '#d1dec8');
      text(copy.hint, CX, CY + 63, 13, '#bad8c9', 'center', 'ui-monospace,monospace');
      ctx.restore();
    }
    if (state.phase === PHASE.READING) {
      drawFortuneCard(state, fx);
      drawSecrets(state);
    }
    // Preserved from the prototype: the spill flash is drawn here, so it only
    // shows outside active play (e.g. on the final, game-ending spill).
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(241,150,110,${fx.flash * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const renderer = {
    quality,
    /**
     * @param {object} state simulation state (read only)
     * @param {{ particles: object[], flash: number, whisper: object, fib: object, glitch: number,
     *   glints: object[], spoonScale: number, upgradeGlow: number }} fx cosmetic effects
     * @param {number} dt seconds since the previous frame
     */
    draw(state, fx, dt) {
      time += dt;
      gradients ??= createGradients();
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (fx.shake > 0) {
        const k = fx.shake * 7;
        ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      }
      trackAim(state, dt);
      drawCup();
      if (fx.tea) tea.paint(fx.tea, state, { quality: renderer.quality, scale: canvas.width / W });
      drawGuides();
      const havoc = havocInProgress(state);
      const grind = grindInProgress(state);
      const inPlay = !havoc && !grind && (state.phase === PHASE.PLAYING || state.phase === PHASE.PAUSED);
      const live = inPlay || !!havoc || !!grind;
      if (inPlay) drawStrainer(state);
      drawAimBeams(state, fx);
      drawClouds(state.clouds);
      if (grind) espresso.drawField(grind, time);
      drawResidue(state);
      for (const e of state.enemies) drawEnemy(e);
      if (havoc) {
        // At the end they melt back into the cup.
        const fade = havoc.stage === 'outro' ? clamp(1 - havoc.time / 0.8, 0, 1) : 1;
        if (fade > 0) for (const m of havoc.marshmallows) drawMarshmallow(m, fade);
        for (const f of havoc.flames) drawFlame(f);
      }
      for (const g of fx.ghosts ?? []) drawGhost(g);
      if (state.golden) drawGolden(state.golden);
      if (state.prismatic) drawPrismatic(state.prismatic);
      for (const s of state.shots) drawShot(s, state.spoon.polished);
      if (grind) espresso.drawMachine(grind, state, fx, time);
      if (inPlay) drawWake(state.wake);
      if (inPlay) drawRecovery(state);
      drawPlayer(state, fx);
      drawGlints(fx.glints ?? []);
      drawParticles(fx.particles);
      if (havoc || grind) drawPopups(fx.popups ?? []);
      if (state.phase === PHASE.GRIND) espresso.drawOverlay(grind, time);
      drawOverlay(state, fx);
      if (state.phase === PHASE.CHOCOLATE) drawHavocOverlay(havoc);
      if (live) drawWhisper(fx.whisper);
      if (inPlay) drawDiscovery(fx.discovery);
      if (havoc || grind) drawBanner(fx.banner);
    },
  };
  return renderer;
}
