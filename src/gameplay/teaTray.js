// The Tea Tray: one-cup treats that keep an upgrade offer a real choice once
// the spoon has fewer upgrades left to give than an offer has cards (#14).
//
// Rules:
//   - Tray cards only fill the slots upgrades can no longer fill, so an offer
//     always has CONFIG.upgrades.choices cards and never fewer than two.
//   - A tray card is never offered when it could not help: no spare strainer
//     before Karma (escaping leaves never reach it), and no golden moment
//     before The Daily Grind (beating it gilds the spoon for longer anyway).
//   - Taking one sets state.tray. It is spent when the next normal cup
//     starts (never in a bonus round or adventure in between), and whatever
//     is left of it is gone when the cup after that starts. One slot, one
//     cup: treats cannot stack, carry over, or grow the spoon permanently.
//   - The cards are chosen without random numbers, rotating with each offer,
//     so every seeded pot draws exactly what it drew before the tray existed.

import { CONFIG } from '../config.js';
import { gildSpoon } from './golden.js';

const T = CONFIG.teaTray;

export const TRAY = Object.freeze({
  trayMilk: {
    id: 'trayMilk',
    name: 'A Spare Jug',
    info: 'One more milk pour, next cup only.',
    words: 'Someone left the cream out.',
    usable: () => true,
  },
  trayCatch: {
    id: 'trayCatch',
    name: 'A Spare Strainer',
    info: 'Catch one more escaping leaf, next cup only.',
    words: 'Borrowed from the good china.',
    usable: (state) => state.nextFortune !== 'karma',
  },
  traySugar: {
    id: 'traySugar',
    name: 'A Sugar Lump',
    info: 'One more sugar burst, next cup only.',
    words: 'Just the one. Allegedly.',
    usable: () => true,
  },
  trayGolden: {
    id: 'trayGolden',
    name: 'A Golden Moment',
    info: `The spoon starts the next cup golden, for ${T.goldenSpoon} seconds.`,
    words: 'Polished to a suspicious shine.',
    usable: (state) => !state.grindDue,
  },
});

/** Tray treats that would help the cup after this reading, in rotation order. */
export function usableTray(state) {
  return Object.values(TRAY).filter((item) => item.usable(state)).map((item) => item.id);
}

/**
 * Fill an upgrade offer's empty slots from the tray, rotating through the
 * usable treats offer by offer. Upgrades keep their places first.
 * @param {string[]} upgrades the upgrade ids already drawn (possibly none)
 * @returns {string[]} a full offer
 */
export function fillFromTray(state, upgrades) {
  const pool = usableTray(state);
  const offerIndex = Math.floor((state.round - CONFIG.upgrades.firstOffer) / CONFIG.upgrades.offerEvery);
  const offer = [...upgrades];
  for (let k = 0; offer.length < CONFIG.upgrades.choices && k < pool.length; k++) {
    offer.push(pool[(offerIndex + k) % pool.length]);
  }
  return offer;
}

/** Spend a waiting treat as a normal cup starts. Call after the cup's supplies are set. */
export function serveTray(state, emit) {
  const id = state.tray;
  state.tray = null;
  if (id === 'trayMilk') state.milkLeft++;
  else if (id === 'trayCatch') state.strainerLeft++;
  else if (id === 'traySugar') state.sugarLeft++;
  else if (id === 'trayGolden') {
    gildSpoon(state, T.goldenSpoon);
    emit('goldenSpoon', { angle: state.angle, time: state.goldenSpoon });
  }
}
