// Original Canvas art for Biscuit Breakout: a tea tray, a wall of biscuits, a
// silver spoon and a sugar cube. Everything that moves reads the mission's own
// clock, so it all freezes with the simulation. This painter owns no physics,
// collisions, random draws or rewards; crumbs scatter by a fixed hash of the
// biscuit's id. The talking biscuit speaks from the header strip, above the
// arena, so its words never cover the cube or the spoon.
import { CONFIG } from '../config.js';
import { TALKER_LINE, biscuitRemark } from '../gameplay/biscuitBreakout.js';

const P = CONFIG.biscuitBreakout;
const A = P.arena;
const W = CONFIG.arena.width;
const H = CONFIG.arena.height;
const INK = '#163b36';
const CREAM = '#fff1cb';
const CRUMB_LIFE = 1.2;
// [body, edge, decoration] for each tint of each style: digestive, bourbon, shortbread.
const BISCUIT = [
  [['#d9a866', '#b8854a', '#9a6a36'], ['#e2b273', '#c08e52', '#a2733e'], ['#cf9d5c', '#ad7c43', '#8f612f']],
  [['#6b3f24', '#4e2c18', '#c98f62'], ['#76462a', '#57321c', '#d39a6c'], ['#61391f', '#462814', '#bf8659']],
  [['#efd39a', '#d2b277', '#c49a5a'], ['#f3d9a4', '#d8b97f', '#c9a062'], ['#e9cc90', '#cdac70', '#bf9454']],
];

/** A repeatable pseudo-random number in [0, 1) from two integers: cosmetic only. */
function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createBreakoutPainter(ctx, { compact = () => false } = {}) {
  const size = (large, small) => (compact() ? large : small);
  function text(s, x, y, px = 22, color = INK, family = 'Georgia', weight = 'bold', align = 'center') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${px}px ${family}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function box(x, y, w, h, color, radius = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }
  function dot(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function wrap(s, maxWidth) {
    const lines = [];
    for (const word of s.split(' ')) {
      const last = lines.at(-1);
      if (last && ctx.measureText(`${last} ${word}`).width <= maxWidth) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    return lines;
  }

  function tray() {
    ctx.fillStyle = '#0f241d';
    ctx.fillRect(0, 0, W, H);
    // The tray: a wooden rim around a checked tea towel.
    box(A.left - 22, A.top - 14, A.right - A.left + 44, H - A.top + 30, '#7a5034', 18);
    box(A.left - 12, A.top - 6, A.right - A.left + 24, H - A.top + 30, '#946540', 12);
    box(A.left, A.top, A.right - A.left, A.bottom - A.top + 30, '#1d4a40');
    ctx.save();
    ctx.beginPath();
    ctx.rect(A.left, A.top, A.right - A.left, A.bottom - A.top + 30);
    ctx.clip();
    ctx.fillStyle = '#ffffff0b';
    for (let x = A.left; x < A.right; x += 60) ctx.fillRect(x, A.top, 30, A.bottom - A.top + 30);
    for (let y = A.top; y < A.bottom + 30; y += 60) ctx.fillRect(A.left, y, A.right - A.left, 30);
    ctx.restore();
    // Polished side rails and the top rail the cube bounces off.
    const rail = ctx.createLinearGradient(0, A.top, 0, A.bottom);
    rail.addColorStop(0, '#dfe9e3'); rail.addColorStop(0.5, '#93aaa1'); rail.addColorStop(1, '#5d7570');
    ctx.fillStyle = rail;
    ctx.fillRect(A.left - 6, A.top - 6, 6, A.bottom - A.top + 36);
    ctx.fillRect(A.right, A.top - 6, 6, A.bottom - A.top + 36);
    ctx.fillRect(A.left - 6, A.top - 6, A.right - A.left + 12, 6);
    // The failure line: where a cube drops off the tray.
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = '#e6ad8255';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(A.left, A.bottom); ctx.lineTo(A.right, A.bottom); ctx.stroke();
    ctx.restore();
  }

  function face(b, m) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    // The eyes follow the cube, warily.
    const look = Math.max(-1, Math.min(1, (m.cube.x - cx) / 200));
    const lookY = m.cube.y > cy ? 1 : -1;
    for (const side of [-1, 1]) {
      dot(cx + side * 13, cy - 4, 5.2, '#fffaf0');
      dot(cx + side * 13 + look * 2, cy - 4 + lookY * 1.5, 2.4, INK);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + side * 8, cy - 13 + (side < 0 ? 1 : -1)); ctx.lineTo(cx + side * 18, cy - 12); ctx.stroke();
    }
    // A small, worried mouth.
    ctx.beginPath();
    ctx.arc(cx, cy + 12, 5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  function biscuit(b, m) {
    const [body, edge, deco] = BISCUIT[b.style][b.tint];
    const radius = [8, 4, 16][b.style];
    box(b.x + 2, b.y + 4, b.w, b.h, '#0c1f1966', radius);
    box(b.x, b.y, b.w, b.h, edge, radius);
    box(b.x + 3, b.y + 3, b.w - 6, b.h - 6, body, Math.max(2, radius - 3));
    if (b.style === 0) {
      // A digestive's docking holes.
      for (let i = 0; i < 5; i++) dot(b.x + 18 + i * 16, b.y + 12 + (i % 2) * 14, 1.8, deco);
    } else if (b.style === 1) {
      // A bourbon: two stripes of filling and a scatter of sugar.
      box(b.x + 8, b.y + b.h / 2 - 3, b.w - 16, 6, deco, 3);
      for (let i = 0; i < 7; i++) dot(b.x + 12 + i * 12.5, b.y + 8 + (i % 3) * 3, 1.3, '#f5e6c8');
    } else {
      // Shortbread: a row of fork pricks.
      for (let i = 0; i < 4; i++) {
        for (const dy of [-5, 5]) dot(b.x + 24 + i * 17, b.y + b.h / 2 + dy, 1.5, deco);
      }
    }
    if (b.face) face(b, m);
  }

  function crumbs(b, m) {
    const age = m.age - b.brokenAt;
    if (age < 0 || age > CRUMB_LIFE) return;
    const [body, edge] = BISCUIT[b.style][b.tint];
    const fade = 1 - age / CRUMB_LIFE;
    ctx.save();
    ctx.globalAlpha = fade;
    for (let i = 0; i < 12; i++) {
      const vx = (hash(b.id, i) - 0.5) * 220;
      const vy = -40 - hash(i, b.id) * 120;
      const x = b.x + b.w / 2 + vx * age;
      const y = b.y + b.h / 2 + vy * age + 260 * age * age;
      const r = 2 + hash(b.id + 7, i) * 4;
      box(x - r, y - r, r * 2, r * 2, i % 3 ? body : edge, 1.5);
    }
    ctx.restore();
  }

  function spoon(m) {
    const { x } = m.paddle;
    const { y, halfWidth, halfHeight } = P.paddle;
    const silver = ctx.createLinearGradient(x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight);
    silver.addColorStop(0, '#7b9995'); silver.addColorStop(0.45, '#f5fbeb'); silver.addColorStop(1, '#91a9a0');
    // A short handle tucked below the bowl, so the whole top edge is the hitting surface.
    ctx.strokeStyle = silver; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + halfWidth * 0.55, y + 4); ctx.lineTo(x + halfWidth + 26, y + 26); ctx.stroke();
    ctx.fillStyle = silver;
    ctx.beginPath(); ctx.ellipse(x, y, halfWidth, halfHeight + 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c5d7ce';
    ctx.beginPath(); ctx.ellipse(x, y + 1, halfWidth - 10, halfHeight - 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x - 14, y - 3, halfWidth * 0.45, 3, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  }

  function cube(m) {
    const c = m.cube;
    const h = P.cube.half;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.held ? 0 : m.age * 5 * Math.sign(c.vx || 1));
    box(-h + 2, -h + 4, h * 2, h * 2, '#0c1f1955', 4);
    box(-h, -h, h * 2, h * 2, '#fbfbf5', 4);
    box(-h + 3, -h + 3, h * 2 - 6, h - 4, '#ffffff', 3);
    for (let i = 0; i < 6; i++) dot(-h + 5 + hash(i, 3) * (h * 2 - 10), -h + 5 + hash(3, i) * (h * 2 - 10), 1.1, '#d8dcd4');
    ctx.restore();
  }

  /**
   * The HUD pills already show the time, the biscuits and the cubes, over the
   * top of the canvas; this strip adds only a slim clock bar beneath them, and
   * leaves room for the talking biscuit.
   */
  function header(m) {
    box(0, 0, W, A.top - 18, '#10271e');
    const share = Math.max(0, 1 - m.clock / P.duration);
    box(A.left, 64, A.right - A.left, 6, '#ffffff1a', 3);
    box(A.left, 64, (A.right - A.left) * share, 6, share < 10 / P.duration ? '#ffb08a' : '#f5d18a', 3);
  }

  function remark(m) {
    const r = biscuitRemark(m);
    if (!r || m.stage === 'outro') return;
    // On a small canvas: bigger words over two lines, still above the tray.
    const px = size(40, 22);
    ctx.font = `bold ${px}px Georgia`;
    const lines = wrap(TALKER_LINE, size(600, 820));
    const lead = Math.round(px * 1.15);
    const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 32;
    const h = lines.length * lead + 14;
    const cx = Math.max(12 + w / 2, Math.min(W - 12 - w / 2, r.x));
    const bottom = A.top - 22;
    const top = bottom - h;
    ctx.save();
    ctx.globalAlpha = Math.min(1, r.since / 0.12, (P.remark - r.since) / 0.3);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(cx - w / 2, top, w, h, 12); ctx.fill(); ctx.stroke();
    // The tail points down at where the biscuit was, stopping at the top rail.
    const tip = Math.max(cx - w / 2 + 16, Math.min(cx + w / 2 - 16, r.x));
    ctx.beginPath(); ctx.moveTo(tip - 9, bottom - 2); ctx.lineTo(r.x, A.top - 8); ctx.lineTo(tip + 9, bottom - 2);
    ctx.fill(); ctx.stroke();
    box(tip - 10, bottom - 5, 20, 6, '#fffaf0');
    lines.forEach((s, i) => text(s, cx, top + 7 + lead * (i + 0.5), px, INK));
    ctx.restore();
  }

  function celebrate(m) {
    // Perfect clear: a gentle shower of golden crumbs over the tray.
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const t = (m.time * (0.4 + hash(i, 1) * 0.5) + hash(1, i)) % 1;
      const x = A.left + hash(i, 9) * (A.right - A.left);
      const y = A.top + t * (A.bottom - A.top);
      ctx.globalAlpha = 0.8 * (1 - t);
      box(x - 3, y - 3, 6, 6, i % 3 ? '#f2c13e' : '#fff1cb', 2);
    }
    ctx.restore();
  }

  function overlay(m, paused) {
    const big = size(38, 34);
    const small = size(26, 21);
    if (paused) {
      box(90, 300, 740, 200, '#fff0ccef', 14);
      text('BISCUITS ON STANDBY.', W / 2, 365, big);
      text('Resume with P or the Resume button.', W / 2, 430, small);
      return;
    }
    if (m.stage === 'intro') {
      box(70, 250, 780, 330, '#fff0ccef', 14);
      text('BISCUIT BREAKOUT', W / 2, 300, size(48, 44));
      text('“The biscuits have formed a wall.', W / 2, 352, small, INK, 'Georgia', 'italic');
      text('Negotiations have failed.”', W / 2, 382, small, INK, 'Georgia', 'italic');
      text('← → MOVE THE SPOON    SPACE: LAUNCH', W / 2, 436, small, INK, 'sans-serif');
      text(`${P.cubes} sugar cubes · ${P.duration} seconds · break 70% for Tea Cash`, W / 2, 482, small);
      text('◀ LAUNCH ▶ on touch · Enter to begin', W / 2, 528, small);
    } else if (m.stage === 'outro') {
      const s = m.summary;
      if (s.perfect) celebrate(m);
      box(70, 260, 780, 290, '#fff0ccef', 14);
      text(s.title, W / 2, 312, big);
      text(s.line, W / 2, 362, small, INK, 'Georgia', 'italic');
      text(`${s.broken} / ${s.total} biscuits broken`, W / 2, 418, small);
      text(`+${s.points} points · +${s.cash} Tea Cash`, W / 2, 464, small);
      text(s.success ? 'The tea is safe. For now.' : 'The biscuits will be talking about this.', W / 2, 508, size(23, 19), '#53715e', 'sans-serif');
    } else if (m.cube.held) {
      // The launch prompt sits below the spoon, clear of the wall and the cube's path.
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = '#fff0b799'; ctx.lineWidth = 2;
      const lean = m.paddle.dir || (m.launches % 2 ? -1 : 1);
      ctx.beginPath(); ctx.moveTo(m.cube.x, m.cube.y - 16);
      ctx.lineTo(m.cube.x + lean * Math.tan(P.cube.launchAngle) * 90, m.cube.y - 106); ctx.stroke();
      ctx.restore();
      text(m.launches ? 'NEXT CUBE · SPACE / LAUNCH' : 'SPACE / LAUNCH', W / 2, P.paddle.y + 40, size(24, 19), CREAM, 'sans-serif');
    }
  }

  return {
    draw(m, paused = false) {
      tray();
      header(m);
      for (const b of m.biscuits) {
        if (b.alive) biscuit(b, m);
        else crumbs(b, m);
      }
      spoon(m);
      if (m.stage !== 'outro' || m.cubes > 0) cube(m);
      remark(m);
      overlay(m, paused);
    },
  };
}
