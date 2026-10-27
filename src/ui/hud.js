// DOM heads-up display: status pills and the side panels.
//
// update() runs every frame but only writes text that actually changed.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { FORTUNES } from '../gameplay/fortunes.js';

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

/** A live detail for the omen pill, for fortunes with something to count down. */
function omenStatus(state) {
  const { modifiers } = state;
  if (modifiers.sugarRegenInterval && state.sugarLeft < CONFIG.sugar.perRound + modifiers.bonusSugar) {
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
  return {
    hudStatus: COPY.status[state.phase],
    hudScore: `SCORE ${pad(state.score, 4)}`,
    hudLives: `CUPS ${'♥ '.repeat(Math.max(0, state.lives))}${'♡ '.repeat(Math.max(0, CONFIG.lives - state.lives))}`,
    roundTitle: COPY.title[state.phase](state),
    roundNum: pad(state.round, 2),
    killCount: `${state.kills} / ${state.target}`,
    milkCount: String(state.milkLeft),
    sugarCount: String(state.sugarLeft),
    mainBtn: COPY.button[state.phase],
    gameTip: COPY.tip[state.phase],
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
  return {
    update(state) {
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
