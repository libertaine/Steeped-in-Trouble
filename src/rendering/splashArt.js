// Procedural 1980s retro arcade pixel-art centerpiece for the title screen.
// Depicts a blue-and-white porcelain teacup with swirling amber tea,
// defended by a determined, slightly irritated silver spoon against mischievous tea leaves.

const TAU = Math.PI * 2;

/**
 * Draws the 80s arcade splash centerpiece onto the given canvas.
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean} true if drawn successfully
 */
export function drawArcadeCenterpiece(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);

  // 1. Dark navy-purple arcade backdrop
  const bgGrad = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.5, w * 0.6);
  bgGrad.addColorStop(0, '#1c133a');
  bgGrad.addColorStop(0.55, '#0e0a22');
  bgGrad.addColorStop(1, '#060410');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Retro background grid lines (arcade perspective)
  ctx.strokeStyle = '#251b4d33';
  ctx.lineWidth = 1;
  for (let x = 16; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 16; y < h; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Distant glowing arcade sparkles / stars
  const stars = [
    [40, 36, '#00e5ff'], [360, 48, '#ff2a85'], [75, 70, '#ffd700'],
    [330, 90, '#00e5ff'], [50, 190, '#ffd700'], [355, 210, '#ff2a85'],
    [90, 240, '#00e5ff'], [320, 235, '#ffd700'],
  ];
  for (const [sx, sy, col] of stars) {
    ctx.fillStyle = col;
    ctx.fillRect(sx, sy, 2, 2);
    ctx.fillRect(sx - 1, sy, 4, 1);
    ctx.fillRect(sx, sy - 1, 1, 4);
  }

  // Teacup geometry center
  const cx = Math.round(w / 2);
  const cy = Math.round(h * 0.58);
  const rx = Math.round(w * 0.35); // ~140px
  const ry = Math.round(h * 0.21); // ~58px

  // 2. Saucer beneath the teacup
  ctx.fillStyle = '#1e293b66';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.85 + 24, rx * 1.08, ry * 0.45, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.85 + 20, rx * 1.05, ry * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Saucer inner blue trim
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.85 + 20, rx * 0.85, ry * 0.32, 0, 0, TAU);
  ctx.stroke();

  // 3. Porcelain cup outer body
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.bezierCurveTo(cx + rx * 0.95, cy + ry * 1.5, cx + rx * 0.6, cy + ry * 1.85, cx, cy + ry * 1.85);
  ctx.bezierCurveTo(cx - rx * 0.6, cy + ry * 1.85, cx - rx * 0.95, cy + ry * 1.5, cx - rx, cy);
  ctx.closePath();

  // Cup porcelain gradient
  const cupGrad = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy + ry * 1.5);
  cupGrad.addColorStop(0, '#cbd5e1');
  cupGrad.addColorStop(0.2, '#f8fafc');
  cupGrad.addColorStop(0.7, '#f1f5f9');
  cupGrad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = cupGrad;
  ctx.fill();

  // Porcelain exterior cobalt-blue ornamental decorations (willow pattern style)
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  // Central blue swirl motif
  ctx.beginPath();
  ctx.arc(cx, cy + ry * 1.1, 14, 0, Math.PI * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - rx * 0.45, cy + ry * 0.9, 10, -0.4, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + rx * 0.45, cy + ry * 0.9, 10, 0, Math.PI * 1.4);
  ctx.stroke();

  // Cup foot ring
  ctx.strokeStyle = '#ffd700'; // gold base rim
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 1.85, rx * 0.42, 6, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Cup Handle (right side)
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(cx + rx + 14, cy + 18, 16, 26, 0.25, -Math.PI * 0.4, Math.PI * 0.65);
  ctx.stroke();
  ctx.strokeStyle = '#1e40af';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx + rx + 14, cy + 18, 16, 26, 0.25, -Math.PI * 0.4, Math.PI * 0.65);
  ctx.stroke();

  // 4. Teacup Rim & Swirling Amber Tea
  // Outer rim porcelain lip
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#ffd700'; // gold arcade accent on rim
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Cobalt blue Greek fret / wave pattern on porcelain rim
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 3, ry - 3, 0, 0, TAU);
  ctx.stroke();

  // Inner tea basin (clipping area)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, rx - 7, ry - 6, 0, 0, TAU);
  ctx.clip();

  // Swirling amber tea base
  const teaGrad = ctx.createRadialGradient(cx + 8, cy - 4, 8, cx, cy + 6, rx * 0.95);
  teaGrad.addColorStop(0, '#d97706'); // bright amber center
  teaGrad.addColorStop(0.35, '#b45309'); // rich tea amber
  teaGrad.addColorStop(0.75, '#78350f'); // deep copper
  teaGrad.addColorStop(1, '#3a1700'); // dark rim depth
  ctx.fillStyle = teaGrad;
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2 + 10);

  // Swirling tea whirlpool eddies and currents
  ctx.strokeStyle = '#f59e0b88';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy + 2, rx * 0.65, ry * 0.58, -0.2, 0.4, Math.PI * 1.8);
  ctx.stroke();

  ctx.strokeStyle = '#fbbf24aa';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(cx - 4, cy + 4, rx * 0.42, ry * 0.38, 0.3, 0.1, Math.PI * 1.6);
  ctx.stroke();

  ctx.strokeStyle = '#fde68aee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, rx * 0.22, ry * 0.22, -0.4, 0, Math.PI * 1.5);
  ctx.stroke();

  // Tea foam bubbles
  ctx.fillStyle = '#fef3c7';
  const bubbles = [[cx - 45, cy + 6, 3], [cx + 36, cy - 8, 2.5], [cx - 18, cy + 16, 2], [cx + 62, cy + 8, 3]];
  for (const [bx, by, br] of bubbles) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // 5. Mischievous Tea Leaves
  function drawLeaf(lx, ly, angle, scale, mood = 'grin') {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    // Leaf shadow
    ctx.fillStyle = '#1e100588';
    ctx.beginPath();
    ctx.ellipse(2, 4, 14, 7, 0, 0, TAU);
    ctx.fill();

    // Leaf body
    ctx.fillStyle = '#15803d'; // deep forest green
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(14, -6, 12, 12);
    ctx.quadraticCurveTo(0, 18, -12, 12);
    ctx.quadraticCurveTo(-14, -6, 0, -18);
    ctx.closePath();
    ctx.fill();

    // Leaf highlight side
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(12, -6, 10, 12);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();

    // Leaf center vein
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, 14);
    ctx.stroke();

    // Mischievous facial expression
    if (mood === 'grin') {
      // Slanted mischievous eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, -4, 4, 3);
      ctx.fillRect(2, -4, 4, 3);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-4, -3, 2, 2);
      ctx.fillRect(4, -3, 2, 2);
      // Cheeky toothy grin
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 2, 5, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, 3, 2, 2); // tiny sharp tooth!
    } else if (mood === 'wink') {
      // One wink, one wide open
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, -2);
      ctx.lineTo(-2, -4);
      ctx.stroke(); // wink
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(2, -4, 4, 3);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(4, -3, 2, 2);
      // Grinning smirk
      ctx.beginPath();
      ctx.arc(0, 3, 4, 0.1, Math.PI * 0.9);
      ctx.stroke();
    } else {
      // Angry determined leaf
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, -3, 3, 3);
      ctx.fillRect(3, -3, 3, 3);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-5, -2, 2, 2);
      ctx.fillRect(3, -2, 2, 2);
      // Brows down
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -5); ctx.lineTo(-3, -3);
      ctx.moveTo(7, -5); ctx.lineTo(3, -3);
      ctx.moveTo(-4, 4); ctx.lineTo(4, 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw 4 mischievous tea leaves swarming the rim
  drawLeaf(cx - rx * 0.72, cy - 6, -0.45, 1.05, 'grin'); // Leaf 1: jumping at left rim
  drawLeaf(cx - rx * 0.28, cy + 18, 0.35, 0.9, 'wink'); // Leaf 2: emerging center-left
  drawLeaf(cx + rx * 0.65, cy - 2, 0.5, 1.0, 'angry'); // Leaf 3: charging right rim
  drawLeaf(cx + rx * 0.25, cy + 24, -0.2, 0.82, 'grin'); // Leaf 4: splashing forward

  // 6. The Determined, Slightly Irritated Silver Spoon
  const spX = cx + 8;
  const spY = cy - 28;

  ctx.save();
  ctx.translate(spX, spY);
  ctx.rotate(-0.16); // poised defensively, angled slightly left toward the horde

  // Spoon handle extending down into the cup
  const handleGrad = ctx.createLinearGradient(-5, 0, 5, 0);
  handleGrad.addColorStop(0, '#64748b');
  handleGrad.addColorStop(0.35, '#f8fafc');
  handleGrad.addColorStop(0.7, '#cbd5e1');
  handleGrad.addColorStop(1, '#475569');
  ctx.fillStyle = handleGrad;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, 28);
  ctx.lineTo(-4, 75);
  ctx.quadraticCurveTo(0, 82, 4, 75);
  ctx.lineTo(6, 28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Spoon bowl (main face of the spoon)
  const bowlW = 32;
  const bowlH = 44;
  const bowlGrad = ctx.createRadialGradient(-6, -10, 4, 0, 0, bowlW * 1.1);
  bowlGrad.addColorStop(0, '#ffffff'); // bright silver glint
  bowlGrad.addColorStop(0.25, '#f1f5f9');
  bowlGrad.addColorStop(0.65, '#cbd5e1');
  bowlGrad.addColorStop(0.9, '#94a3b8');
  bowlGrad.addColorStop(1, '#475569'); // dark metallic bevel

  ctx.fillStyle = bowlGrad;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, bowlW, bowlH, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Inner bowl bevel rim
  ctx.strokeStyle = '#ffffffbb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(-2, -2, bowlW - 4, bowlH - 4, 0, 0, TAU);
  ctx.stroke();

  // Humorous expressive face on the spoon:
  // Slanted determined / exasperated eyebrows (\  /)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  // Left brow: slants down inwards
  ctx.beginPath();
  ctx.moveTo(-16, -16);
  ctx.lineTo(-4, -10);
  ctx.stroke();
  // Right brow: slants down inwards
  ctx.beginPath();
  ctx.moveTo(16, -16);
  ctx.lineTo(4, -10);
  ctx.stroke();

  // Wide, alert eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-10, -5, 6, 8, 0, 0, TAU);
  ctx.ellipse(10, -5, 6, 8, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Dark pupils glaring sharply at the incoming leaves (looking left and down)
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(-12, -4, 3.2, 0, TAU);
  ctx.arc(8, -4, 3.2, 0, TAU);
  ctx.fill();
  // Eye glints
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-13, -6, 2, 2);
  ctx.fillRect(7, -6, 2, 2);

  // Determined, slightly irritated straight grimace with tiny twitch
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-9, 14);
  ctx.lineTo(9, 13);
  ctx.lineTo(12, 11); // tiny irritated curl
  ctx.stroke();

  // Glint star on spoon top left (✦)
  ctx.fillStyle = '#ffffff';
  const gx = -22;
  const gy = -26;
  ctx.fillRect(gx - 4, gy, 9, 1.5);
  ctx.fillRect(gx, gy - 4, 1.5, 9);
  ctx.fillRect(gx - 1.5, gy - 1.5, 3, 3);

  // Sweat drop of exasperation on temple
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(19, -8, 3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, -8);
  ctx.lineTo(19, -14);
  ctx.lineTo(22, -8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // 7. Defensive Steam Puffs emitted by the spoon toward the leaves
  const steamClouds = [
    [spX - 32, spY - 14, 11, 0.75],
    [spX - 52, spY - 8, 15, 0.65],
    [spX - 74, spY - 2, 19, 0.55],
    [spX - 98, spY + 8, 22, 0.45],
    [spX + 38, spY - 18, 10, 0.65],
  ];
  for (const [sx, sy, sr, alpha] of steamClouds) {
    ctx.fillStyle = `rgba(224, 242, 254, ${alpha})`;
    ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // 8. 80s Arcade corner accents (gold & magenta pixel brackets)
  const pad = 10;
  const len = 18;
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3;
  // Top-left
  ctx.beginPath(); ctx.moveTo(pad, pad + len); ctx.lineTo(pad, pad); ctx.lineTo(pad + len, pad); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(w - pad - len, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + len); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(pad, h - pad - len); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + len, h - pad); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(w - pad - len, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - len); ctx.stroke();

  // Magenta inner corner notches
  ctx.strokeStyle = '#ff2a85';
  ctx.lineWidth = 1.5;
  const ip = pad + 4;
  const il = len - 6;
  ctx.beginPath(); ctx.moveTo(ip, ip + il); ctx.lineTo(ip, ip); ctx.lineTo(ip + il, ip); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - ip - il, ip); ctx.lineTo(w - ip, ip); ctx.lineTo(w - ip, ip + il); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ip, h - ip - il); ctx.lineTo(ip, h - ip); ctx.lineTo(ip + il, h - ip); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - ip - il, h - ip); ctx.lineTo(w - ip, h - ip); ctx.lineTo(w - ip, h - ip - il); ctx.stroke();

  ctx.restore();
  return true;
}
