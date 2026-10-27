// Cosmetic effects driven by simulation events: particles, the spill flash,
// whispered messages, The Leaves Lie's pranks, and the living tea surface
// (see tea.js).
//
// Effects never modify game state and use their own random source, so they
// can be changed freely without affecting gameplay or seeded replays.

import { TAU, toCanvasPoint } from '../gameplay/arena.js';
import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { FIBS, FORTUNES } from '../gameplay/fortunes.js';
import { createTea } from './tea.js';

const GOLD = '#ffd45e';

const GOLDEN_WORDS = {
  points: (e) => `+${e.points}. Fortune favors the well-caffeinated.`,
  sugar: () => 'The cube was full of sugar. Bursts restocked, plus one.',
  life: () => 'An extra cup! The leaves are quietly impressed.',
  jackpot: (e) => `JACKPOT! +${e.points}, full sugar, full milk. Steady on.`,
};

const ESCAPE_REMARKS = ['The leaves saw that.', 'That one had somewhere to be.', 'Spilled, but with dignity.'];

const ABSURD_TEAS = [
  { color: '#2f7fe0', text: 'The tea is now Earl Blue.' },
  { color: '#e04fa8', text: 'Raspberry oolong, apparently.' },
  { color: '#45d468', text: 'Matcha? Nobody ordered matcha.' },
  { color: '#9b5cf0', text: 'Ultraviolet Assam. Very rare. Very wrong.' },
];

const EMPTY_PROPHECIES = [
  ['The leaves foresee great wealth.', '…any moment now.'],
  ['You are about to be very lucky.', 'Not yet.'],
  ['Something wonderful is about to happen.', 'The leaves request a second opinion.'],
];

/** Harmless things The Leaves Lie may do mid-round. Each returns its whisper(s). */
const PRANKS = [
  { kind: 'tint', run: (pick) => {
    const tea = pick(ABSURD_TEAS);
    return { prank: { color: tea.color }, words: [tea.text] };
  } },
  { kind: 'bigBubble', run: () => ({ words: ['Blorp.'] }) },
  { kind: 'sugarShower', run: () => ({ words: ['A spontaneous sweetening.'] }) },
  { kind: 'whirlpool', run: () => ({ words: ['The cup is thinking.'] }) },
  { kind: 'biscuit', run: () => ({ words: ['Beware the approaching biscuit.'] }) },
  { kind: 'nothing', run: (pick) => ({ words: pick(EMPTY_PROPHECIES) }) },
];

export function createEffects({ random = Math.random } = {}) {
  const rnd = (min, max) => min + random() * (max - min);
  const tea = createTea({ random });
  const pick = (list) => list[Math.floor(random() * list.length) % list.length];
  const fx = {
    particles: [],
    flash: 0, // seconds of spill flash remaining
    tea: tea.liquid,
    whisper: null, // { text, color, time, life }: a short message under the cup
    fib: FIBS[0], // what The Leaves Lie claims during its reading
    glitch: 0, // seconds of fortune-text glitch remaining
    spoonAngle: CONFIG.player.startAngle,
  };
  const queue = [];
  let prankTimer = null; // seconds until The Leaves Lie misbehaves
  let golden = null; // the cube's last known spot, for sparkles

  /** Show a message under the cup; `then` queues it behind the current one. */
  function say(text, { color = '#f1dfbd', life = 3.4, then = false } = {}) {
    if (!then) {
      queue.length = 0;
      fx.whisper = null;
    }
    queue.push({ text, color, life, time: life });
  }

  function hush() {
    queue.length = 0;
    fx.whisper = null;
  }

  function burst(count, radius, angle, color, life, speed = 1) {
    for (let i = 0; i < count; i++) {
      const p = toCanvasPoint(radius(), angle());
      const lifetime = typeof life === 'function' ? life() : life;
      fx.particles.push({
        x: p.x,
        y: p.y,
        vx: rnd(-36, 36) * speed,
        vy: rnd(-45, 18) * speed,
        time: lifetime,
        life: lifetime,
        color: typeof color === 'function' ? color(i) : color,
        size: rnd(1, 3.3),
      });
    }
  }

  function prank(only) {
    const { kind, run } = PRANKS.find((p) => p.kind === only) ?? pick(PRANKS);
    const { prank: props = {}, words } = run(pick);
    tea.handle({ type: 'prank', kind, ...props });
    words.forEach((text, i) => say(text, { color: FORTUNES.lie.color, then: i > 0 }));
  }

  const handlers = {
    roundStart({ fortune }) {
      fx.particles = [];
      fx.flash = 0;
      golden = null;
      prankTimer = fortune === 'lie' ? rnd(3, 10) : null;
      if (fortune) say(`“${FORTUNES[fortune].quote}”`, { color: FORTUNES[fortune].color });
      else hush();
    },
    steam({ twin }) {
      if (!twin) return;
      // A puff of sparkle from the spoon for each pair of darts.
      const angle = fx.spoonAngle;
      burst(3, () => CONFIG.arena.rimRadius - 16, () => angle + rnd(-0.12, 0.12), '#c8f5e6', () => rnd(0.2, 0.45));
    },
    sugarRegen({ angle }) {
      burst(16, () => CONFIG.arena.rimRadius - rnd(10, 30), () => angle + rnd(-0.2, 0.2),
        (i) => (i % 2 ? '#fff4c8' : GOLD), () => rnd(0.4, 0.9));
    },
    goldenAppear({ radius, angle }) {
      golden = { radius, angle };
      burst(24, () => radius + rnd(-6, 6), () => angle + rnd(-0.05, 0.05), GOLD, () => rnd(0.4, 1), 1.6);
      say('A golden sugar cube! Quick, steam it!', { color: GOLD, life: 2.6 });
    },
    goldenCatch(event) {
      golden = null;
      const big = event.reward === 'jackpot';
      burst(big ? 70 : 36, () => event.radius + rnd(-8, 8), () => event.angle + rnd(-0.06, 0.06),
        (i) => (i % 3 ? GOLD : '#fff8e2'), () => rnd(0.5, big ? 1.6 : 1.1), big ? 3 : 2);
      say(GOLDEN_WORDS[event.reward](event), { color: GOLD, life: big ? 4.5 : 3.4 });
    },
    goldenGone({ radius, angle }) {
      golden = null;
      burst(10, () => radius + rnd(-5, 5), () => angle + rnd(-0.04, 0.04), '#b39a5a', () => rnd(0.3, 0.7));
      say('The golden cube dissolves. Typical.', { color: '#c9b27a' });
    },
    reading({ fortune }) {
      prankTimer = null;
      golden = null;
      hush();
      if (fortune === 'lie') fx.fib = pick(FIBS);
    },
    reveal({ fortune }) {
      const f = FORTUNES[fortune];
      const count = f.rare ? 60 : 34;
      burst(count, () => rnd(40, 170), () => rnd(0, TAU), (i) => (i % 3 ? f.color : '#fff8e2'),
        () => rnd(0.6, f.rare ? 1.8 : 1.2), f.rare ? 1.8 : 1.2);
    },
    retract() {
      fx.glitch = 0.45;
      burst(30, () => rnd(30, 150), () => rnd(0, TAU), FORTUNES.lie.color, () => rnd(0.4, 1.1), 1.4);
    },
    gameover() {
      prankTimer = null;
      golden = null;
      hush();
    },
    kill({ radius, angle }) {
      burst(9, () => radius + rnd(-8, 8), () => angle + rnd(-0.07, 0.07),
        (i) => (i % 3 === 0 ? '#efe4b4' : '#b4dcc0'), () => rnd(0.25, 0.7));
    },
    escape({ angle }) {
      fx.flash = 0.5;
      burst(20, () => CONFIG.arena.rimRadius, () => angle + rnd(-0.1, 0.1), '#e6ad82', 0.7);
      if (random() < 0.15) say(pick(ESCAPE_REMARKS), { color: '#e6ad82', life: 2.4 });
    },
    milk({ angle }) {
      burst(22, () => rnd(100, 245), () => angle + rnd(-0.38, 0.38), '#dceee8', () => rnd(0.3, 0.9));
    },
    drift({ radius, angle }) {
      burst(1, () => radius, () => angle, '#e5d9b0', 0.4);
    },
  };

  return {
    fx,
    /** Make The Leaves Lie misbehave now (a random prank, or a named one). */
    prank,
    handle(event) {
      handlers[event.type]?.(event);
      tea.handle(event);
    },
    /**
     * @param {number} dt seconds since the previous frame
     * @param {object} [state] simulation state, read only (lets the tea follow the spoon and darts)
     */
    update(dt, state) {
      tea.update(dt, state);
      fx.flash = Math.max(0, fx.flash - dt);
      fx.glitch = Math.max(0, fx.glitch - dt);
      if (state) fx.spoonAngle = state.angle;

      const playing = state?.phase === PHASE.PLAYING;
      if (playing && prankTimer !== null) {
        prankTimer -= dt;
        if (prankTimer <= 0) {
          prankTimer = null;
          prank();
        }
      }
      if (playing && golden && random() < dt * 14) {
        burst(1, () => golden.radius + rnd(-14, 14), () => golden.angle + rnd(-0.06, 0.06), GOLD, () => rnd(0.3, 0.7), 0.5);
      }

      if (state?.phase !== PHASE.PAUSED) {
        if (fx.whisper) {
          fx.whisper.time -= dt;
          if (fx.whisper.time <= 0) fx.whisper = null;
        }
        if (!fx.whisper && queue.length) fx.whisper = queue.shift();
      }

      const { particles } = fx;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.time -= dt;
        if (p.time <= 0) particles.splice(i, 1);
      }
    },
  };
}
