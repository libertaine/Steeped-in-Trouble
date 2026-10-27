// Draws the game from state. Rendering reads state but never changes it.
//
// All drawing uses the logical coordinate system (CONFIG.arena width × height,
// origin at the top-left); draw() scales it onto the canvas backing store.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { LANES, LANE_STEP, TAU, laneAngle, toCanvasPoint as polar } from '../gameplay/arena.js';
import { FORTUNES, glyphPoint } from '../gameplay/fortunes.js';
import { SECRETS } from '../gameplay/secrets.js';
import { createTeaPainter } from './tea.js';

const { width: W, height: H, centerX: CX, centerY: CY, rimRadius: OUTER } = CONFIG.arena;
const { revealAt, lieRetractAt } = CONFIG.fortunes;
const GOLD = '#ffd45e';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => t * t * (3 - 2 * t);
const MONO = 'ui-monospace,monospace';

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
      ctx.arc(CX, CY, OUTER - 12, c.angle - LANE_STEP * 1.55, c.angle + LANE_STEP * 1.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f4ecdc';
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.22;
      ctx.stroke();
      ctx.restore();
    }
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
    // The Golden Spoon flickers as it wears off.
    const flicker = look.golden && state.goldenSpoon < 1.5 ? 0.6 + 0.4 * Math.abs(Math.sin(time * 14)) : 1;
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
    const p = polar(OUTER - 11, angle);
    circle(p.x, p.y, 3, look.golden ? '#fff1b0' : '#c4fbeb', 0, true, 0.8);
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
      drawCup();
      if (fx.tea) tea.paint(fx.tea, state, { quality: renderer.quality, scale: canvas.width / W });
      drawGuides();
      const inPlay = state.phase === PHASE.PLAYING || state.phase === PHASE.PAUSED;
      if (inPlay) drawStrainer(state);
      drawClouds(state.clouds);
      drawResidue(state);
      for (const e of state.enemies) drawEnemy(e);
      if (state.golden) drawGolden(state.golden);
      if (state.prismatic) drawPrismatic(state.prismatic);
      for (const s of state.shots) drawShot(s, state.spoon.polished);
      if (inPlay) drawRecovery(state);
      drawPlayer(state, fx);
      drawGlints(fx.glints ?? []);
      drawParticles(fx.particles);
      drawOverlay(state, fx);
      if (inPlay) drawWhisper(fx.whisper);
    },
  };
  return renderer;
}
