// The slow burn: a pot is told in chapters (CONFIG.chapters).
//
// Within a chapter the leaves' speed and the pace of their arrival hold
// steady, whatever the round; what changes from cup to cup is the tea, the
// fortune, and the spoon. A chapter ends when its milestone boss is beaten
// (for Chapter 1, The Daily Grind: see game.js), and the next one starts with
// the following cup, a little quicker and with new teas on the shelf.
//
// Progress is plain data on the state, { chapter, starts }, where starts[i]
// is the first normal round of chapter i + 1. Each chapter's teas come on tap
// a fixed number of rounds after it starts, and stay for the rest of the pot.
//
// To add a chapter, add an entry to CONFIG.chapters and give its milestone a
// way to call advanceChapter().

import { CONFIG } from '../config.js';

const CHAPTERS = CONFIG.chapters;

export function createProgress() {
  return { chapter: 1, starts: [1] };
}

/** The tuning of the chapter the pot is in. */
export const currentChapter = (progress) => CHAPTERS[progress.chapter - 1];

/** Is there a chapter after this one? */
export const hasNextChapter = (progress) => progress.chapter < CHAPTERS.length;

/** Begin the next chapter with the given round. Does nothing after the last. */
export function advanceChapter(progress, round) {
  if (!hasNextChapter(progress)) return;
  progress.chapter++;
  progress.starts.push(round);
}

/** Does this round open a chapter after the first? */
export const opensChapter = (progress, round) => progress.chapter > 1 && progress.starts.at(-1) === round;

/** The round each tea comes on tap in this pot so far (tea id → round). Teas of chapters not reached are absent. */
export function teaUnlocks(progress) {
  const unlocks = {};
  progress.starts.forEach((start, i) => {
    for (const [id, after] of Object.entries(CHAPTERS[i].teas)) unlocks[id] = start + after;
  });
  return unlocks;
}

/** The teas that can be brewed in a round, in chapter order. */
export function teasOnTap(progress, round) {
  return Object.entries(teaUnlocks(progress)).filter(([, from]) => round >= from).map(([id]) => id);
}

/** The tea that comes on tap in this round (after the first), to be served at once; or null. */
export function debutTea(progress, round) {
  if (round <= 1) return null;
  return Object.entries(teaUnlocks(progress)).find(([, from]) => from === round)?.[0] ?? null;
}

/**
 * How long a tea has been on tap: normal rounds since it arrived, counting
 * that round as 1. Its behaviour grows with this (see gameplay/strength.js),
 * not with the round number, so a tea that arrives late still starts gentle.
 */
export function teaAge(progress, teaId, round) {
  const from = teaUnlocks(progress)[teaId] ?? 1;
  return Math.max(1, round - from + 1);
}
