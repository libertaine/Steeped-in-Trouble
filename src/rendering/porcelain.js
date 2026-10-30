// The teacup's porcelain: the cup itself, its cracks, chips and gold seams,
// the critical warning, the Golden Leaf, and the final break.
//
// Drawing only. Every shape comes from a fracture's stored seed through a
// private generator (never a gameplay stream), is built once, and is cached,
// so nothing about the cup changes from frame to frame except the animation.
// Cracks keep to the porcelain ring and a sliver of tea just inside the rim,
// beneath the leaves and the spoon.

import { CONFIG } from '../config.js';
import { createRandom } from '../core/random.js';
import { TAU, toCanvasPoint as polar } from '../gameplay/arena.js';

const { centerX: CX, centerY: CY, rimRadius: OUTER } = CONFIG.arena;
const RIM_OUT = OUTER + 34; // the porcelain's outer edge, where cracks start
const RIM_IN = OUTER - 10; // how far a crack may reach into the tea
const AMBER = '#ffae42';
const GOLD = '#e9b949';
const GOLD_DARK = '#7d5a12';
const GOLD_LIGHT = '#fff1b8';

// The cup's rings, outermost first: [radius, colour, width]. Unchanged since the prototype.
const RINGS = [
  [OUTER + 52, '#78948022', 16],
  [OUTER + 43, '#8ca58836', 3],
  [OUTER + 26, '#a9b68d28', 17],
  [OUTER + 15, '#eee8ce', 3],
  [OUTER + 10, '#678b6f', 14],
  [OUTER + 2, '#a9bc94', 3],
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - (1 - t) ** 3;

/**
 * A fracture's shape: polylines of [radius, angle, width] points. The main
 * line runs from the outer edge inwards; each branch has a level, and level 2
 * branches show only once the cup is critical. Chips are short and shallow.
 */
export function fractureShape({ angle, seed, kind }) {
  const rng = createRandom(seed);
  const chip = kind === 'chip';
  const inner = chip ? OUTER + 18 + rng.range(0, 6) : RIM_IN - rng.range(0, 5);
  const steps = chip ? 3 : 7;
  const lean = rng.range(-0.014, 0.014); // porcelain seldom breaks straight across
  const main = [];
  let a = angle + rng.range(-0.01, 0.01);
  for (let i = 0; i <= steps; i++) {
    const r = RIM_OUT - ((RIM_OUT - inner) * i) / steps;
    main.push([r, a, (chip ? 1.6 : 3) * (1 - 0.55 * (i / steps)) * rng.range(0.8, 1.15)]);
    a += lean + rng.range(-0.014, 0.014);
  }
  // Branches mostly run along the band of porcelain, as cracks round a rim do.
  const branches = [];
  const count = chip ? 1 : 2 + rng.int(2);
  for (let b = 0; b < count + (chip ? 0 : 3); b++) {
    const level = b < count ? 1 : 2;
    const from = main[1 + rng.int(Math.min(main.length - 2, 5))];
    const side = b % 2 ? 1 : -1;
    const length = chip ? 2 : 3 + rng.int(level === 2 ? 3 : 2);
    const path = [from];
    let [r, ba] = from;
    for (let i = 0; i < length; i++) {
      r = clamp(r + rng.range(-6, 4), RIM_IN + 4, RIM_OUT);
      ba += side * rng.range(0.02, 0.038);
      path.push([r, ba, from[2] * 0.7 * (1 - i / (length + 1))]);
    }
    branches.push({ level, path });
  }
  return { main, branches };
}

export function createPorcelainPainter(ctx) {
  const shapes = new Map(); // `${id}:${seed}:${kind === 'chip'}` -> fractureShape()

  function shapeOf(f) {
    const key = `${f.id}:${f.seed}:${f.kind === 'chip'}`;
    let shape = shapes.get(key);
    if (!shape) {
      if (shapes.size > 64) shapes.clear(); // a new pot, or a very long one: rebuilt on demand
      shape = fractureShape(f);
      shapes.set(key, shape);
    }
    return shape;
  }

  function trace(path, width, color, alpha = 1, scale = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < path.length; i++) {
      const a = polar(path[i - 1][0], path[i - 1][1]);
      const b = polar(path[i][0], path[i][1]);
      ctx.lineWidth = Math.max(0.5, (width ?? path[i - 1][2]) * scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paths(shape, critical) {
    return [shape.main, ...shape.branches.filter((b) => b.level === 1 || critical).map((b) => b.path)];
  }

  /** An open crack: a dark fissure with a pale glazed edge (amber when the cup is critical). */
  function drawCrack(f, critical, glow) {
    for (const path of paths(shapeOf(f), critical)) {
      trace(path, null, '#0f1d17', 0.95, 1.05);
      trace(path, 0.8, critical ? AMBER : '#f6eed6', critical ? 0.4 + 0.45 * glow : 0.45);
    }
  }

  /** Kintsugi: thin metallic gold of varying width, a darker bed beneath, and a few highlights. */
  function drawSeam(f, shine = 0) {
    for (const path of paths(shapeOf(f), false)) {
      trace(path, null, GOLD_DARK, 0.85, 1.25);
      trace(path, null, GOLD, 1, 0.9);
      trace(path.filter((_, i) => i % 3 !== 2), 0.6, GOLD_LIGHT, 0.45 + 0.5 * shine);
    }
  }

  function drawChip(f) {
    const { main } = shapeOf(f);
    const tip = polar(RIM_OUT + 1, main[0][1]);
    ctx.save();
    ctx.fillStyle = '#2a4034';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    trace(main, null, '#1d3027', 0.7);
  }

  return {
    /** The cup and its handle (whole), exactly as the prototype drew them. */
    drawCup() {
      for (const [r, color, width] of RINGS) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      drawHandle();
    },

    /**
     * Every fracture in the cup. `fx.impacts` flash where the rim has just
     * given way; `fx.mends` shimmer along newly gilded seams.
     */
    drawFractures(state, fx, { clock, reduced }) {
      const critical = state.lives === 1;
      const glow = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((clock * TAU) / 2.6);
      const mends = new Map((fx.mends ?? []).map((m) => [m.id, m.time / m.life]));
      for (const f of state.porcelain.fractures) {
        if (f.kind === 'seam') drawSeam(f, mends.get(f.id) ?? 0);
        else if (f.kind === 'crack') drawCrack(f, critical, glow);
        else drawChip(f);
      }
      for (const hit of fx.impacts ?? []) {
        const f = state.porcelain.fractures.find((x) => x.id === hit.id);
        if (!f) continue;
        const k = hit.time / hit.life;
        trace(shapeOf(f).main, 3.2, '#fff8e6', 0.8 * k);
        const p = polar(RIM_OUT - 4, f.angle);
        ctx.save();
        ctx.globalAlpha = 0.5 * k;
        ctx.strokeStyle = '#fff8e6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + 16 * (1 - k), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    },

    /** Structural failure imminent: a slow amber pulse around the outer rim (steady with reduced motion). */
    drawWarning(state, { clock, reduced }) {
      if (state.lives !== 1) return;
      const k = reduced ? 0.55 : 0.5 + 0.5 * Math.sin((clock * TAU) / 2.6);
      ctx.save();
      ctx.strokeStyle = AMBER;
      ctx.shadowColor = AMBER;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.16 + 0.3 * k;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(CX, CY, OUTER + 50, 0, TAU);
      ctx.stroke();
      ctx.restore();
    },

    /** The Golden Leaf: a gilded leaf with a soft glow and a slow turn. */
    drawGoldenLeaf(leaf, time) {
      const p = polar(leaf.radius, leaf.angle);
      const fade = clamp(Math.min((leaf.life - leaf.time) / 0.4, leaf.time / 0.8), 0, 1);
      const size = 13;
      ctx.save();
      ctx.globalAlpha = fade * (0.28 + 0.12 * Math.sin(time * 3));
      ctx.strokeStyle = '#ffe9a0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size + 7, 0, TAU);
      ctx.stroke();
      ctx.translate(p.x, p.y);
      ctx.rotate(leaf.angle + Math.PI / 2 + 0.35 * Math.sin(time * 1.6));
      ctx.globalAlpha = fade;
      const fill = ctx.createLinearGradient(-size, -size, size, size);
      fill.addColorStop(0, '#fff3c0');
      fill.addColorStop(0.5, '#f2c34a');
      fill.addColorStop(1, '#b8861e');
      ctx.fillStyle = fill;
      ctx.shadowColor = '#ffd45e';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = GOLD_DARK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(size * 0.86, -size * 0.4, size * 0.9, size * 0.65, 0, size);
      ctx.bezierCurveTo(-size * 0.8, size * 0.53, -size * 0.9, -size * 0.4, 0, -size);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();
      // Its veins, and a short stem.
      ctx.strokeStyle = '#8a6416';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.85);
      ctx.lineTo(0, size * 1.25);
      for (const y of [-0.35, 0.05, 0.42]) {
        ctx.moveTo(0, size * y);
        ctx.lineTo(size * 0.45, size * (y - 0.28));
        ctx.moveTo(0, size * y);
        ctx.lineTo(-size * 0.45, size * (y - 0.28));
      }
      ctx.stroke();
      ctx.restore();
    },

    /**
     * The final break: cracks race round the rim, the porcelain parts into
     * shards that settle a little apart, and tea spills out between them.
     * `age` is seconds since the cup broke (Infinity for the settled wreck).
     */
    drawShattered(state, age, reduced) {
      const t = reduced ? Infinity : age;
      const spread = clamp(t / 0.35, 0, 1); // cracks running round the cup
      const apart = ease(clamp((t - 0.3) / 0.9, 0, 1)); // shards drifting
      const spill = ease(clamp((t - 0.3) / 1.3, 0, 1));
      const bounds = shardBounds(state.porcelain);
      // Tea running out through the gaps and pooling beyond the rim.
      if (spill > 0) {
        bounds.forEach((b, i) => {
          const reach = (36 + 22 * ((i * 5) % 3)) * spill;
          ctx.save();
          ctx.globalAlpha = 0.62 * spill;
          ctx.fillStyle = '#5c3214';
          for (let k = 0; k <= 4; k++) {
            const f = k / 4;
            const p = polar(OUTER - 4 + reach * f, b + 0.03 * Math.sin(i + f * 3) * f);
            ctx.beginPath();
            ctx.arc(p.x, p.y, (7 + 9 * f + 4 * ((i + k) % 2)) * (0.5 + 0.5 * spill), 0, TAU);
            ctx.fill();
          }
          const pool = polar(OUTER - 4 + reach, b);
          ctx.globalAlpha = 0.35 * spill;
          ctx.fillStyle = '#9a6332';
          ctx.beginPath();
          ctx.arc(pool.x - 3, pool.y - 3, 6 * spill, 0, TAU); // a glint on the puddle
          ctx.fill();
          ctx.restore();
        });
      }
      bounds.forEach((from, i) => {
        let to = bounds[(i + 1) % bounds.length];
        if (to <= from) to += TAU;
        const mid = (from + to) / 2;
        const push = (16 + 10 * ((i * 7) % 3)) * apart;
        const turn = (i % 2 ? 1 : -1) * 0.035 * apart;
        const centre = polar(OUTER + 26, mid);
        ctx.save();
        ctx.translate(Math.cos(mid) * push, Math.sin(mid) * push);
        ctx.translate(centre.x, centre.y);
        ctx.rotate(turn);
        ctx.translate(-centre.x, -centre.y);
        const gap = 0.012 * apart;
        for (const [r, color, width] of RINGS) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.arc(CX, CY, r, from + gap, to - gap);
          ctx.stroke();
        }
        if (to >= TAU) drawHandle(); // the shard that wraps past angle 0 keeps the handle
        ctx.restore();
      });
      // The breaks themselves, racing round from the last spill until the pieces part.
      if (apart < 1) {
        bounds.forEach((b, i) => {
          if (i / bounds.length > spread) return;
          trace([[OUTER + 56, b, 2.4], [OUTER + 26, b + 0.012, 2.2], [OUTER + 8, b - 0.01, 1.8], [RIM_IN, b + 0.006, 1.2]],
            null, '#0f1d17', 0.9 * (1 - apart));
        });
      }
      for (const f of state.porcelain.fractures) if (f.kind === 'seam') drawSeam(f, 0);
    },
  };

  function drawHandle() {
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
}

/** Where the broken cup parts: at every crack, then evenly between, nudged by the cracks' own seeds. */
export function shardBounds(porcelain) {
  const cracks = porcelain.fractures.filter((f) => f.kind === 'crack');
  const seed = cracks.reduce((s, f) => (Math.imul(s, 31) + f.seed) >>> 0, 0x5eed);
  const rng = createRandom(seed);
  const bounds = cracks.map((f) => ((f.angle % TAU) + TAU) % TAU);
  const want = 8;
  const base = bounds[0] ?? 0.4;
  for (let i = 1; bounds.length < want; i++) {
    const a = (((base + (i * TAU) / want + rng.range(-0.2, 0.2)) % TAU) + TAU) % TAU;
    if (bounds.every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 0.35)) bounds.push(a);
    if (i > 40) break;
  }
  return bounds.sort((x, y) => x - y);
}
