// Draws the game from state. Rendering reads state but never changes it.
//
// All drawing uses the logical coordinate system (CONFIG.arena width × height,
// origin at the top-left); draw() scales it onto the canvas backing store.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { LANES, LANE_STEP, TAU, laneAngle, toCanvasPoint as polar } from '../gameplay/arena.js';
import { FORTUNES, glyphPoint } from '../gameplay/fortunes.js';

const { width: W, height: H, centerX: CX, centerY: CY, rimRadius: OUTER } = CONFIG.arena;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Fixed pseudo-random offsets for the milk cloud puffs.
const puffOffset = (n) => ((n * 71) % 97) / 97;

const OVERLAY_TEXT = {
  [PHASE.READY]: {
    heading: 'A STORM IS STEEPING',
    title: 'Storm in a Teacup',
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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let time = 0; // animation clock, independent of the simulation
  let gradients = null;

  function createGradients() {
    const liquid = ctx.createRadialGradient(CX - 64, CY - 82, 30, CX, CY, 330);
    liquid.addColorStop(0, '#5e6645');
    liquid.addColorStop(0.52, '#394c34');
    liquid.addColorStop(0.95, '#152920');
    liquid.addColorStop(1, '#0d1d1b');
    const glare = ctx.createLinearGradient(CX - 250, CY - 240, CX + 220, CY + 240);
    glare.addColorStop(0, '#f3ead914');
    glare.addColorStop(0.35, '#ffffff02');
    glare.addColorStop(1, '#0000001a');
    return { liquid, glare };
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

  function text(t, x, y, size, color, align = 'center', font = 'Georgia,serif') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font}`;
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

  function drawBackground() {
    circle(CX, CY, OUTER + 52, '#78948022', 16);
    circle(CX, CY, OUTER + 43, '#8ca58836', 3);
    circle(CX, CY, OUTER + 26, '#a9b68d28', 17);
    circle(CX, CY, OUTER + 15, '#eee8ce', 3);
    circle(CX, CY, OUTER + 10, '#678b6f', 14);
    circle(CX, CY, OUTER + 2, '#a9bc94', 3);
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER, 0, TAU);
    ctx.fillStyle = gradients.liquid;
    ctx.fill();

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

    for (let ring = 1; ring <= 4; ring++) {
      circle(CX, CY, (ring * OUTER) / 4, '#d7e4bf', ring === 4 ? 1.5 : 0.7, false, ring === 4 ? 0.32 : 0.14);
    }
    for (let i = 0; i < LANES; i++) {
      const a = laneAngle(i);
      line(polar(25, a), polar(OUTER - 3, a), '#c8d5ae', 1, i % 2 === 0 ? 0.2 : 0.11);
      const p = polar(OUTER + 17, a);
      circle(p.x, p.y, 1.7, '#c7daba', 0, true, 0.55);
    }

    // Slow swirl on the tea's surface.
    const rot = time * 0.035;
    ctx.strokeStyle = '#d3c17d20';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(CX, CY, 70 + i * 40, rot + i * 0.7, rot + 1.7 + i * 0.7);
      ctx.stroke();
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

  function drawClouds(clouds) {
    for (const c of clouds) {
      ctx.save();
      const alpha = Math.min(1, c.time / 0.75) * 0.17;
      ctx.fillStyle = `rgba(220,240,231,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, OUTER - 12, c.angle - LANE_STEP * 1.55, c.angle + LANE_STEP * 1.55);
      ctx.closePath();
      ctx.fill();
      for (let n = 0; n < 12; n++) {
        const a = c.angle + puffOffset(n) * LANE_STEP * 2.6 - LANE_STEP * 1.3;
        const r = 70 + ((n * 31) % 170);
        const p = polar(r, a);
        circle(p.x + Math.sin(time + n) * 3, p.y, 16 + (n % 4) * 6, '#e0eee1', 0, true, Math.min(0.1, c.time * 0.03));
      }
      ctx.restore();
    }
  }

  function drawPlayer(angle) {
    const pos = polar(OUTER + 7, angle);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.shadowColor = '#b4fae5';
    ctx.shadowBlur = 17;
    ctx.fillStyle = '#e5f4e8';
    ctx.strokeStyle = '#132b2c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -21);
    ctx.lineTo(12, 9);
    ctx.quadraticCurveTo(0, 20, -12, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#56847a';
    ctx.beginPath();
    ctx.ellipse(0, 3, 4.5, 8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    const p = polar(OUTER - 11, angle);
    circle(p.x, p.y, 3, '#c4fbeb', 0, true, 0.8);
  }

  function drawEnemy(e) {
    const p = polar(e.radius, e.angle);
    const scale = e.size * (1 + Math.sin(time * 7 + e.wiggle) * 0.08);
    leafShape(p.x, p.y, scale, e.angle + Math.PI / 2 + Math.sin(time * 3 + e.wiggle) * 0.3, '#c8a36b', e.alpha);
    circle(p.x, p.y, scale + 4, '#ead199', 0.65, false, e.alpha * 0.3);
  }

  function drawShot(s) {
    const p = polar(s.radius, s.angle);
    if (s.sugar) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#faf1cc';
      ctx.shadowColor = '#fff3a9';
      ctx.shadowBlur = 13;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    } else {
      circle(p.x, p.y, 4, '#cbfff2', 0, true, 0.9);
      circle(p.x, p.y, 9, '#b2eac7', 1, false, 0.3);
    }
  }

  function drawResidue(state) {
    const { residue, phase } = state;
    for (let i = 0; i < residue.length; i++) {
      const leaf = residue[i];
      const start = polar(leaf.radius, leaf.angle);
      let { x, y } = start;
      let size = leaf.size;
      let opacity = 0.75;
      if (phase === PHASE.READING) {
        // Leaves glide from where they fell into the fortune's glyph.
        const t = clamp((state.readingTime - 0.3) / 2.1, 0, 1);
        const smooth = t * t * (3 - 2 * t);
        const g = glyphPoint(state.nextFortune, i, residue.length);
        x = start.x + (CX + g.x - start.x) * smooth;
        y = start.y + (CY + g.y - start.y) * smooth;
        size += 1.7 * smooth;
        opacity = 0.7 + 0.28 * smooth;
      } else if (phase !== PHASE.PLAYING) {
        opacity = 0.38;
      }
      leafShape(x, y, size, leaf.spin + time * 0.13, '#819c6b', opacity);
    }
  }

  function drawParticles(particles) {
    for (const p of particles) circle(p.x, p.y, p.size, p.color, 0, true, p.time / p.life);
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
      const a = clamp((state.readingTime - 1.5) / 1.1, 0, 1);
      if (a > 0.01) {
        const f = FORTUNES[state.nextFortune];
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#10271ecc';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(CX - 194, CY + 178, 388, 73, 12);
        else ctx.rect(CX - 194, CY + 178, 388, 73);
        ctx.fill();
        text('THE LEAVES FORETELL', CX, CY + 196, 11, '#bcdbbc', 'center', 'ui-monospace,monospace');
        text(f.name.toUpperCase(), CX, CY + 222, 25, f.color);
        ctx.restore();
      }
    }
    // Preserved from the prototype: the spill flash is drawn here, so it only
    // shows outside active play (e.g. on the final, game-ending spill).
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(241,150,110,${fx.flash * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return {
    /**
     * @param {object} state simulation state (read only)
     * @param {{ particles: object[], flash: number }} fx cosmetic effects
     * @param {number} dt seconds since the previous frame
     */
    draw(state, fx, dt) {
      time += dt;
      gradients ??= createGradients();
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawBackground();
      drawClouds(state.clouds);
      drawResidue(state);
      for (const e of state.enemies) drawEnemy(e);
      for (const s of state.shots) drawShot(s);
      drawPlayer(state.angle);
      drawParticles(fx.particles);
      drawOverlay(state, fx);
    },
  };
}
