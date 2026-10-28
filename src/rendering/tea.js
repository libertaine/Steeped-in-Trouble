// The living tea: a purely cosmetic liquid surface beneath the arena.
//
// createTea() keeps the liquid's own state (currents, ripples, milk wisps,
// sugar crystals, and the occasional oddity) and advances it from simulation
// events and the frame clock. createTeaPainter() draws it. Nothing here
// touches game state or the gameplay random generator, so the tea is free to
// be as random and whimsical as it likes.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { LANE_STEP, TAU, angleDifference, toCanvasPoint as polar } from '../gameplay/arena.js';
import { havocInProgress } from '../gameplay/chocolate.js';
import { FORTUNES } from '../gameplay/fortunes.js';

const { centerX: CX, centerY: CY, rimRadius: RIM } = CONFIG.arena;

// The Prismatic Sugar Cube's colours (a fixed set, so glow sprites stay cached).
const PRISM = ['#ff7aa8', '#ffd36b', '#8dffb8', '#7ccfff', '#c79bff'];

// Hot chocolate: the same currents, in cream and copper.
const COCOA_TONES = ['#c58a5a', '#e2b98e', '#a8653a', '#f0d6b4'];
const COCOA_DARK = '#0b0300';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const rgbCache = new Map();
function rgb(hex) {
  if (!rgbCache.has(hex)) rgbCache.set(hex, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  return rgbCache.get(hex);
}
/** Blend two '#rrggbb' colours. */
function mixColor(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}

/** 0 → 1 → 0 over a lifetime. */
const swell = (age, life) => Math.sin(Math.PI * clamp(age / life, 0, 1));

/** The tea turns faster near the centre than at the rim, so currents curl into spirals. */
const shear = (r) => 0.35 + 1.25 * (1 - clamp(r / RIM, 0, 1)) ** 1.5;

const STRANDS = 24; // low quality draws only the first LOW_STRANDS
const LOW_STRANDS = 14;
const LIMITS = { ripples: 40, crystals: 320, wisps: 30, glows: 16, oddities: 14, surges: 6 };

export function createTea({ random = Math.random } = {}) {
  const rnd = (min, max) => min + random() * (max - min);
  const chance = (p) => random() < p;
  const motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

  const liquid = {
    time: 0, // oscillation clock; stops while paused
    pace: 1, // eases to 0 while paused
    flow: 0, // accumulated rotation of the tea
    spin: 0.06, // current rotation speed (radians per second, scaled by shear)
    drift: chance(0.5) ? 1 : -1, // which way the tea would rather turn
    mood: 0.3, // 0 = glassy calm, 1 = turbulent
    stir: 0, // short-lived agitation from events
    agitation: 0.3,
    milkiness: 0,
    choco: 0, // 0 = tea, 1 = hot chocolate (eases between them)
    glow: 0, // fortune-reading luminescence
    glowColor: '#ffd27e',
    tint: null, // The Leaves Lie: { color, age, life } — the tea briefly turns an absurd colour
    reduced: false,
    spoon: { angle: CONFIG.player.startAngle, speed: 0 },
    strands: [],
    blobs: [],
    ripples: [],
    wisps: [],
    surges: [], // milk backwash: a pale wave rolling in from the rim, { angle, reach, age, life }
    crystals: [],
    glows: [],
    oddities: [],
  };
  let moodTarget = 0.3;
  let moodTimer = rnd(4, 9);
  let surpriseTimer = rnd(3, 7);
  let lastSpoon = null;

  const push = (list, item, limit) => {
    list.push(item);
    if (list.length > limit) list.shift();
  };

  function newStrand(age = 0) {
    const light = chance(0.7);
    const r0 = rnd(14, 120);
    const life = rnd(7, 15);
    return {
      angle: rnd(0, TAU),
      r0,
      r1: Math.min(RIM - 4, r0 + rnd(90, 210)),
      twist: liquid.drift * rnd(0.3, 1.5) * (chance(0.85) ? 1 : -1),
      flow0: liquid.flow,
      age: age * life,
      life,
      width: light ? rnd(5, 20) : rnd(14, 34),
      amp: rnd(0.04, 0.13),
      freq: rnd(2, 5.5),
      speed: rnd(0.25, 0.9),
      seed: rnd(0, TAU),
      light,
      tone: light ? ['#d9933f', '#c36f2c', '#f0c070', '#e8a95a'][Math.floor(random() * 4) % 4] : '#120602',
      cocoa: light ? COCOA_TONES[Math.floor(random() * 4) % 4] : COCOA_DARK,
      alpha: light ? rnd(0.05, 0.11) : rnd(0.14, 0.26),
    };
  }

  for (let i = 0; i < STRANDS; i++) liquid.strands.push(newStrand(random()));
  for (let i = 0; i < 3; i++) {
    liquid.blobs.push({ r: rnd(60, 190), angle: rnd(0, TAU), size: rnd(80, 140), seed: rnd(0, TAU) });
  }

  function randomSpot(maxR = RIM - 40, minR = 0) {
    const r = Math.sqrt(rnd((minR / maxR) ** 2, 1)) * maxR;
    return polar(r, rnd(0, TAU));
  }

  function ripple(x, y, { size = 40, life = 1.2, strength = 1, rings = 2, tone = '#f6e2b5' } = {}) {
    push(liquid.ripples, { x, y, size, life, strength, rings, tone, age: 0 }, LIMITS.ripples);
  }

  function glow(x, y, radius, color, life, strength = 1) {
    push(liquid.glows, { x, y, radius, color, life, strength, age: 0 }, LIMITS.glows);
  }

  function crystal(x, y, spread = 0, life = rnd(0.5, 1.2), color = '#fff4c8') {
    push(liquid.crystals, {
      x, y, vx: rnd(-spread, spread), vy: rnd(-spread, spread), life, age: 0,
      size: rnd(0.8, 2.2), phase: rnd(0, TAU), color,
    }, LIMITS.crystals);
  }

  function oddity(kind, props) {
    push(liquid.oddities, { kind, age: 0, ...props }, LIMITS.oddities);
  }

  function kick(amount) {
    liquid.stir = Math.min(1, liquid.stir + amount);
  }

  // ── Little surprises ──────────────────────────────────────────────────

  const SURPRISES = [
    {
      weight: 5,
      calm: true,
      run() {
        // A small cluster of bubbles rises, idles, and pops.
        const at = randomSpot();
        const count = chance(0.6) ? 1 : Math.floor(rnd(2, 5));
        for (let i = 0; i < count; i++) {
          oddity('bubble', {
            x: at.x + (i > 0 ? rnd(-14, 14) : 0), y: at.y + (i > 0 ? rnd(-14, 14) : 0),
            size: rnd(2.5, 6.5), life: rnd(1.4, 3.8),
          });
        }
      },
    },
    {
      weight: 3,
      run() {
        oddity('shimmer', { angle: rnd(0, TAU), life: rnd(1.4, 2.2), width: rnd(40, 90) });
      },
    },
    {
      weight: 2.5,
      calm: true,
      run() {
        const at = randomSpot(RIM - 70, 60);
        oddity('whirlpool', { ...at, size: rnd(18, 40), life: rnd(3, 5.5), dir: chance(0.5) ? 1 : -1 });
      },
    },
    {
      weight: 2,
      calm: true,
      run() {
        // A stray stem fragment catches a current. Thin and dark, so it never reads as a foe.
        const at = randomSpot(RIM - 50, 40);
        oddity('stem', { ...at, rot: rnd(0, TAU), spinRate: rnd(-1.2, 1.2), len: rnd(5, 9), life: rnd(5, 9) });
      },
    },
    {
      weight: 1.2,
      run() {
        // For a moment, the tea reflects a sky that isn't there.
        const stars = [];
        for (let i = 0, n = Math.floor(rnd(12, 22)); i < n; i++) {
          stars.push({ ...randomSpot(RIM - 20), phase: rnd(0, TAU), size: rnd(1.2, 3), rate: rnd(3, 7) });
        }
        oddity('starlight', { stars, life: rnd(2.5, 3.8) });
      },
    },
    {
      weight: 1,
      run() {
        // Something stirs beneath.
        kick(0.6);
        liquid.spin += liquid.drift * rnd(0.12, 0.3);
        ripple(CX, CY, { size: RIM * 1.1, life: 3.6, strength: 0.9, rings: 1, tone: 'dark' });
      },
    },
  ];

  function surprise() {
    const pool = liquid.reduced ? SURPRISES.filter((s) => s.calm) : SURPRISES;
    let roll = rnd(0, pool.reduce((sum, s) => sum + s.weight, 0));
    for (const s of pool) {
      roll -= s.weight;
      if (roll <= 0) return s.run();
    }
    return pool[0].run();
  }

  // ── Reactions to simulation events ────────────────────────────────────

  const rimPoint = (angle, inset = 6) => polar(RIM - inset, angle);

  const handlers = {
    roundStart() {
      // A fresh cup: swirl it up.
      liquid.milkiness = 0;
      liquid.wisps = [];
      liquid.surges = [];
      kick(0.55);
      liquid.spin += liquid.drift * 0.2;
      ripple(CX, CY, { size: 150, life: 2, strength: 0.8, rings: 3 });
    },
    steam({ twin }) {
      if (twin) {
        for (const side of [-1, 1]) {
          const p = rimPoint(liquid.spoon.angle + side * LANE_STEP * 0.25, 16);
          ripple(p.x, p.y, { size: 14, life: 0.6, strength: 0.55, rings: 1, tone: '#d8f5e8' });
        }
        return;
      }
      if (!chance(0.45)) return;
      const p = rimPoint(liquid.spoon.angle, 14);
      ripple(p.x, p.y, { size: 12, life: 0.55, strength: 0.45, rings: 1, tone: '#d8f5e8' });
    },
    sugarRegen({ angle }) {
      const p = rimPoint(angle, 16);
      ripple(p.x, p.y, { size: 30, life: 1, strength: 0.9, rings: 2, tone: '#ffd57a' });
      glow(p.x, p.y, 50, '#ffcf6a', 1.2, 0.8);
      for (let i = 0; i < 18; i++) crystal(p.x, p.y, 60);
    },
    goldenAppear({ radius, angle }) {
      const p = polar(radius, angle);
      ripple(p.x, p.y, { size: 60, life: 1.4, strength: 1.2, rings: 3, tone: '#ffd57a' });
      glow(p.x, p.y, 80, '#ffcf6a', 1.6, 1);
    },
    goldenCatch({ radius, angle, reward }) {
      const p = polar(radius, angle);
      const big = reward === 'jackpot';
      kick(big ? 0.5 : 0.25);
      ripple(p.x, p.y, { size: big ? 220 : 110, life: big ? 2.4 : 1.6, strength: 1.4, rings: 3, tone: '#ffd57a' });
      glow(p.x, p.y, big ? 200 : 110, '#ffcf6a', big ? 2.6 : 1.6, 1.2);
      for (let i = 0; i < (big ? 90 : 40); i++) crystal(p.x, p.y, big ? 160 : 100, rnd(0.6, 1.6));
    },
    goldenGone({ radius, angle }) {
      const p = polar(radius, angle);
      ripple(p.x, p.y, { size: 36, life: 1.2, strength: 0.6, rings: 1, tone: 'dark' });
    },
    prismaticAppear({ radius, angle }) {
      const p = polar(radius, angle);
      PRISM.forEach((tone, i) => ripple(p.x, p.y, { size: 30 + i * 9, life: 1, strength: 0.8, rings: 1, tone }));
      glow(p.x, p.y, 60, PRISM[1], 1, 0.9);
    },
    prismaticGone({ radius, angle }) {
      const p = polar(radius, angle);
      ripple(p.x, p.y, { size: 30, life: 1, strength: 0.5, rings: 1, tone: 'dark' });
    },
    nova({ count }) {
      // Every lane at once: the whole cup rings like a struck bell.
      kick(0.6);
      ripple(CX, CY, { size: RIM, life: 1.8, strength: 1.4, rings: 3, tone: '#f4fbff' });
      PRISM.forEach((tone, i) => glow(CX, CY, 90 + i * 30, tone, 1.4, 0.8));
      for (let i = 0; i < 6; i++) {
        const p = rimPoint((i / 6) * TAU, 14);
        ripple(p.x, p.y, { size: 34, life: 1, strength: 0.9, rings: 2, tone: PRISM[i % PRISM.length] });
      }
      for (let i = 0; i < Math.min(80, count * 3); i++) crystal(CX, CY, 180, rnd(0.6, 1.6), PRISM[i % PRISM.length]);
    },
    reveal({ fortune }) {
      const f = FORTUNES[fortune];
      liquid.glowColor = f.color;
      ripple(CX, CY, { size: 210, life: 1.8, strength: 1.1, rings: f.tone === 'trouble' ? 1 : 3, tone: f.color });
      glow(CX, CY, 160, f.color, 1.6, f.rare ? 1.4 : 1);
      if (f.tone === 'trouble') kick(0.35); // a shiver runs through the cup
    },
    retract() {
      ripple(CX, CY, { size: RIM * 0.9, life: 1.6, strength: 1, rings: 1, tone: 'dark' });
      liquid.glowColor = FORTUNES.lie.color;
    },
    /** The Leaves Lie, misbehaving harmlessly. */
    prank({ kind, color }) {
      if (kind === 'tint') {
        liquid.tint = { color, age: 0, life: rnd(4, 6) };
        kick(0.2);
      } else if (kind === 'bigBubble') {
        const at = randomSpot(RIM - 90, 40);
        oddity('bubble', { ...at, size: rnd(24, 34), life: rnd(2.6, 3.4) });
      } else if (kind === 'sugarShower') {
        for (let i = 0; i < 160; i++) {
          const at = randomSpot(RIM - 10);
          crystal(at.x, at.y, 20, rnd(0.6, 2.2), chance(0.3) ? '#ffd57a' : '#fff4c8');
        }
      } else if (kind === 'whirlpool') {
        oddity('whirlpool', { x: CX + rnd(-30, 30), y: CY + rnd(-30, 30), size: rnd(85, 115), life: rnd(4.5, 6), dir: liquid.drift });
        liquid.spin += liquid.drift * 0.25;
      } else if (kind === 'biscuit') {
        // It drifts across the cup on a chord, well beneath the action.
        const a = rnd(0, TAU);
        const from = polar(RIM + 40, a);
        const to = polar(RIM + 40, a + Math.PI + rnd(-0.7, 0.7));
        const life = rnd(8, 10);
        oddity('biscuit', {
          x: from.x, y: from.y, vx: (to.x - from.x) / life, vy: (to.y - from.y) / life,
          rot: rnd(0, TAU), spinRate: rnd(-0.4, 0.4), size: rnd(26, 32), life,
        });
      }
    },
    sugar() {
      kick(0.12);
      for (const offset of CONFIG.sugar.laneOffsets) {
        const p = rimPoint(liquid.spoon.angle + offset * LANE_STEP, 14);
        ripple(p.x, p.y, { size: 22, life: 0.8, strength: 0.8, rings: 2, tone: '#ffd57a' });
        for (let i = 0; i < 5; i++) crystal(p.x, p.y, 40);
      }
    },
    milk({ angle, cloud = angle, spread = 1 }) {
      kick(0.3);
      liquid.milkiness = Math.min(1, liquid.milkiness + 0.5);
      const p = rimPoint(angle, 12);
      ripple(p.x, p.y, { size: 70, life: 1.8, strength: 1.3, rings: 3, tone: '#f4efe4' });
      glow(p.x, p.y, 90, '#f3ece0', 2.4, 0.7);
      // The backwash: a pale wave rolls in over the slowed wedge.
      push(liquid.surges, { angle: cloud, reach: CONFIG.milk.backwash + 40, age: 0, life: 0.9 }, LIMITS.surges);
      const mid = polar(RIM - CONFIG.milk.backwash, cloud);
      ripple(mid.x, mid.y, { size: 60, life: 1.4, strength: 0.8, rings: 2, tone: '#f4efe4' });
      const duration = CONFIG.milk.duration;
      for (let i = 0; i < Math.round(11 * spread); i++) {
        push(liquid.wisps, {
          angle: cloud + rnd(-1.4, 1.4) * LANE_STEP * spread,
          flow0: liquid.flow,
          reach: rnd(110, 240),
          spread: rnd(0.08, 0.3) * (chance(0.5) ? 1 : -1),
          curl: rnd(-1.1, 1.1),
          freq: rnd(2, 6),
          speed: rnd(0.4, 1.2),
          seed: rnd(0, TAU),
          width: rnd(2.5, 9),
          delay: rnd(0, 0.5),
          life: duration + rnd(0.5, 2.5),
          age: 0,
        }, LIMITS.wisps);
      }
    },
    kill({ radius, angle, sugar }) {
      kick(0.04);
      const p = polar(radius, angle);
      if (sugar) {
        ripple(p.x, p.y, { size: 46, life: 1.3, strength: 1.2, rings: 3, tone: '#ffd57a' });
        glow(p.x, p.y, 46, '#ffcf6a', 0.9, 0.9);
        for (let i = 0; i < 14; i++) crystal(p.x, p.y, 70);
      } else {
        ripple(p.x, p.y, { size: 34, life: 1.1, strength: 1, rings: 2 });
      }
      // Now and then a sinking leaf leaves a tiny swirl behind.
      if (chance(0.12)) oddity('whirlpool', { ...p, size: rnd(10, 18), life: rnd(1.6, 2.4), dir: chance(0.5) ? 1 : -1 });
    },
    drift({ radius, angle }) {
      const p = polar(radius, angle);
      ripple(p.x, p.y, { size: 20, life: 0.8, strength: 0.7, rings: 1, tone: '#e5d9b0' });
    },
    strain({ angle }) {
      kick(0.15);
      const p = rimPoint(angle, 6);
      ripple(p.x, p.y, { size: 44, life: 1, strength: 1.2, rings: 2, tone: '#e8f0f4' });
      glow(p.x, p.y, 50, '#e6f2f6', 0.8, 0.9);
      for (let i = 0; i < 10; i++) crystal(p.x, p.y, 70, rnd(0.3, 0.7), '#eef6f8');
    },
    recoil({ angle }) {
      const p = rimPoint(angle, 8);
      ripple(p.x, p.y, { size: 50, life: 1.2, strength: 1, rings: 2, tone: '#f7e8cc' });
    },
    goldenSpoon() {
      const p = rimPoint(liquid.spoon.angle, 14);
      ripple(p.x, p.y, { size: 80, life: 1.6, strength: 1.2, rings: 3, tone: '#ffd57a' });
      glow(p.x, p.y, 100, '#ffcf6a', 1.8, 1);
      for (let i = 0; i < 40; i++) crystal(p.x, p.y, 110, rnd(0.5, 1.4), chance(0.5) ? '#ffd57a' : '#fff4c8');
    },
    upgrade() {
      const p = rimPoint(liquid.spoon.angle, 14);
      ripple(p.x, p.y, { size: 60, life: 1.4, strength: 1, rings: 3, tone: '#e8f0f4' });
    },
    escape({ angle }) {
      kick(0.45);
      liquid.spin += liquid.drift * 0.15;
      const p = rimPoint(angle, 4);
      ripple(p.x, p.y, { size: 90, life: 1.8, strength: 1.5, rings: 3, tone: '#f0a878' });
      glow(p.x, p.y, 60, '#f08a5a', 1, 0.7);
    },
    gameover() {
      ripple(CX, CY, { size: RIM * 1.1, life: 4, strength: 1, rings: 1, tone: 'dark' });
    },

    // Hot Chocolate Havoc.
    chocolateStart() {
      // The tea darkens from the middle outward.
      liquid.milkiness = 0;
      liquid.wisps = [];
      kick(0.4);
      ripple(CX, CY, { size: RIM * 1.05, life: 3.2, strength: 1.1, rings: 1, tone: 'dark' });
      glow(CX, CY, 200, '#8a4a22', 3, 0.9);
    },
    havocStart() {
      kick(0.5);
      ripple(CX, CY, { size: RIM, life: 1.8, strength: 1.2, rings: 3, tone: '#f3d6b0' });
      for (let i = 0; i < 8; i++) {
        const at = randomSpot(RIM - 40, 30);
        oddity('bubble', { ...at, size: rnd(3, 8), life: rnd(0.8, 2) });
      }
    },
    havocEnd() {
      ripple(CX, CY, { size: RIM * 1.05, life: 2.6, strength: 1, rings: 2, tone: '#f0c070' });
    },
    flame({ lane }) {
      if (!chance(0.5)) return;
      const p = rimPoint(-Math.PI / 2 + lane * LANE_STEP, 14);
      ripple(p.x, p.y, { size: 12, life: 0.5, strength: 0.5, rings: 1, tone: '#ffb36b' });
    },
    toast({ radius, angle, heat }) {
      // The flame lights up the chocolate around it.
      const p = polar(radius, angle);
      glow(p.x, p.y, 34 + 14 * heat, heat > 1.2 ? '#ff6a2a' : '#ffa94a', 0.6, 0.9);
      ripple(p.x, p.y, { size: 22, life: 0.7, strength: 0.6, rings: 1, tone: '#f3d6b0' });
    },
    burn({ radius, angle }) {
      const p = polar(radius, angle);
      glow(p.x, p.y, 70, '#ff4a1a', 1, 1.2);
      ripple(p.x, p.y, { size: 40, life: 1.2, strength: 1, rings: 1, tone: 'dark' });
    },
    perfect({ radius, angle }) {
      const p = polar(radius, angle);
      glow(p.x, p.y, 60, '#ffcf6a', 1.2, 1);
      ripple(p.x, p.y, { size: 46, life: 1.1, strength: 1, rings: 2, tone: '#ffd57a' });
      for (let i = 0; i < 16; i++) crystal(p.x, p.y, 70, rnd(0.4, 1), chance(0.5) ? '#ffd57a' : '#fff4c8');
    },
    scoop({ angle, how }) {
      if (how !== 'rim') return;
      // A little chocolate slops against the rim.
      const p = rimPoint(angle, 6);
      ripple(p.x, p.y, { size: 34, life: 0.9, strength: 1, rings: 2, tone: '#e2b98e' });
    },
    crumble({ radius, angle }) {
      const p = polar(radius, angle);
      ripple(p.x, p.y, { size: 26, life: 0.8, strength: 0.6, rings: 1, tone: 'dark' });
    },
    bump({ radius, angle }) {
      const p = polar(radius, angle);
      ripple(p.x, p.y, { size: 16, life: 0.6, strength: 0.6, rings: 1, tone: '#f3d6b0' });
    },
    giantAppear({ radius, angle }) {
      const p = polar(radius, angle);
      kick(0.3);
      ripple(p.x, p.y, { size: 80, life: 1.6, strength: 1.2, rings: 3, tone: '#f3d6b0' });
    },
    catastrophe({ radius, angle }) {
      const p = polar(radius, angle);
      kick(0.7);
      ripple(p.x, p.y, { size: 180, life: 1.8, strength: 1.5, rings: 3, tone: '#fff4e6' });
      glow(p.x, p.y, 150, '#fff0dc', 1.4, 1.2);
      for (let i = 0; i < 70; i++) crystal(p.x, p.y, 170, rnd(0.5, 1.4), '#fff8ee');
    },
  };

  // ── Per-frame update ──────────────────────────────────────────────────

  /** Rotate a free-floating point along with the tea. */
  function carry(item, sdt) {
    const dx = item.x - CX;
    const dy = item.y - CY;
    const r = Math.hypot(dx, dy);
    const turn = liquid.spin * shear(r) * sdt * (liquid.reduced ? 0.35 : 1);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    item.x = CX + dx * c - dy * s;
    item.y = CY + dx * s + dy * c;
  }

  function age(list, sdt) {
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].age += sdt;
      if (list[i].age >= list[i].life) list.splice(i, 1);
    }
  }

  function updateOddities(sdt) {
    const list = liquid.oddities;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      o.age += sdt;
      if (o.kind === 'bubble' || o.kind === 'stem' || o.kind === 'whirlpool') carry(o, sdt);
      if (o.kind === 'stem' || o.kind === 'biscuit') o.rot += o.spinRate * sdt;
      if (o.kind === 'biscuit') {
        o.x += o.vx * sdt;
        o.y += o.vy * sdt;
      }
      if (o.age < o.life) continue;
      list.splice(i, 1);
      if (o.kind === 'bubble') {
        const big = o.size > 15;
        ripple(o.x, o.y, { size: 10 + o.size * 3, life: big ? 1.4 : 0.8, strength: big ? 1.3 : 0.8, rings: big ? 3 : 1 });
        for (let n = 0; n < (big ? 40 : 5); n++) crystal(o.x, o.y, big ? 140 : 50, rnd(0.2, big ? 0.9 : 0.45), '#f6e2b5');
        if (big) kick(0.3);
      } else if (o.kind === 'whirlpool') {
        ripple(o.x, o.y, { size: o.size * 1.6, life: 1, strength: 0.6, rings: 1 });
      }
    }
  }

  return {
    liquid,
    handle(event) {
      handlers[event.type]?.(event);
    },
    /**
     * @param {number} dt seconds since the previous frame (already clamped by the loop)
     * @param {object} [state] simulation state, read only
     */
    update(dt, state) {
      liquid.reduced = !!motionQuery?.matches;
      const motion = liquid.reduced ? 0.35 : 1;
      const phase = state?.phase;
      const playing = phase === PHASE.PLAYING;
      const reading = phase === PHASE.READING;
      const havoc = havocInProgress(state);
      const toasting = phase === PHASE.CHOCOLATE && havoc.stage === 'play';
      const stormy = playing && state.fortune === 'tempest'; // Tempestuous Tea

      // Pausing lets the tea settle to a standstill rather than freezing mid-slosh.
      liquid.pace += ((phase === PHASE.PAUSED ? 0 : 1) - liquid.pace) * Math.min(1, dt * 5);
      if (liquid.pace < 0.003) liquid.pace = 0;
      const sdt = dt * liquid.pace;
      liquid.time += sdt * motion;

      // The spoon stirs the tea as it travels around the rim.
      liquid.spoon.speed = (playing || toasting) && lastSpoon !== null && dt > 0
        ? angleDifference(state.angle, lastSpoon) / dt
        : 0;
      if (state) liquid.spoon.angle = state.angle;
      lastSpoon = state ? state.angle : null;

      moodTimer -= sdt;
      if (moodTimer <= 0) {
        moodTimer = rnd(5, 14);
        const r = random();
        moodTarget = r < 0.5 ? rnd(0.05, 0.3) : r < 0.86 ? rnd(0.3, 0.6) : rnd(0.7, 1);
        if (chance(0.18)) liquid.drift = -liquid.drift;
      }
      const target = reading ? 0.02 : stormy ? Math.max(moodTarget, 0.9) : moodTarget;
      liquid.mood += (target - liquid.mood) * Math.min(1, sdt * (stormy ? 0.8 : 0.4));
      liquid.stir *= Math.exp(-sdt * (reading ? 2 : 0.7));
      liquid.agitation = clamp(liquid.mood + liquid.stir, 0, 1.2);

      // The tea becomes chocolate (and back): darker, thicker, slower.
      const chocoTarget = havoc && havoc.stage !== 'outro' && (havoc.stage !== 'intro' || havoc.time > 0.5) ? 1 : 0;
      liquid.choco += (chocoTarget - liquid.choco) * Math.min(1, sdt * (chocoTarget ? 0.95 : 1.4));
      if (liquid.choco < 0.002) liquid.choco = 0;

      const base = liquid.drift * (0.04 + 0.09 * liquid.agitation) * (reading ? 0.4 : stormy ? 2.4 : 1)
        * (1 - 0.45 * liquid.choco);
      liquid.spin += (liquid.spoon.speed * 0.02 - (liquid.spin - base) * 0.3) * sdt;
      liquid.flow += liquid.spin * sdt * motion;

      liquid.glow += ((reading ? 1 : 0) - liquid.glow) * Math.min(1, sdt * 1.2);
      liquid.milkiness = Math.max(0, liquid.milkiness - sdt * 0.025);
      if (liquid.tint) {
        liquid.tint.age += sdt;
        if (liquid.tint.age >= liquid.tint.life || !playing) liquid.tint = null;
      }

      if (stormy && sdt > 0) {
        // Squalls: gusts of stirring, rim spray, and bubbles boiling up.
        if (chance(sdt * 0.5)) {
          kick(0.3);
          liquid.spin += liquid.drift * rnd(0.05, 0.15);
        }
        if (chance(sdt * 1.6 * motion)) {
          const p = rimPoint(rnd(0, TAU), rnd(4, 20));
          ripple(p.x, p.y, { size: rnd(20, 50), life: rnd(0.8, 1.4), strength: 0.9, rings: 2, tone: '#f0b38a' });
        }
        if (chance(sdt * 1.2 * motion)) {
          const at = randomSpot(RIM - 30, 30);
          oddity('bubble', { ...at, size: rnd(2.5, 7), life: rnd(0.8, 2) });
        }
      }
      // Hot chocolate bubbles up now and then, and flames shed embers.
      if (liquid.choco > 0.55 && sdt > 0 && chance(sdt * (havoc?.stage === 'intro' ? 4 : 1.3) * motion)) {
        const at = randomSpot(RIM - 30, 20);
        oddity('bubble', { ...at, size: rnd(2, 6.5), life: rnd(0.9, 2.6) });
      }
      if (toasting && sdt > 0) {
        for (const flame of havoc.flames) {
          if (!chance(Math.min(1, sdt * 24))) continue;
          const p = polar(flame.radius + rnd(4, 14), flame.angle + rnd(-0.02, 0.02));
          crystal(p.x, p.y, 10, rnd(0.2, 0.45), flame.golden ? '#ffe08a' : chance(0.5) ? '#ffb347' : '#ff7a2a');
        }
      }
      // Sugar Rush: the cup glitters near the spoon.
      if (playing && state.fortune === 'sugarRush' && chance(Math.min(1, sdt * 10))) {
        const p = rimPoint(liquid.spoon.angle + rnd(-0.5, 0.5), rnd(10, 60));
        crystal(p.x, p.y, 15, rnd(0.4, 1));
      }

      for (let i = 0; i < liquid.strands.length; i++) {
        const strand = liquid.strands[i];
        strand.age += sdt;
        if (strand.age >= strand.life) liquid.strands[i] = newStrand();
      }
      age(liquid.ripples, sdt);
      age(liquid.wisps, sdt);
      age(liquid.surges, sdt);
      age(liquid.glows, sdt);
      for (const c of liquid.crystals) {
        const drag = Math.exp(-sdt * 3);
        c.vx *= drag;
        c.vy *= drag;
        c.x += c.vx * sdt;
        c.y += c.vy * sdt;
      }
      age(liquid.crystals, sdt);
      updateOddities(sdt);

      // Sugar darts (and golden steam) shed crystals that sparkle and dissolve behind them.
      if (playing && sdt > 0) {
        for (const shot of state.shots) {
          if (!(shot.sugar || shot.golden) || !chance(Math.min(1, sdt * (shot.sugar ? 50 : 20)))) continue;
          const p = polar(shot.radius + rnd(0, 12), shot.angle + rnd(-0.02, 0.02));
          crystal(p.x, p.y, 8, undefined, shot.sugar ? '#fff4c8' : '#ffd57a');
        }
      }

      surpriseTimer -= sdt * (0.6 + liquid.agitation);
      if (surpriseTimer <= 0) {
        surpriseTimer = rnd(4, 11) * (liquid.reduced ? 3 : 1);
        surprise();
      }
    },
  };
}

// ── Drawing ───────────────────────────────────────────────────────────────

/** Per-quality drawing detail. High assumes a reasonably modern GPU. */
const QUALITY = {
  high: { points: 32, strands: STRANDS, bloom: true, fullResolution: true, glow: 1.5 },
  low: { points: 20, strands: LOW_STRANDS, bloom: false, fullResolution: false, glow: 1 },
};
const MAX_POINTS = 32;
const SPRITE = 128;

function offscreen(size) {
  return typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement('canvas'), { width: size, height: size });
}

/** A soft round glow in one colour, pre-rendered once and stretched as needed. */
function softSprite(color) {
  const canvas = offscreen(SPRITE);
  const g = canvas.getContext('2d');
  const half = SPRITE / 2;
  const falloff = g.createRadialGradient(half, half, 0, half, half, half);
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    falloff.addColorStop(u, `rgba(0,0,0,${((1 - u) ** 2 * (1 + 2 * u)).toFixed(3)})`);
  }
  g.fillStyle = falloff;
  g.fillRect(0, 0, SPRITE, SPRITE);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, SPRITE, SPRITE);
  return canvas;
}

/**
 * A soft glow squashed into an ellipse and tilted, baked once: drawing rotated
 * images every frame is surprisingly expensive without GPU acceleration.
 */
function tiltedSprite(round, angle, squash) {
  const canvas = offscreen(SPRITE * 2);
  const g = canvas.getContext('2d');
  g.translate(SPRITE, SPRITE);
  g.rotate(angle);
  g.drawImage(round, -SPRITE, -SPRITE * squash, SPRITE * 2, SPRITE * 2 * squash);
  return canvas;
}

/** Drifting reflections of an unseen window, in polar terms around the cup. */
const HIGHLIGHTS = [
  { angle: -2.25, swing: 0.2, rate: 0.11, r: 150, bob: 18, size: 125, squash: 0.3, alpha: 0.075 },
  { angle: -2.1, swing: 0.25, rate: 0.15, r: 205, bob: 12, size: 46, squash: 0.35, alpha: 0.09 },
  { angle: 0.85, swing: 0.3, rate: 0.07, r: 190, bob: 0, size: 95, squash: 0.28, alpha: 0.03 },
];

/**
 * The soft, slow layers (base colour, depths, currents, milk, glows) are
 * painted into an offscreen buffer and stretched onto the canvas; crisp
 * details are drawn directly. High quality sizes the buffer to the canvas and
 * adds a bloom pass over the light currents; low quality uses one pixel per
 * logical unit, which keeps older laptops and high-DPI screens cheap.
 */
export function createTeaPainter(main) {
  const BOX = RIM * 2 + 4;
  const ORIGIN_X = CX - BOX / 2;
  const ORIGIN_Y = CY - BOX / 2;
  let resolution = 0;
  let soft = null; // buffer context for the soft layers
  let glowLayer = null; // light currents, composited sharp and blurred (high only)
  let ctx = main; // whichever surface the draw helpers currently paint on
  let detail = QUALITY.high;
  const xs = new Float64Array(MAX_POINTS);
  const ys = new Float64Array(MAX_POINTS);
  const ws = new Float64Array(MAX_POINTS);

  function layer(res) {
    const g = offscreen(Math.ceil(BOX * res)).getContext('2d');
    g.setTransform(res, 0, 0, res, -ORIGIN_X * res, -ORIGIN_Y * res);
    g.beginPath();
    g.arc(CX, CY, RIM + 1, 0, TAU);
    g.clip();
    return g;
  }

  function prepare(res) {
    if (res === resolution) return;
    resolution = res;
    soft = layer(res);
    glowLayer = null;
  }
  let cached = null;
  const sprites = new Map();
  let highlightSprites = null;
  const sprite = (color) => {
    if (!sprites.has(color)) sprites.set(color, softSprite(color));
    return sprites.get(color);
  };
  const blot = (color, x, y, rx, ry = rx) => ctx.drawImage(sprite(color), x - rx, y - ry, rx * 2, ry * 2);

  function gradients() {
    const base = ctx.createRadialGradient(CX - 62, CY - 84, 16, CX, CY, RIM + 8);
    base.addColorStop(0, '#7d4a1d');
    base.addColorStop(0.3, '#643913');
    base.addColorStop(0.7, '#3a1e0a');
    base.addColorStop(1, '#1d0e05');
    const shadow = ctx.createRadialGradient(CX, CY, RIM - 48, CX, CY, RIM);
    shadow.addColorStop(0, 'rgba(10,4,1,0)');
    shadow.addColorStop(1, 'rgba(10,4,1,0.55)');
    // Hot chocolate: deeper, redder, and opaque.
    const cocoa = ctx.createRadialGradient(CX - 70, CY - 90, 10, CX, CY, RIM + 8);
    cocoa.addColorStop(0, '#7a3f1f');
    cocoa.addColorStop(0.35, '#5a2a13');
    cocoa.addColorStop(0.75, '#3a190a');
    cocoa.addColorStop(1, '#1e0b04');
    return { base, shadow, cocoa };
  }

  /** Nudge a point outward from any ripple ring passing over it. */
  function displace(liquid, i) {
    for (const rp of liquid.ripples) {
      const u = rp.age / rp.life;
      const radius = rp.size * (1 - (1 - u) ** 2);
      const dx = xs[i] - rp.x;
      const dy = ys[i] - rp.y;
      const d = Math.hypot(dx, dy);
      const off = Math.abs(d - radius);
      if (off > 14 || d < 0.01) continue;
      const push = (1 - off / 14) * (1 - u) * rp.strength * 4;
      xs[i] += (dx / d) * push;
      ys[i] += (dy / d) * push;
    }
  }

  /** Fill a tapered band through the current xs/ys/ws points. */
  function ribbon(n, scale = 1) {
    ctx.beginPath();
    for (let side = 1; side >= -1; side -= 2) {
      for (let k = 0; k < n; k++) {
        const i = side === 1 ? k : n - 1 - k;
        const a = Math.max(0, i - 1);
        const b = Math.min(n - 1, i + 1);
        const tx = xs[b] - xs[a];
        const ty = ys[b] - ys[a];
        const len = Math.hypot(tx, ty) || 1;
        const w = ws[i] * scale * side * 0.5;
        ctx.lineTo(xs[i] - (ty / len) * w, ys[i] + (tx / len) * w);
      }
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawBlobs(liquid) {
    const t = liquid.time;
    for (const b of liquid.blobs) {
      const r = b.r + 28 * Math.sin(t * 0.09 + b.seed);
      const p = polar(r, b.angle + liquid.flow * shear(r) * 0.6 + 0.2 * Math.sin(t * 0.05 + b.seed));
      const size = b.size * (1 + 0.15 * Math.sin(t * 0.13 + b.seed * 2));
      ctx.globalAlpha = 0.42;
      blot('#0c0501', p.x, p.y, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawStrands(liquid, light) {
    const POINTS = detail.points;
    const { time: t, flow, agitation, choco } = liquid;
    // In hot chocolate the currents go thick and lazy, then change colour.
    const thick = 1 + 0.4 * choco;
    const lazy = 1 - 0.45 * choco;
    const recolor = clamp((choco - 0.15) / 0.7, 0, 1);
    ctx.globalCompositeOperation = light ? 'lighter' : 'source-over';
    for (let n = 0; n < Math.min(detail.strands, liquid.strands.length); n++) {
      const s = liquid.strands[n];
      if (s.light !== light) continue;
      for (let i = 0; i < POINTS; i++) {
        const u = i / (POINTS - 1);
        const r = s.r0 + (s.r1 - s.r0) * u;
        const a = s.angle + s.twist * u + (flow - s.flow0) * shear(r)
          + s.amp * lazy * (0.4 + agitation) * Math.sin(u * s.freq + t * s.speed + s.seed);
        xs[i] = CX + r * Math.cos(a);
        ys[i] = CY + r * Math.sin(a);
        ws[i] = thick * s.width * Math.sin(Math.PI * u) ** 0.7 * (0.65 + 0.35 * Math.sin(u * 4 + t * 0.6 + s.seed));
        displace(liquid, i);
      }
      ctx.globalAlpha = s.alpha * swell(s.age, s.life) * (0.75 + 0.45 * agitation)
        * (light ? detail.glow * (1 - 0.25 * choco) : 1);
      ctx.fillStyle = recolor > 0 ? mixColor(s.tone, s.cocoa, recolor) : s.tone;
      ribbon(POINTS);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Hot chocolate: a few thick ribbons of cream, curling slowly round the cup. */
  function drawCocoaSwirls(liquid) {
    const amount = clamp((liquid.choco - 0.35) / 0.65, 0, 1);
    if (amount <= 0) return;
    const POINTS = detail.points;
    const { time: t, flow } = liquid;
    ctx.fillStyle = '#efd3ae';
    for (let k = 0; k < 3; k++) {
      const turn = flow * 0.55 + k * (TAU / 3) + 0.25 * Math.sin(t * 0.11 + k);
      for (let i = 0; i < POINTS; i++) {
        const u = i / (POINTS - 1);
        const r = 30 + 205 * u;
        const a = turn + u * 2.6 + 0.12 * Math.sin(u * 5 + t * 0.4 + k * 2);
        xs[i] = CX + r * Math.cos(a);
        ys[i] = CY + r * Math.sin(a);
        ws[i] = (7 + 10 * Math.sin(Math.PI * u)) * (0.8 + 0.2 * Math.sin(t * 0.5 + k + u * 3));
        displace(liquid, i);
      }
      ctx.globalAlpha = 0.11 * amount;
      ribbon(POINTS, 1.6);
      ctx.globalAlpha = 0.16 * amount;
      ribbon(POINTS, 0.55);
    }
    ctx.globalAlpha = 1;
  }

  function drawWisps(liquid) {
    const POINTS = detail.points;
    const { time: t, flow } = liquid;
    ctx.fillStyle = '#f1e7d4';
    for (const w of liquid.wisps) {
      const live = w.age - w.delay;
      if (live <= 0) continue;
      const grow = 1 - (1 - Math.min(1, live / 1.1)) ** 3;
      const fadeIn = Math.min(1, live / 0.35);
      const fadeOut = clamp((w.life - w.age) / (w.life * 0.45), 0, 1);
      const spread = 1 + live * 0.25;
      for (let i = 0; i < POINTS; i++) {
        const u = i / (POINTS - 1);
        const r = RIM - 8 - w.reach * grow * u;
        const a = w.angle + w.spread * spread * u * Math.sin(u * w.freq + t * w.speed + w.seed)
          + w.curl * u * u * live * 0.35 + (flow - w.flow0) * shear(r);
        xs[i] = CX + r * Math.cos(a);
        ys[i] = CY + r * Math.sin(a);
        ws[i] = w.width * (0.6 + live * 0.35) * Math.sin(Math.PI * (0.12 + 0.88 * u)) ** 0.6;
        displace(liquid, i);
      }
      const alpha = 0.2 * fadeIn * fadeOut;
      ctx.globalAlpha = alpha * 0.35;
      ribbon(POINTS, 2.4);
      ctx.globalAlpha = alpha;
      ribbon(POINTS, 0.7);
    }
    ctx.globalAlpha = 1;
  }

  function drawGlows(liquid) {
    ctx.globalCompositeOperation = 'lighter';
    for (const g of liquid.glows) {
      const u = g.age / g.life;
      const radius = g.radius * (0.6 + 0.6 * u);
      ctx.globalAlpha = 0.28 * g.strength * (1 - u) ** 1.5;
      blot(g.color, g.x, g.y, radius);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Faint V-shaped wakes behind leaves and marshmallows, and grooves behind darts and flames. */
  function drawWakes(state) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#f3d9a4';
    ctx.lineWidth = 1.1;
    const havoc = havocInProgress(state);
    const floaters = havoc && havoc.stage !== 'outro' ? havoc.marshmallows.map((m) => ({ ...m, alpha: 0.55 })) : state.enemies;
    for (const e of floaters) {
      const ux = Math.cos(e.angle);
      const uy = Math.sin(e.angle);
      const p = polar(e.radius, e.angle);
      const s = e.size;
      const L = 12 + s * 1.4;
      ctx.globalAlpha = 0.16 * e.alpha;
      ctx.beginPath();
      for (const side of [1, -1]) {
        const nx = -uy * side;
        const ny = ux * side;
        ctx.moveTo(p.x - ux * s * 0.7 + nx * s * 0.3, p.y - uy * s * 0.7 + ny * s * 0.3);
        ctx.quadraticCurveTo(
          p.x - ux * (s + L * 0.4) + nx * s * 0.5, p.y - uy * (s + L * 0.4) + ny * s * 0.5,
          p.x - ux * (s + L) + nx * L * 0.55, p.y - uy * (s + L) + ny * L * 0.55,
        );
      }
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    for (const flame of havoc?.flames ?? []) {
      const a = polar(flame.radius + 6, flame.angle);
      const b = polar(flame.radius + 30, flame.angle);
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = flame.golden ? '#ffe08a' : '#ff9a4a';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const shot of state.shots) {
      const a = polar(shot.radius + 4, shot.angle);
      const b = polar(shot.radius + (shot.sugar ? 34 : 26), shot.angle);
      ctx.globalAlpha = shot.sugar ? 0.13 : 0.08;
      ctx.strokeStyle = shot.sugar ? '#ffe39a' : '#d8fff0';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRipples(liquid) {
    // Troughs first (darkening), then crests (brightening), so each ring reads as a wave.
    for (const pass of ['trough', 'crest']) {
      ctx.globalCompositeOperation = pass === 'crest' ? 'lighter' : 'source-over';
      for (const rp of liquid.ripples) {
        const u = rp.age / rp.life;
        const radius = rp.size * (1 - (1 - u) ** 2);
        const fade = rp.strength * (1 - u) ** 1.5;
        const dark = rp.tone === 'dark';
        if (pass === 'crest' && dark) continue;
        for (let k = 0; k < rp.rings; k++) {
          const rr = radius * (1 - k * 0.28);
          if (rr <= 1) continue;
          const ringFade = fade * (1 - k * 0.3);
          ctx.beginPath();
          if (pass === 'trough') {
            ctx.globalAlpha = Math.min(1, ringFade * (dark ? 0.32 : 0.26));
            ctx.strokeStyle = '#0d0602';
            ctx.lineWidth = dark ? 18 : 2.4;
            ctx.arc(rp.x, rp.y, Math.max(0.5, rr - 2.4), 0, TAU);
          } else {
            ctx.globalAlpha = Math.min(1, ringFade * 0.38);
            ctx.strokeStyle = rp.tone;
            ctx.lineWidth = 1.5;
            ctx.arc(rp.x, rp.y, rr, 0, TAU);
          }
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function sparkle(x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 2.2);
    ctx.lineTo(x + size * 0.45, y);
    ctx.lineTo(x, y + size * 2.2);
    ctx.lineTo(x - size * 0.45, y);
    ctx.moveTo(x - size * 2.2, y);
    ctx.lineTo(x, y - size * 0.45);
    ctx.lineTo(x + size * 2.2, y);
    ctx.lineTo(x, y + size * 0.45);
    ctx.fill();
  }

  function drawOddities(liquid) {
    const t = liquid.time;
    for (const o of liquid.oddities) {
      const env = swell(o.age, o.life);
      if (o.kind === 'bubble') {
        const grow = Math.min(1, o.age / 0.3);
        const r = o.size * grow * (1 + 0.06 * Math.sin(t * 9 + o.size));
        ctx.globalAlpha = 0.35 * grow;
        ctx.fillStyle = '#1a0b03';
        ctx.beginPath();
        ctx.arc(o.x + 1, o.y + 1.5, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.6 * grow;
        ctx.strokeStyle = '#f6dfae';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(o.x, o.y, r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.85 * grow;
        ctx.fillStyle = '#fff6df';
        ctx.beginPath();
        ctx.arc(o.x - r * 0.35, o.y - r * 0.35, Math.max(0.6, r * 0.28), 0, TAU);
        ctx.fill();
      } else if (o.kind === 'stem') {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.6 * env;
        ctx.strokeStyle = '#1b0d04';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-o.len, 0);
        ctx.quadraticCurveTo(0, o.len * 0.35, o.len, -o.len * 0.1);
        ctx.stroke();
        ctx.restore();
      } else if (o.kind === 'whirlpool') {
        const size = o.size * env;
        ctx.globalAlpha = env * 0.5;
        blot('#080300', o.x, o.y, size * 1.2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#f0c98a';
        ctx.lineWidth = 1.2;
        for (let arm = 0; arm < 4; arm++) {
          ctx.beginPath();
          for (let j = 0; j <= 14; j++) {
            const v = j / 14;
            const ang = (arm * TAU) / 4 + o.dir * (o.age * 3.2 + (1 - v) * 2.8);
            const x = o.x + Math.cos(ang) * size * v;
            const y = o.y + Math.sin(ang) * size * v;
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.globalAlpha = 0.22 * env;
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (o.kind === 'shimmer') {
        const u = o.age / o.life;
        const offset = (-1 + 2 * u) * RIM * 1.15;
        ctx.save();
        ctx.translate(CX, CY);
        ctx.rotate(o.angle);
        const band = ctx.createLinearGradient(offset - o.width, 0, offset + o.width, 0);
        band.addColorStop(0, 'rgba(255,236,196,0)');
        band.addColorStop(0.5, 'rgba(255,236,196,0.09)');
        band.addColorStop(1, 'rgba(255,236,196,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = env;
        ctx.fillStyle = band;
        ctx.fillRect(offset - o.width, -RIM, o.width * 2, RIM * 2);
        ctx.restore();
      } else if (o.kind === 'biscuit') {
        // A plain round biscuit: scalloped edge, docking holes. Muted, so it reads as scenery.
        const fade = clamp(Math.min(o.age / 1, (o.life - o.age) / 1), 0, 1);
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(o.rot);
        ctx.globalAlpha = 0.3 * fade;
        ctx.fillStyle = '#0c0501';
        ctx.beginPath();
        ctx.arc(3, 5, o.size, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.62 * fade;
        ctx.fillStyle = '#b98a4e';
        ctx.strokeStyle = '#6e4a22';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * TAU;
          const r = o.size * (1 + 0.05 * Math.cos(a * 16));
          ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5c3b18';
        for (const [hx, hy] of [[-0.4, -0.35], [0.4, -0.35], [0, 0], [-0.4, 0.38], [0.4, 0.38], [0, -0.7], [0, 0.7]]) {
          ctx.beginPath();
          ctx.arc(hx * o.size * 0.8, hy * o.size * 0.8, 1.6, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      } else if (o.kind === 'starlight') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#fff8e2';
        for (const s of o.stars) {
          const twinkle = 0.5 + 0.5 * Math.sin(t * s.rate + s.phase);
          ctx.globalAlpha = env * twinkle * 0.7;
          sparkle(s.x, s.y, s.size * (0.6 + 0.4 * twinkle));
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCrystals(liquid) {
    const t = liquid.time;
    ctx.globalCompositeOperation = 'lighter';
    for (const c of liquid.crystals) {
      const u = c.age / c.life;
      const twinkle = 0.55 + 0.45 * Math.sin(t * 22 + c.phase);
      ctx.globalAlpha = (1 - u) * twinkle * 0.9;
      ctx.fillStyle = c.color;
      sparkle(c.x, c.y, c.size * (1 - u * 0.6));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawHighlights(liquid) {
    const t = liquid.time;
    highlightSprites ??= HIGHLIGHTS.map((h) => tiltedSprite(sprite('#fff0d2'), h.angle + Math.PI / 2, h.squash));
    ctx.globalCompositeOperation = 'lighter';
    HIGHLIGHTS.forEach((h, i) => {
      const angle = h.angle + h.swing * Math.sin(t * h.rate + i * 2);
      const p = polar(h.r + h.bob * Math.sin(t * (h.rate + 0.06) + i), angle);
      // Hot chocolate is glossier than tea.
      ctx.globalAlpha = h.alpha * (1 + 0.3 * Math.sin(t * 0.7 + h.r) + 0.4 * liquid.agitation) * (1 + 2.2 * liquid.choco);
      ctx.drawImage(highlightSprites[i], p.x - h.size, p.y - h.size, h.size * 2, h.size * 2);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Recolour the tea, keeping its light and shade, so the leaves stay readable. */
  function drawTint(liquid) {
    const tint = liquid.tint;
    if (!tint) return;
    const u = tint.age / tint.life;
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = 0.85 * clamp(Math.min(u / 0.12, (1 - u) / 0.25), 0, 1);
    ctx.fillStyle = tint.color;
    ctx.fillRect(CX - RIM, CY - RIM, RIM * 2, RIM * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawReadingGlow(liquid) {
    if (liquid.glow < 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 * liquid.glow * (0.85 + 0.15 * Math.sin(liquid.time * 1.7));
    blot(liquid.glowColor, CX, CY, 230);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Milk backwash: a creamy crest rolling inward, the wedge behind it clouding over. */
  function drawSurges(liquid) {
    ctx.lineCap = 'round';
    for (const sg of liquid.surges) {
      const u = sg.age / sg.life;
      const ease = 1 - (1 - u) ** 2.2;
      const front = RIM - 8 - sg.reach * ease;
      const half = LANE_STEP * 1.65 * (0.85 + 0.35 * u);
      const fade = (1 - u) ** 1.3;
      // The milky body between the rim and the front.
      ctx.globalAlpha = 0.2 * fade;
      ctx.strokeStyle = '#efe6d6';
      ctx.lineWidth = RIM - 8 - front;
      ctx.beginPath();
      ctx.arc(CX, CY, (front + RIM - 8) / 2, sg.angle - half, sg.angle + half);
      ctx.stroke();
      // The crest, curling at its ends.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = '#f8f1e4';
      ctx.lineWidth = 3 + 9 * (1 - u);
      ctx.beginPath();
      ctx.arc(CX, CY, front, sg.angle - half, sg.angle + half);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35 * fade;
      for (const side of [-1, 1]) {
        const end = sg.angle + side * half;
        const tip = polar(front, end);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 6 + 10 * u, end + side * Math.PI / 2, end + side * (Math.PI / 2 + 2.6 * u + 1), side < 0);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  /** The bright line where tea meets porcelain, shimmering unevenly. */
  function drawMeniscus(liquid) {
    const t = liquid.time;
    const { spoon } = liquid;
    const stirGlow = Math.min(0.45, Math.abs(spoon.speed) * 0.12);
    const SEG = 72;
    const STEPS = 8; // segments are batched into a few brightness levels
    const levels = Array.from({ length: STEPS }, () => []);
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * TAU;
      const n = 0.5 + 0.5 * Math.sin(a * 3 + t * 0.5 + Math.sin(a * 2 - t * 0.3)) * Math.sin(a * 5 - t * 0.8);
      const lit = Math.max(0, Math.cos(a + 2.25));
      const near = angleDifference(a, spoon.angle);
      const alpha = 0.05 + 0.16 * n * n + 0.12 * lit + stirGlow * Math.exp(-(near * near) / 0.03);
      levels[Math.min(STEPS - 1, Math.floor(alpha * STEPS * 1.6))].push(a);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#f8dca0';
    ctx.lineWidth = 2.2;
    for (let level = 0; level < STEPS; level++) {
      if (!levels[level].length) continue;
      ctx.globalAlpha = (level + 0.5) / (STEPS * 1.6);
      ctx.beginPath();
      for (const a of levels[level]) {
        ctx.moveTo(CX + (RIM - 2) * Math.cos(a), CY + (RIM - 2) * Math.sin(a));
        ctx.arc(CX, CY, RIM - 2, a, a + TAU / SEG + 0.003);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    /**
     * Draw the whole liquid surface, clipped to the cup.
     * @param {object} liquid tea state from createTea()
     * @param {object} state simulation state (read only)
     */
    paint(liquid, state, { quality = 'high', scale = 1 } = {}) {
      detail = QUALITY[quality] ?? QUALITY.high;
      prepare(detail.fullResolution ? Math.max(1, Math.min(2, scale)) : 1);
      ctx = soft;
      cached ??= gradients();
      ctx.fillStyle = cached.base;
      ctx.fillRect(CX - RIM, CY - RIM, RIM * 2, RIM * 2);
      if (liquid.choco > 0.01) {
        ctx.globalAlpha = liquid.choco;
        ctx.fillStyle = cached.cocoa;
        ctx.fillRect(CX - RIM, CY - RIM, RIM * 2, RIM * 2);
        ctx.globalAlpha = 1;
      }
      if (liquid.milkiness > 0.01) {
        ctx.globalAlpha = liquid.milkiness * 0.08;
        ctx.fillStyle = '#e9dcc4';
        ctx.fillRect(CX - RIM, CY - RIM, RIM * 2, RIM * 2);
        ctx.globalAlpha = 1;
      }
      drawBlobs(liquid);
      drawStrands(liquid, false);
      if (detail.bloom) {
        // Paint the light currents on their own layer, then add it back twice:
        // once crisp and once blurred, for a soft vector-screen glow.
        glowLayer ??= layer(resolution);
        glowLayer.save();
        glowLayer.setTransform(1, 0, 0, 1, 0, 0);
        glowLayer.clearRect(0, 0, glowLayer.canvas.width, glowLayer.canvas.height);
        glowLayer.restore();
        ctx = glowLayer;
        drawStrands(liquid, true);
        ctx = soft;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowLayer.canvas, 0, 0);
        ctx.filter = `blur(${(8 * resolution).toFixed(1)}px)`;
        ctx.globalAlpha = 1;
        ctx.drawImage(glowLayer.canvas, 0, 0);
        ctx.drawImage(glowLayer.canvas, 0, 0);
        ctx.restore();
      } else {
        drawStrands(liquid, true);
      }
      drawCocoaSwirls(liquid);
      drawWisps(liquid);
      drawTint(liquid);
      drawGlows(liquid);
      drawHighlights(liquid);
      drawReadingGlow(liquid);
      ctx.strokeStyle = cached.shadow;
      ctx.lineWidth = 50;
      ctx.beginPath();
      ctx.arc(CX, CY, RIM - 23, 0, TAU);
      ctx.stroke();

      ctx = main;
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, RIM, 0, TAU);
      ctx.clip();
      ctx.drawImage(soft.canvas, ORIGIN_X, ORIGIN_Y, BOX, BOX);
      drawWakes(state);
      drawRipples(liquid);
      drawSurges(liquid);
      drawOddities(liquid);
      drawCrystals(liquid);
      drawMeniscus(liquid);
      ctx.restore();
    },
  };
}
