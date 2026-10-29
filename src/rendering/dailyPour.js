// Original Canvas scenery. Every moving object reads the paused simulation
// clock; this painter owns no route, collisions, random draws, or rewards.
import { CONFIG } from '../config.js';
import { PEDESTRIAN_LINE, pedestrianRemark } from '../gameplay/dailyPour.js';

const P = CONFIG.dailyPour;
const W = CONFIG.arena.width;
const H = CONFIG.arena.height;
const INK = '#163b36';
const CREAM = '#fff1cb';
const COLORS = ['#d29b70', '#8fa997', '#c8ad74', '#b7a3ac'];

export function createPourPainter(ctx, { compact = () => false } = {}) {
  const fontSize = (large, small) => compact() ? large : small;
  function text(s, x, y, size = 22, color = INK, family = 'Georgia', weight = 'bold') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function box(x, y, w, h, color, radius = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }
  function ellipse(x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function line(points, color, width = 3) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  function paper(x, y, rotation, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale, scale);
    box(-16, -10, 32, 20, CREAM, 2);
    line([[-11, -5], [11, -5]], INK, 2);
    for (const offset of [0, 4]) line([[-11, offset], [8, offset]], '#698271', 1);
    ctx.restore();
  }
  function tree(x, y, size = 1) {
    box(x - 4, y - 58 * size, 8, 58 * size, '#665c43');
    ellipse(x, y - 72 * size, 34 * size, 45 * size, '#66896c');
    ellipse(x - 13 * size, y - 78 * size, 22 * size, 30 * size, '#7d9a70');
  }
  function scenery(m) {
    const sky = ctx.createLinearGradient(0, 0, 0, 550);
    sky.addColorStop(0, '#a4c8bb'); sky.addColorStop(1, '#f2e4bb');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ellipse(785, 177, 44, 44, '#ffedb2');
    for (let i = -1; i < 9; i++) {
      const x = i * 170 - (m.distance * 0.13) % 170;
      box(x, 250, 120, 160, '#85a79a');
      tree(x + 140, 390, 1.4);
    }
    box(0, 375, W, 133, '#99ad79');
    box(0, 494, W, 44, '#cfceb0');
    box(0, 532, W, 8, '#f7e8c5');
    box(0, 540, W, 168, '#47615a');
    box(0, 706, W, 84, '#2c4a42');
    for (let x = -m.distance % 120; x < W; x += 120) {
      line([[x, 496], [x - 10, 532]], '#9caa90', 2);
      box(x, 661, 48, 4, '#e7dbaa', 1);
    }
  }
  function target(x, y, active, label, delivered, radius) {
    ctx.strokeStyle = delivered ? '#fff4cf' : active ? '#ffe08a' : '#426852';
    ctx.lineWidth = active ? 5 : 2;
    ctx.beginPath(); ctx.ellipse(x, y, radius, active ? 20 : 15, 0, 0, Math.PI * 2); ctx.stroke();
    if (active || delivered) {
      box(x - 65, y - 58, 130, 27, INK, 5);
      text(delivered ? 'DELIVERED ✓' : label, x, y - 44, 18, CREAM, 'sans-serif');
    }
  }
  function dog(x, m, h) {
    const happy = h.dogAt !== null && m.age - h.dogAt < 2;
    const bounce = happy ? -22 * Math.sin(Math.min(1, (m.age - h.dogAt) / 0.6) * Math.PI) : 0;
    const y = P.targets.near.y + bounce;
    ellipse(x, y - 13, 25, 16, '#aa744c');
    ellipse(x + 21, y - 28, 14, 15, '#c99362');
    ellipse(x + 12, y - 39, 7, 12, '#684a35');
    ellipse(x + 26, y - 29, 2, 2, INK);
    line([[x - 17, y - 9], [x - 18, y + 6]], '#684a35', 5);
    line([[x + 10, y - 8], [x + 10, y + 6]], '#684a35', 5);
    line([[x - 21, y - 19], [x - 34, y - 32 - 5 * Math.sin(m.age * 9)]], '#aa744c', 6);
    if (happy) paper(x + 31, y - 14, 0.1, 0.7);
    else text('WOOF?', x, y + 30, 17, INK, 'sans-serif');
  }
  function house(h, m) {
    const x = P.riderX + h.x - m.distance;
    if (x < -180 || x > W + 180) return;
    const shake = h.windowAt !== null && m.age - h.windowAt < 0.6 ? Math.sin(m.age * 55) * 5 : 0;
    const wall = COLORS[h.color];
    tree(x + 139, 414, 0.85);
    box(x - 104, 243, 208, 146, wall, 3);
    ctx.fillStyle = '#52695c'; ctx.beginPath();
    ctx.moveTo(x - 119, 248);
    if (h.roof) { ctx.lineTo(x - 70, 196); ctx.lineTo(x + 70, 196); }
    else ctx.lineTo(x, 183);
    ctx.lineTo(x + 119, 248); ctx.closePath(); ctx.fill();
    box(x - 71, 271, 44, 49, '#365a52', 2);
    line([[x - 49, 272], [x - 49, 319]], '#d9d9b7', 2);
    line([[x - 70, 293], [x - 28, 293]], '#d9d9b7', 2);
    box(x + 36, 270, 39, 48, '#365a52', 2);
    box(x - 19, 287, 38, 91, '#3a5347', 2);
    ellipse(x + 10, 333, 3, 3, '#f5d494');
    // Subscribers' far landing pad is a porch; non-subscribers have a low window.
    if (h.subscriber) {
      box(x - 38, 335, 76, 14, '#d9c7a4', 2);
      box(x - 45, 352, 90, 11, '#b6a685', 2);
    } else {
      box(x - 29 + shake, 313, 58, 44, '#e4ce97', 2);
      if (h.windowAt === null) {
        box(x - 24, 318, 48, 34, '#9dc6b5');
        line([[x, 318], [x, 352]], CREAM, 2);
      } else {
        ellipse(x + shake, 334, 12, 13, '#e6b990');
        line([[x - 9, 328], [x - 3, 331]], INK, 2);
        line([[x + 9, 328], [x + 3, 331]], INK, 2);
        text('!', x + 38, 325, 30, INK);
      }
    }
    box(x - 40, 390, 80, 16, INK, 3);
    text(h.subscriber ? `No. ${12 + h.id * 2}` : 'NO PAPER', x, 398, 16, CREAM, 'sans-serif');
    // Mailbox centre is the same world x as the porch: aim changes depth only.
    box(x - 4, 452, 8, 39, '#756750');
    box(x - 25, 433, 50, 24, '#426f68', 10);
    line([[x + 14, 438], [x + 14, 416], [x + 30, 416]], '#c66c4c', 4);
    if (h.subscriber) target(x, P.targets[h.aim].y, !h.delivered, h.aim === 'near' ? 'MAILBOX ↓' : 'PORCH ↑', h.delivered, h.radius);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) box(x + side * (70 + i * 15) - 4, 426, 8, 43, '#d6d7b5', 3);
      line([[x + side * 68, 438], [x + side * 110, 438]], '#d6d7b5', 4);
    }
    if (h.dog) dog(x, m, h);
    if (h.gnome) {
      const gx = x - 75;
      ctx.fillStyle = '#b94f3c'; ctx.beginPath(); ctx.moveTo(gx - 12, 400); ctx.lineTo(gx, 369); ctx.lineTo(gx + 12, 400); ctx.fill();
      ellipse(gx, 407, 10, 11, '#ebd4b4');
      box(gx - 10, 418, 20, 22, '#486c8c', 3);
      ellipse(gx + (x < P.riderX ? 4 : -4), 407, 2, 2, INK);
    }
    if (h.deliveredAt !== null && m.age - h.deliveredAt < 1.4) text(`+${P.deliveryPoints}`, x, P.targets[h.aim].y - 80, 28, INK);
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
  // A bystander on the sidewalk who turns to follow the spoon. Not a target.
  function pedestrian(m) {
    const { x: worldX, since, speaking } = pedestrianRemark(m);
    const x = P.riderX + worldX - m.distance;
    if (x < -60 || x > W + 60) return;
    const noticed = since >= 0;
    const look = noticed ? Math.max(-1, Math.min(1, (P.riderX - x) / 120)) * Math.min(1, since / 0.25) : 0;
    const y = Math.sin(m.age * 2.2) * 1.2;
    ellipse(x, 527, 22, 5, '#193e3633');
    line([[x - 6, 486], [x - 8, 524]], '#3d4f5c', 6);
    line([[x + 6, 486], [x + 8, 524]], '#3d4f5c', 6);
    ellipse(x - 10, 525, 7, 3.5, INK); ellipse(x + 10, 525, 7, 3.5, INK);
    ctx.fillStyle = '#8c5a7a'; ctx.beginPath();
    ctx.moveTo(x - 13, 446 + y); ctx.lineTo(x + 13, 446 + y); ctx.lineTo(x + 18, 492); ctx.lineTo(x - 18, 492);
    ctx.closePath(); ctx.fill();
    line([[x, 448 + y], [x, 490]], '#6f465f', 2);
    const side = look < 0 ? -1 : 1;
    // Speaking, the near arm points at the spoon; otherwise both hang.
    line([[x + side * 12, 452 + y], speaking ? [x + side * 34, 440 + y] : [x + side * 17, 484]], '#8c5a7a', 6);
    line([[x - side * 12, 452 + y], [x - side * 17, 484]], '#8c5a7a', 6);
    ellipse(x + side * (speaking ? 37 : 17), (speaking ? 439 : 487) + y, 4, 4, '#e9c9a3');
    const hx = x + look * 3;
    const hy = 430 + y;
    ellipse(hx, hy, 12, 13, '#e9c9a3');
    ellipse(hx - side * 11, hy + 1, 3, 4, '#d9b48c');
    box(hx - 13, hy - 15, 26, 7, '#3a5347', 3);
    ellipse(hx + look * 9, hy - 9, 10, 3, '#3a5347');
    const blink = since > 0.35 && since < 0.47;
    for (const ex of [-4.5, 4.5]) {
      const eye = hx + ex + look * 3;
      if (blink) line([[eye - 2.5, hy - 1], [eye + 2.5, hy - 1]], INK, 1.5);
      else ellipse(eye, hy - 1, speaking ? 2.4 : 1.6, speaking ? 2.8 : 1.6, INK);
      // Raised, then slightly uneven: the face of someone reconsidering anatomy.
      const lift = speaking ? (ex < 0 ? 5 : 3.5) : 2.5;
      line([[eye - 3, hy - 3.5 - lift], [eye + 3, hy - 4 - lift]], INK, 1.5);
    }
    if (speaking) ellipse(hx + look * 3, hy + 6, 2.5, 3.2, '#6f3d3d');
    else line([[hx - 3 + look * 3, hy + 6], [hx + 3 + look * 3, hy + 6]], INK, 1.5);
    if (since >= -0.6 && since < 0) text('?', hx + 20, hy - 22, 26, INK);
  }
  function speech(m) {
    const { x: worldX, since, speaking } = pedestrianRemark(m);
    if (!speaking) return;
    const size = fontSize(27, 19);
    const lead = Math.round(size * 1.18);
    ctx.font = `bold ${size}px Georgia`;
    const lines = wrap(PEDESTRIAN_LINE, fontSize(232, 165));
    const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 28;
    const h = lines.length * lead + 20;
    const x = P.riderX + worldX - m.distance;
    // Centred over the bystander, clamped to the screen; the tail keeps pointing at them.
    const cx = Math.max(12 + w / 2, Math.min(W - 12 - w / 2, x));
    const bottom = 398;
    const top = bottom - h;
    ctx.save();
    ctx.globalAlpha = Math.min(1, since / 0.15, (P.pedestrian.speech - since) / 0.3);
    const tip = Math.max(cx - w / 2 + 14, Math.min(cx + w / 2 - 14, x));
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(cx - w / 2, top, w, h, 14); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tip - 10, bottom - 2); ctx.lineTo(Math.max(-20, x) + 2, 412); ctx.lineTo(tip + 8, bottom - 2);
    ctx.fill(); ctx.stroke();
    box(tip - 11, bottom - 5, 21, 6, '#fffaf0');
    lines.forEach((s, i) => text(s, cx, top + 10 + lead * (i + 0.5), size, INK));
    ctx.restore();
  }
  function bicycle(m) {
    const t = m.age;
    ctx.save(); ctx.translate(P.riderX, Math.sin(t * 11) * 2);
    ellipse(3, 637, 90, 8, '#193e3655');
    for (const x of [-43, 51]) {
      ellipse(x, 610, 31, 31, '#183b34');
      ellipse(x, 610, 25, 25, '#adc3ad');
      for (let i = 0; i < 8; i++) {
        const a = t * 9 + i * Math.PI / 4;
        line([[x, 610], [x + Math.cos(a) * 25, 610 + Math.sin(a) * 25]], '#4b7167', 1.5);
      }
    }
    line([[-43, 610], [-14, 569], [8, 606], [-43, 610], [39, 571], [8, 606]], '#e0b365', 5);
    line([[51, 610], [35, 550], [48, 548]], '#e0b365', 5);
    line([[-25, 567], [-4, 567]], '#1d3933', 6);
    // Newspaper pannier and an entirely unqualified employee.
    box(-72, 551, 38, 35, '#8e6751', 5);
    for (let i = 0; i < Math.min(4, m.papers); i++) paper(-54, 548 - i * 5, -0.13, 0.8);
    const pedal = [8 + Math.cos(t * 10) * 15, 598 + Math.sin(t * 10) * 15];
    line([[-12, 557], [10, 579], pedal], '#d7e1db', 6);
    line([[pedal[0] - 6, pedal[1]], [pedal[0] + 6, pedal[1]]], INK, 4);
    const silver = ctx.createLinearGradient(-25, 0, 10, 0);
    silver.addColorStop(0, '#7b9995'); silver.addColorStop(0.5, '#f5fbeb'); silver.addColorStop(1, '#91a9a0');
    line([[-18, 518], [-12, 560]], silver, 9);
    ctx.save(); ctx.translate(-21, 496); ctx.rotate(-0.16);
    ellipse(0, 0, 16, 25, silver);
    ellipse(-2, -3, 9, 17, '#c5d7ce');
    line([[-8, -12], [-10, -3]], '#f6fff4', 2); ctx.restore();
    line([[-15, 536], [8, 549], [38, 550]], '#d7e1db', 5);
    ellipse(35, 545, 5, 3, '#f5cf75');
    ctx.restore();
  }
  function overlay(m, paused) {
    const big = fontSize(36, 32);
    const small = fontSize(27, 22);
    if (paused || m.stage !== 'play') {
      box(68, 150, 784, m.stage === 'outro' ? 325 : 300, '#fff0cceF', 14);
      line([[90, 163], [830, 163]], INK, 3);
      if (paused) {
        text('TEA BREAK. NEWS CAN WAIT.', 460, 245, big);
        text('Resume with P or the Resume button.', 460, 315, small);
      } else if (m.stage === 'intro') {
        text('THE DAILY POUR', 460, 207, fontSize(48, 44));
        text('The spoon has a paper route. Nobody knows why.', 460, 259, small);
        text('↑ PORCH    ↓ MAILBOX    SPACE: THROW', 460, 313, small, INK, 'sans-serif');
        text('Match the marked target to your landing ring.', 460, 355, small);
        text('AIM / THROW on touch · Enter to ring the bell', 460, 399, small);
      } else {
        text(m.summary.title, 460, 210, big);
        text(`${m.delivered} / ${m.scheduled} subscribers informed`, 460, 268, small);
        text(`+${m.summary.points} points · +${m.summary.cash} Tea Cash`, 460, 316, small);
        text(m.summary.success ? 'The kettle remains your primary employer.' : 'Sidewalk readership is at an all-time high.', 460, 361, small);
        text(m.headline, 460, 421, fontSize(25, 20), '#53715e', 'sans-serif');
      }
    } else {
      const aim = P.targets[m.aim];
      const x = P.riderX + aim.ahead;
      ctx.save(); ctx.setLineDash([7, 7]);
      line([[P.riderX + 15, P.releaseY], [x, aim.y]], '#ffe5a577', 2);
      ctx.restore();
      ctx.strokeStyle = '#fff0b7'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, aim.y, 29, 0, Math.PI * 2); ctx.stroke();
      line([[x - 37, aim.y], [x + 37, aim.y]], '#fff0b7', 2);
      box(180, 124, 560, 47, INK, 7);
      text(`${m.aim === 'near' ? '↓ MAILBOX' : '↑ PORCH'}  ·  ${m.papers ? m.cooldown > 0 ? 'FOLDING…' : 'SPACE: THROW' : 'BAG EMPTY'}`, 460, 148, fontSize(29, 23), CREAM, 'sans-serif');
      if (m.feedback && m.age - m.feedback.at < 2.2) {
        box(40, 680, 840, 44, '#fff0cced', 6);
        text(m.feedback.text, 460, 702, fontSize(27, 23));
      }
    }
    box(85, 747, 750, 8, '#738a6d', 4);
    box(85, 747, 750 * m.clock / P.duration, 8, '#f5d18a', 4);
    text(`PAPER ROUTE  ·  ${Math.round(100 * m.clock / P.duration)}%  ·  GOAL ${Math.ceil(m.scheduled * P.successRatio)}/${m.scheduled}`, 460, 776, fontSize(25, 19), CREAM, 'sans-serif');
  }
  return {
    draw(m, paused = false) {
      scenery(m);
      m.houses.forEach((h) => house(h, m));
      pedestrian(m);
      speech(m);
      bicycle(m);
      for (const p of m.flights) {
        const u = Math.min(1, p.elapsed / p.duration);
        const x = P.riderX + p.start + (p.x - p.start) * u - m.distance;
        let y = P.releaseY + (P.targets[p.aim].y - P.releaseY) * u - 115 * Math.sin(u * Math.PI);
        if (p.landed && p.outcome === 'miss') y += (525 - y) * Math.min(1, (p.elapsed - p.duration) / 0.15);
        const bounce = p.landed ? Math.sin(Math.min(1, (p.elapsed - p.duration) / 0.3) * Math.PI) * 15 : 0;
        if (!p.landed || p.outcome === 'miss') paper(x, y - bounce, p.elapsed * 7, 1.1);
      }
      overlay(m, paused);
    },
  };
}
