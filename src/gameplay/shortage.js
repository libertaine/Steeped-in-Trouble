// The Tea Shortage, and the Tea Cash that pays for it.
//
// Tea Cash is pocket money for one pot, earned by finishing normal rounds
// and beating a milestone boss. It is never part of the score, and nothing
// here ever takes points away.
//
// Once the pot reaches CONFIG.shortage.minChapter, the reading after round
// state.shortageAfter (or the first reading after it) announces that the tea
// tin is empty. The player buys tea with Tea Cash, runs to the shop for it
// (the Tea Run, gameplay/teaRun.js), or skips it; whichever they choose, the
// game goes on. Buying and a successful run restock the same: extra sugar
// for the next normal cup.
//
// The shortage comes straight after the reading (and any upgrade choice), and
// before any Hot Chocolate Havoc or Daily Grind decided at that reading, so
// it never moves a bonus round; but it never shares a reading with a
// milestone boss, which goes first while the shortage waits for a later one.
// state.shortageAfter is set again when a shortage starts: to a later round
// if CONFIG.shortage.repeatEvery says so, else null (one per pot).

import { CONFIG } from '../config.js';
import { milestoneDue } from './grind.js';

const S = CONFIG.shortage;

/** The three answers to an empty tea tin, in the order they are offered (keys 1, 2, 3). */
export const ERRANDS = Object.freeze(['buy', 'run', 'skip']);

/** At a reading: is the tea tin empty? */
export function shortageDue(state) {
  return state.shortageAfter !== null
    && state.round >= state.shortageAfter
    && state.progress.chapter >= S.minChapter
    && !milestoneDue(state);
}

/** When the next shortage may come, once this one has started. */
export function scheduleNextShortage(state) {
  state.shortageAfter = S.repeatEvery
    ? S.firstAfter + (Math.floor((state.round - S.firstAfter) / S.repeatEvery) + 1) * S.repeatEvery
    : null;
}

export const canBuyTea = (state) => state.teaCash >= S.teaPrice;

/** Add Tea Cash. Returns the amount added. */
export function earnTeaCash(state, amount) {
  state.teaCash += amount;
  return amount;
}

/** Restock the tea: extra sugar for the next normal cup. */
export function restock(state) {
  state.extraSugar += S.restockSugar;
}

/** Pay for tea, if the Tea Cash runs to it. Returns true if bought. */
export function buyTea(state) {
  if (!canBuyTea(state)) return false;
  state.teaCash -= S.teaPrice;
  restock(state);
  return true;
}
