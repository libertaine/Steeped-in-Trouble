// Draws the Tea Run (a silver spoon on legs, running down a neighbourhood
// sidewalk to the tea shop) and the Tea Shortage's announcement over the cup.
// Like the rest of the renderer it reads state and never changes it; every
// moving detail (the scenery, crumbs, splashes) is worked out from the run's
// own clock, so the same run always looks the same.

import { CONFIG } from '../config.js';
import { AERIAL_DISCOVERIES, obstacleX, spoonHeight } from '../gameplay/teaRun.js';

const { width: W, height: H, centerX: CX, centerY: CY } = CONFIG.arena;
const R = CONFIG.teaRun;
const O = R.obstacles;
const MONO = 'ui-monospace,monospace';
const SERIF = 'Georgia,serif';

const GROUND = 610; // the paving's surface, in canvas units
const SPOON_X = 150; // where the spoon runs, on screen
// The street is drawn a little larger than life about the spoon's feet, so a
// phone shows a spoon worth cheering for; obstacles still come into view
// more than a second and a half before they arrive.
const ZOOM = 1.25;
const TEA = '#a8682a';
const SILVER = '#dfe7ea';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** A steady pseudo-random number in [0, 1) for scenery item n. */
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// The neighbourhood, and the neighbours.
const SHOPS = [
  { name: 'BISCUIT BARREL', color: '#5b7f6a', awning: '#d9b77a' },
  { name: 'KETTLE REPAIRS', color: '#6f6a8f', awning: '#c8d4e8' },
  { name: 'SCONE ZONE', color: '#8a5f4f', awning: '#f2d3a0' },
  { name: 'CRUMPETS & CO.', color: '#4f6f80', awning: '#e9a87a' },
  { name: 'ESPRESSO (BOO!)', color: '#5a4636', awning: '#b9876a' },
  { name: 'JAM SESSION', color: '#7d4f68', awning: '#f0b8c8' },
  { name: 'SPOONS: NONE', color: '#506a52', awning: '#cfe0b8' },
  { name: 'MARMALADE MANOR', color: '#8a6d3b', awning: '#f4d58a' },
];
const NEIGHBOURS = ['cat', 'gnome', 'waver', 'none', 'binoculars', 'none', 'cat', 'trumpet'];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ text: Function, circle: Function, highQuality: () => boolean, compact: () => boolean }} tools the renderer's own helpers
 */
export function createRunPainter(ctx, { text, circle, highQuality, compact }) {
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => !!motion?.matches;
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function panel(x, y, w, h, edge = '#e8c77a', fill = '#10271ee8') {
    ctx.save();
    ctx.fillStyle = fill;
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ── Scenery ────────────────────────────────────────────────────────────

  function drawSky(time) {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#1f3d3f');
    sky.addColorStop(0.65, '#4d7a70');
    sky.addColorStop(1, '#b9c99a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // A low, friendly sun.
    circle(760, 170, 46, '#f6dc9a', 0, true, 0.85);
    circle(760, 170, 70, '#f6dc9a', 0, true, 0.12 + 0.03 * Math.sin(time * 1.5));
  }

  function drawClouds(distance) {
    const offset = distance * 0.08;
    const first = Math.floor(offset / 260) - 1;
    for (let k = first; k < first + 6; k++) {
      const x = k * 260 - offset + 60 * hash(k);
      const y = 70 + 90 * hash(k + 40);
      const s = 0.7 + 0.5 * hash(k + 80);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#e9efe2';
      for (const [dx, dy, r] of [[0, 0, 22], [24, -10, 28], [52, 0, 22], [26, 8, 24]]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Rooftops far off: slow parallax silhouettes. */
  function drawFarRow(distance) {
    const offset = distance * 0.25;
    const step = 120;
    const first = Math.floor(offset / step) - 1;
    ctx.fillStyle = '#35574d';
    for (let k = first; k < first + W / step + 3; k++) {
      const x = k * step - offset;
      const h = 90 + 70 * hash(k + 3);
      const top = GROUND - 60 - h;
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x, top + 26);
      ctx.lineTo(x + step / 2, top);
      ctx.lineTo(x + step - 6, top + 26);
      ctx.lineTo(x + step - 6, GROUND);
      ctx.fill();
      if (hash(k + 9) > 0.5) {
        ctx.fillStyle = '#f1d99a55';
        ctx.fillRect(x + 30, top + 50, 14, 16);
        ctx.fillStyle = '#35574d';
      }
    }
  }

  function drawNeighbour(kind, x, y, time) {
    ctx.save();
    ctx.translate(x, y);
    if (kind === 'cat') {
      ctx.fillStyle = '#1d2422';
      ctx.beginPath();
      ctx.ellipse(0, 6, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, -1); ctx.lineTo(-5, -10); ctx.lineTo(-1, -2);
      ctx.moveTo(8, -1); ctx.lineTo(5, -10); ctx.lineTo(1, -2);
      ctx.fill();
      circle(-4, 3, 1.6, '#e8e070', 0, true);
      circle(4, 3, 1.6, '#e8e070', 0, true);
    } else if (kind === 'binoculars') {
      circle(0, 4, 10, '#e2c7a8', 0, true);
      ctx.fillStyle = '#26302c';
      ctx.fillRect(-9, -1, 7, 6);
      ctx.fillRect(2, -1, 7, 6);
    } else if (kind === 'waver') {
      circle(0, 4, 10, '#d9b48e', 0, true);
      ctx.strokeStyle = '#d9b48e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 8);
      ctx.lineTo(18 + 4 * Math.sin(time * 9), -6);
      ctx.stroke();
    } else if (kind === 'trumpet') {
      circle(0, 4, 10, '#c9a07a', 0, true);
      ctx.fillStyle = '#e8c45a';
      ctx.beginPath();
      ctx.moveTo(8, 4); ctx.lineTo(22, -2); ctx.lineTo(22, 12); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** The shops along the street, a little slower than the paving. */
  function drawStreet(distance, time) {
    const offset = distance * 0.55;
    const step = 240;
    const first = Math.floor(offset / step) - 1;
    for (let k = first; k < first + W / step + 3; k++) {
      const shop = SHOPS[((k % SHOPS.length) + SHOPS.length) % SHOPS.length];
      const x = k * step - offset;
      const h = 190 + 60 * hash(k + 17);
      const top = GROUND - h;
      ctx.fillStyle = shop.color;
      ctx.fillRect(x + 6, top, step - 12, h);
      ctx.fillStyle = '#00000022';
      ctx.fillRect(x + 6, top, step - 12, 10);
      // Upstairs windows, one of them occupied.
      for (const wx of [30, 100, 170]) {
        ctx.fillStyle = '#f3e3b0';
        ctx.globalAlpha = 0.75;
        ctx.fillRect(x + wx, top + 26, 40, 34);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff55';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + wx, top + 26, 40, 34);
      }
      const who = NEIGHBOURS[((k % NEIGHBOURS.length) + NEIGHBOURS.length) % NEIGHBOURS.length];
      if (who !== 'none' && who !== 'gnome') drawNeighbour(who, x + 120, top + 44, time);
      // Sign, awning, and shop window.
      const signY = GROUND - 128;
      ctx.fillStyle = '#132a22';
      roundRect(x + 24, signY, step - 48, 26, 5);
      ctx.fill();
      text(shop.name, x + step / 2, signY + 13, 12, '#f1dfbd', 'center', MONO);
      ctx.fillStyle = shop.awning;
      for (let s = 0; s < 8; s++) {
        ctx.globalAlpha = s % 2 ? 0.75 : 1;
        ctx.fillRect(x + 14 + s * ((step - 28) / 8), signY + 30, (step - 28) / 8, 16);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#c7e0d655';
      ctx.fillRect(x + 26, signY + 54, step - 110, GROUND - signY - 60);
      ctx.fillStyle = '#2a201a';
      ctx.fillRect(x + step - 74, signY + 54, 38, GROUND - signY - 54);
      if (who === 'gnome') {
        // A garden gnome, keeping a close eye on things.
        ctx.fillStyle = '#c84a3a';
        ctx.beginPath();
        ctx.moveTo(x + 50, GROUND - 40); ctx.lineTo(x + 58, GROUND - 62); ctx.lineTo(x + 66, GROUND - 40);
        ctx.fill();
        circle(x + 58, GROUND - 34, 7, '#efd2b5', 0, true);
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(x + 52, GROUND - 30, 12, 8);
        ctx.fillStyle = '#3e6a8c';
        ctx.fillRect(x + 52, GROUND - 22, 12, 22);
      }
    }
  }

  function drawPaving(distance) {
    ctx.fillStyle = '#a9a993';
    ctx.fillRect(0, GROUND, W, 72);
    ctx.fillStyle = '#c6c6b0';
    ctx.fillRect(0, GROUND, W, 4);
    ctx.strokeStyle = '#7f7f6c';
    ctx.lineWidth = 2;
    const seam = 80;
    for (let x = -(distance % seam); x < W; x += seam) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND + 4);
      ctx.lineTo(x - 18, GROUND + 70);
      ctx.stroke();
    }
    // The kerb and the road.
    ctx.fillStyle = '#8b8b78';
    ctx.fillRect(0, GROUND + 70, W, 8);
    ctx.fillStyle = '#2d3936';
    ctx.fillRect(0, GROUND + 78, W, H - GROUND - 78);
    ctx.fillStyle = '#e8e2c8';
    for (let x = -(distance % 120); x < W; x += 120) ctx.fillRect(x, GROUND + 98, 60, 5);
  }

  /** The tea shop, whose door is the finish line. */
  function drawTeaShop(run, time) {
    const door = SPOON_X + (run.finish - run.distance);
    if (door < -260 || door > W + 260) return;
    const left = door - 150;
    const top = GROUND - 300;
    ctx.fillStyle = '#7b4a2e';
    ctx.fillRect(left, top, 300, 300);
    ctx.fillStyle = '#5c3520';
    ctx.fillRect(left, top, 300, 14);
    // The sign: a teacup and its name.
    panel(left + 30, top + 30, 240, 50, '#f6dc9a', '#1b3a2c');
    text('THE TEA SHOP', door, top + 50, 22, '#f6dc9a', 'center', SERIF, 'bold ');
    text('open (just about)', door, top + 70, 11, '#cfe0c4', 'center', MONO);
    // Windows full of tins.
    for (const wx of [left + 20, left + 196]) {
      ctx.fillStyle = '#f3e3b0cc';
      ctx.fillRect(wx, top + 110, 84, 90);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = ['#c84a3a', '#3e8c5a', '#d9a84a'][i % 3];
        ctx.fillRect(wx + 8 + (i % 3) * 26, top + 124 + Math.floor(i / 3) * 38, 18, 26);
      }
    }
    // The open door, glowing.
    ctx.fillStyle = '#ffe9a8';
    ctx.globalAlpha = 0.85 + 0.1 * Math.sin(time * 3);
    ctx.fillRect(door - 32, GROUND - 120, 64, 120);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#3a2416';
    ctx.lineWidth = 5;
    ctx.strokeRect(door - 32, GROUND - 120, 64, 120);
  }

  // ── Obstacles and pickups ──────────────────────────────────────────────

  /** Where something at a distance along the sidewalk appears on screen. */
  const screenX = (run, x) => SPOON_X + (x - run.distance);

  function drawSugarCube(ob, run, x) {
    const s = O.sugarCube.width;
    const since = ob.hitAt === null ? null : run.clock - ob.hitAt;
    if (since !== null) {
      // Burst into crystals.
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI * (0.1 + 0.8 * hash(ob.id * 13 + i));
        const v = 140 + 120 * hash(ob.id * 7 + i);
        const px = x + s / 2 + Math.cos(a) * v * since;
        const py = GROUND - s / 2 + Math.sin(a) * v * since + 380 * since * since;
        ctx.save();
        ctx.globalAlpha = clamp(1 - since / 0.9, 0, 1);
        ctx.translate(px, py);
        ctx.rotate(since * 9 + i);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#fff3c4';
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }
      return;
    }
    const spin = -(obstacleX(ob, 0) - obstacleX(ob, run.clock)) / (s / 2);
    ctx.save();
    ctx.translate(x + s / 2, GROUND - s / 2);
    ctx.rotate(spin);
    ctx.fillStyle = '#fbf8ee';
    ctx.strokeStyle = '#c9c2a8';
    ctx.lineWidth = 2;
    roundRect(-s / 2, -s / 2, s, s, 8);
    ctx.fill();
    ctx.stroke();
    // Sugar grains, and a face with opinions.
    ctx.fillStyle = '#e5ddc4';
    for (let i = 0; i < 6; i++) ctx.fillRect(-14 + 9 * (i % 3), -14 + 18 * Math.floor(i / 3), 3, 3);
    circle(-7, -2, 2.4, '#3a2a20', 0, true);
    circle(7, -2, 2.4, '#3a2a20', 0, true);
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, -9); ctx.lineTo(-3, -6);
    ctx.moveTo(11, -9); ctx.lineTo(3, -6);
    ctx.moveTo(-5, 8); ctx.quadraticCurveTo(0, 4, 5, 8);
    ctx.stroke();
    ctx.restore();
    // A little dust behind it as it rolls.
    circle(x + s + 8, GROUND - 4, 4, '#e7e2cf', 0, true, 0.5);
  }

  function drawPuddle(ob, run, x, time) {
    const w = O.puddle.width;
    const since = ob.hitAt === null ? null : run.clock - ob.hitAt;
    ctx.save();
    ctx.fillStyle = TEA;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, GROUND + 4, w / 2, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#e4a868';
    ctx.beginPath();
    ctx.ellipse(x + w / 2 - 12, GROUND + 1, w / 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ripples, and the tea bag responsible.
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#f0c48a';
    ctx.lineWidth = 1.2;
    const u = (time * 0.8 + ob.id * 0.3) % 1;
    ctx.beginPath();
    ctx.ellipse(x + w / 2 + 10, GROUND + 4, 6 + 18 * u, 2 + 4 * u, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.6 * (1 - u);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#efe6cf';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w - 22, GROUND + 2);
    ctx.lineTo(x + w - 14, GROUND - 22);
    ctx.stroke();
    ctx.fillStyle = '#d9483a';
    ctx.fillRect(x + w - 20, GROUND - 32, 12, 10);
    ctx.restore();
    if (since !== null && since < 0.8) {
      // A splash.
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * (0.15 + 0.7 * hash(ob.id * 5 + i));
        const v = 120 + 90 * hash(ob.id * 3 + i);
        circle(x + w / 2 + Math.cos(a) * v * since, GROUND + Math.sin(a) * v * since + 420 * since * since,
          3, '#d08a48', 0, true, 1 - since / 0.8);
      }
    }
  }

  function drawCoffeeCup(ob, run, x, time) {
    const { width: w, clearance, height } = O.coffeeCup;
    const since = ob.hitAt === null ? null : run.clock - ob.hitAt;
    // It sways a little on its rope; a bonk sets it swinging.
    const swing = 0.03 * Math.sin(time * 2 + ob.id) + (since !== null ? 0.35 * Math.exp(-since * 2.5) * Math.sin(since * 14) : 0);
    const hook = { x: x + w / 2, y: 0 };
    const bottom = GROUND - clearance;
    ctx.save();
    // Its shadow on the paving says where it hangs.
    ctx.fillStyle = '#00000033';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, GROUND + 3, w / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(hook.x, hook.y);
    ctx.rotate(swing);
    ctx.strokeStyle = '#3b2c22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, bottom - height);
    ctx.stroke();
    // The cup, upside up: wide at the lid, narrower at the base.
    const top = bottom - height;
    ctx.fillStyle = '#f2ece0';
    ctx.strokeStyle = '#8a7a66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2, top + 10);
    ctx.lineTo(w / 2, top + 10);
    ctx.lineTo(w / 2 - 9, bottom);
    ctx.lineTo(-w / 2 + 9, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6b4a34';
    roundRect(-w / 2 - 4, top, w + 8, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#b07a4f';
    ctx.fillRect(-w / 2 + 5, top + 32, w - 10, 22);
    text('JOE', 0, top + 43, 13, '#f2ece0', 'center', MONO, 'bold ');
    ctx.restore();
    // Steam from the lid, because of course.
    for (let i = 0; i < 2; i++) {
      const u = (time * 0.7 + i * 0.5) % 1;
      circle(x + w / 2 + 6 * Math.sin(u * 6 + i), bottom - height - 8 - 30 * u, 5 + 4 * u, '#ffffff', 0, true, 0.3 * (1 - u));
    }
    if (since !== null && since < 0.9) text('BONK', x + w / 2, bottom - height - 24 - 30 * since, 18, '#ffd36a', 'center', MONO, 'bold ');
  }

  function drawObstacles(run, time) {
    for (const ob of run.obstacles) {
      if (ob.bypassed) continue;
      const x = screenX(run, obstacleX(ob, run.clock));
      if (x > W + 120 || x < -200) continue;
      if (ob.kind === 'sugarCube') drawSugarCube(ob, run, x);
      else if (ob.kind === 'puddle') drawPuddle(ob, run, x, time);
      else drawCoffeeCup(ob, run, x, time);
      // The first of each kind says what to do about it.
      if (ob.id < 3 && ob.hitAt === null && x > SPOON_X + 40) {
        const slide = O[ob.kind].action === 'slide';
        const y = slide ? GROUND - O.coffeeCup.clearance - 112 : GROUND - 74;
        text(slide ? '↓ SLIDE!' : '↑ JUMP!', x + O[ob.kind].width / 2, y, 22, '#ffe9a8', 'center', MONO, 'bold ');
      }
    }
  }

  function drawPickups(run, time) {
    for (const p of run.pickups) {
      const x = screenX(run, p.x);
      if (x < -30 || x > W + 30) continue;
      const since = p.takenAt === null ? 0 : run.clock - p.takenAt;
      if (p.takenAt !== null && since > 0.45) continue;
      const y = GROUND - p.height - 70 * since;
      ctx.save();
      ctx.globalAlpha = 1 - since / 0.45;
      ctx.translate(x, y + (p.kind === 'packet' ? 3 * Math.sin(time * 4 + p.x) : 0));
      if (p.kind === 'coin') {
        ctx.scale(Math.max(0.2, Math.abs(Math.cos(time * 4 + p.x * 0.01))), 1);
        circle(0, 0, 10, '#f2c94c', 0, true);
        circle(0, 0, 10, '#a77d1c', 2);
        text('T', 0, 1, 11, '#7a5a10', 'center', MONO, 'bold ');
      } else {
        ctx.rotate(0.12);
        ctx.fillStyle = '#3e8c5a';
        roundRect(-11, -14, 22, 28, 3);
        ctx.fill();
        ctx.fillStyle = '#f1dfbd';
        ctx.fillRect(-7, -4, 14, 10);
        circle(0, 1, 3, '#3e8c5a', 0, true);
      }
      ctx.restore();
    }
  }

  // ── The spoon ──────────────────────────────────────────────────────────

  function drawSpoon(run, time, { x = SPOON_X, feet = GROUND - spoonHeight(run.spoon), rotation = null, scorched = false, shadow = true } = {}) {
    const { spoon } = run;
    const h = GROUND - feet;
    const stride = run.distance / 26;
    const blink = !reduced() && spoon.safe > 0 && spoon.tumble <= 0 ? 0.45 + 0.55 * Math.abs(Math.sin(time * 16)) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(x, feet);
    // Shadow on the paving, shrinking as it rises.
    ctx.save();
    ctx.globalAlpha = shadow ? 0.25 * blink : 0;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, h + 3, Math.max(2, 16 * (1 - h / 300)), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    let lean = 0.12; // running: leaning into it
    let legs = Math.sin(stride);
    let tuck = 0;
    if (spoon.action === 'slide') lean = -1.2;
    if (spoon.action === 'jump') {
      tuck = 1;
      lean = 0.25 - 0.3 * (spoon.time / R.jumpTime);
    }
    if (run.stage === 'outro' && run.result === 'failed') {
      lean = -1.45; // flat on its back
      legs = 0.3 * Math.sin(time * 3);
    } else if (run.stage === 'intro') {
      legs = 0.15 * Math.sin(time * 5); // on its marks
    }
    if (spoon.tumble > 0) lean += (1 - spoon.tumble / R.tumbleTime) * Math.PI * 2;
    ctx.rotate(rotation ?? lean);
    if (scorched) ctx.filter = 'brightness(0.12)';

    // Legs: thin silver, with red trainers.
    ctx.strokeStyle = '#c8d2d6';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.5;
    for (const side of [1, -1]) {
      const swing = 0.7 * legs * side;
      const knee = { x: Math.sin(swing) * 9 + tuck * 7, y: -10 + tuck * 3 };
      const foot = { x: knee.x + Math.sin(swing - 0.4 * tuck) * 9 - tuck * 6, y: knee.y + 10 - tuck * 6 };
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.stroke();
      ctx.fillStyle = side > 0 ? '#e0483a' : '#c23a2e';
      ctx.beginPath();
      ctx.ellipse(foot.x + 3, foot.y, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The handle, and two little arms pumping.
    ctx.strokeStyle = SILVER;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(0, -40);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1.5, -18);
    ctx.lineTo(-1.5, -38);
    ctx.stroke();
    ctx.strokeStyle = '#c8d2d6';
    ctx.lineWidth = 2.5;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(8 * Math.sin(-legs * side) + 4, -24 - tuck * 8);
      ctx.stroke();
    }
    // The bowl is the head: shiny, with a face of grim determination.
    const bowl = ctx.createRadialGradient(-4, -58, 2, 0, -52, 18);
    bowl.addColorStop(0, '#ffffff');
    bowl.addColorStop(0.5, SILVER);
    bowl.addColorStop(1, '#8fa2a8');
    ctx.fillStyle = bowl;
    ctx.beginPath();
    ctx.ellipse(0, -53, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7d9096';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.filter = 'none';
    const dizzy = spoon.tumble > 0 || (run.stage === 'outro' && run.result === 'failed');
    if (dizzy) {
      text('×', 2, -56, 9, '#24302c', 'center', MONO, 'bold ');
      text('×', 8, -56, 9, '#24302c', 'center', MONO, 'bold ');
    } else {
      const eye = scorched ? '#ffffff' : '#24302c';
      const eyeSize = scorched && time % 1.4 < 0.15 ? 0.6 : 1.8;
      circle(3, -56, eyeSize, eye, 0, true);
      circle(8, -56, eyeSize, eye, 0, true);
      ctx.strokeStyle = '#24302c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1, -60); ctx.lineTo(5, -59);
      ctx.moveTo(10, -60); ctx.lineTo(6, -59);
      ctx.stroke();
    }
    ctx.restore();
    if ((scorched || spoon.smoke > 0) && !reduced()) {
      for (let i = 0; i < 4; i++) {
        const u = (time * 0.65 + i / 4) % 1;
        circle(x - 16 - u * 20, feet - 65 - u * 50, 3 + u * 9, '#b6b8b1', 0, true, 0.35 * (1 - u));
      }
    }
    if (dizzy) {
      // Stars, naturally.
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        text('✦', SPOON_X + Math.cos(a) * 18, GROUND - h - 76 + Math.sin(a) * 5, 11, '#ffe08a');
      }
    }
    if (spoon.action === 'slide') {
      for (let i = 0; i < 4; i++) {
        const u = (time * 3 + i / 4) % 1;
        circle(SPOON_X - 30 - 30 * u, GROUND - 4 - 6 * u, 3 + 4 * u, '#d8d4c0', 0, true, 0.5 * (1 - u));
      }
    }
  }

  // ── Heads-up and cards ─────────────────────────────────────────────────

  function discoveryCard(kind, returning = false) {
    const copy = AERIAL_DISCOVERIES[kind];
    panel(70, 116, W - 140, compact() ? 130 : 98, '#f6dc9a', '#10271ef2');
    const size = compact() ? 29 : 26;
    if (kind === 'orbit' && !returning) {
      text('YOU HAVE LEFT THE', W / 2, 148, size, '#f6dc9a', 'center', MONO, 'bold ');
      text('DESIGNATED SHOPPING AREA.', W / 2, 184, size, '#f6dc9a', 'center', MONO, 'bold ');
    } else {
      text(copy.title, W / 2, 148, size, '#f6dc9a', 'center', SERIF, 'bold ');
      if (compact() && kind !== 'bird') {
        const lines = kind === 'power' ? ['Conductivity was not covered', 'in the instructions.']
          : ['Please remain within walking', 'distance of the store.'];
        lines.forEach((line, i) => text(line, W / 2, 190 + 32 * i, 27, '#e8dcc0'));
      } else text(copy.detail, W / 2, 190, compact() ? 27 : 18, '#e8dcc0');
    }
  }

  function bird(x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    const flap = reduced() ? 12 : Math.sin(t * 8) * 22;
    ctx.strokeStyle = '#e2d6b8';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-72, -16 - flap); ctx.quadraticCurveTo(-38, -44, 0, 0);
    ctx.quadraticCurveTo(40, -42, 74, -16 - flap); ctx.stroke();
    ctx.fillStyle = '#e2d6b8';
    ctx.beginPath(); ctx.ellipse(0, 0, 37, 19, 0, 0, Math.PI * 2); ctx.fill();
    circle(28, -13, 19, '#f1e6cd', 0, true);
    circle(35, -18, 3, '#20352e', 0, true);
    ctx.fillStyle = '#e9af46';
    ctx.beginPath(); ctx.moveTo(44, -14); ctx.lineTo(65, -7); ctx.lineTo(44, -3); ctx.fill();
    ctx.strokeStyle = '#e9af46'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-5, 14); ctx.lineTo(-6, 37); ctx.lineTo(4, 37); ctx.stroke();
    ctx.restore();
  }

  function drawPower(run, feet) {
    const t = run.encounter.time;
    const y = GROUND - run.encounter.height - 54;
    if (t < 1.5) {
      ctx.strokeStyle = '#1b282a'; ctx.lineWidth = 4;
      for (const d of [0, -18]) {
        ctx.beginPath(); ctx.moveTo(-100, y + d - 20); ctx.quadraticCurveTo(W / 2, y + d + 26, W + 100, y + d - 20); ctx.stroke();
      }
      ctx.fillStyle = '#775c43'; ctx.fillRect(600, y - 90, 17, 500);
      ctx.fillRect(557, y - 50, 104, 10);
    }
    if (t < 0.8) {
      text('ZAP!', SPOON_X + 94, feet - 72, 38, '#ffe9a8', 'center', MONO, 'bold ');
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(SPOON_X - 35, feet - 88); ctx.lineTo(SPOON_X - 52, feet - 60);
      ctx.lineTo(SPOON_X - 32, feet - 64); ctx.lineTo(SPOON_X - 44, feet - 34); ctx.stroke();
    }
  }

  function drawOrbit(run) {
    const e = run.encounter;
    const t = e.time;
    const arrival = clamp(t / 1.1, 0, 1);
    const reentry = clamp((t - 3.5) / 1.9, 0, 1);
    const space = reduced() ? 1 : Math.min(arrival, 1 - reentry);
    // Clouds fade into a dark sky, then Earth grows during the return.
    ctx.fillStyle = `rgba(11,20,43,${space})`; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 65; i++) circle(hash(i + 101) * W, hash(i + 305) * 530, 1 + hash(i) * 1.2, '#e8e4d4', 0, true, space);
    const earthY = reduced() ? 1050 : 1300 - 250 * arrival - 230 * reentry;
    circle(W / 2, earthY, 560, '#69bcc3', 0, true);
    circle(W / 2, earthY, 550, '#377baf', 0, true);
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, earthY, 550, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#84a67d';
    ctx.beginPath(); ctx.moveTo(140, earthY - 490); ctx.lineTo(310, earthY - 530);
    ctx.lineTo(440, earthY - 450); ctx.lineTo(370, earthY - 360); ctx.lineTo(300, earthY - 320);
    ctx.lineTo(225, earthY - 390); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(700, earthY - 350, 120, 70, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#edf4e499'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.ellipse(450, earthY - 450, 220, 30, -0.2, 0, Math.PI); ctx.stroke();
    ctx.restore();
    // One satellite, still apparently doing its job.
    const sx = reduced() ? 730 : 830 - t * 28;
    ctx.save(); ctx.translate(sx, 300); ctx.rotate(-0.2);
    ctx.fillStyle = '#bbc7cf'; ctx.fillRect(-18, -12, 36, 24);
    ctx.fillStyle = '#5276aa'; ctx.strokeStyle = '#b6cce2'; ctx.lineWidth = 2;
    for (const dx of [-75, 30]) { ctx.fillRect(dx, -20, 45, 40); ctx.strokeRect(dx, -20, 45, 40); }
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, -34); ctx.stroke(); ctx.restore();
    // A distant teapot. No explanation is forthcoming.
    ctx.save(); ctx.translate(290, 275); ctx.rotate(reduced() ? 0.2 : t * 0.08);
    ctx.fillStyle = '#d7b4b6'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-13, -20, 26, 6); circle(0, -23, 4, '#d7b4b6', 0, true);
    ctx.strokeStyle = '#d7b4b6'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(-24, 0, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(35, -17); ctx.stroke(); ctx.restore();
    const feet = reduced() ? 425 : 510 - 110 * arrival + 220 * reentry ** 2;
    if (reentry > 0) {
      ctx.fillStyle = '#ec8748';
      ctx.beginPath(); ctx.moveTo(W / 2 - 26, feet + 5); ctx.lineTo(W / 2, feet - 130);
      ctx.lineTo(W / 2 + 26, feet + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe39a';
      ctx.beginPath(); ctx.moveTo(W / 2 - 12, feet + 5); ctx.lineTo(W / 2, feet - 80);
      ctx.lineTo(W / 2 + 12, feet + 5); ctx.closePath(); ctx.fill();
      text('NEXT STOP: THE SIDEWALK', W / 2, 690, compact() ? 28 : 20, '#ffe9a8', 'center', MONO);
    }
    drawSpoon(run, run.age, { x: W / 2, feet, rotation: reduced() ? 0.25 : t * 0.75, shadow: false });
  }

  /**
   * The way to the shop, big and wordless along the road (the pills above the
   * canvas count the time, coins, and stumbles). In the last seconds before
   * the shop shuts, a warning in the sky.
   */
  function drawProgress(run, time) {
    const y = H - 24;
    const x0 = 80;
    const x1 = W - 80;
    const u = clamp(run.distance / run.finish, 0, 1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#f1dfbd40';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.strokeStyle = '#f6dc9a';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + (x1 - x0) * u, y);
    ctx.stroke();
    // Home…
    ctx.fillStyle = '#f1dfbd';
    ctx.beginPath();
    ctx.moveTo(x0 - 52, y + 10);
    ctx.lineTo(x0 - 52, y - 4);
    ctx.lineTo(x0 - 38, y - 16);
    ctx.lineTo(x0 - 24, y - 4);
    ctx.lineTo(x0 - 24, y + 10);
    ctx.fill();
    // …and a teacup at the shop.
    ctx.fillStyle = '#f6dc9a';
    ctx.beginPath();
    ctx.moveTo(x1 + 22, y - 10);
    ctx.lineTo(x1 + 50, y - 10);
    ctx.lineTo(x1 + 46, y + 10);
    ctx.lineTo(x1 + 26, y + 10);
    ctx.fill();
    ctx.strokeStyle = '#f6dc9a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x1 + 51, y - 2, 6, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.restore();
    circle(x0 + (x1 - x0) * u, y, 11, SILVER, 0, true);
    circle(x0 + (x1 - x0) * u, y, 11, '#7d9096', 2);
    if (run.stage === 'run' && run.left <= 10) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 8);
      ctx.save();
      ctx.globalAlpha = pulse;
      text(`THE SHOP SHUTS IN ${Math.ceil(run.left)}!`, W / 2, 120, 30, '#ff9a7a', 'center', SERIF, 'bold ');
      ctx.restore();
    }
  }

  function drawIntro(run) {
    const a = clamp(run.time / 0.3, 0, 1);
    if (compact()) {
      ctx.save();
      ctx.globalAlpha = a;
      panel(W / 2 - 420, 210, 840, 310);
      text('RUN TO THE STORE!', W / 2, 248, 38, '#f6dc9a', 'center', SERIF, 'bold ');
      text('JUMP ▲ sugar and puddles', W / 2, 302, 30, '#e8dcc0');
      text('SLIDE ▼ under the coffee', W / 2, 344, 30, '#e8dcc0');
      text('Three stumbles. No cups lost.', W / 2, 398, 28, '#cfe0c4');
      text('Tap JUMP to start', W / 2, 440, 28, '#cfe0c4');
      text(Math.max(1, Math.ceil(R.introTime - run.time)) + '…', W / 2, 486, 32, '#ffe9a8');
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = a;
    panel(CX - 270, 170, 540, 220);
    text('THE TEA RUN', CX, 198, 12, '#bcdbbc', 'center', MONO);
    text('RUN TO THE STORE!', CX, 238, 34, '#f6dc9a', 'center', SERIF, 'bold ');
    text('Jump: Space or ↑   ·   Slide: ↓   ·   or tap JUMP and SLIDE', CX, 280, 14, '#e8dcc0', 'center', MONO);
    text('Hop the sugar and the puddles; duck the coffee.', CX, 306, 16, '#e8dcc0', 'center', SERIF, 'italic ');
    text(`Three stumbles and the errand is off. It can't cost a cup.`, CX, 330, 13, '#cfe0c4', 'center', MONO);
    const count = Math.ceil(R.introTime - run.time);
    text(count > 0 ? `${count}…` : 'GO!', CX, 364, 20, '#ffe9a8', 'center', MONO, 'bold ');
    ctx.restore();
  }

  function drawOutro(run, time) {
    const s = run.summary;
    if (!s) return;
    const a = clamp(run.time / 0.4, 0, 1);
    const won = s.result === 'success';
    if (compact()) {
      ctx.save();
      ctx.globalAlpha = a;
      panel(W / 2 - 420, 210, 840, 330, won ? '#f6dc9a' : '#e88a62');
      text(won ? 'MISSION ACCOMPLISHED!' : 'GONE PEAR-SHAPED.', W / 2, 250, 36, won ? '#f6dc9a' : '#f8c7ae', 'center', SERIF, 'bold ');
      text(won ? 'The tea is safe. Back to the kettle!' : 'The kettle still works. No cups lost.', W / 2, 304, 28, '#e8dcc0');
      text(won ? '+' + s.sugar + ' sugar next cup · +' + s.cash + ' Tea Cash' : 'No restock this time', W / 2, 354, 30, '#cfe0c4');
      text('+' + s.points + ' points · ' + s.hits + ' stumble' + (s.hits === 1 ? '' : 's'), W / 2, 402, 30, '#bcdbbc');
      if (run.time >= R.outroMin) text('JUMP — BACK TO THE TEA', W / 2, 490, 30, '#bad8c9');
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = a;
    panel(CX - 300, 160, 600, 250, won ? '#f6dc9a' : '#e88a62');
    text(won ? 'THE TEA IS SAFE' : 'THE ERRAND', CX, 188, 12, '#bcdbbc', 'center', MONO);
    const title = won ? 'MISSION ACCOMPLISHED!' : 'THE ERRAND HAS GONE PEAR-SHAPED.';
    text(title, CX + (won ? 0 : Math.sin(time * 30) * 0.8), 226, won ? 32 : 24, won ? '#f6dc9a' : '#f8c7ae', 'center', SERIF, 'bold ');
    const joke = won ? 'You bought the tea. You forgot the milk.'
      : s.reason === 'time' ? 'The shop shut. Fortunately, the kettle still works.' : 'Fortunately, the kettle still works.';
    text(joke, CX, 264, 17, '#e8dcc0', 'center', SERIF, 'italic ');
    const lines = [];
    if (won) lines.push(`+${s.sugar} sugar burst next cup`);
    if (s.cash) lines.push(`+${s.cash} Tea Cash`);
    if (s.points) lines.push(`+${s.points} points`);
    if (!won) lines.push('No restock this time · your cups are untouched');
    text(lines.join('  ·  '), CX, 304, 14, '#cfe0c4', 'center', MONO);
    text(`${s.coins} coin${s.coins === 1 ? '' : 's'} · ${s.packets} tea packet${s.packets === 1 ? '' : 's'} · ${s.hits} stumble${s.hits === 1 ? '' : 's'}`,
      CX, 330, 12, '#bcdbbc', 'center', MONO);
    if (run.time >= R.outroMin) {
      ctx.globalAlpha = a * (0.65 + 0.35 * Math.sin(time * 2.5));
      text('ENTER OR JUMP — BACK TO THE TEA', CX, 380, 12, '#bad8c9', 'center', MONO);
    }
    ctx.restore();
  }

  function drawPaused() {
    ctx.save();
    ctx.fillStyle = 'rgba(12,27,24,.55)';
    ctx.fillRect(0, 0, W, H);
    if (compact()) {
      panel(W / 2 - 390, 220, 780, 170, '#c2dbb3');
      text('Catch your breath', W / 2, 265, 38, '#f5dfb6');
      text('Resume with P or the main button', W / 2, 334, 28, '#bad8c9');
      ctx.restore();
      return;
    }
    panel(CX - 220, 220, 440, 130, '#c2dbb3');
    text('THE ERRAND IS PAUSED', CX, 256, 14, '#d3e9d9', 'center', MONO);
    text('Catch your breath', CX, 292, 28, '#f5dfb6');
    text('Press P to continue', CX, 326, 13, '#bad8c9', 'center', MONO);
    ctx.restore();
  }

  // ── The Tea Shortage, over the cup ─────────────────────────────────────

  /** An empty tea tin, lid off, one sad leaf at the bottom. */
  function drawTin(x, y, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.06 * Math.sin(time * 2.2));
    ctx.fillStyle = '#c84a3a';
    roundRect(-34, -40, 68, 80, 8);
    ctx.fill();
    ctx.fillStyle = '#e9c46a';
    ctx.fillRect(-34, -14, 68, 22);
    text('TEA', 0, -3, 15, '#5a2a1a', 'center', MONO, 'bold ');
    ctx.fillStyle = '#2a1712';
    ctx.beginPath();
    ctx.ellipse(0, -40, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The lid, rolling away in despair.
    ctx.save();
    ctx.translate(x + 64, y + 30);
    ctx.rotate(time * 0.8);
    circle(0, 0, 16, '#e9c46a', 0, true);
    circle(0, 0, 16, '#a8862e', 2);
    ctx.restore();
  }

  function drawShortage(shortage, state, time) {
    const t = shortage.time;
    const a = clamp(t / 0.35, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12,27,24,.72)';
    ctx.fillRect(0, 0, W, H);
    panel(CX - 300, CY - 250, 600, 300, '#e88a62');
    const shake = t < 1 ? Math.sin(t * 60) * 3 * (1 - t) : 0;
    text('DISASTER!', CX + shake, CY - 212, 30, '#ff9a7a', 'center', SERIF, 'bold ');
    text('THE TEA TIN IS EMPTY!', CX, CY - 172, 26, '#f6dc9a', 'center', SERIF, 'bold ');
    text('Someone forgot to put tea on the shopping list.', CX, CY - 138, 16, '#e8dcc0', 'center', SERIF, 'italic ');
    drawTin(CX - 20, CY - 60, time);
    const price = CONFIG.shortage.teaPrice;
    text(`TEA CASH ${state.teaCash}  ·  A TIN COSTS ${price}`, CX, CY + 22, 13, '#f2c94c', 'center', MONO, 'bold ');
    ctx.restore();
    // The choice is made with the buttons beneath (or 1 / 2 / 3).
  }

  return {
    /** Draw the whole errand scene. */
    drawRun(run, state, time, paused) {
      time = run.age; // all runner animation freezes while paused, including scenery
      const e = run.encounter;
      let height = spoonHeight(run.spoon);
      let camera = run.camera;
      let carry = 0;
      if (e && e.kind !== 'orbit') {
        const duration = R.aerial[e.kind].duration;
        const drop = clamp((e.time - duration + 1) / 1, 0, 1);
        height = e.height * (1 - drop * drop);
        const follow = clamp(e.time / 0.4, 0, 1);
        camera = e.camera + (Math.max(0, height - 115) - e.camera) * follow;
        carry = e.kind === 'bird' ? 110 * Math.sin(clamp((e.time - 1) / 2.6, 0, 1) * Math.PI) : 0;
      }
      if (e?.kind === 'orbit') camera = e.camera * (1 - clamp((e.time - 4.4) / 0.6, 0, 1));
      drawSky(time);
      ctx.save();
      ctx.translate(0, camera * 0.25);
      drawClouds(run.distance);
      drawFarRow(run.distance);
      ctx.restore();
      ctx.save();
      ctx.translate(SPOON_X, GROUND);
      ctx.scale(ZOOM, ZOOM);
      ctx.translate(-SPOON_X, -GROUND);
      ctx.translate(0, camera);
      drawStreet(run.distance, time);
      drawPaving(run.distance);
      drawTeaShop(run, time);
      drawPickups(run, time);
      drawObstacles(run, time);
      if (!(run.stage === 'outro' && run.result === 'success') && e?.kind !== 'orbit') {
        drawSpoon(run, time, { x: SPOON_X + carry, feet: GROUND - height, scorched: e?.kind === 'power' });
      }
      if (e?.kind === 'bird') {
        const approach = clamp(e.time / 0.9, 0, 1);
        const bx = SPOON_X + carry + (1 - approach) * 700;
        bird(bx, GROUND - height - 105, time);
        if (e.time > 0.55 && e.time < 1.4) text('?', bx + 70, GROUND - height - 145, 34, '#ffe9a8');
      }
      if (e?.kind === 'power') drawPower(run, GROUND - height);
      const feedback = run.feedback;
      if (!e && feedback && time - feedback.at < 0.28) {
        const u = (time - feedback.at) / 0.28;
        circle(SPOON_X, GROUND - height - 12, reduced() ? 22 : 14 + u * 30,
          feedback.success ? '#ffe9a8' : '#bac1b5', 2, false, 1 - u);
      }
      ctx.restore();
      if (e?.kind === 'orbit') {
        ctx.save();
        ctx.globalAlpha = reduced() ? 1 : Math.min(1, e.time / 0.6, (R.aerial.orbit.duration - e.time) / 0.4);
        drawOrbit(run);
        ctx.restore();
      }
      if (e?.kind === 'power' && e.time < 0.35 && !reduced()) {
        // One soft tint, never a strobe; bolt and silhouette also explain the zap.
        ctx.fillStyle = `rgba(255,233,168,${0.13 * Math.sin(Math.PI * e.time / 0.35)})`;
        ctx.fillRect(0, 0, W, H);
      }
      drawProgress(run, time);
      if (e) discoveryCard(e.kind);
      else if (run.notice) discoveryCard(run.notice.kind, true);
      if (run.stage === 'intro') drawIntro(run);
      if (run.stage === 'outro') drawOutro(run, time);
      if (paused) drawPaused();
      if (!highQuality()) return;
      // A soft vignette, as on the cup.
      const v = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 640);
      v.addColorStop(0, '#00000000');
      v.addColorStop(1, '#00000044');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },
    drawShortage,
  };
}
