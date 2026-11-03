// The only resumable boundary is a fully settled normal-round reading.
// Schema changes belong here; unsupported versions fail closed until a
// deliberate migration is added to migrateCheckpoint().
//
// Schema 1 (0.16.0): eight random streams, no porcelain.
// Schema 2 (0.17.0): adds the Golden Leaf's stream, state.porcelain, and the
//   Golden Leaf's (always empty here) state.goldenLeaf / goldenLeafTimer.
// Schema 3 (0.19.0): adds Mushroom Tea's (always empty here) state.spores and
//   its neutral modifier, state.modifiers.puffballChance.
// Schema 4 (0.19.0): adds the Tea Tray's state.tray (always null here: a treat
//   is taken after the reading is saved and served when the next cup starts),
//   and lets an offer hold Tea Tray cards beside upgrades.
import { CONFIG } from '../config.js';
import { createRandom, toSeed } from './random.js';
import { createInitialState, PHASE } from './state.js';
import { FORTUNES } from '../gameplay/fortunes.js';
import { TEAS } from '../gameplay/teas.js';
import { UPGRADES } from '../gameplay/upgrades.js';
import { TRAY } from '../gameplay/teaTray.js';
import { SECRETS } from '../gameplay/secrets.js';
import { COMBOS } from '../gameplay/combos.js';
import { MAX_HEAT, endsDay } from '../gameplay/days.js';
import { INTERLUDES, eligibleInterlude } from '../gameplay/arcadeInterludes.js';
import { FRACTURE_KINDS, cracksFor, porcelainForLives } from '../gameplay/porcelain.js';
import { GOLDEN_LEAF_SALT } from '../gameplay/goldenLeaf.js';

export const POT_SCHEMA_VERSION = 4;
const V1_STREAMS = Object.freeze(['normal', 'chocolate', 'boss', 'tea',
  'teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']);
export const RANDOM_STREAMS = Object.freeze([...V1_STREAMS, 'goldenLeaf']);
const V2_STATE = Object.freeze(['porcelain', 'goldenLeaf', 'goldenLeafTimer']);
const V3_STATE = Object.freeze(['spores']);
const V3_MODIFIERS = Object.freeze(['puffballChance']);
const V4_STATE = Object.freeze(['tray']);
const LATER_STATE = Object.freeze([...V2_STATE, ...V3_STATE, ...V4_STATE]);
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

/**
 * Schema 1 to 2 (checked, with everything else, after the step to 4). Everything a 0.16.0 save holds is kept exactly, its eight
 * random cursors included; the pending reading, offer, Day choice and
 * encounters come along untouched, so nothing is rerolled. The Golden Leaf's
 * stream starts where a fresh pot's would, from the pot's own seed. A 0.16.0
 * save never recorded where its leaves spilled, so its cracks (one per cup
 * below three) are drawn at fixed places rather than invented ones.
 * @returns {object|null} a schema 2 checkpoint, or null if `data` is not a sound schema 1 save
 */
function fromVersion1(data) {
  if (!keys(data, ['schemaVersion', 'state', 'random', 'pinnedTea']) || !keys(data.random, V1_STREAMS)) return null;
  const template = Object.keys(createInitialState()).filter((key) => !LATER_STATE.includes(key));
  if (!keys(data.state, template) || !integer(data.state.lives) || !integer(data.random.normal?.seed, 0, 0xffffffff)) return null;
  const leaf = createRandom(toSeed(data.random.normal.seed) ^ GOLDEN_LEAF_SALT).exportState();
  const migrated = {
    schemaVersion: 2,
    state: { ...structuredClone(data.state), porcelain: porcelainForLives(data.state.lives), goldenLeaf: null, goldenLeafTimer: null },
    random: { ...structuredClone(data.random), goldenLeaf: leaf },
    pinnedTea: data.pinnedTea,
  };
  return migrated;
}

/**
 * Schema 2 to 3 (checked, with everything else, after the step to 4). Nothing a 0.17.0 or 0.18.0 save holds changes, its nine
 * random cursors included. At a reading the field is clear, so Mushroom
 * Tea's spore clouds are empty; the finished cup's modifiers gain the neutral
 * puffball chance (they are recomputed when the next cup starts anyway).
 * @returns {object|null} a schema 3 checkpoint, or null if `data` is not a sound schema 2 save
 */
function fromVersion2(data) {
  if (!keys(data, ['schemaVersion', 'state', 'random', 'pinnedTea']) || !keys(data.random, RANDOM_STREAMS)) return null;
  const template = createInitialState();
  const stateKeys = Object.keys(template).filter((key) => !V3_STATE.includes(key) && !V4_STATE.includes(key));
  const modifierKeys = Object.keys(template.modifiers).filter((key) => !V3_MODIFIERS.includes(key));
  if (!keys(data.state, stateKeys) || !keys(data.state.modifiers, modifierKeys)) return null;
  const state = structuredClone(data.state);
  return {
    schemaVersion: 3,
    state: { ...state, modifiers: { ...state.modifiers, puffballChance: 0 }, spores: [] },
    random: structuredClone(data.random),
    pinnedTea: data.pinnedTea,
  };
}

/**
 * Schema 3 to 4. Nothing a schema 3 save holds changes: no treat can be
 * waiting at a saved reading, so the Tea Tray's slot starts empty, and a
 * pending offer (upgrades only, in schema 3) is kept exactly as it was.
 * @returns {object|null} a valid schema 4 checkpoint, or null if `data` is not a sound schema 3 save
 */
function fromVersion3(data) {
  if (!keys(data, ['schemaVersion', 'state', 'random', 'pinnedTea'])) return null;
  const stateKeys = Object.keys(createInitialState()).filter((key) => !V4_STATE.includes(key));
  if (!keys(data.state, stateKeys)) return null;
  const migrated = {
    schemaVersion: POT_SCHEMA_VERSION,
    state: { ...structuredClone(data.state), tray: null },
    random: structuredClone(data.random),
    pinnedTea: data.pinnedTea,
  };
  return validateCheckpoint(migrated) ? migrated : null;
}

/**
 * Bring a saved checkpoint up to the current schema, validated. The original
 * is never changed (callers keep it until the migrated pot saves over it).
 * @returns {object|null} a valid current checkpoint, or null
 */
export function migrateCheckpoint(data) {
  try {
    if (data?.schemaVersion === POT_SCHEMA_VERSION) return validateCheckpoint(data) ? data : null;
    if (data?.schemaVersion === 3) return fromVersion3(data);
    if (data?.schemaVersion === 2) {
      const v3 = fromVersion2(data);
      return v3 && fromVersion3(v3);
    }
    if (data?.schemaVersion === 1) {
      const v2 = fromVersion1(data);
      const v3 = v2 && fromVersion2(v2);
      return v3 && fromVersion3(v3);
    }
    return null;
  } catch {
    return null;
  }
}

/** The cup's fractures: well formed, bounded, and exactly one active crack per cup below three. */
function validPorcelain(p, lives) {
  if (!keys(p, ['serial', 'fractures']) || !integer(p.serial) || !Array.isArray(p.fractures)
    || p.fractures.length > CONFIG.porcelain.maxFractures || p.fractures.length > p.serial) return false;
  const seen = new Set();
  for (const f of p.fractures) {
    if (!keys(f, ['id', 'kind', 'angle', 'seed']) || !integer(f.id, 0, p.serial - 1) || seen.has(f.id)
      || !FRACTURE_KINDS.includes(f.kind) || !finite(f.angle) || f.angle < 0 || f.angle >= Math.PI * 2
      || !integer(f.seed, 0, 0xffffffff)) return false;
    if (seen.size && f.id < Math.max(...seen)) return false; // oldest first
    seen.add(f.id);
  }
  return p.fractures.filter((f) => f.kind === 'crack').length === cracksFor(lives);
}

/** Strictly the current schema. Older saves go through migrateCheckpoint() first. */
export function validateCheckpoint(data) {
  try {
    if (!keys(data, ['schemaVersion', 'state', 'random', 'pinnedTea']) || data.schemaVersion !== POT_SCHEMA_VERSION) return false;
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
      'stir', 'volleys', 'aerialDiscoveries', 'arcade', 'residue', 'roundStats', 'porcelain'];
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
    // An offer: upgrades that can still improve, then any Tea Tray treats filling it out.
    if (s.offer !== null && (!ids(s.offer, { ...UPGRADES, ...TRAY }) || s.offer.length < 1
      || s.offer.length > CONFIG.upgrades.choices || s.offer.some((id) => own(UPGRADES, id) && s.spoon[id] >= UPGRADES[id].max)
      || s.offer.some((id, i) => own(TRAY, id) && own(UPGRADES, s.offer[i + 1] ?? '')))) return false;
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
    if (!validPorcelain(s.porcelain, s.lives)) return false;
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
