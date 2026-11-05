// Day palettes: the page around the cup takes a quiet tint from the in-game Day.
//
// This is decoration only. The Day is the one the HUD already shows, dayOf(round)
// from gameplay/days.js, so there is no second counter and nothing new in the
// save. Palettes never read the clock, the timezone or any random stream. Seven
// palettes repeat: Day 8 looks like Day 1. A missing or odd round falls back to
// Day 1.
//
// Only the page ground (the gradient behind and around the stage) and the fine
// rule under the header change. The playfield, cup, HUD, panels, buttons,
// readings, overlays and the title keep their own colours. The ground stays
// dark because the page's lettering is light; the cream "paper" of each Day
// tints the rule and names the mood.
//
// The new colours fade in (about 0.8 s, CSS transitions on registered custom
// properties in styles/main.css) only when a Day choice brews the next cup on
// High graphics. A new pot, a continued pot, a practice set-up or a reload
// applies its palette at once. Reduced motion turns the fade off in CSS, live
// changes included.

import { dayOf } from '../gameplay/days.js';

const palette = (id, name, paper, glow, mid, deep) => Object.freeze({ id, name, paper, glow, mid, deep });

/** In Day order. Day 1 is the established page ground, colour for colour. */
export const DAY_PALETTES = Object.freeze([
  palette('parchment', 'Warm Parchment', '#e6e1d5', '#263e34', '#13231f', '#0c1716'),
  palette('sage', 'Sage Cream', '#e1e7dd', '#283d30', '#15241b', '#0c1712'),
  palette('lavender', 'Lavender Mist', '#e7dfe8', '#30354a', '#181c26', '#0f1218'),
  palette('honey', 'Honey Cream', '#e8dfc8', '#38392a', '#1c1f16', '#11140e'),
  palette('rose', 'Rose Beige', '#e3d9d0', '#3a3234', '#1d1b1c', '#121213'),
  palette('porcelain', 'Blue Porcelain', '#d6e4e5', '#233d45', '#122128', '#0b1519'),
  palette('biscuit', 'Sunday Biscuit', '#eadfcf', '#3a3528', '#1e1d17', '#13130f'),
]);

/** CSS custom properties each palette sets on <body>, read by styles/main.css. */
export const DAY_PROPERTIES = Object.freeze({ paper: '--day-paper', glow: '--day-glow', mid: '--day-mid', deep: '--day-deep' });

/** 0-6 for a Day number; anything that is not a whole Day of at least 1 counts as Day 1. */
export function paletteIndex(day) {
  return Number.isSafeInteger(day) && day >= 1 ? (day - 1) % DAY_PALETTES.length : 0;
}

export const paletteForDay = (day) => DAY_PALETTES[paletteIndex(day)];

/** The palette for a round, through the same dayOf() as the HUD's "DAY n". */
export const paletteForRound = (round) => paletteForDay(Number.isSafeInteger(round) && round >= 1 ? dayOf(round) : 1);

/**
 * Keeps <body> showing the palette for the game's round.
 * @param {Document} doc
 */
export function createDayPalette(doc = document) {
  let shown = null;
  let fade = false;

  return {
    /** A Day choice is the one change that fades; everything else snaps. */
    handle(event) {
      if (event.type === 'dayStart') fade = true;
    },
    /** Call each frame after events are handled. Writes to the DOM only when the palette changes. */
    update(state, { quality = 'high' } = {}) {
      const body = doc.body;
      const next = paletteForRound(state?.round);
      if (!body || next === shown) {
        fade = false;
        return next;
      }
      // data-day-fade is in the same style change as the new colours, so CSS
      // either transitions them or (without it) applies them immediately.
      if (fade && shown && quality !== 'low') body.dataset.dayFade = 'on';
      else delete body.dataset.dayFade;
      body.dataset.dayPalette = next.id;
      for (const [key, property] of Object.entries(DAY_PROPERTIES)) body.style.setProperty(property, next[key]);
      shown = next;
      fade = false;
      return next;
    },
    get shown() { return shown; },
  };
}
