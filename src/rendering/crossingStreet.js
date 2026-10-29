// Original Canvas art for Crossing the Street, seen from above: a tea shop
// across the top, a far sidewalk, two lanes, a planted median, three more
// lanes, and the near sidewalk where the spoon starts. Every vehicle is drawn
// exactly over its hitbox (wheels and lamps tucked inside the body), and the
// paving joints line up with the squares the spoon hops between. Everything
// that moves reads the mission's own clock, so it all freezes with the
// simulation. This painter owns no physics, collisions or rewards; its only
// randomness is a fixed, private preview road for the offer screen.
import { CONFIG } from '../config.js';
import { createRandom } from '../core/random.js';
import {
  EXCHANGE, SIGN_LINES, TRAFFIC_ROWS, colX, planRoad, rowY, shopExchange, spoonPoint, vehicleX,
} from '../gameplay/crossingStreet.js';

const P = CONFIG.crossingStreet;
const W = CONFIG.arena.width;
const H = CONFIG.arena.height;
const INK = '#163b36';
const CREAM = '#fff1cb';
const SILVER = '#dfe7ea';
const ROAD = '#363c3f';
const PAVING = '#bdb5a1';
const DOOR_X = colX(P.startCol);
const top = (row) => P.bottom - (row + 1) * P.row;
const ease = (k) => 1 - (1 - k) ** 3;

// [body, trim] per paint: small cars are bold, vans pale, the milk truck's cab blue.
const PAINT = {
  car: [['#d9534a', '#9e2f28'], ['#3f8fb0', '#25607a'], ['#e3b23c', '#a87d1c'], ['#5aa469', '#356d40']],
  van: [['#f2efe6', '#a9a496'], ['#cfe3d6', '#7f9e8a'], ['#f0c48a', '#b3854a'], ['#d8dde6', '#8d96a3']],
  milk: [['#3a6ea5', '#21456e'], ['#3a6ea5', '#21456e'], ['#5b8fc7', '#2f5a87'], ['#3a6ea5', '#21456e']],
};

/** A repeatable pseudo-random number in [0, 1) from two integers: cosmetic only. */
function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createCrossingPainter(ctx, { compact = () => false } = {}) {
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => !!motion?.matches;
  const size = (large, small) => (compact() ? large : small);
  let preview = null; // the offer screen's road, made once

  function text(s, x, y, px = 22, color = INK, family = 'Georgia', weight = 'bold', align = 'center') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${px}px ${family}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  /** Text shrunk, if need be, to fit `width`. */
  function fit(s, x, y, px, width, color = INK, family = 'Georgia', weight = 'bold') {
    ctx.font = `${weight} ${px}px ${family}`;
    const w = ctx.measureText(s).width;
    text(s, x, y, w > width ? Math.floor(px * width / w) : px, color, family, weight);
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
  function line(x0, y0, x1, y1, color, width = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
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

  // ── The street ─────────────────────────────────────────────────────────

  function shopfront(open) {
    // Neighbours either side, plain so the shop stands out.
    box(0, 0, W, top(P.shop), '#2b3f3a');
    box(0, 18, 300, top(P.shop) - 18, '#7b4a3a');
    box(620, 26, 300, top(P.shop) - 26, '#55646a');
    for (let x = 22; x < 290; x += 62) box(x, 44, 36, 44, '#f5d18a55', 3);
    for (let x = 640; x < 910; x += 62) box(x, 50, 36, 40, '#cfe0e655', 3);
    // The tea shop.
    box(300, 8, 320, top(P.shop) - 8, '#2f6b55');
    box(316, 16, 288, 30, CREAM, 6);
    text('STEEP STREET TEAS', 460, 32, 19, '#2f6b55', 'Georgia', 'bold');
    // A striped awning over the windows and door.
    for (let i = 0; i < 10; i++) box(304 + i * 31.2, 52, 31.2, 16, i % 2 ? CREAM : '#c9554a');
    ctx.fillStyle = '#00000022';
    ctx.fillRect(304, 68, 312, 4);
    // Windows with a teapot and cups on show.
    for (const wx of [326, 506]) {
      box(wx, 76, 88, 50, '#a9d3c8', 4);
      box(wx, 76, 88, 50, '#ffffff22', 4);
      ctx.fillStyle = '#2f6b55';
      ctx.beginPath(); ctx.ellipse(wx + 30, 112, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(wx + 26, 98, 8, 4);
      line(wx + 43, 110, wx + 52, 103, '#2f6b55', 4);
      box(wx + 58, 106, 14, 12, CREAM, 3);
    }
    // The door (col 6): closed with an OPEN card, or open with the shopkeeper in it.
    box(DOOR_X - 26, 74, 52, top(P.shop) - 74, open ? '#1a2e28' : '#8a5a3a', 4);
    if (!open) {
      box(DOOR_X - 18, 82, 36, 26, '#f6e7c4', 3);
      text('OPEN', DOOR_X, 95, 11, '#2f6b55', 'sans-serif');
      dot(DOOR_X + 18, 112, 2.6, '#e6c35c');
    }
  }

  function paving(row0, row1) {
    const y0 = top(row1);
    const y1 = row0 === 0 ? H : P.bottom - row0 * P.row;
    box(0, y0, W, y1 - y0, PAVING);
    // Joints on the hop grid, so the squares can be read without a word.
    ctx.strokeStyle = '#a39b87';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let c = 0; c <= P.columns; c++) {
      const x = P.left + c * P.column;
      ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    }
    for (let y = y0 + P.row; y < y1; y += P.row) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function road() {
    for (const [hi, lo] of [[6, 5], [3, 1]]) {
      const y0 = top(hi);
      const y1 = P.bottom - lo * P.row;
      box(0, y0, W, y1 - y0, ROAD);
      // Solid edge lines by the curbs, dashed lines between lanes.
      box(0, y0 + 5, W, 3, '#e9e4cf');
      box(0, y1 - 8, W, 3, '#e9e4cf');
      ctx.save();
      ctx.setLineDash([26, 22]);
      for (let r = lo + 1; r <= hi; r++) line(0, P.bottom - r * P.row, W, P.bottom - r * P.row, '#e9e4cfcc', 3);
      ctx.restore();
    }
  }

  /** Faint chevrons painted in each lane show which way it runs, behind the traffic. */
  function arrows(lanes) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const lane of lanes) {
      const y = rowY(lane.row);
      for (const x0 of [140, 460, 780]) {
        ctx.beginPath();
        ctx.moveTo(x0 - lane.dir * 8, y - 12); ctx.lineTo(x0 + lane.dir * 8, y); ctx.lineTo(x0 - lane.dir * 8, y + 12);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function median() {
    const y0 = top(P.median);
    box(0, y0, W, P.row, '#dcd6c4');
    box(0, y0 + 8, W, P.row - 16, '#4d7a45');
    // Low flowers only: nothing that looks like it might be in the way.
    for (let i = 0; i < 26; i++) {
      const x = 18 + i * 35 + hash(i, 2) * 12;
      const y = y0 + 18 + hash(2, i) * (P.row - 36);
      dot(x, y, 3, ['#f3d36b', '#f2a3b8', '#ffffff'][i % 3]);
      dot(x, y, 1.2, '#9a6b2a');
    }
  }

  function nearSidewalkProps(m) {
    // The sign: decorative, and firmly ignored.
    const sy = P.bottom + 8;
    box(56, sy + 52, 6, 20, '#5e6a6b');
    box(326, sy + 52, 6, 20, '#5e6a6b');
    box(36, sy, 316, 54, '#f4f1e6', 5);
    ctx.strokeStyle = '#c9554a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(40, sy + 4, 308, 46, 4); ctx.stroke();
    text(SIGN_LINES[0], 194, sy + 17, 15, '#c9554a', 'sans-serif', '800');
    text(SIGN_LINES[1], 194, sy + 37, 13, INK, 'sans-serif', '700');
    // A pedestrian signal with a countdown: the hand is red, as ever.
    const left = m && m.stage === 'play' ? Math.max(0, Math.ceil(P.duration - m.clock - 1e-6)) : null;
    box(788, sy + 2, 96, 52, '#2b3133', 6);
    box(860, sy + 52, 6, 20, '#5e6a6b');
    ctx.fillStyle = '#ff6a4d';
    ctx.beginPath(); ctx.roundRect(800, sy + 12, 26, 32, 6); ctx.fill();
    for (let f = 0; f < 4; f++) box(801 + f * 6.2, sy + 6, 5, 12, '#ff6a4d', 2);
    text(left === null ? '--' : String(left).padStart(2, '0'), 856, sy + 29, 24, left !== null && left <= 10 ? '#ffb08a' : '#f5a35c', 'ui-monospace,monospace');
  }

  // ── Traffic ────────────────────────────────────────────────────────────

  function car(len, hh, [body, trim]) {
    const h = len / 2;
    for (const wx of [-h + 14, h - 30]) for (const wy of [-hh, hh - 5]) box(wx, wy, 16, 5, '#1c2224', 2);
    box(-h, -hh + 3, len, hh * 2 - 6, trim, 12);
    box(-h + 2, -hh + 4, len - 4, hh * 2 - 8, body, 11);
    box(h - 30, -hh + 7, 11, hh * 2 - 14, '#9cc9d6', 4); // windscreen
    box(-h + 18, -hh + 8, 30, hh * 2 - 16, '#ffffff33', 6); // roof shine
    box(-h + 8, -hh + 8, 8, hh * 2 - 16, '#7fb0bf', 3); // rear window
    box(h - 6, -hh + 5, 5, 6, '#fff6c2', 2); box(h - 6, hh - 11, 5, 6, '#fff6c2', 2);
    box(-h + 1, -hh + 5, 4, 6, '#ff6b5a', 2); box(-h + 1, hh - 11, 4, 6, '#ff6b5a', 2);
  }

  function van(len, hh, [body, trim]) {
    const h = len / 2;
    for (const wx of [-h + 16, h - 34]) for (const wy of [-hh, hh - 5]) box(wx, wy, 18, 5, '#1c2224', 2);
    box(-h, -hh, len, hh * 2, trim, 5);
    box(-h + 2, -hh + 2, len - 44, hh * 2 - 4, body, 4); // cargo box
    box(h - 40, -hh + 3, 38, hh * 2 - 6, body, 8); // cab
    box(h - 22, -hh + 7, 10, hh * 2 - 14, '#9cc9d6', 3);
    box(-h + 8, -8, len - 56, 16, trim, 4); // a band along the roof, for the lettering
    box(h - 5, -hh + 5, 4, 7, '#fff6c2', 2); box(h - 5, hh - 12, 4, 7, '#fff6c2', 2);
  }

  function milkTruck(len, hh, [body, trim], id) {
    const h = len / 2;
    for (const wx of [-h + 14, -h + 40, h - 34]) for (const wy of [-hh, hh - 5]) box(wx, wy, 18, 5, '#1c2224', 2);
    box(-h, -hh + 2, len, hh * 2 - 4, '#c9cdd0', 6); // chassis: no gap between cab and tank
    box(h - 46, -hh, 46, hh * 2, trim, 8); // cab
    box(h - 44, -hh + 2, 42, hh * 2 - 4, body, 7);
    box(h - 22, -hh + 7, 10, hh * 2 - 14, '#9cc9d6', 3);
    box(h - 5, -hh + 5, 4, 7, '#fff6c2', 2); box(h - 5, hh - 12, 4, 7, '#fff6c2', 2);
    // The tank, in black-and-white spots.
    box(-h + 2, -hh + 1, len - 52, hh * 2 - 2, '#fbfbf7', hh - 2);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-h + 2, -hh + 1, len - 52, hh * 2 - 2, hh - 2); ctx.clip();
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = '#1f2526';
      ctx.beginPath();
      ctx.ellipse(-h + 14 + hash(id, i) * (len - 72), -hh + 6 + hash(i, id) * (hh * 2 - 12), 7 + 5 * hash(i, 9), 5 + 3 * hash(9, i), hash(i, i), 0, Math.PI * 2);
      ctx.fill();
    }
    box(-h + 2, -8, len - 52, 16, '#3a6ea5'); // the company band, for the slogan
    ctx.restore();
    // The cab wears a pair of little horns. Nobody at the dairy will say why.
    ctx.fillStyle = '#f6e7c4';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(h - 34, side * (hh - 4)); ctx.lineTo(h - 12, side * (hh - 2)); ctx.lineTo(h - 30, side * (hh - 10));
      ctx.fill();
    }
  }

  function vehicle(lane, v, x) {
    const y = rowY(lane.row);
    const paint = PAINT[v.kind][v.paint % 4];
    ctx.save();
    ctx.translate(x, y);
    // A soft shadow, just inside the body, so it never reads as part of the vehicle.
    box(-v.length / 2 + 4, -v.halfHeight + 6, v.length - 8, v.halfHeight * 2 - 6, '#00000030', 8);
    ctx.scale(lane.dir, 1); // the nose leads
    if (v.kind === 'car') car(v.length, v.halfHeight, paint);
    else if (v.kind === 'van') van(v.length, v.halfHeight, paint);
    else milkTruck(v.length, v.halfHeight, paint, v.id + lane.row * 5);
    ctx.restore();
    // Words go on unmirrored.
    if (v.kind === 'van') text('PARCELS', x - lane.dir * 20, y + 1, 11, '#fffdf4', 'sans-serif', '800');
    if (v.kind === 'milk') text('SUSPICIOUSLY FRESH', x - lane.dir * 24, y + 1, 9, '#fffdf4', 'sans-serif', '800');
  }

  function traffic(lanes, xOf) {
    for (const lane of lanes) for (const v of lane.vehicles) {
      const x = xOf(lane, v);
      if (x + v.length / 2 > -4 && x - v.length / 2 < W + 4) vehicle(lane, v, x);
    }
  }

  // ── The spoon, and the shopkeeper ──────────────────────────────────────

  /**
   * The same silver spoon as on the Tea Run, smaller: bowl for a head, handle
   * for a body, red trainers. Its feet stand at the bottom of its hitbox.
   */
  function figure(x, y, { lean = 0, lift = 0, look = 0, dizzy = false, whistle = false, alpha = 1 } = {}) {
    const k = size(0.8, 0.66); // a little larger on a phone, still within its row
    const feet = y + P.spoon.halfHeight;
    ctx.save();
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, feet, 12 - lift * 0.3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.translate(x, feet - lift);
    ctx.rotate(lean);
    ctx.scale(k, k);
    ctx.lineCap = 'round';
    const tuck = lift > 2 ? 1 : 0;
    for (const side of [1, -1]) {
      ctx.strokeStyle = '#c8d2d6'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(side * 6, -9 + tuck * 2); ctx.lineTo(side * 7, -2 - tuck * 3); ctx.stroke();
      ctx.fillStyle = side > 0 ? '#e0483a' : '#c23a2e';
      ctx.beginPath(); ctx.ellipse(side * 8, -2 - tuck * 3, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = SILVER; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -40); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-1.5, -18); ctx.lineTo(-1.5, -38); ctx.stroke();
    ctx.strokeStyle = '#c8d2d6'; ctx.lineWidth = 2.5;
    for (const side of [1, -1]) {
      ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(side * 9, -24 - tuck * 8); ctx.stroke();
    }
    const bowl = ctx.createRadialGradient(-4, -58, 2, 0, -52, 18);
    bowl.addColorStop(0, '#ffffff'); bowl.addColorStop(0.5, SILVER); bowl.addColorStop(1, '#8fa2a8');
    ctx.fillStyle = bowl;
    ctx.beginPath(); ctx.ellipse(0, -53, 12, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7d9096'; ctx.lineWidth = 1.2; ctx.stroke();
    if (dizzy) {
      text('×', -4, -55, 10, '#24302c', 'ui-monospace,monospace');
      text('×', 4, -55, 10, '#24302c', 'ui-monospace,monospace');
    } else {
      dot(-4 + look * 2, -55, 1.9, '#24302c');
      dot(4 + look * 2, -55, 1.9, '#24302c');
      // Calm, if anything. Possibly whistling.
      ctx.strokeStyle = '#24302c'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (whistle) ctx.arc(look * 2, -47, 1.8, 0, Math.PI * 2);
      else ctx.arc(look * 2, -49, 3.5, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  function spoon(m) {
    const s = m.spoon;
    const { x, y } = spoonPoint(m);
    if (s.fallen) {
      // Knocked aside in the vehicle's direction, spinning, then lying still to collect itself.
      const k = Math.min(1, (P.stumble - s.stumble) / 0.4);
      const fx = x + s.fallen.dir * 34 * ease(k);
      const spin = reduced() ? s.fallen.dir * 1.2 * k : s.fallen.dir * (Math.PI * 2 * ease(k) + 1.2 * k);
      figure(fx, y, { lean: spin, dizzy: true });
      if (!reduced()) {
        for (let i = 0; i < 3; i++) {
          const a = m.age * 5 + (i * Math.PI * 2) / 3;
          text('✦', fx + Math.cos(a) * 16, y - 34 + Math.sin(a) * 5, 10, '#f5d18a', 'sans-serif');
        }
      }
      return;
    }
    const hop = s.hop ? Math.min(1, s.hop.time / P.hop) : 0;
    const lift = s.hop ? Math.sin(Math.PI * hop) * (reduced() ? 4 : 11) : 0;
    const side = s.face === 'left' ? -1 : s.face === 'right' ? 1 : 0;
    const blink = s.freeze > 0 && !reduced() ? 0.45 + 0.55 * Math.abs(Math.sin(m.age * 22)) : 1;
    const waiting = m.stage === 'intro' || m.stage === 'preview';
    figure(x, y, { lean: side * (s.hop ? 0.22 : 0.08), lift, look: side, alpha: blink, whistle: waiting });
    if (waiting && !reduced()) {
      // Not a care in the world.
      const t = (m.age * 0.8) % 1;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      text('♪', x + 14 + 10 * t, y - 40 - 22 * t, 16, CREAM, 'sans-serif');
      ctx.restore();
    }
  }

  function shopkeeper() {
    // A teapot with a magnificent moustache, in the doorway.
    const x = DOOR_X;
    const y = top(P.shop) - 22;
    ctx.fillStyle = '#e9e2cf';
    ctx.beginPath(); ctx.ellipse(x, y, 19, 15, 0, 0, Math.PI * 2); ctx.fill();
    box(x - 8, y - 21, 16, 6, '#e9e2cf', 3);
    dot(x, y - 23, 3, '#c9554a');
    line(x + 17, y + 2, x + 27, y - 9, '#e9e2cf', 5);
    ctx.strokeStyle = '#e9e2cf'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x - 20, y, 7, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    dot(x - 6, y - 5, 2, INK); dot(x + 6, y - 5, 2, INK);
    ctx.fillStyle = '#5a3a28';
    ctx.beginPath();
    ctx.ellipse(x - 6, y + 2, 7, 3, -0.3, 0, Math.PI * 2);
    ctx.ellipse(x + 6, y + 2, 7, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A speech bubble whose tail points at (tx, ty), kept above the far sidewalk. */
  function bubble(words, cx, tx, ty, alpha) {
    const px = size(30, 18);
    ctx.font = `italic ${px}px Georgia`;
    const lines = wrap(words, size(380, 300));
    const lead = Math.round(px * 1.2);
    const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 26;
    const h = lines.length * lead + 12;
    const x = Math.max(8 + w / 2, Math.min(W - 8 - w / 2, cx));
    const bottom = ty - 10;
    const y0 = Math.max(4, bottom - h);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y0, w, h, 10); ctx.fill(); ctx.stroke();
    const tip = Math.max(x - w / 2 + 14, Math.min(x + w / 2 - 14, tx));
    ctx.beginPath(); ctx.moveTo(tip - 7, y0 + h - 1); ctx.lineTo(tx, ty); ctx.lineTo(tip + 7, y0 + h - 1); ctx.fill(); ctx.stroke();
    box(tip - 8, y0 + h - 4, 16, 5, '#fffaf0');
    lines.forEach((s, i) => text(s, x, y0 + 6 + lead * (i + 0.5), px, INK, 'Georgia', 'italic'));
    ctx.restore();
  }

  function exchange(m) {
    const e = shopExchange(m);
    if (!e) return;
    const fade = (from) => Math.min(1, (e.time - from) / 0.15, (P.exchange - e.time) / 0.3);
    const { x } = spoonPoint(m);
    const right = x > DOOR_X - 20; // keep the two bubbles on either side of whichever is further left
    bubble(EXCHANGE.shopkeeper, right ? DOOR_X - size(210, 150) : DOOR_X + size(210, 150), DOOR_X + (right ? -14 : 14), top(P.shop) - 34, fade(0));
    if (e.spoon) {
      bubble(EXCHANGE.spoon, right ? x + size(180, 140) : x - size(180, 140), x, rowY(P.shop) - 26, fade(1.1));
    }
  }

  // ── Feedback and cards ─────────────────────────────────────────────────

  function popups(m) {
    for (const c of m.credited) {
      const since = m.age - c.at;
      if (since < 0 || since > 0.8) continue;
      ctx.save();
      ctx.globalAlpha = 1 - since / 0.8;
      const py = rowY(c.row) - 30 - (reduced() ? 0 : 26 * since);
      ctx.font = `800 ${size(26, 18)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.strokeText(`+${P.lanePoints}`, colX(c.col) + 20, py);
      text(`+${P.lanePoints}`, colX(c.col) + 20, py, size(26, 18), '#f5d18a', 'sans-serif', '800');
      ctx.restore();
    }
    const b = m.bump;
    if (b && m.age - b.at < 0.7) {
      const since = m.age - b.at;
      ctx.save();
      ctx.globalAlpha = 1 - since / 0.7;
      if (!reduced()) {
        ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y - 10, 14 + 50 * since, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.font = `900 ${size(30, 22)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.strokeText('CLANK!', b.x, b.y - 46);
      text('CLANK!', b.x, b.y - 46, size(30, 22), '#ffd36b', 'sans-serif', '900');
      ctx.restore();
    }
  }

  function card(y0, h) {
    box(90, y0, 740, h, '#fff0ccef', 14);
  }

  function overlay(m, paused) {
    const big = size(36, 32);
    const small = size(26, 20);
    const cy = rowY(P.median);
    if (paused) {
      card(cy - 80, 160);
      text('THE TRAFFIC WAITS.', W / 2, cy - 28, big);
      text('Resume with P or the Resume button.', W / 2, cy + 30, small);
      return;
    }
    if (m.stage === 'intro') {
      card(cy - 130, 260);
      fit('WHY DID THE SPOON CROSS THE ROAD?', W / 2, cy - 94, size(40, 31), 700);
      fit('“Nobody knows. But apparently, it’s our problem now.”', W / 2, cy - 50, size(26, 19), 700, INK, 'Georgia', 'italic');
      text('ARROWS / WASD: HOP ONE SQUARE', W / 2, cy - 2, small, INK, 'sans-serif');
      text(`${P.attempts} attempts · ${P.duration} seconds · the median is safe`, W / 2, cy + 44, small);
      text('Arrow pad on touch · Enter to begin', W / 2, cy + 88, size(23, 18), '#53715e', 'sans-serif');
    } else if (m.stage === 'outro') {
      const s = m.summary;
      if (s.success && m.time < 0.8) return; // the doorstep first
      ctx.save();
      ctx.globalAlpha = s.success ? Math.min(1, (m.time - 0.8) / 0.25) : 1;
      card(cy - 110, 236);
      fit(s.title, W / 2, cy - 66, big, 700);
      fit(s.line, W / 2, cy - 22, small, 700, INK, 'Georgia', 'italic');
      text(`${s.lanes} / ${TRAFFIC_ROWS.length} lanes · ${s.hits} ${s.hits === 1 ? 'bump' : 'bumps'}`, W / 2, cy + 26, small);
      text(`+${s.points} points · +${s.cash} Tea Cash`, W / 2, cy + 70, small);
      ctx.restore();
    }
  }

  function scene(m, xOf, open) {
    shopfront(open);
    paving(P.shop, P.shop);
    road();
    median();
    paving(0, 0);
    box(0, top(0), W, 7, '#dcd6c4'); // the near curb
    box(0, P.bottom - P.shop * P.row - 7, W, 7, '#dcd6c4'); // the far curb
    arrows(m.lanes);
    nearSidewalkProps(m);
    traffic(m.lanes, xOf);
  }

  return {
    /** The mission in progress. */
    draw(m, paused = false) {
      const open = m.stage === 'outro' && m.summary?.success;
      scene(m, (lane, v) => v.x, open);
      if (open) shopkeeper();
      spoon(m);
      popups(m);
      if (!paused) exchange(m);
      overlay(m, paused);
    },
    /**
     * Behind the offer card: the road the spoon is eyeing, busy as ever. It
     * waits at the far end of the curb, clear of the card laid over the stage.
     */
    drawPreview(time) {
      preview ??= { stage: 'preview', lanes: planRoad(createRandom(0x7ea5)), age: 0,
        spoon: { col: P.columns - 1, row: 0, hop: null, face: 'up', stumble: 0, freeze: 0, fallen: null } };
      preview.age = time;
      scene(preview, (lane, v) => vehicleX(lane, v, time), false);
      spoon(preview);
    },
  };
}
