// DOM heads-up display: status pills, the side panels, and the spoon upgrade
// offer shown during some readings.
//
// update() runs every frame but only writes text that actually changed.

import { CONFIG } from '../config.js';
import { OFFER_AT } from '../core/game.js';
import { PHASE } from '../core/state.js';
import { FORTUNES } from '../gameplay/fortunes.js';
import { UPGRADES, strainerCapacity } from '../gameplay/upgrades.js';
import { sugarCapacity } from '../gameplay/weapons.js';

const COPY = {
  status: {
    [PHASE.READY]: 'READY TO BREW',
    [PHASE.PLAYING]: 'DEFEND THE RIM',
    [PHASE.PAUSED]: 'PAUSED',
    [PHASE.READING]: 'READING THE LEAVES',
    [PHASE.GAME_OVER]: 'THE CUP RUNNETH OVER',
  },
  title: {
    [PHASE.READY]: () => 'The kettle waits',
    [PHASE.PLAYING]: (s) => `Cup ${s.round}: the storm stirs`,
    [PHASE.PAUSED]: () => 'A moment to steep',
    [PHASE.READING]: () => 'The leaves have spoken',
    [PHASE.GAME_OVER]: () => 'The last drop',
  },
  button: {
    [PHASE.READY]: 'Brew the first cup →',
    [PHASE.PLAYING]: 'Pause / resume (P)',
    [PHASE.PAUSED]: 'Resume cup →',
    [PHASE.READING]: 'Brew the next cup →',
    [PHASE.GAME_OVER]: 'Start a fresh pot →',
  },
  tip: {
    [PHASE.READY]: 'Defend the rim. Your defeated leaves are the seeds of the next fortune.',
    [PHASE.PLAYING]: 'Keep tea leaves from escaping the rim. Every defeated leaf joins your final reading.',
    [PHASE.PAUSED]: 'The kettle is on hold.',
    [PHASE.READING]: 'The pattern was made by the leaves you defeated, though the leaves have opinions of their own. The omen applies to the next cup.',
    [PHASE.GAME_OVER]: 'Three spills end the pot. Brew again to rewrite the future.',
  },
};

const pad = (n, width) => String(n).padStart(width, '0');
const pips = (level, max) => '●'.repeat(level) + '○'.repeat(max - level);

/** The status pill: the phase, or during play the Golden Spoon or a recovering cup. */
function statusText(state) {
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
  if (!fortune || (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PAUSED)) return '';
  return `✦ ${fortune.name} · ${fortune.tag} · ${omenStatus(state)}`;
}

/** The Leaves Lie keeps up appearances until it changes its mind. */
const stillLying = (state) => state.phase === PHASE.READING && state.nextFortune === 'lie'
  && state.readingTime < CONFIG.fortunes.lieRetractAt;

/** All HUD text for a state, keyed by element id. Pure, for easy testing. */
export function hudText(state) {
  const shown = state.phase === PHASE.READING ? state.nextFortune : state.fortune;
  const fortune = shown ? FORTUNES[shown] : null;
  const offering = state.phase === PHASE.READING && !!state.offer;
  const strainer = `${state.strainerLeft}/${strainerCapacity(state.spoon)}`;
  return {
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
    fortuneLabel: state.phase === PHASE.READING
      ? 'Fortune for the next cup'
      : fortune ? 'This cup’s omen' : 'Next cup’s omen',
    fortuneName: stillLying(state) ? 'Something Wonderful' : fortune ? fortune.name : 'Not yet written',
    fortuneDetail: stillLying(state)
      ? 'The leaves are unusually confident about this.'
      : fortune
        ? `“${fortune.quote}” ${fortune.info}`
        : 'Finish a round to read the leaves. How you play nudges what they foretell.',
    hudOmen: omenText(state, fortune),
  };
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
