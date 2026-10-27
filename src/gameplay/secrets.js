// Secrets: feats the leaves notice when a round is read, and quietly reward.
// They are not explained anywhere in the game. Each is judged from the
// round's stats; see docs/GAME_DESIGN.md (spoilers) for the full list.

import { CONFIG } from '../config.js';
import { gildSpoon } from './golden.js';

const S = CONFIG.secrets;

export const SECRETS = Object.freeze({
  notADropWasted: {
    id: 'notADropWasted',
    words: 'Not a drop wasted.',
    reward: `+${S.perfectPoints}, and more sugar next cup`,
    /** Every steam shot hit something. */
    earned: ({ volleys, wastedVolleys }) => volleys >= S.perfectMinVolleys && wastedVolleys === 0,
    award(state) {
      state.score += S.perfectPoints;
      state.extraSugar += S.perfectSugar;
    },
  },
  moreLeavesThanSteam: {
    id: 'moreLeavesThanSteam',
    words: 'More leaves than steam.',
    reward: 'The spoon turns golden for the next cup',
    /** Steam destroyed more leaves than shots were fired. */
    earned: ({ volleys, steamKills }) => volleys >= S.thriftyMinVolleys && steamKills > volleys,
    award: gildSpoon,
  },
});

/** Ids of the secrets a finished round earned. */
export function findSecrets(stats) {
  return Object.keys(SECRETS).filter((id) => SECRETS[id].earned(stats));
}
