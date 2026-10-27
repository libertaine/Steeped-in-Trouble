// Spoon upgrades: small, stacking improvements chosen between rounds. Unlike
// fortunes, they last for the whole pot (until game over or a restart).
//
// The spoon's upgrades live in state.spoon as plain levels, one per id, and
// never mix with the round's fortune modifiers. Each effect is read where it
// applies (steam speed in weapons.js, turn speed in player.js, sugar and
// strainer capacity at round start).
//
// To add an upgrade, add an entry to UPGRADES and a level to createSpoon(),
// then read that level wherever it takes effect.

import { CONFIG } from '../config.js';

const U = CONFIG.upgrades;
const percent = (fraction) => `${Math.round(fraction * 100)}%`;

export const UPGRADES = Object.freeze({
  polished: {
    id: 'polished',
    name: 'Polished Spoon',
    short: 'Polished',
    info: `Steam travels ${percent(U.polishedSpeed)} faster.`,
    icon: '✦',
    max: 3,
  },
  quickStir: {
    id: 'quickStir',
    name: 'Quick Stir',
    short: 'Quick Stir',
    info: `The spoon circles the rim ${percent(U.quickStirSpeed)} faster.`,
    icon: '↻',
    max: 3,
  },
  sugarScoop: {
    id: 'sugarScoop',
    name: 'Sugar Scoop',
    short: 'Scoop',
    info: 'Carry one more sugar burst every cup.',
    icon: '◆',
    max: 2,
  },
  strainer: {
    id: 'strainer',
    name: 'Strainer Attachment',
    short: 'Strainer',
    info: 'Catch one more escaping leaf every cup.',
    icon: '◎',
    max: 2, // with the built-in catch: three per round
  },
});

/** An ordinary silver spoon: every upgrade at level 0. */
export function createSpoon() {
  return { polished: 0, quickStir: 0, sugarScoop: 0, strainer: 0 };
}

export const steamSpeedFactor = (spoon) => 1 + U.polishedSpeed * spoon.polished;
export const turnSpeedFactor = (spoon) => 1 + U.quickStirSpeed * spoon.quickStir;
export const strainerCapacity = (spoon) => CONFIG.strainer.perRound + spoon.strainer;

/** Is an upgrade offered after this round? Round 1, then every few rounds. */
export function offerDue(round) {
  return round >= U.firstOffer && (round - U.firstOffer) % U.offerEvery === 0;
}

/** Upgrade ids that can still improve. */
export function availableUpgrades(spoon) {
  return Object.keys(UPGRADES).filter((id) => spoon[id] < UPGRADES[id].max);
}

/**
 * Pick up to CONFIG.upgrades.choices different upgrades that can still
 * improve, or null once the spoon is fully upgraded.
 * @param {{ int(n: number): number }} rng
 * @returns {string[] | null}
 */
export function drawOffer(spoon, rng) {
  const pool = availableUpgrades(spoon);
  const offer = [];
  while (pool.length && offer.length < U.choices) offer.push(pool.splice(rng.int(pool.length), 1)[0]);
  return offer.length ? offer : null;
}

/** Raise one upgrade a level, within its limit. Returns true if it improved. */
export function applyUpgrade(spoon, id) {
  if (!UPGRADES[id] || spoon[id] >= UPGRADES[id].max) return false;
  spoon[id]++;
  return true;
}
