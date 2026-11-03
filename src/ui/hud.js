// DOM heads-up display: status pills, the side panels, the spoon upgrade
// offer shown during some readings, and the Tea Shortage's three answers.
//
// update() runs every frame but only writes text that actually changed. It
// also marks the page with what is going on (body[data-mode]: 'cup',
// 'shortage', or 'run'), so the stylesheet can show the right touch controls.

import { CONFIG } from '../config.js';
import { DAY_CAPTIONS, MAX_HEAT, cupOfDay, dayOf } from '../gameplay/days.js';
import { readingReadyAt } from '../core/game.js';
import { PHASE } from '../core/state.js';
import { havocInProgress } from '../gameplay/chocolate.js';
import { FORTUNES } from '../gameplay/fortunes.js';
import { readingMemory } from '../gameplay/memory.js';
import { SECRETS } from '../gameplay/secrets.js';
import { grindInProgress } from '../gameplay/grind.js';
import { managerInProgress } from '../gameplay/mycelium.js';
import { canBuyTea } from '../gameplay/shortage.js';
import { runInProgress } from '../gameplay/teaRun.js';
import { pourInProgress } from '../gameplay/dailyPour.js';
import { breakoutInProgress } from '../gameplay/biscuitBreakout.js';
import { TRAFFIC_ROWS, crossingInProgress } from '../gameplay/crossingStreet.js';
import { TEAS } from '../gameplay/teas.js';
import { UPGRADES, strainerCapacity } from '../gameplay/upgrades.js';
import { TRAY } from '../gameplay/teaTray.js';
import { cupCondition } from '../gameplay/porcelain.js';
import { sugarCapacity } from '../gameplay/weapons.js';
import { createResources } from './resources.js';

const COPY = {
  status: {
    [PHASE.READY]: 'READY TO BREW',
    [PHASE.PLAYING]: 'DEFEND THE RIM',
    [PHASE.PAUSED]: 'PAUSED',
    [PHASE.READING]: 'READING THE LEAVES',
    [PHASE.DAY]: 'TOMORROW IS YOURS',
    [PHASE.CHOCOLATE]: 'HOT CHOCOLATE HAVOC',
    [PHASE.GRIND]: 'THE DAILY GRIND',
    [PHASE.MANAGER]: 'THE MYCELIUM MANAGER',
    [PHASE.SHORTAGE]: 'THE TEA SHORTAGE',
    [PHASE.TEA_RUN]: 'THE TEA RUN',
    [PHASE.ARCADE_OFFER]: 'EXTRA! EXTRA!',
    [PHASE.DAILY_POUR]: 'THE DAILY POUR',
    [PHASE.BISCUIT_BREAKOUT]: 'BISCUIT BREAKOUT',
    [PHASE.CROSSING_STREET]: 'CROSSING THE STREET',
    [PHASE.GAME_OVER]: 'THE CUP RUNNETH OVER',
  },
  title: {
    [PHASE.READY]: () => 'The kettle waits',
    [PHASE.PLAYING]: (s) => `Cup ${s.round}: ${TEAS[s.tea].title}`,
    [PHASE.PAUSED]: () => 'A moment to steep',
    [PHASE.READING]: () => 'The leaves have spoken',
    [PHASE.DAY]: () => 'Another day, another brew',
    [PHASE.CHOCOLATE]: () => HAVOC.title.play,
    [PHASE.GRIND]: () => GRIND.title.fight,
    [PHASE.MANAGER]: () => MANAGER.title.fight,
    [PHASE.SHORTAGE]: () => 'The tea tin is empty!',
    [PHASE.TEA_RUN]: () => RUN.title.run,
    [PHASE.ARCADE_OFFER]: () => 'A spoon with a second job',
    [PHASE.DAILY_POUR]: () => 'The Daily Pour',
    [PHASE.BISCUIT_BREAKOUT]: () => 'Biscuit Breakout',
    [PHASE.CROSSING_STREET]: () => 'Crossing the Street',
    [PHASE.GAME_OVER]: () => 'The last drop',
  },
  button: {
    [PHASE.READY]: 'Brew the first cup →',
    [PHASE.PLAYING]: 'Pause / resume (P)',
    [PHASE.PAUSED]: 'Resume cup →',
    [PHASE.READING]: 'Brew the next cup →',
    [PHASE.DAY]: 'Choose tomorrow (1 / 2)',
    [PHASE.CHOCOLATE]: 'Pause / resume (P)',
    [PHASE.GRIND]: 'Pause / resume (P)',
    [PHASE.MANAGER]: 'Pause / resume (P)',
    [PHASE.SHORTAGE]: 'Buy, run, or skip (1 / 2 / 3)',
    [PHASE.TEA_RUN]: 'Pause / resume (P)',
    [PHASE.ARCADE_OFFER]: 'Deliver or skip (1 / 2)',
    [PHASE.DAILY_POUR]: 'Pause / resume (P)',
    [PHASE.BISCUIT_BREAKOUT]: 'Pause / resume (P)',
    [PHASE.CROSSING_STREET]: 'Pause / resume (P)',
    [PHASE.GAME_OVER]: 'Start a fresh pot →',
  },
  tip: {
    [PHASE.READY]: 'Defend the rim. Your defeated leaves are the seeds of the next fortune.',
    [PHASE.DAY]: 'Days control difficulty. Chapters control content. Either choice keeps your progress and next fortune.',
    [PHASE.PLAYING]: 'Keep tea leaves from escaping the rim. Every defeated leaf joins your final reading.',
    [PHASE.PAUSED]: 'The kettle is on hold.',
    [PHASE.CHOCOLATE]: '',
    [PHASE.GRIND]: '',
    [PHASE.MANAGER]: '',
    [PHASE.SHORTAGE]: `Buy a tin with Tea Cash, run to the shop for one, or carry on without. A restock means ${CONFIG.shortage.restockSugar} extra sugar burst next cup; skipping costs nothing. Your cups, spoon, and next fortune wait for you either way.`,
    [PHASE.TEA_RUN]: '',
    [PHASE.ARCADE_OFFER]: 'The Daily Pour needs a delivery spoon. Deliver papers, or carry on brewing. Skipping costs nothing.',
    [PHASE.DAILY_POUR]: '',
    [PHASE.BISCUIT_BREAKOUT]: '',
    [PHASE.CROSSING_STREET]: '',
    [PHASE.READING]: 'The pattern was made by the leaves you defeated, though the leaves have opinions of their own. The omen applies to the next cup.',
    [PHASE.GAME_OVER]: 'Three spills end the pot. Brew again to rewrite the future.',
  },
};

// The Arcade Interlude offer, per adventure: the same card, in its own words.
export const ARCADE_OFFERS = Object.freeze({
  dailyPour: {
    status: 'EXTRA! EXTRA!', title: 'A spoon with a second job', heading: 'EXTRA! EXTRA!',
    pitch: 'The Daily Pour needs a delivery spoon.',
    accept: 'DELIVER PAPERS', acceptInfo: 'A short, optional paper route',
    skip: 'NO THANKS', skipInfo: 'Costs nothing. Carry on brewing.',
    button: 'Deliver or skip (1 / 2)',
    tip: 'The Daily Pour needs a delivery spoon. Deliver papers, or carry on brewing. Skipping costs nothing.',
  },
  biscuitBreakout: {
    status: 'THE BISCUITS ARE REVOLTING!', title: 'A wall has been built', heading: 'THE BISCUITS ARE REVOLTING!',
    pitch: '“Their demands are unclear. Their formation is not.”',
    accept: 'BREAK THE BISCUITS', acceptInfo: 'A short, optional brick-breaking round',
    skip: 'LEAVE THEM ALONE', skipInfo: 'Costs nothing. Carry on brewing.',
    button: 'Break or skip (1 / 2)',
    tip: 'The spoon is the paddle and a sugar cube is the ball. Break the biscuits, or leave them alone. Skipping costs nothing.',
  },
  crossingStreet: {
    status: 'WHY DID THE SPOON CROSS THE ROAD?', title: 'A busy road', heading: 'WHY DID THE SPOON CROSS THE ROAD?',
    pitch: '“Nobody knows. But apparently, it’s our problem now.”',
    accept: 'CROSS THE ROAD', acceptInfo: 'A short, optional dash through traffic',
    skip: 'STAY RIGHT HERE', skipInfo: 'Costs nothing. Carry on brewing.',
    button: 'Cross or stay (1 / 2)',
    tip: 'Hop the spoon across five lanes of traffic to the tea shop, or stay right here. Skipping costs nothing.',
  },
});

// Crossing the Street, stage by stage.
const CROSSING = {
  button: { intro: 'Start crossing →', play: 'Pause / resume (P)', outro: 'Back to the tea →' },
  tip: {
    intro: 'Arrow keys or WASD hop the spoon one square; hold to keep hopping. On touch, use the arrow pad.',
    play: `Reach the tea shop in ${CONFIG.crossingStreet.duration} seconds. A bump sends the spoon back to the curb and costs one of ${CONFIG.crossingStreet.attempts} attempts, never a cup. The median is safe.`,
    outro: 'Your cups, your spoon, and the next fortune are exactly as you left them.',
  },
};

// Biscuit Breakout, stage by stage.
const BREAKOUT = {
  button: { intro: 'Start breaking →', play: 'Pause / resume (P)', outro: 'Back to the tea →' },
  tip: {
    intro: '← / → (or A / D) move the spoon; Space launches the sugar cube. On touch, hold ◀ / ▶ and tap LAUNCH.',
    play: 'Catch the cube on the spoon: its edges send it off at an angle. Three cubes and 45 seconds. Nothing here costs a cup.',
    outro: 'Your cups, your spoon, and the next fortune are exactly as you left them.',
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
  // Until it is first beaten, the machine stands between the pot and its next chapter.
  milestone: {
    victory: 'The next brew awaits: new teas are on the shelf, and the leaves are a little livelier. Your spoon comes too.',
    escaped: `It will be back after ${CONFIG.grind.retryAfter} more cups. Until then the tea stays as you know it, and your cups, spoon, and fortune are safe.`,
  },
};

// The Mycelium Manager, stage by stage, likewise.
const MANAGER = {
  status: {
    intro: () => 'A MEETING HAS BEEN SCHEDULED',
    fight: (m) => `THE MYCELIUM MANAGER · ${Math.ceil(m.left)}s`,
    outro: (m) => (m.result === 'victory' ? 'MEETING ADJOURNED' : 'TAKEN OFFLINE'),
  },
  title: { intro: 'Quick sync?', fight: 'Boss: The Mycelium Manager', outro: 'Back to the tea' },
  button: { intro: 'Skip the entrance →', fight: 'Pause / resume (P)', outro: 'Back to the tea →' },
  tip: {
    intro: 'Middle management has arrived.',
    fight: 'Pop the memos: their spores are the only thing that hurts it. Steam root tips to cut them back (sugar clears three lanes; milk stops them growing). At an all-hands meeting, leave the invited lanes or cut their roots. Three scalds and it gets away, but it can’t cost you a cup.',
    outro: 'Your cups, your spoon, and the next fortune are exactly as you left them.',
  },
  milestone: {
    victory: 'The cup has gone fungal: Chapter 3 begins with a cup of Mushroom Tea, and the leaves are livelier still. Your spoon comes too.',
    escaped: `It will be back after ${CONFIG.manager.retryAfter} more cups. Until then the tea stays as you know it, and your cups, spoon, and fortune are safe.`,
  },
};

// The Tea Run, stage by stage.
const RUN = {
  status: {
    intro: () => 'ON YOUR MARKS',
    run: (r) => `THE TEA RUN · ${Math.ceil(r.left)}s`,
    finish: () => 'NEARLY THERE',
    outro: (r) => (r.result === 'success' ? 'MISSION ACCOMPLISHED' : 'PEAR-SHAPED'),
  },
  title: { intro: 'Run to the store!', run: 'Errand: The Tea Run', finish: 'The tea shop!', outro: 'Back to the tea' },
  button: { intro: 'Start running →', run: 'Pause / resume (P)', finish: 'Entering the tea shop…', outro: 'Back to the tea →' },
  tip: {
    intro: 'The spoon runs by itself. Jump (Space or ↑) over sugar cubes and puddles; slide (↓) under the coffee cups. On a touch screen, tap JUMP and SLIDE.',
    run: 'Jump the sugar and the puddles, slide under the coffee. Three stumbles and the errand is off, but it can’t cost you a cup.',
    finish: 'In through the door…',
    outro: 'Your cups, your spoon, and the next fortune are exactly as you left them.',
  },
};

const pad = (n, width) => String(n).padStart(width, '0');
const pips = (level, max) => '●'.repeat(level) + '○'.repeat(max - level);

/** The status pill: the phase, or during play the Golden Spoon or a recovering cup. */
function statusText(state) {
  if (state.phase === PHASE.CHOCOLATE) return HAVOC.status[state.chocolate.stage](state.chocolate);
  if (state.phase === PHASE.GRIND) return GRIND.status[state.grind.stage](state.grind);
  if (state.phase === PHASE.MANAGER) return MANAGER.status[state.manager.stage](state.manager);
  if (state.phase === PHASE.TEA_RUN) return RUN.status[state.run.stage](state.run);
  if (state.phase === PHASE.PLAYING) {
    if (state.goldenSpoon > 0) return `✦ GOLDEN SPOON ${Math.ceil(state.goldenSpoon)}s`;
    if (state.graceTime > 0) return 'THE CUP RECOVERS';
    if (state.goldenLeaf) return `✦ GOLDEN LEAF · STEAM IT TO MEND ${Math.ceil(state.goldenLeaf.time)}s`;
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

const OFFER_NOTES = Object.freeze({ cupboard: 'The cupboard offers assistance.', tray: 'The Tea Tray comes round.' });

/**
 * The upgrade cards to show, or null while no offer is open. Each shows the
 * level the upgrade would reach; a Tea Tray treat shows only its name.
 */
export function offerCards(state) {
  if (state.phase !== PHASE.READING || !state.offer || state.readingTime < readingReadyAt(state)) return null;
  return state.offer.map((id) => {
    if (Object.hasOwn(TRAY, id)) return { id, title: TRAY[id].name, info: TRAY[id].info, tray: true };
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
  if (!fortune || havocInProgress(state) || grindInProgress(state) || managerInProgress(state) || runInProgress(state) || pourInProgress(state)
    || breakoutInProgress(state) || crossingInProgress(state)) return '';
  if (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PAUSED) return '';
  return `✦ ${fortune.name} · ${fortune.tag} · ${omenStatus(state)}`;
}

/** The small in-play indicator of the tea brewed for this round. */
function teaText(state) {
  if (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PAUSED) return '';
  if (havocInProgress(state) || grindInProgress(state) || managerInProgress(state) || runInProgress(state) || pourInProgress(state)
    || breakoutInProgress(state) || crossingInProgress(state)) return '';
  const tea = TEAS[state.tea];
  return `☕ ${tea.name} · ${tea.tag}`;
}

/** What is in the cup right now, for the side panel. */
function teaName(state) {
  if (havocInProgress(state)) return 'Hot chocolate';
  if (grindInProgress(state)) return 'Espresso, apparently';
  if (managerInProgress(state)) return 'Tea, under new management';
  return TEAS[state.tea].name;
}

/** The Leaves Lie keeps up appearances until it changes its mind. */
const stillLying = (state) => state.phase === PHASE.READING && state.nextFortune === 'lie'
  && state.readingTime < CONFIG.fortunes.lieRetractAt;

/** The Auto Steam pill, shown while it can fire: in a round or the boss fight. */
function autoText(state) {
  if (!state.autoSteam) return '';
  const from = state.phase === PHASE.PAUSED ? state.pausedFrom : state.phase;
  return from === PHASE.PLAYING || from === PHASE.GRIND || from === PHASE.MANAGER ? 'AUTO STEAM' : '';
}

/** What the page is showing, for the touch controls: the cup, the shortage's choice, or the errand. */
export function pageMode(state) {
  if (state.phase === PHASE.DAY) return 'day';
  if (pourInProgress(state)) return 'pour';
  if (breakoutInProgress(state)) return 'breakout';
  if (crossingInProgress(state)) return 'crossing';
  if (state.phase === PHASE.ARCADE_OFFER) return 'arcadeOffer';
  if (state.phase === PHASE.SHORTAGE) return 'shortage';
  return runInProgress(state) ? 'run' : 'cup';
}

/**
 * The Tea Shortage's buttons, or null while they are not on show. Buying is
 * offered (and disabled) even when the Tea Cash doesn't run to it, so the
 * price is always clear.
 */
export function errandView(state) {
  if (state.phase !== PHASE.SHORTAGE || state.shortage.time < CONFIG.shortage.chooseAt) return null;
  const price = CONFIG.shortage.teaPrice;
  const affordable = canBuyTea(state);
  return {
    buy: { enabled: affordable, info: affordable ? `${price} Tea Cash of your ${state.teaCash}` : `Needs ${price} Tea Cash (you have ${state.teaCash})` },
    run: { enabled: true, info: 'A quick dash to the shop' },
    skip: { enabled: true, info: 'Carry on without' },
  };
}

/** All HUD text for a state, keyed by element id. Pure, for easy testing. */
export function hudText(state) {
  const havoc = havocInProgress(state);
  const grind = grindInProgress(state);
  const manager = managerInProgress(state);
  const run = runInProgress(state);
  const pour = pourInProgress(state);
  const breakout = breakoutInProgress(state);
  const street = crossingInProgress(state);
  // Between rounds (a reading, the bonus, the boss, or an errand) the panel looks ahead to the next cup.
  const between = state.phase === PHASE.DAY || state.phase === PHASE.READING || state.phase === PHASE.SHORTAGE || state.phase === PHASE.ARCADE_OFFER
    || !!havoc || !!grind || !!manager || !!run || !!pour || !!breakout || !!street;
  const shown = between ? state.nextFortune : state.fortune;
  const fortune = shown ? FORTUNES[shown] : null;
  const offering = state.phase === PHASE.READING && !!state.offer;
  const strainer = `${state.strainerLeft}/${strainerCapacity(state.spoon)}`;
  const tea = TEAS[state.tea];
  const fresh = state.round > 1 && state.teaAge === 1 ? 'New on the shelf! ' : '';
  const teaTip = state.phase === PHASE.PLAYING && tea.id !== 'house' ? `${fresh}${tea.name}: ${tea.info}` : null;
  const values = {
    hudStatus: statusText(state),
    hudDay: `DAY ${dayOf(state.round)} · CUP ${cupOfDay(state.round)}/${CONFIG.days.length} · HEAT ${state.heat}${state.heat === MAX_HEAT ? ' MAX' : ''}`,
    dayCompleted: `Day ${dayOf(state.round)} complete. Choose how tomorrow brews.`,
    dayCaption: DAY_CAPTIONS[(dayOf(state.round) - 1) % DAY_CAPTIONS.length],
    hudScore: `SCORE ${pad(state.score, 4)}`,
    // The teacup shows its condition, not a count (gameplay/porcelain.js); the adventures keep their own counters below.
    hudLives: cupCondition(state.lives).label,
    cupStatus: `Cup condition: ${cupCondition(state.lives).words}`,
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
      : teaTip ?? COPY.tip[state.phase],
    teaName: teaName(state),
    hudTea: teaText(state),
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
    hudAuto: autoText(state),
    killLabel: 'Leaves cleared',
    teaCash: String(state.teaCash),
    chapterNum: String(state.progress.chapter),
    potScore: `Score: ${state.score}`,
    teaDetail: `${tea.name}: ${tea.info}`,
    compactRound: `Cup ${state.round}`,
    compactMilk: `Milk ${state.milkLeft}`,
    compactSugar: `Sugar ${state.sugarLeft}`,
    compactProgress: `${state.kills}/${state.target}`,
    easyHint: havoc ? 'Hold cup: flames' : 'Double-tap: milk\nHold: sugar',
  };
  const reading = state.phase === PHASE.READING;
  const ready = reading && state.readingTime >= readingReadyAt(state);
  const unrevealed = reading && state.readingTime < CONFIG.fortunes.revealAt;
  if (unrevealed) {
    values.fortuneName = 'The leaves are settling…';
    values.fortuneDetail = 'Let the cup have its moment.';
  }
  if (!between) {
    values.fortuneLabel = 'Fortune for the next cup';
    values.fortuneName = 'Not yet written';
    values.fortuneDetail = 'Finish this cup to read its leaves. The next fortune has not been drawn.';
  }
  const active = state.fortune ? FORTUNES[state.fortune] : null;
  values.activeFortuneLabel = between ? 'Completed cup’s fortune' : 'This cup’s fortune';
  values.activeFortune = active ? `${active.name}: ${active.effect}` : 'No fortune is active in this cup.';
  values.readingTitle = ready ? `Cup ${state.round} complete` : '';
  values.readingQuote = ready ? `“${FORTUNES[state.nextFortune].quote}”` : '';
  values.readingSecrets = ready ? state.secrets.map((id) => `${SECRETS[id].words} ${SECRETS[id].reward}.`).join(' ') : '';
  values.referenceSecrets = values.readingSecrets;
  values.temporaryUpgrades = [state.goldenSpoon > 0 ? `Golden Spoon: ${Math.ceil(state.goldenSpoon)} seconds remaining in play.` : '',
    state.extraSugar > 0 ? `Earned sugar for the next cup: +${state.extraSugar}.` : '',
    state.tray ? `From the Tea Tray, for the next cup: ${TRAY[state.tray].name}.` : ''].filter(Boolean).join(' ')
    || 'No temporary spoon effect is active.';
  values.upgradeProgression = `The cupboard offers help after cup ${CONFIG.upgrades.firstOffer}, then every ${CONFIG.upgrades.offerEvery} cups, Upgrades stack for this pot; once they run short, the Tea Tray fills the gaps with treats for the next cup only.`;
  if (state.phase === PHASE.SHORTAGE) values.roundNum = `${pad(state.round, 2)}½`;
  if (state.phase === PHASE.ARCADE_OFFER) {
    const offer = ARCADE_OFFERS[state.interlude?.id] ?? ARCADE_OFFERS.dailyPour;
    Object.assign(values, {
      hudStatus: offer.status, roundTitle: offer.title, mainBtn: offer.button, gameTip: offer.tip,
      arcadeTitle: offer.heading, arcadePitch: offer.pitch, arcadeAccept: offer.accept,
      arcadeAcceptInfo: offer.acceptInfo, arcadeSkip: offer.skip, arcadeSkipInfo: offer.skipInfo,
    });
  }
  if (breakout) {
    const B = CONFIG.biscuitBreakout;
    const paused = state.phase === PHASE.PAUSED;
    Object.assign(values, {
      roundTitle: breakout.stage === 'outro' ? breakout.summary.title : 'Biscuit Breakout',
      roundNum: `${pad(state.round, 2)}½`,
      hudStatus: paused ? 'BREAKOUT PAUSED' : breakout.stage === 'outro' ? 'CRUMBS COUNTED'
        : `BISCUIT BREAKOUT · ${Math.max(0, Math.ceil(B.duration - breakout.clock - 1e-6))}s`,
      hudScore: `BISCUITS ${breakout.broken}/${breakout.total}`,
      hudLives: `CUBES ${'■ '.repeat(breakout.cubes)}${'□ '.repeat(B.cubes - breakout.cubes)}`.trim(),
      hudStrainer: '', teaName: 'Biscuits, regrettably',
      killLabel: 'Biscuits broken', killCount: `${breakout.broken} / ${breakout.total}`,
      compactProgress: `Biscuits ${breakout.broken}/${breakout.total}`,
      mainBtn: paused ? 'Resume breakout →' : BREAKOUT.button[breakout.stage],
      gameTip: BREAKOUT.tip[breakout.stage],
    });
  }
  if (street) {
    const C = CONFIG.crossingStreet;
    const paused = state.phase === PHASE.PAUSED;
    const points = street.summary?.points ?? street.credited.length * C.lanePoints;
    Object.assign(values, {
      roundTitle: street.stage === 'outro' ? street.summary.title : 'Crossing the Street',
      roundNum: `${pad(state.round, 2)}½`,
      hudStatus: paused ? 'TRAFFIC PAUSED' : street.stage === 'outro' ? (street.summary.success ? 'SAFELY ACROSS' : 'BACK ON THE CURB')
        : `CROSSING THE STREET · ${Math.max(0, Math.ceil(C.duration - street.clock - 1e-6))}s`,
      hudScore: `POINTS ${points}`,
      hudLives: `ATTEMPTS ${'● '.repeat(Math.max(0, street.attempts))}${'○ '.repeat(C.attempts - Math.max(0, street.attempts))}`.trim(),
      hudStrainer: '', teaName: 'Across the road, apparently',
      killLabel: 'Lanes crossed', killCount: `${street.credited.length} / ${TRAFFIC_ROWS.length}`,
      compactProgress: `Lanes ${street.credited.length}/${TRAFFIC_ROWS.length} · ${points} pts`,
      mainBtn: paused ? 'Resume crossing →' : CROSSING.button[street.stage],
      gameTip: CROSSING.tip[street.stage],
    });
  }
  if (pour) {
    Object.assign(values, {
      roundTitle: pour.stage === 'outro' ? pour.summary.title : 'The Daily Pour',
      hudStatus: state.phase === PHASE.PAUSED ? 'PAPER ROUTE PAUSED' : `THE DAILY POUR · ${Math.ceil(CONFIG.dailyPour.duration - pour.clock)}s`,
      hudScore: `DELIVERED ${pour.delivered}/${pour.scheduled}`,
      hudLives: `PAPERS ${pour.papers}`,
      hudStrainer: '', teaName: 'News, freshly brewed',
      killLabel: 'Deliveries', killCount: `${pour.delivered} / ${pour.scheduled}`,
      compactProgress: `Route ${Math.round(100 * pour.clock / CONFIG.dailyPour.duration)}%`,
      aimPaperBtn: `AIM: ${pour.aim === 'near' ? 'MAILBOX' : 'PORCH'}`,
      mainBtn: state.phase === PHASE.PAUSED ? 'Resume paper route →' : pour.stage === 'intro' ? 'Ring bell & ride →'
        : pour.stage === 'outro' ? 'Back to the tea →' : 'Pause / resume (P)',
      gameTip: '↑ aims for porches; ↓ for mailboxes. Space throws. Match the marked subscriber target as it crosses your landing ring. On touch, use AIM and THROW. No paper for houses marked NO PAPER.',
    });
  }
  if (run) {
    // On the sidewalk the pills count what matters there: the pickups, and the stumbles left.
    const left = Math.max(0, CONFIG.teaRun.hits - run.hits);
    Object.assign(values, {
      roundTitle: RUN.title[run.stage],
      roundNum: `${pad(state.round, 2)}½`,
      teaName: 'None, yet',
      killLabel: 'Coins · tea packets',
      killCount: `${run.coins} · ${run.packets}`,
      hudScore: `COINS ${run.coins} · TEA ${run.packets}`,
      hudLives: `STUMBLES ${'♥ '.repeat(left)}${'♡ '.repeat(run.hits)}`.trim(),
      hudStrainer: '',
      gameTip: RUN.tip[run.stage],
      compactProgress: `${Math.round(100 * Math.min(1, run.distance / run.finish))}%`,
    });
    values.mainBtn = state.phase === PHASE.PAUSED ? 'Resume errand →' : RUN.button[run.stage];
  }
  if (havoc) {
    const { tally, stage } = havoc;
    Object.assign(values, {
      roundTitle: HAVOC.title[stage],
      roundNum: `${pad(state.round, 2)}½`, // between cups, and not a cup of its own
      killLabel: 'Marshmallows toasted',
      killCount: `${tally.perfect} perfect · ${tally.toasted} toasted`,
      gameTip: HAVOC.tip[stage],
      compactProgress: `${tally.perfect} perfect · ${tally.toasted} toasted`,
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
      gameTip: grind.stage === 'outro' && grind.milestone ? GRIND.milestone[grind.result] : GRIND.tip[grind.stage],
      compactProgress: `Boss ${grind.health}/${CONFIG.grind.health}`,
    });
    if (state.phase === PHASE.GRIND) values.mainBtn = GRIND.button[grind.stage];
  }
  if (manager) {
    const left = CONFIG.grind.scalds - manager.scalds;
    Object.assign(values, {
      roundTitle: MANAGER.title[manager.stage],
      roundNum: `${pad(state.round, 2)}½`,
      killLabel: 'Manager patience',
      killCount: `${manager.health} / ${CONFIG.manager.health}`,
      hudStrainer: `SCALDS ${'● '.repeat(manager.scalds)}${'○ '.repeat(Math.max(0, left))}`.trim(),
      gameTip: manager.stage === 'outro' && manager.milestone ? MANAGER.milestone[manager.result] : MANAGER.tip[manager.stage],
      compactProgress: `Boss ${manager.health}/${CONFIG.manager.health}`,
    });
    if (state.phase === PHASE.MANAGER) values.mainBtn = MANAGER.button[manager.stage];
  }
  // One reading explanation, with the same complete account in Tea Break.
  const memory = ready ? readingMemory(state) : null;
  values.readingMemory = memory ? memory.observations.map((o) => `${o.fact} ${o.influence}`).join(' ') : '';
  values.compactMemory = values.readingMemory;
  values.compactFortune = ready ? `Next cup: ${values.fortuneName}` : '';
  values.compactEffect = ready ? FORTUNES[state.nextFortune].effect : '';
  values.readingAnnouncement = ready ? `${values.compactFortune}. ${values.compactEffect}`
    : reading && !unrevealed ? stillLying(state) ? 'The leaves foretell Something Wonderful.'
      : state.nextFortune === 'lie' ? 'The leaves reconsider…' : `The leaves foretell ${values.fortuneName}.` : '';
  return values;
}

export function createHud(doc = document) {
  const resources = createResources(doc);
  const elements = {};
  const shown = {};
  const offer = doc.getElementById('upgradeOffer');
  const cards = offer ? [...offer.querySelectorAll('[data-choice]')] : [];
  let shownOffer = null;
  let inventoryKey = '';
  let acknowledgmentTimer;

  /** Show, fill, or hide the upgrade offer. */
  function updateOffer(state) {
    const view = offerCards(state);
    const key = view ? view.map((card) => card.title).join('|') : null;
    if (!offer || key === shownOffer) return;
    shownOffer = key;
    offer.hidden = !view;
    const note = offer.querySelector('.offer-head em');
    if (note) note.textContent = view?.some((card) => card.tray) ? OFFER_NOTES.tray : OFFER_NOTES.cupboard;
    cards.forEach((card, i) => {
      const choice = view?.[i];
      card.hidden = !choice;
      if (!choice) return;
      card.dataset.upgrade = choice.id;
      card.querySelector('strong').textContent = choice.title;
      card.querySelector('small').textContent = choice.info;
    });
  }

  const errand = doc.getElementById('errandOffer');
  const arcade = doc.getElementById('arcadeOffer');
  const day = doc.getElementById('dayOffer');
  const errandButtons = errand ? [...errand.querySelectorAll('[data-errand]')] : [];
  let shownErrand = null;

  /** Show, fill, or hide the Tea Shortage's choice. */
  function updateErrand(state) {
    const view = errandView(state);
    const key = view ? JSON.stringify(view) : null;
    if (!errand || key === shownErrand) return;
    shownErrand = key;
    errand.hidden = !view;
    for (const button of errandButtons) {
      const choice = view?.[button.dataset.errand];
      if (!choice) continue;
      button.disabled = !choice.enabled;
      button.querySelector('small').textContent = choice.info;
    }
  }

  return {
    handle(event) {
      resources.handle(event);
      if (event.type !== 'upgrade') return;
      const acknowledgment = doc.getElementById('upgradeAcknowledgment');
      if (!acknowledgment) return;
      doc.defaultView.clearTimeout(acknowledgmentTimer);
      acknowledgment.textContent = event.tray ? `${event.name} · next cup only` : `${event.name} acquired · level ${event.level}`;
      acknowledgment.hidden = false;
      acknowledgmentTimer = doc.defaultView.setTimeout(() => { acknowledgment.hidden = true; }, 2400);
    },
    update(state) {
      updateOffer(state);
      updateErrand(state);
      if (arcade) arcade.hidden = state.phase !== PHASE.ARCADE_OFFER;
      if (day) day.hidden = state.phase !== PHASE.DAY;
      const mode = pageMode(state);
      if (doc.body && doc.body.dataset.mode !== mode) doc.body.dataset.mode = mode;
      const values = hudText(state);
      const ready = state.phase === PHASE.READING && state.readingTime >= readingReadyAt(state);
      const presentation = doc.getElementById('readingPresentation');
      if (presentation) presentation.hidden = !ready;
      if (doc.body) doc.body.dataset.readingReady = String(ready);
      const primary = doc.getElementById('mainBtn');
      if (primary) primary.disabled = state.phase === PHASE.READING && (!ready || !!state.offer);
      const key = JSON.stringify(state.spoon);
      const inventory = doc.getElementById('spoonInventory');
      if (inventory && inventoryKey !== key) {
        inventoryKey = key;
        inventory.replaceChildren(...Object.values(UPGRADES).filter((u) => state.spoon[u.id] > 0).map((u) => {
          const item = doc.createElement('p');
          item.textContent = `${u.name} · level ${state.spoon[u.id]}/${u.max}. ${u.info} (per level)`;
          return item;
        }));
      }
      resources.update(state, values);
      const reference = doc.getElementById('referenceResources');
      if (reference) {
        const special = havocInProgress(state) || runInProgress(state) || pourInProgress(state)
          || breakoutInProgress(state) || crossingInProgress(state);
        const label = special ? 'Normal pot resources suspended.' : grindInProgress(state) || managerInProgress(state)
          ? 'Boss milk and sugar are active; normal pot protection is suspended.' : 'Active cup resources.';
        if (reference.textContent !== label) reference.textContent = label;
      }
      // The omen pill takes its fortune's tone (good, trouble, odd) for colour.
      const omen = (elements.hudOmen ??= doc.getElementById('hudOmen'));
      const tone = values.hudOmen && state.fortune ? FORTUNES[state.fortune].tone : '';
      if (omen && omen.dataset.tone !== tone) omen.dataset.tone = tone;
      // The tea pill takes the tea's colour.
      // The condition pill takes the cup's condition for colour, while it shows it.
      const lives = (elements.hudLives ??= doc.getElementById('hudLives'));
      const condition = cupCondition(state.lives);
      const shownCondition = values.hudLives === condition.label ? condition.id : '';
      if (lives && lives.dataset.condition !== shownCondition) lives.dataset.condition = shownCondition;
      const teaPill = (elements.hudTea ??= doc.getElementById('hudTea'));
      const teaId = values.hudTea ? state.tea : '';
      if (teaPill && teaPill.dataset.tea !== teaId) teaPill.dataset.tea = teaId;
      for (const id in values) {
        if (shown[id] === values[id]) continue;
        elements[id] ??= doc.getElementById(id);
        if (elements[id]) elements[id].textContent = values[id];
        shown[id] = values[id];
      }
    },
  };
}
