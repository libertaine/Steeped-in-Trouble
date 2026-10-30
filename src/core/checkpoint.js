// The only resumable boundary is a fully settled normal-round reading.
// Schema changes belong here; unsupported versions fail closed until a
// deliberate migration is added to migrateCheckpoint().
import { CONFIG } from '../config.js';
import { createInitialState, PHASE } from './state.js';
import { FORTUNES } from '../gameplay/fortunes.js';
import { TEAS } from '../gameplay/teas.js';
import { UPGRADES } from '../gameplay/upgrades.js';
import { SECRETS } from '../gameplay/secrets.js';
import { COMBOS } from '../gameplay/combos.js';
import { MAX_HEAT, endsDay } from '../gameplay/days.js';
import { INTERLUDES, eligibleInterlude } from '../gameplay/arcadeInterludes.js';

export const POT_SCHEMA_VERSION = 1;
export const RANDOM_STREAMS = Object.freeze(['normal', 'chocolate', 'boss', 'tea',
  'teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']);
const own = (o, k) => Object.hasOwn(o, k);
const object = (o) => o !== null && typeof o === 'object' && !Array.isArray(o)
  && Object.getPrototypeOf(o) === Object.prototype;
const integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER;
const keys = (o, names) => object(o) && Object.keys(o).length === names.length && names.every((k) => own(o, k));
const known = (id, registry) => typeof id === 'string' && own(registry, id);
const ids = (a, registry) => Array.isArray(a) && a.length <= Object.keys(registry).length
  && new Set(a).size === a.length && a.every((id) => known(id, registry));
const optionalRound = (n) => n === null || integer(n, 1);

export function migrateCheckpoint(data) {
  return data?.schemaVersion === POT_SCHEMA_VERSION ? data : null;
}

export function validateCheckpoint(data) {
  try {
    if (!keys(data, ['schemaVersion', 'state', 'random', 'pinnedTea']) || !migrateCheckpoint(data)) return false;
    if (data.pinnedTea !== null && !known(data.pinnedTea, TEAS)) return false;
    if (!keys(data.random, RANDOM_STREAMS) || !RANDOM_STREAMS.every((id) => {
      const r = data.random[id];
      return keys(r, ['seed', 'state']) && integer(r.seed, 0, 0xffffffff) && integer(r.state, 0, 0xffffffff);
    })) return false;
    const s = data.state, template = createInitialState();
    if (!keys(s, Object.keys(template)) || s.phase !== PHASE.READING
      || !Object.values(PHASE).includes(s.pausedFrom)) return false;
    // Check every scalar rather than accepting unexamined nested data. Empty
    // fields at this stable boundary must stay empty, never active missions.
    const nested = ['progress', 'spoon', 'offer', 'modifiers', 'teaServed', 'secrets', 'discovered',
      'stir', 'volleys', 'aerialDiscoveries', 'arcade', 'residue', 'roundStats'];
    for (const [key, value] of Object.entries(template)) {
      if (nested.includes(key) || ['fortune', 'nextFortune', 'arcadeDue', 'havocAfter', 'grindAfter', 'shortageAfter'].includes(key)) continue;
      if (value === null) { if (s[key] !== null) return false; }
      else if (Array.isArray(value)) { if (!Array.isArray(s[key]) || s[key].length) return false; }
      else if (typeof value === 'number') { if (!finite(s[key])) return false; }
      else if (typeof s[key] !== typeof value) return false;
    }
    if (!integer(s.round, 1) || !integer(s.heat, 0, Math.min(MAX_HEAT, s.round - 1))
      || !integer(s.score) || !integer(s.lives, 1, Math.max(CONFIG.lives + 1, CONFIG.grind.maxLives)) || !integer(s.teaCash)
      || !integer(s.kills, 1) || !integer(s.target, CONFIG.rounds.baseTarget, CONFIG.rounds.maxTarget)
      || s.kills !== s.target || s.readingTime < 0 || s.goldenSpoon < 0
      || s.dayPending !== endsDay(s.round)) return false;
    for (const k of ['milkLeft', 'sugarLeft', 'strainerLeft', 'extraSugar', 'lastHavoc', 'lastGrind']) {
      if (!integer(s[k])) return false;
    }
    if (s.lastHavoc > s.round || s.lastGrind > s.round || !optionalRound(s.havocAfter)
      || !optionalRound(s.grindAfter) || !optionalRound(s.shortageAfter)) return false;
    if ((s.fortune !== null && !known(s.fortune, FORTUNES)) || !known(s.nextFortune, FORTUNES)
      || !known(s.tea, TEAS) || !integer(s.teaAge, 1, s.round)) return false;
    if (!keys(s.progress, ['chapter', 'starts']) || !integer(s.progress.chapter, 1, CONFIG.chapters.length)
      || !Array.isArray(s.progress.starts) || s.progress.starts.length !== s.progress.chapter
      || s.progress.starts[0] !== 1 || !s.progress.starts.every((r, i, a) => integer(r, 1, s.round)
        && (i === 0 || r > a[i - 1]))) return false;
    if (!keys(s.spoon, Object.keys(UPGRADES)) || !Object.entries(UPGRADES).every(([id, u]) => integer(s.spoon[id], 0, u.max))) return false;
    if (s.offer !== null && (!ids(s.offer, UPGRADES) || s.offer.length < 1 || s.offer.length > CONFIG.upgrades.choices
      || s.offer.some((id) => s.spoon[id] >= UPGRADES[id].max))) return false;
    if (!keys(s.modifiers, Object.keys(template.modifiers)) || !Object.entries(template.modifiers).every(([k, v]) =>
      typeof v === 'number' ? finite(s.modifiers[k]) && s.modifiers[k] >= 0 : typeof s.modifiers[k] === typeof v)) return false;
    if (!object(s.teaServed) || !Object.entries(s.teaServed).every(([id, r]) => known(id, TEAS) && integer(r, 1, s.round))
      || s.teaServed[s.tea] !== s.round) return false;
    if (!ids(s.secrets, SECRETS) || !ids(s.discovered, COMBOS) || !ids(s.aerialDiscoveries, CONFIG.teaRun.aerial)) return false;
    if (!keys(s.stir, ['dir', 'time']) || s.stir.dir !== 0 || s.stir.time !== 0 || !keys(s.volleys, [])) return false;
    if (!keys(s.arcade, ['after', 'offeredAt']) || !keys(s.arcade.after, Object.keys(INTERLUDES))
      || !Object.values(s.arcade.after).every((r) => integer(r, 1))
      || !(s.arcade.offeredAt === null || integer(s.arcade.offeredAt, 1, s.round))
      || !(s.arcadeDue === null || known(s.arcadeDue, INTERLUDES))) return false;
    if (s.arcadeDue !== eligibleInterlude(s) || (s.havocDue && s.grindDue)) return false;
    if (!Array.isArray(s.residue) || s.residue.length > CONFIG.residue.maxLeaves || !s.residue.every((leaf) =>
      keys(leaf, ['lane', 'radius', 'angle', 'spin', 'size']) && integer(leaf.lane, 0, CONFIG.arena.lanes - 1)
        && ['radius', 'angle', 'spin', 'size'].every((k) => finite(leaf[k])) && leaf.size > 0 && leaf.radius >= 0)) return false;
    if (!keys(s.roundStats, Object.keys(template.roundStats)) || !Object.entries(s.roundStats).every(([k, v]) =>
      k === 'motionTime' ? finite(v) && v >= 0 : integer(v))) return false;
    return true;
  } catch {
    return false;
  }
}

export function captureCheckpoint(state, streams, pinnedTea = null) {
  if (state.phase !== PHASE.READING || RANDOM_STREAMS.some((id) => !streams[id]?.exportState)) return null;
  const data = { schemaVersion: POT_SCHEMA_VERSION, state: structuredClone(state),
    random: Object.fromEntries(RANDOM_STREAMS.map((id) => [id, streams[id].exportState()])), pinnedTea };
  return validateCheckpoint(data) ? data : null;
}
