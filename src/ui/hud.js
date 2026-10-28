// DOM heads-up display: status pills, the side panels, and the spoon upgrade
// offer shown during some readings.
//
// update() runs every frame but only writes text that actually changed.

import { CONFIG } from '../config.js';
import { OFFER_AT } from '../core/game.js';
import { PHASE } from '../core/state.js';
import { havocInProgress } from '../gameplay/chocolate.js';
import { FORTUNES } from '../gameplay/fortunes.js';
import { grindInProgress } from '../gameplay/grind.js';
import { UPGRADES, strainerCapacity } from '../gameplay/upgrades.js';
import { sugarCapacity } from '../gameplay/weapons.js';

const COPY = {
  status: {
    [PHASE.READY]: 'READY TO BREW',
    [PHASE.PLAYING]: 'DEFEND THE RIM',
    [PHASE.PAUSED]: 'PAUSED',
    [PHASE.READING]: 'READING THE LEAVES',
    [PHASE.CHOCOLATE]: 'HOT CHOCOLATE HAVOC',
    [PHASE.GRIND]: 'THE DAILY GRIND',
    [PHASE.GAME_OVER]: 'THE CUP RUNNETH OVER',
  },
  title: {
    [PHASE.READY]: () => 'The kettle waits',
    [PHASE.PLAYING]: (s) => `Cup ${s.round}: the storm stirs`,
    [PHASE.PAUSED]: () => 'A moment to steep',
    [PHASE.READING]: () => 'The leaves have spoken',
    [PHASE.CHOCOLATE]: () => HAVOC.title.play,
    [PHASE.GRIND]: () => GRIND.title.fight,
    [PHASE.GAME_OVER]: () => 'The last drop',
  },
  button: {
    [PHASE.READY]: 'Brew the first cup →',
    [PHASE.PLAYING]: 'Pause / resume (P)',
    [PHASE.PAUSED]: 'Resume cup →',
    [PHASE.READING]: 'Brew the next cup →',
    [PHASE.CHOCOLATE]: 'Pause / resume (P)',
    [PHASE.GRIND]: 'Pause / resume (P)',
    [PHASE.GAME_OVER]: 'Start a fresh pot →',
  },
  tip: {
    [PHASE.READY]: 'Defend the rim. Your defeated leaves are the seeds of the next fortune.',
    [PHASE.PLAYING]: 'Keep tea leaves from escaping the rim. Every defeated leaf joins your final reading.',
    [PHASE.PAUSED]: 'The kettle is on hold.',
    [PHASE.CHOCOLATE]: '',
    [PHASE.GRIND]: '',
    [PHASE.READING]: 'The pattern was made by the leaves you defeated, though the leaves have opinions of their own. The omen applies to the next cup.',
    [PHASE.GAME_OVER]: 'Three spills end the pot. Brew again to rewrite the future.',
  },
};

// Hot Chocolate Havoc, stage by stage.
const HAVOC = {
  status: { intro: () => 'THE CHOCOLATE PROPHECY', play: (c) => `HOT CHOCOLATE HAVOC · ${Math.ceil(c.left)}s`, outro: () => 'BACK TO TEA' },
  title: { intro: 'Something is brewing…', play: 'Bonus: Hot Chocolate Havoc', outro: 'A sweeter interlude' },
  button: { intro: 'Skip to the marshmallows →', play: 'Pause / resume (P)', outro: 'Back to the tea →' },
  tip: {
    intro: 'This is not tea.',
    play: 'Toast, don’t torch: give each marshmallow a few well-spaced flames. Heat one too fast and it catches fire. Perfect ones pop out by themselves; the rest are scooped up at the rim. Nothing here costs a cup.',
    outro: 'Your spoon, your cups, and the next fortune are exactly as you left them.',
  },
};

// The Daily Grind, stage by stage. The outro depends on how it went.
const GRIND = {
  status: {
    intro: () => 'SOMEONE ORDERED TROUBLE',
    fight: (g) => `THE DAILY GRIND · ${Math.ceil(g.left)}s`,
    outro: (g) => (g.result === 'victory' ? 'ORDER UP' : 'THE MACHINE ESCAPES'),
  },
  title: { intro: 'Something is percolating…', fight: 'Boss: The Daily Grind', outro: 'Back to the tea' },
  button: { intro: 'Skip the entrance →', fight: 'Pause / resume (P)', outro: 'Back to the tea →' },
  tip: {
    intro: 'A double shot of trouble.',
    fight: 'Steam the safety valve while it’s open. Dodge the glowing lanes before the pressure blows, and shoot or sidestep the beans. Milk washes beans back and makes the machine sputter; sugar hits the valve hard. Three scalds and it gets away, but it can’t cost you a cup.',
    outro: 'Your cups, your spoon, and the next fortune are exactly as you left them.',
  },
};

const pad = (n, width) => String(n).padStart(width, '0');
const pips = (level, max) => '●'.repeat(level) + '○'.repeat(max - level);

/** The status pill: the phase, or during play the Golden Spoon or a recovering cup. */
function statusText(state) {
  if (state.phase === PHASE.CHOCOLATE) return HAVOC.status[state.chocolate.stage](state.chocolate);
  if (state.phase === PHASE.GRIND) return GRIND.status[state.grind.stage](state.grind);
  if (state.phase === PHASE.PLAYING) {
    if (state.goldenSpoon > 0) return `✦ GOLDEN SPOON ${Math.ceil(state.goldenSpoon)}s`;
    if (state.graceTime > 0) return 'THE CUP RECOVERS';
  }
  return COPY.status[state.phase];
}

/** The spoon's upgrades in a compact line, e.g. "✦ Polished ●○○ · ◎ Strainer ●●". */
export function spoonKitText(state) {
  const parts = Object.values(UPGRADES)
    .filter((u) => state.spoon[u.id] > 0)
    .map((u) => `${u.icon} ${u.short} ${pips(state.spoon[u.id], u.max)}`);
  if (state.goldenSpoon > 0) parts.push('✶ golden, for now');
  return parts.length ? parts.join(' · ') : 'An ordinary silver spoon.';
}

/**
 * The upgrade cards to show, or null while no offer is open. Each shows the
 * level the upgrade would reach.
 */
export function offerCards(state) {
  if (state.phase !== PHASE.READING || !state.offer || state.readingTime < OFFER_AT) return null;
  return state.offer.map((id) => {
    const u = UPGRADES[id];
    return { id, title: `${u.name} ${pips(state.spoon[id] + 1, u.max)}`, info: u.info };
  });
}

/** A live detail for the omen pill, for fortunes with something to count down. */
function omenStatus(state) {
  const { modifiers } = state;
  if (modifiers.sugarRegenInterval && state.sugarLeft < sugarCapacity(state)) {
    return `next lump ${Math.ceil(state.sugarRegenTimer)}s`;
  }
  if (modifiers.goldenCube) {
    if (state.golden) return `GOLD! ${Math.ceil(state.golden.time)}s`;
    if (state.goldenTimer === null) return 'spent';
  }
  return 'this cup';
}

/** The small in-play indicator of the fortune shaping this round. */
function omenText(state, fortune) {
  if (!fortune || havocInProgress(state) || grindInProgress(state) || (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PAUSED)) return '';
  return `✦ ${fortune.name} · ${fortune.tag} · ${omenStatus(state)}`;
}

/** The Leaves Lie keeps up appearances until it changes its mind. */
const stillLying = (state) => state.phase === PHASE.READING && state.nextFortune === 'lie'
  && state.readingTime < CONFIG.fortunes.lieRetractAt;

/** All HUD text for a state, keyed by element id. Pure, for easy testing. */
export function hudText(state) {
  const havoc = havocInProgress(state);
  const grind = grindInProgress(state);
  // Between rounds (a reading, the bonus, or the boss) the panel looks ahead to the next cup.
  const between = state.phase === PHASE.READING || !!havoc || !!grind;
  const shown = between ? state.nextFortune : state.fortune;
  const fortune = shown ? FORTUNES[shown] : null;
  const offering = state.phase === PHASE.READING && !!state.offer;
  const strainer = `${state.strainerLeft}/${strainerCapacity(state.spoon)}`;
  const values = {
    hudStatus: statusText(state),
    hudScore: `SCORE ${pad(state.score, 4)}`,
    hudLives: `CUPS ${'♥ '.repeat(Math.max(0, state.lives))}${'♡ '.repeat(Math.max(0, CONFIG.lives - state.lives))}`,
    roundTitle: COPY.title[state.phase](state),
    roundNum: pad(state.round, 2),
    killCount: `${state.kills} / ${state.target}`,
    milkCount: String(state.milkLeft),
    sugarCount: String(state.sugarLeft),
    hudStrainer: `STRAINER ${strainer}`,
    strainerCount: strainer.replace('/', ' / '),
    spoonKit: spoonKitText(state),
    mainBtn: offering ? 'Choose a spoon upgrade (1 / 2)' : COPY.button[state.phase],
    gameTip: offering
      ? 'The cupboard offers assistance. Pick one spoon upgrade; it stays with you until the pot runs dry.'
      : COPY.tip[state.phase],
    fortuneLabel: between
      ? 'Fortune for the next cup'
      : fortune ? 'This cup’s omen' : 'Next cup’s omen',
    fortuneName: stillLying(state) ? 'Something Wonderful' : fortune ? fortune.name : 'Not yet written',
    fortuneDetail: stillLying(state)
      ? 'The leaves are unusually confident about this.'
      : fortune
        ? `“${fortune.quote}” ${fortune.info}`
        : 'Finish a round to read the leaves. How you play nudges what they foretell.',
    hudOmen: omenText(state, fortune),
    killLabel: 'Leaves cleared',
  };
  if (havoc) {
    const { tally, stage } = havoc;
    Object.assign(values, {
      roundTitle: HAVOC.title[stage],
      roundNum: `${pad(state.round, 2)}½`, // between cups, and not a cup of its own
      killLabel: 'Marshmallows toasted',
      killCount: `${tally.perfect} perfect · ${tally.toasted} toasted`,
      gameTip: HAVOC.tip[stage],
    });
    if (state.phase === PHASE.CHOCOLATE) values.mainBtn = HAVOC.button[stage];
  }
  if (grind) {
    const left = CONFIG.grind.scalds - grind.scalds;
    Object.assign(values, {
      roundTitle: GRIND.title[grind.stage],
      roundNum: `${pad(state.round, 2)}½`,
      killLabel: 'Machine pressure',
      killCount: `${grind.health} / ${CONFIG.grind.health}`,
      hudStrainer: `SCALDS ${'● '.repeat(grind.scalds)}${'○ '.repeat(Math.max(0, left))}`.trim(),
      gameTip: GRIND.tip[grind.stage],
    });
    if (state.phase === PHASE.GRIND) values.mainBtn = GRIND.button[grind.stage];
  }
  return values;
}

export function createHud(doc = document) {
  const elements = {};
  const shown = {};
  const offer = doc.getElementById('upgradeOffer');
  const cards = offer ? [...offer.querySelectorAll('[data-choice]')] : [];
  let shownOffer = null;

  /** Show, fill, or hide the upgrade offer. */
  function updateOffer(state) {
    const view = offerCards(state);
    const key = view ? view.map((card) => card.title).join('|') : null;
    if (!offer || key === shownOffer) return;
    shownOffer = key;
    offer.hidden = !view;
    cards.forEach((card, i) => {
      const choice = view?.[i];
      card.hidden = !choice;
      if (!choice) return;
      card.dataset.upgrade = choice.id;
      card.querySelector('strong').textContent = choice.title;
      card.querySelector('small').textContent = choice.info;
    });
  }

  return {
    update(state) {
      updateOffer(state);
      const values = hudText(state);
      // The omen pill takes its fortune's tone (good, trouble, odd) for colour.
      const omen = (elements.hudOmen ??= doc.getElementById('hudOmen'));
      const tone = values.hudOmen && state.fortune ? FORTUNES[state.fortune].tone : '';
      if (omen && omen.dataset.tone !== tone) omen.dataset.tone = tone;
      for (const id in values) {
        if (shown[id] === values[id]) continue;
        elements[id] ??= doc.getElementById(id);
        if (elements[id]) elements[id].textContent = values[id];
        shown[id] = values[id];
      }
    },
  };
}
