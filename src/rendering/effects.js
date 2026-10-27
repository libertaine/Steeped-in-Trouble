// Cosmetic effects driven by simulation events: particles, the spill flash,
// strainer glints, whispered messages, The Leaves Lie's pranks, the spoon's
// moments of glory, and the living tea surface (see tea.js).
//
// Effects never modify game state and use their own random source, so they
// can be changed freely without affecting gameplay or seeded replays.

import { LANE_STEP, TAU, toCanvasPoint } from '../gameplay/arena.js';
import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { FIBS, FORTUNES } from '../gameplay/fortunes.js';
import { UPGRADES } from '../gameplay/upgrades.js';
import { createTea } from './tea.js';

const GOLD = '#ffd45e';
const RIM = CONFIG.arena.rimRadius;
const SPOON_RADIUS = RIM + 7;

const PRISM = ['#ff7aa8', '#ffd36b', '#8dffb8', '#7ccfff', '#c79bff', '#ffffff'];

const NOVA_WORDS = [
  'STEAM NOVA! Every lane at once.',
  'STEAM NOVA! The cup has opinions now too.',
  'STEAM NOVA! That was a lot of steam.',
];

const GOLDEN_WORDS = {
  points: (e) => `+${e.points}. Fortune favors the well-caffeinated.`,
  sugar: () => 'The cube was full of sugar. Bursts restocked, plus one.',
  life: () => 'An extra cup! The leaves are quietly impressed.',
  goldenSpoon: () => 'The cube was hiding a Golden Spoon!',
  jackpot: (e) => `JACKPOT! +${e.points}, full sugar, full milk, and a Golden Spoon. Steady on.`,
};

const STRAINER_REMARKS = ['Not through this mesh.', 'Strained!', 'The strainer earns its keep.', 'Caught, with a tiny clink.'];

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

const UPGRADE_WORDS = {
  polished: 'The spoon gleams.',
  quickStir: 'The spoon is in a hurry.',
  sugarScoop: 'More room for sugar.',
  strainer: 'The cup gets a little silver trim.',
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
  { kind: 'bigSpoon', run: () => ({ words: ['The leaves recommend a bigger spoon.', 'Perhaps not that big.'] }) },
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
    glints: [], // strainer catches: { angle, time, life }
    spoonScale: 1, // The Leaves Lie can make the spoon briefly enormous
    upgradeGlow: 0, // seconds of the ring that marks a new upgrade
  };
  const queue = [];
  let prankTimer = null; // seconds until The Leaves Lie misbehaves
  let golden = null; // the cube's last known spot, for sparkles
  let prismatic = null; // the same for the prismatic cube
  let bigSpoon = null; // { time, life } while the spoon is comically large
  let strained = false; // has the strainer been explained this pot?

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

  function burst(count, radius, angle, color, life, speed = 1, [sizeMin, sizeMax] = [1, 3.3]) {
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
        size: rnd(sizeMin, sizeMax),
      });
    }
  }

  function prank(only) {
    const { kind, run } = PRANKS.find((p) => p.kind === only) ?? pick(PRANKS);
    const { prank: props = {}, words } = run(pick);
    if (kind === 'bigSpoon') bigSpoon = { time: 3.4, life: 3.4 };
    tea.handle({ type: 'prank', kind, ...props });
    words.forEach((text, i) => say(text, { color: FORTUNES.lie.color, then: i > 0 }));
  }

  /** Spoon sparkles: silver, or gold. */
  function spoonBurst(count, angle, colors, speed = 1.4) {
    burst(count, () => SPOON_RADIUS + rnd(-10, 6), () => angle + rnd(-0.08, 0.08),
      (i) => colors[i % colors.length], () => rnd(0.4, 1.1), speed);
  }

  const handlers = {
    matchStart() {
      strained = false;
    },
    roundStart({ fortune }) {
      fx.particles = [];
      fx.flash = 0;
      fx.glints = [];
      golden = null;
      prismatic = null;
      bigSpoon = null;
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
    prismaticAppear({ radius, angle }) {
      prismatic = { radius, angle };
      burst(30, () => radius + rnd(-6, 6), () => angle + rnd(-0.05, 0.05), (i) => PRISM[i % PRISM.length],
        () => rnd(0.4, 0.9), 1.8);
      say('A prismatic sugar cube! QUICK!', { color: '#c79bff', life: 2 });
    },
    prismaticCatch({ radius, angle }) {
      prismatic = null;
      burst(40, () => radius + rnd(-8, 8), () => angle + rnd(-0.06, 0.06), (i) => PRISM[i % PRISM.length],
        () => rnd(0.5, 1.2), 2.6);
    },
    prismaticGone({ radius, angle }) {
      prismatic = null;
      burst(10, () => radius + rnd(-5, 5), () => angle + rnd(-0.04, 0.04), '#a99bc0', () => rnd(0.3, 0.6));
      say('The prism fades. Blink and you miss it.', { color: '#a99bc0', life: 2.6 });
    },
    nova({ count, golden: gilded }) {
      // A ring of colour bursting out from the middle of the cup.
      for (let i = 0; i < 90; i++) {
        const a = rnd(0, TAU);
        const p = toCanvasPoint(rnd(0, 30), a);
        const speed = rnd(160, 340);
        const life = rnd(0.5, 1.1);
        fx.particles.push({
          x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          time: life, life, color: gilded && i % 2 ? GOLD : PRISM[i % PRISM.length], size: rnd(1.5, 3.8),
        });
      }
      const words = gilded ? `GOLDEN STEAM NOVA! ${count} darts. Steady on.` : count > CONFIG.arena.lanes
        ? `STEAM NOVA! ${count} darts. Double the trouble.` : pick(NOVA_WORDS);
      say(words, { color: gilded ? GOLD : '#f4fbff', life: 3.4 });
    },
    reading({ fortune }) {
      prankTimer = null;
      golden = null;
      prismatic = null;
      bigSpoon = null;
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
      prismatic = null;
      bigSpoon = null;
      hush();
    },
    strain({ angle, left }) {
      fx.glints.push({ angle, time: 1.1, life: 1.1 });
      // The leaf breaks into fragments, and a little tea splashes off the mesh.
      burst(18, () => RIM - rnd(2, 10), () => angle + rnd(-0.06, 0.06),
        (i) => (i % 2 ? '#dcb877' : '#819c6b'), () => rnd(0.5, 1.1), 1.4, [2, 4.2]);
      burst(16, () => RIM - 2, () => angle + rnd(-0.12, 0.12), (i) => (i % 3 ? '#c98a45' : '#f0c070'),
        () => rnd(0.4, 0.8), 2.4, [1.5, 3.4]);
      burst(8, () => RIM + 4, () => angle + rnd(-0.3, 0.3), '#f4fbff', () => rnd(0.2, 0.5), 0.6);
      if (!strained) {
        strained = true;
        say('Caught by the tea strainer! It is ready again every cup.', { color: '#e4eef0' });
      } else if (left === 0 && random() < 0.4) {
        say(pick(STRAINER_REMARKS), { color: '#e4eef0', life: 2.4 });
      }
    },
    recoil({ angle }) {
      // The recovering cup sloshes the leaf back in.
      burst(12, () => RIM - rnd(0, 8), () => angle + rnd(-0.08, 0.08), (i) => (i % 2 ? '#f7e8cc' : '#e6ad82'),
        () => rnd(0.3, 0.6), 1.2);
    },
    upgrade({ id, level, angle }) {
      fx.upgradeGlow = 1;
      spoonBurst(46, angle, ['#ffffff', '#e4f2ee', GOLD], 1.8);
      say(`${UPGRADES[id].name} ${ROMAN[level] ?? level}. ${UPGRADE_WORDS[id]}`, { color: '#e4eef0', then: true });
    },
    secret({ id, angle }) {
      // A shower of lilac sparks over the top of the cup (the reading shows the words).
      burst(40, () => rnd(150, 250), () => -Math.PI / 2 + rnd(-0.5, 0.5), (i) => (i % 3 ? '#c79bff' : '#fff8e2'),
        () => rnd(0.6, 1.4), 1.2);
      if (id === 'moreLeavesThanSteam') spoonBurst(40, angle, [GOLD, '#fff8e2', '#f2c13e'], 2);
    },
    goldenSpoon({ angle }) {
      spoonBurst(50, angle, [GOLD, '#fff8e2', '#f2c13e'], 2.2);
    },
    goldenSpoonEnd({ angle }) {
      spoonBurst(18, angle, ['#b39a5a', '#e4f2ee'], 1);
      say('The gold wears off. Still a fine spoon.', { color: '#c9b27a', life: 2.6 });
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
    milk({ angle, cloud = angle }) {
      burst(22, () => rnd(100, 245), () => angle + rnd(-0.38, 0.38), '#dceee8', () => rnd(0.3, 0.9));
      // The backwash: a spray of cream rushing in from the rim.
      for (let i = 0; i < 30; i++) {
        const a = cloud + rnd(-1.6, 1.6) * LANE_STEP;
        const p = toCanvasPoint(RIM - rnd(4, 20), a);
        const speed = rnd(140, 280);
        const life = rnd(0.35, 0.7);
        fx.particles.push({
          x: p.x, y: p.y, vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed,
          time: life, life, color: i % 3 ? '#f4efe4' : '#dceee8', size: rnd(1.4, 3.4),
        });
      }
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
      fx.upgradeGlow = Math.max(0, fx.upgradeGlow - dt * 1.2);
      if (state) fx.spoonAngle = state.angle;
      for (let i = fx.glints.length - 1; i >= 0; i--) {
        fx.glints[i].time -= dt;
        if (fx.glints[i].time <= 0) fx.glints.splice(i, 1);
      }

      const playing = state?.phase === PHASE.PLAYING;
      if (bigSpoon && playing) {
        bigSpoon.time -= dt;
        const age = bigSpoon.life - bigSpoon.time;
        const swell = Math.min(1, age / 0.5, Math.max(0, bigSpoon.time) / 0.6);
        fx.spoonScale = 1 + 2.2 * swell * swell * (3 - 2 * swell);
        if (bigSpoon.time <= 0) bigSpoon = null;
      } else if (!bigSpoon) {
        fx.spoonScale = 1;
      }
      if (playing && state.goldenSpoon > 0 && random() < dt * 18) {
        spoonBurst(1, state.angle, [GOLD, '#fff8e2'], 0.6);
      }
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
      if (playing && prismatic && random() < dt * 24) {
        burst(1, () => prismatic.radius + rnd(-12, 12), () => prismatic.angle + rnd(-0.05, 0.05),
          () => pick(PRISM), () => rnd(0.3, 0.6), 0.6);
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
