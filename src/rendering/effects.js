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
import { havocInProgress } from '../gameplay/chocolate.js';
import { fury, grindInProgress } from '../gameplay/grind.js';
import { TEAS } from '../gameplay/teas.js';
import { createTea } from './tea.js';

const GOLD = '#ffd45e';
const AMBER = '#ffae42'; // the cracked cup's warning
const RIM = CONFIG.arena.rimRadius;
const { centerX: CX, centerY: CY } = CONFIG.arena;
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

const CHAPTER_CARD = 3.6; // seconds a new chapter's card stays up

// Hot Chocolate Havoc.
const COCOA = '#f3c99a';
const MARSHMALLOW = ['#fffaf2', '#f6ead8'];
const BURN_REMARKS = ['Ah. Charcoal.', 'That one has gone to a better place. It is on fire.', 'Crispy.', 'The smoke alarm is a leaf. It is fine.'];
const RAW_REMARKS = ['Raw. A bold choice.', 'That one escaped untoasted.', 'Plop.'];
const PERFECT_REMARKS = ['Perfectly toasted!', 'Golden. Flawless. Gone.', 'The cup applauds.', 'Caramel perfection.'];
const CATASTROPHE_WORDS = ['Nobody could have foreseen this.', 'The leaves foresaw this. They said nothing.',
  'It had a face. Briefly.', 'Structural marshmallow failure.'];

// The Daily Grind.
const CREMA = '#e0b48a';
const BEAN = ['#4a2a16', '#6b3d1f', '#2e1a0d'];
const CUP_VOICE = '#f1dfbd';
const COMPLAINTS = ['Ow.', 'I have a warranty!', 'That is my good valve!', 'I am a PROFESSIONAL.', 'Do you know what I cost?',
  'Rude.', 'I was descaled on TUESDAY.', 'Stop that. Stop that at once.', 'My crema!'];
const SCALD_REMARKS = ['Scalding!', 'Ow, hot! Who serves it this hot?', 'That was a direct pour.', 'Extra hot, as requested.'];
const VICTORY_WORDS = ['The machine is out of order.', 'Order up!', 'Descaled. Permanently.'];
const POD_WORDS = ['It spat out a defective pod.', 'A pod. Possibly decaf. Definitely broken.'];

const UPGRADE_WORDS = {
  polished: 'The spoon gleams.',
  quickStir: 'The spoon is in a hurry.',
  sugarScoop: 'More room for sugar.',
  strainer: 'The cup gets a little silver trim.',
};

// Karma: the rim answers back.
const KARMA = '#ffa6d9';
const KARMA_REMARKS = ['INSTANT KARMA!', 'INSTANT KARMA!', 'Return to sender.', 'What goes around…'];

const ESCAPE_REMARKS = ['The leaves saw that.', 'That one had somewhere to be.', 'Spilled, but with dignity.'];

const ABSURD_TEAS = [
  { color: '#2f7fe0', text: 'The tea is now Earl Blue.' },
  { color: '#e04fa8', text: 'Raspberry oolong, apparently.' },
  { color: '#45d468', text: 'Matcha? Nobody ordered matcha.' },
  { color: '#9b5cf0', text: 'Ultraviolet Assam. Very rare. Very wrong.' },
];

// Strange Brews.
const DART_GREEN = '#d9f59a';
const WANDER_LAVENDER = '#d7c2f6';
const SPICE = '#ffb85c';
const HERBAL_WORDS = [
  'Notes of hay. And regret.',
  'A chamomile flower surfaces, says nothing, and leaves.',
  'This tea is forty per cent garden.',
  'The cup feels very relaxed about all this.',
  'Somewhere, a bee is concerned.',
  'Hints of meadow. Possibly an actual meadow.',
  'The leaves are taking a moment for themselves.',
  'Is that… a daisy?',
];
const CURRENT_WORDS = ['A spice current! Watch the arrows.', 'Here comes the cinnamon.', 'The cardamom is restless.'];

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
    rebounds: [], // Karma at the rim: { kind: 'bounce' | 'puff', angle, radius, time, life }
    spoonScale: 1, // The Leaves Lie can make the spoon briefly enormous
    upgradeGlow: 0, // seconds of the ring that marks a new upgrade
    discovery: null, // { id, time, life }: an unexpected brew being announced
    aimPulses: [], // lanes that just fired, flashing briefly: { lanes, tone, time, life }
    banner: null, // { title, words, time, life }: a big moment in the hot chocolate or the coffee boss
    pods: [], // defective coffee pods the machine spits out: { x, y, vx, vy, spin, time, life }
    flyingBeans: [], // beans erupting from the defeated machine: { x, y, vx, vy, spin, time, life }
    popups: [], // floating points: { text, x, y, color, time, life }
    ghosts: [], // perfect marshmallows lifting out of the cup: { x, y, size, spin, time, life }
    shake: 0, // seconds of cup shake left
    teaCard: null, // { tea, debut, delay, time, life }: the round's tea being announced (after `delay` seconds)
    chapterCard: null, // { chapter, time, life }: a new chapter being announced
    // The Cup Remembers (rendering/porcelain.js).
    impacts: [], // the rim giving way where a leaf spilled: { id, time, life } (id: the new fracture's)
    mends: [], // gold running into a newly mended crack: { id, time, life }
    shatter: null, // { age }: seconds since the cup broke, at the end of a pot
    cupClock: 0, // seconds of cup time, for the slow critical pulse; it stands still while paused
  };
  const queue = [];
  let prankTimer = null; // seconds until The Leaves Lie misbehaves
  let golden = null; // the cube's last known spot, for sparkles
  let prismatic = null; // the same for the prismatic cube
  let goldLeaf = null; // the same for the Golden Leaf
  let bigSpoon = null; // { time, life } while the spoon is comically large
  let strained = false; // has the strainer been explained this pot?
  let burnedOnce = false; // has the first burn been explained this pot?
  let perfects = 0; // perfect marshmallows this bonus round
  let grindMet = false; // has the machine explained itself this pot?
  let warned = false; // has the first pressure warning been explained this pot?
  let podTimer = null; // seconds until the furious machine spits out a defective pod
  let herbalTimer = null; // seconds until Herbal Tea's next harmless surprise
  const explained = new Set(); // Strange Brews behaviours already explained this pot

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

  /** Flash the lanes a shot just went down (the renderer draws it over the aim highlight). */
  function pulseLanes(lanes, tone, life = 0.22) {
    fx.aimPulses.push({ lanes, tone, time: life, life });
    if (fx.aimPulses.length > 12) fx.aimPulses.shift();
  }

  function popup(text, radius, angle, color, life = 1) {
    const p = toCanvasPoint(radius, angle);
    fx.popups.push({ text, x: p.x, y: p.y - 10, color, time: life, life });
    if (fx.popups.length > 16) fx.popups.shift();
  }

  /** Explain a new behaviour the first time it turns up in a pot. */
  function explainOnce(id, text, color) {
    if (explained.has(id)) return;
    explained.add(id);
    say(text, { color, life: 3 });
  }

  /** Clear everything that belongs to one stretch of play. */
  function clearScene() {
    fx.particles = [];
    fx.flash = 0;
    fx.glints = [];
    fx.rebounds = [];
    fx.aimPulses = [];
    fx.banner = null;
    fx.popups = [];
    fx.ghosts = [];
    fx.shake = 0;
    fx.pods = [];
    fx.flyingBeans = [];
    fx.teaCard = null;
    fx.chapterCard = null;
    fx.impacts = [];
    fx.mends = [];
  }

  /** Coffee-coloured steam, billowing up from a point. */
  function steamCloud(count, x, y, spread, speed = 1) {
    for (let i = 0; i < count; i++) {
      const life = rnd(0.7, 1.8);
      fx.particles.push({
        x: x + rnd(-spread, spread), y: y + rnd(-spread * 0.6, spread * 0.6),
        vx: rnd(-40, 40) * speed, vy: rnd(-70, -10) * speed, time: life, life,
        color: ['#b08a6a', '#d8c0a8', '#8a6a52', '#e8dccb'][i % 4], size: rnd(3, 8),
      });
    }
  }

  /** Beans (or pods) flung out from the middle of the cup. */
  function fling(list, count, speedMin, speedMax, [lifeMin, lifeMax] = [0.8, 1.6]) {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, TAU);
      const speed = rnd(speedMin, speedMax);
      const p = toCanvasPoint(rnd(0, 40), a);
      const life = rnd(lifeMin, lifeMax);
      list.push({ x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 60, spin: rnd(0, TAU), time: life, life });
    }
  }

  /** Spoon sparkles: silver, or gold. */
  function spoonBurst(count, angle, colors, speed = 1.4) {
    burst(count, () => SPOON_RADIUS + rnd(-10, 6), () => angle + rnd(-0.08, 0.08),
      (i) => colors[i % colors.length], () => rnd(0.4, 1.1), speed);
  }

  const handlers = {
    matchStart() {
      fx.shatter = null;
      fx.cupClock = 0;
      strained = false;
      burnedOnce = false;
      grindMet = false;
      warned = false;
      explained.clear();
      fx.discovery = null;
    },
    roundStart({ fortune, tea = 'house', round = 1, debut = false, chapter = 1, opens = false }) {
      clearScene();
      golden = null;
      prismatic = null;
      goldLeaf = null;
      bigSpoon = null;
      prankTimer = fortune === 'lie' ? rnd(3, 10) : null;
      herbalTimer = tea === 'herbal' ? rnd(4, 8) : null;
      // A new chapter is announced first, with a shower of gold, and the tea card waits for it.
      if (opens) {
        fx.chapterCard = { chapter, time: CHAPTER_CARD, life: CHAPTER_CARD };
        burst(60, () => rnd(170, 255), () => -Math.PI / 2 + rnd(-0.7, 0.7),
          (i) => [GOLD, '#fff8e2', '#f2c13e', '#ffd6a0'][i % 4], () => rnd(0.7, 1.6), 1.6);
      }
      // Every cup after the first announces its tea, briefly, and more briefly as the pot goes on;
      // a tea that has just come on tap takes a little longer.
      const life = debut ? 3.4 : round > 8 ? 2.2 : 2.8;
      fx.teaCard = round > 1 ? { tea, debut, delay: opens ? CHAPTER_CARD : 0, time: life, life } : null;
      if (fortune) say(`“${FORTUNES[fortune].quote}”`, { color: FORTUNES[fortune].color });
      else hush();
    },
    dayStart({ choice }) {
      const fresh = choice === 'fresh';
      fx.banner = {
        title: fresh ? 'A FRESH START' : 'THE KETTLE STAYS ON',
        words: fresh ? 'The leaves have agreed to behave. For now.' : 'The spoon has made a questionable decision.',
        time: 2.6, life: 2.6,
      };
      if (fx.teaCard) fx.teaCard.delay += 2.6;
    },
    milkPulse() {
      // A ring of cream rushing in from all round the rim.
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU + rnd(-0.05, 0.05);
        const p = toCanvasPoint(RIM - rnd(2, 10), a);
        const speed = rnd(70, 120);
        const life = rnd(0.35, 0.6);
        fx.particles.push({
          x: p.x, y: p.y, vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed, time: life, life, color: '#f4efe4', size: rnd(1.2, 2.4),
        });
      }
      explainOnce('pulse', 'The milk ripples through the whole cup: every leaf slows for a moment.', '#f4efe4');
    },
    dartWarn({ radius, angle }) {
      burst(6, () => radius + rnd(-6, 6), () => angle + rnd(-0.05, 0.05), DART_GREEN, () => rnd(0.2, 0.45), 0.6);
      explainOnce('dart', 'That leaf is crouching. Darting leaves sprint after a flicker.', DART_GREEN);
    },
    dart({ radius, angle }) {
      burst(10, () => radius - rnd(0, 16), () => angle + rnd(-0.03, 0.03), (i) => (i % 2 ? DART_GREEN : '#f4fff0'),
        () => rnd(0.2, 0.5), 0.8, [1, 2.4]);
    },
    wanderWarn() {
      explainOnce('wander', 'A lavender curl: that leaf is about to change lanes.', WANDER_LAVENDER);
    },
    wander({ radius, angle }) {
      burst(8, () => radius + rnd(-6, 6), () => angle + rnd(-0.06, 0.06), WANDER_LAVENDER, () => rnd(0.4, 0.9), 0.5);
    },
    currentWarn() {
      if (explained.has('current')) {
        if (random() < 0.35) say(pick(CURRENT_WORDS), { color: SPICE, life: 2 });
      } else {
        explainOnce('current', 'A spice current is coming! Every leaf will slide one lane the way the arrows point.', SPICE);
      }
    },
    steam({ lane, twin, golden: gilded }) {
      pulseLanes([lane], gilded ? 'golden' : 'steam');
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
    sugar({ lanes }) {
      pulseLanes(lanes, 'sugar', 0.4);
    },
    nova({ count, golden: gilded }) {
      pulseLanes(Array.from({ length: CONFIG.arena.lanes }, (_, lane) => lane), 'nova', 0.6);
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
      herbalTimer = null;
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
      herbalTimer = null;
      golden = null;
      prismatic = null;
      goldLeaf = null;
      bigSpoon = null;
      hush();
      // The cup breaks: the renderer parts the porcelain; a little tea and glaze fly.
      fx.shatter = { age: 0 };
      const calm = tea.liquid.reduced;
      burst(calm ? 12 : 40, () => RIM + rnd(0, 40), () => rnd(0, TAU), (i) => (i % 3 ? '#eee8ce' : '#8fae92'),
        () => rnd(0.5, 1.2), calm ? 0.4 : 1.8, [1.5, 3.5]);
      burst(calm ? 8 : 26, () => RIM + rnd(-4, 20), () => rnd(0, TAU), (i) => (i % 2 ? '#7a4a22' : '#a8672e'),
        () => rnd(0.6, 1.4), calm ? 0.3 : 1.2, [2, 4.5]);
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
    karmaBounce({ angle, radius }) {
      // The rim brightens where it was struck, and a few sparkling drops fly back into the tea.
      const calm = tea.liquid.reduced;
      fx.rebounds.push({ kind: 'bounce', angle, radius, time: 0.55, life: 0.55 });
      burst(calm ? 5 : 12, () => RIM - rnd(4, 16), () => angle + rnd(-0.07, 0.07), (i) => (i % 2 ? KARMA : '#fff4fb'),
        () => rnd(0.3, 0.6), calm ? 0.5 : 1.3, [1, 2.4]);
      if (!explained.has('karma')) explainOnce('karma', 'INSTANT KARMA! The rim sends each leaf back once. If it returns: poof.', KARMA);
      else if (!fx.whisper && !queue.length && random() < 0.25) say(pick(KARMA_REMARKS), { color: KARMA, life: 1.6 });
    },
    karmaPuff({ angle, radius }) {
      // A soft round puff of pale steam, nothing like a kill's green crumbs.
      const calm = tea.liquid.reduced;
      fx.rebounds.push({ kind: 'puff', angle, radius, time: 0.5, life: 0.5 });
      burst(calm ? 6 : 16, () => radius - rnd(0, 10), () => angle + rnd(-0.05, 0.05), (i) => (i % 3 ? '#f7f1f5' : KARMA),
        () => rnd(0.45, 0.9), calm ? 0.3 : 0.7, [2.5, 6]);
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
    kill({ radius, angle, by }) {
      if (by === 'wake') {
        // Churned out over the rim by the Silver Tornado.
        burst(14, () => radius + rnd(-4, 10), () => angle + rnd(-0.08, 0.08),
          (i) => (i % 2 ? '#ffffff' : '#cfe6e8'), () => rnd(0.3, 0.7), 2);
      } else if (by === 'splash') {
        burst(16, () => radius + rnd(-8, 8), () => angle + rnd(-0.07, 0.07),
          (i) => (i % 2 ? GOLD : '#fff8e2'), () => rnd(0.3, 0.8), 1.6);
      } else {
        burst(9, () => radius + rnd(-8, 8), () => angle + rnd(-0.07, 0.07),
          (i) => (i % 3 === 0 ? '#efe4b4' : '#b4dcc0'), () => rnd(0.25, 0.7));
      }
    },
    discover({ id }) {
      fx.discovery = { id, time: 4, life: 4 };
      burst(50, () => rnd(170, 255), () => -Math.PI / 2 + rnd(-0.6, 0.6),
        (i) => ['#c79bff', '#ffd36b', '#8dffb8', '#7ccfff', '#ffffff'][i % 5], () => rnd(0.6, 1.4), 1.6);
    },
    escape({ angle, lives = CONFIG.lives, fracture = null }) {
      fx.flash = 0.5;
      burst(20, () => CONFIG.arena.rimRadius, () => angle + rnd(-0.1, 0.1), '#e6ad82', 0.7);
      // The porcelain answers: a flash along the new fracture, and a few flakes of glaze.
      if (fracture) fx.impacts.push({ id: fracture.id, time: 0.7, life: 0.7 });
      burst(10, () => RIM + rnd(14, 44), () => angle + rnd(-0.05, 0.05), (i) => (i % 2 ? '#eee8ce' : '#8fae92'),
        () => rnd(0.3, 0.7), 0.9, [1, 2.4]);
      if (lives >= CONFIG.lives) say('A chip in the glaze. The cup holds steady.', { color: '#e4eef0', life: 2.6 });
      else if (lives === CONFIG.lives - 1) say('The porcelain cracks.', { color: '#e6ad82', life: 2.4 });
      else if (lives === 1) say('STRUCTURAL FAILURE IMMINENT. One more spill and the cup breaks.', { color: AMBER, life: 3.6 });
      else if (lives > 1 && random() < 0.15) say(pick(ESCAPE_REMARKS), { color: '#e6ad82', life: 2.4 });
    },
    mend({ id, angle, source }) {
      // Gold runs into the crack.
      fx.mends.push({ id, time: 1.6, life: 1.6 });
      burst(26, () => RIM + rnd(-8, 46), () => angle + rnd(-0.06, 0.06), (i) => (i % 3 ? GOLD : '#fff8e2'),
        () => rnd(0.5, 1.2), 0.8, [1, 2.6]);
      // The golden cube and the Perfect Brew announce their own rewards.
      if (source === 'goldenLeaf') say('Kintsugi: the crack is filled with gold. The cup is stronger for it.', { color: GOLD, life: 3.6 });
    },
    goldenLeafAppear({ radius, angle }) {
      goldLeaf = { radius, angle };
      burst(20, () => radius + rnd(-6, 6), () => angle + rnd(-0.05, 0.05), (i) => (i % 2 ? GOLD : '#fff8e2'),
        () => rnd(0.4, 0.9), 1.2);
      say('A golden leaf! Steam it to mend the cup.', { color: GOLD, life: 3 });
    },
    goldenLeafCatch({ radius, angle }) {
      goldLeaf = null;
      burst(40, () => radius + rnd(-8, 8), () => angle + rnd(-0.06, 0.06), (i) => (i % 3 ? GOLD : '#fff8e2'),
        () => rnd(0.5, 1.2), 2);
    },
    goldenLeafGone({ radius, angle, mended }) {
      goldLeaf = null;
      burst(8, () => radius + rnd(-5, 5), () => angle + rnd(-0.04, 0.04), '#b39a5a', () => rnd(0.3, 0.7));
      if (!mended) say('The golden leaf sinks out of reach.', { color: '#c9b27a', life: 2.6 });
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

    // Hot Chocolate Havoc.
    chocolateStart() {
      clearScene();
      hush();
      perfects = 0;
    },
    havocStart() {
      say('This is not tea.', { color: COCOA, life: 2.4 });
      say('Toast, don’t torch: tap, don’t hold.', { color: COCOA, then: true });
    },
    flame({ lane, golden: gilded }) {
      pulseLanes([lane], gilded ? 'golden' : 'flame', 0.18);
      const angle = -Math.PI / 2 + lane * LANE_STEP;
      burst(2, () => RIM - rnd(10, 18), () => angle + rnd(-0.05, 0.05), (i) => (i % 2 ? '#ffb347' : '#ff7a2a'),
        () => rnd(0.15, 0.35), 0.6, [1, 2]);
    },
    toast({ radius, angle, stage }) {
      burst(stage === 'toasted' ? 8 : 5, () => radius + rnd(-6, 6), () => angle + rnd(-0.05, 0.05),
        (i) => (i % 2 ? '#ffcf7a' : '#ff9a3c'), () => rnd(0.2, 0.5), 0.9, [1, 2.4]);
    },
    burn({ radius, angle }) {
      burst(16, () => radius + rnd(-6, 6), () => angle + rnd(-0.06, 0.06), (i) => (i % 3 ? '#6e625b' : '#ff6a2a'),
        () => rnd(0.5, 1.2), 0.8, [2, 4]);
      if (!burnedOnce) {
        burnedOnce = true;
        say('Too hot! Let them cool between flames.', { color: '#ff9a6a' });
      } else if (random() < 0.25) {
        say(pick(BURN_REMARKS), { color: '#ff9a6a', life: 2.4 });
      }
    },
    perfect({ radius, angle, points, size }) {
      perfects++;
      const p = toCanvasPoint(radius, angle);
      fx.ghosts.push({ x: p.x, y: p.y, size, spin: angle, time: 0.9, life: 0.9 });
      burst(22, () => radius + rnd(-8, 8), () => angle + rnd(-0.06, 0.06), (i) => (i % 3 ? GOLD : '#fff8e2'),
        () => rnd(0.4, 1), 1.6);
      popup(`+${points}`, radius, angle, GOLD, 1.1);
      if (perfects === 1) say('Perfect! They pop out by themselves.', { color: GOLD, life: 2.6 });
      else if (perfects % 5 === 0) say(pick(PERFECT_REMARKS), { color: GOLD, life: 2.2 });
    },
    scoop({ radius, angle, stage, points, how }) {
      if (how !== 'rim') return;
      // Scooped at the rim, with a little splash of chocolate.
      burst(12, () => RIM - rnd(0, 8), () => angle + rnd(-0.1, 0.1), (i) => (i % 3 ? '#7a3f1f' : '#c58a5a'),
        () => rnd(0.3, 0.7), 1.6, [1.5, 3.4]);
      if (points > 0) popup(`+${points}`, radius, angle, stage === 'burned' ? '#b8a89c' : COCOA, 0.9);
      else if (random() < 0.3) say(pick(RAW_REMARKS), { color: COCOA, life: 2.2 });
    },
    crumble({ radius, angle }) {
      burst(14, () => radius + rnd(-6, 6), () => angle + rnd(-0.06, 0.06), (i) => (i % 2 ? '#3a2a22' : '#7a6e66'),
        () => rnd(0.4, 0.9), 1.2, [1.5, 3]);
    },
    giantAppear({ radius, angle }) {
      burst(24, () => radius + rnd(-10, 10), () => angle + rnd(-0.1, 0.1), (i) => MARSHMALLOW[i % 2], () => rnd(0.4, 1), 1.4);
      say('That marshmallow is… larger than usual.', { color: '#f6ead8' });
    },
    giantGrow({ radius, angle, left }) {
      burst(6, () => radius + rnd(-14, 14), () => angle + rnd(-0.1, 0.1), (i) => MARSHMALLOW[i % 2], () => rnd(0.3, 0.6), 1);
      if (left === 3) say('It is getting… bigger?', { color: '#f6ead8', life: 2 });
    },
    catastrophe({ radius, angle }) {
      fx.banner = { title: 'MARSHMALLOW CATASTROPHE!', words: pick(CATASTROPHE_WORDS), time: 3.4, life: 3.4 };
      fx.shake = 0.45;
      // A shower of tiny white particles.
      const centre = toCanvasPoint(radius, angle);
      for (let i = 0; i < 110; i++) {
        const a = rnd(0, TAU);
        const speed = rnd(60, 300);
        const life = rnd(0.6, 1.6);
        fx.particles.push({
          x: centre.x, y: centre.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 40,
          time: life, life, color: MARSHMALLOW[i % 2], size: rnd(1.2, 3.6),
        });
      }
    },
    giantGone() {
      say('The giant marshmallow wanders off, unbothered.', { color: '#f6ead8' });
    },
    havocEnd() {
      hush();
      fx.banner = null;
    },

    // The Daily Grind.
    grindStart() {
      clearScene();
      hush();
      podTimer = null;
      fx.shake = 0.3;
    },
    grindFight() {
      fx.shake = 0.35;
      podTimer = rnd(8, 14);
      if (!grindMet) {
        grindMet = true;
        say('Steam the safety valve while it’s open!', { color: CREMA, life: 3 });
        say('Mind the beans.', { color: CREMA, then: true, life: 2.2 });
      } else {
        say('It’s back. And it has brewed a grudge.', { color: CREMA, life: 2.6 });
      }
    },
    valveOpen({ lane }) {
      pulseLanes([lane], 'valve', 0.5);
    },
    beans({ lanes }) {
      for (const lane of lanes) {
        const angle = -Math.PI / 2 + lane * LANE_STEP;
        burst(2, () => CONFIG.grind.bodyRadius + rnd(0, 6), () => angle + rnd(-0.05, 0.05), BEAN[lane % 3], () => rnd(0.2, 0.4), 0.6);
      }
    },
    beanCrack({ radius, angle, sugar }) {
      burst(sugar ? 10 : 7, () => radius + rnd(-5, 5), () => angle + rnd(-0.05, 0.05),
        (i) => (i % 3 ? BEAN[i % 2] : '#c89a6a'), () => rnd(0.25, 0.6), 1.1, [1.2, 2.8]);
    },
    beanSplat({ angle }) {
      burst(6, () => RIM - rnd(0, 6), () => angle + rnd(-0.06, 0.06), (i) => BEAN[i % 3], () => rnd(0.3, 0.6), 1.2, [1.2, 2.6]);
    },
    pressureWarn({ lanes }) {
      pulseLanes(lanes, 'danger', 0.35);
      if (!warned) {
        warned = true;
        say('Pressure building! Get out of the red lanes.', { color: '#ff9a7a', life: 2.6 });
      }
    },
    pressureBurst({ lanes }) {
      fx.shake = Math.max(fx.shake, 0.3);
      for (const lane of lanes) {
        const angle = -Math.PI / 2 + lane * LANE_STEP;
        burst(6, () => RIM - rnd(0, 10), () => angle + rnd(-0.08, 0.08), (i) => (i % 2 ? '#6b3d1f' : '#c8915a'),
          () => rnd(0.3, 0.8), 2, [1.5, 3.6]);
      }
    },
    sputter() {
      steamCloud(14, CX, CY - 40, 24, 0.6);
      say('The milk takes the edge off. Briefly.', { color: '#e4eef0', life: 2.4 });
    },
    clank({ angle }) {
      if (random() < 0.5) return;
      burst(2, () => CONFIG.grind.bodyRadius + rnd(0, 6), () => angle + rnd(-0.04, 0.04), '#e8eef0', () => rnd(0.12, 0.3), 1.4, [1, 2]);
    },
    grindHit({ angle, damage, hits }) {
      burst(damage > 1 ? 18 : 8, () => CONFIG.grind.bodyRadius + rnd(0, 10), () => angle + rnd(-0.08, 0.08),
        (i) => (i % 3 ? '#ffb36b' : '#fff1c4'), () => rnd(0.2, 0.6), 1.8, [1.2, 3]);
      popup(`-${damage}`, CONFIG.grind.bodyRadius + 18, angle, damage > 1 ? GOLD : '#ffd0a0', 0.8);
      if (hits % 9 === 4 || (damage > 1 && random() < 0.5)) say(pick(COMPLAINTS), { color: CREMA, life: 1.8 });
    },
    grindRage({ level }) {
      fx.shake = 0.5;
      steamCloud(24, CX, CY - 50, 30, 1.2);
      if (level === 1) {
        fx.banner = { title: 'PRESSURE RISING', words: 'The gauge now reads TOO MUCH.', time: 2.8, life: 2.8 };
        say('I specifically ordered decaf.', { color: CUP_VOICE, life: 2.6 });
      } else {
        fx.banner = { title: 'CRITICAL CAFFEINE', words: 'It is making a noise it should not make.', time: 2.8, life: 2.8 };
      }
    },
    scald({ angle, left }) {
      fx.flash = 0.35;
      fx.shake = Math.max(fx.shake, 0.4);
      burst(22, () => RIM - rnd(0, 10), () => angle + rnd(-0.1, 0.1), (i) => (i % 2 ? '#c8915a' : '#f0a878'), 0.7, 1.6);
      if (left > 0) say(`${pick(SCALD_REMARKS)}${left === 1 ? ' One more and it gets away.' : ''}`, { color: '#ff9a7a', life: 2.4 });
    },
    grindDefeat({ perfect }) {
      hush();
      podTimer = null;
      fx.banner = null;
      fx.shake = 0.8;
      // Coffee everywhere, and every bean it was saving.
      fling(fx.flyingBeans, 70, 120, 420);
      steamCloud(40, CX, CY - 20, 40, 1.6);
      for (let i = 0; i < 80; i++) {
        const a = rnd(0, TAU);
        const speed = rnd(80, 380);
        const life = rnd(0.5, 1.3);
        fx.particles.push({
          x: CX, y: CY, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, time: life, life,
          color: ['#6b3d1f', '#c8915a', '#3b200e', '#e0b48a'][i % 4], size: rnd(1.5, 4),
        });
      }
      say(pick(VICTORY_WORDS), { color: CREMA, life: 2.4 });
      if (perfect) say('Not a single drop spilled.', { color: GOLD, then: true, life: 3 });
    },
    grindEscape() {
      hush();
      podTimer = null;
      fx.banner = null;
      steamCloud(70, CX, CY - 10, 60, 1);
      say('“You’ll be hearing from my manager.”', { color: CREMA, life: 3.2 });
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
      const paused = state?.phase === PHASE.PAUSED;
      if (!paused) {
        fx.cupClock += dt;
        if (fx.shatter && state?.phase === PHASE.GAME_OVER) fx.shatter.age += dt;
        for (const list of [fx.impacts, fx.mends]) {
          for (let i = list.length - 1; i >= 0; i--) {
            list[i].time -= dt;
            if (list[i].time <= 0) list.splice(i, 1);
          }
        }
      }
      for (const list of [fx.glints, fx.rebounds, fx.aimPulses]) {
        for (let i = list.length - 1; i >= 0; i--) {
          list[i].time -= dt;
          if (list[i].time <= 0) list.splice(i, 1);
        }
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
      const grind = grindInProgress(state);
      const fighting = grind?.stage === 'fight' && state.phase !== PHASE.PAUSED;
      const toasting = (havocInProgress(state)?.stage === 'play' && state.phase !== PHASE.PAUSED) || fighting;
      if ((playing || toasting) && state.goldenSpoon > 0 && random() < dt * 18) {
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
      if (playing && goldLeaf && state.goldenLeaf && random() < dt * 10) {
        const leaf = state.goldenLeaf;
        burst(1, () => leaf.radius + rnd(-12, 12), () => leaf.angle + rnd(-0.05, 0.05), GOLD, () => rnd(0.4, 0.8), 0.35);
      }
      if (playing && prismatic && random() < dt * 24) {
        burst(1, () => prismatic.radius + rnd(-12, 12), () => prismatic.angle + rnd(-0.05, 0.05),
          () => pick(PRISM), () => rnd(0.3, 0.6), 0.6);
      }
      if (playing) {
        // Leaves gliding sideways leave a brief trail: lavender for a wanderer, spice for a current.
        for (const e of state.enemies) {
          if (!e.glide || random() > dt * 40) continue;
          const color = state.current?.stage === 'flowing' ? SPICE : WANDER_LAVENDER;
          burst(1, () => e.radius + rnd(-4, 4), () => e.angle + rnd(-0.03, 0.03), color, () => rnd(0.35, 0.7), 0.25, [1, 2.2]);
        }
      }
      if (playing && herbalTimer !== null) {
        herbalTimer -= dt;
        if (herbalTimer <= 0) {
          herbalTimer = rnd(7, 13);
          tea.handle({ type: 'herbal', kind: random() < 0.55 ? 'blossom' : 'petals' });
          if (random() < 0.6) say(pick(HERBAL_WORDS), { color: TEAS.herbal.color, life: 3 });
        }
      }

      if (fighting) {
        // The machine leaks steam, more the angrier it gets, and later spits out defective pods.
        const f = fury(grind);
        if (random() < dt * (1.5 + 10 * f)) steamCloud(1, CX + rnd(-30, 30), CY - 62, 4, 0.5 + f);
        if (podTimer !== null && f > 0.45) {
          podTimer -= dt;
          if (podTimer <= 0) {
            podTimer = rnd(6, 11);
            fling(fx.pods, 1, 160, 240, [1.2, 1.6]);
            if (random() < 0.6) say(pick(POD_WORDS), { color: CUP_VOICE, life: 2.2 });
          }
        }
      }

      if (state?.phase !== PHASE.PAUSED) {
        fx.shake = Math.max(0, fx.shake - dt);
        for (const list of [fx.pods, fx.flyingBeans]) {
          for (let i = list.length - 1; i >= 0; i--) {
            const b = list[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.vy += 240 * dt; // they arc and fall
            b.spin += dt * 9;
            b.time -= dt;
            if (b.time <= 0) list.splice(i, 1);
          }
        }
        if (fx.banner) {
          fx.banner.time -= dt;
          if (fx.banner.time <= 0) fx.banner = null;
        }
        for (const list of [fx.popups, fx.ghosts]) {
          for (let i = list.length - 1; i >= 0; i--) {
            list[i].time -= dt;
            if (list[i].time <= 0) list.splice(i, 1);
          }
        }
        for (const p of fx.popups) p.y -= dt * 34;
        for (const g of fx.ghosts) g.y -= dt * 46;
        if (fx.discovery) {
          fx.discovery.time -= dt;
          if (fx.discovery.time <= 0) fx.discovery = null;
        }
        if (fx.chapterCard) {
          fx.chapterCard.time -= dt;
          if (fx.chapterCard.time <= 0) fx.chapterCard = null;
        }
        if (fx.teaCard?.delay > 0) fx.teaCard.delay = Math.max(0, fx.teaCard.delay - dt);
        else if (fx.teaCard) {
          fx.teaCard.time -= dt;
          if (fx.teaCard.time <= 0) fx.teaCard = null;
        }
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
