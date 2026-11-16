import { migrateCheckpoint, validateCheckpoint } from '../core/checkpoint.js';
import { recordEligible } from '../core/recordEligibility.js';

export const RECORDS_KEY = 'steeped-in-trouble:arcade-records';
export const MODE_RECORDS_KEY = 'steeped-in-trouble:mode-records';
export const POT_KEY = 'steeped-in-trouble:pot-save';
export const RECORD_SCHEMA_VERSION = 1;
export const MODE_RECORD_SCHEMA_VERSION = 1;
export const ARCADE_IDS = Object.freeze(['teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']);
export const MODE_IDS = Object.freeze(['chill', 'arcade']);
const emptyGame = (id) => ({ plays: 0, bestScore: 0, wins: 0,
  ...(id === 'teaRun' ? {} : { perfects: 0 }), lastPlayed: null });
export const emptyMode = () => ({ plays: 0, bestScore: 0, bestRound: 0, cups: 0, lastPlayed: null });
export const emptyRecords = () => ({ schemaVersion: RECORD_SCHEMA_VERSION,
  games: Object.fromEntries(ARCADE_IDS.map((id) => [id, emptyGame(id)])) });
export const emptyModeRecords = () => ({ schemaVersion: MODE_RECORD_SCHEMA_VERSION,
  modes: Object.fromEntries(MODE_IDS.map((id) => [id, emptyMode()])) });
const object = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const exactKeys = (o, names) => object(o) && Object.keys(o).length === names.length && names.every((k) => Object.hasOwn(o, k));
const count = (n) => Number.isSafeInteger(n) && n >= 0;
const validIso = (s) => s === null || (typeof s === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)));

export function validateRecords(data) {
  return exactKeys(data, ['schemaVersion', 'games']) && data.schemaVersion === RECORD_SCHEMA_VERSION
    && exactKeys(data.games, ARCADE_IDS) && ARCADE_IDS.every((id) => {
      const r = data.games[id];
      return exactKeys(r, Object.keys(emptyGame(id))) && ['plays', 'bestScore', 'wins'].every((k) => count(r[k]))
        && r.wins <= r.plays && (r.plays > 0 || (r.bestScore === 0 && r.lastPlayed === null))
        && (id === 'teaRun' || (count(r.perfects) && r.perfects <= r.wins))
        && validIso(r.lastPlayed);
    });
}

export function validateModeRecords(data) {
  return exactKeys(data, ['schemaVersion', 'modes']) && data.schemaVersion === MODE_RECORD_SCHEMA_VERSION
    && exactKeys(data.modes, MODE_IDS) && MODE_IDS.every((id) => {
      const r = data.modes[id];
      return exactKeys(r, Object.keys(emptyMode()))
        && ['plays', 'bestScore', 'bestRound', 'cups'].every((k) => count(r[k]))
        && validIso(r.lastPlayed);
    });
}

/** Storage is injected: neither tests nor the simulation need a browser. */
export function createLocalProgress(storage, { now = () => new Date().toISOString(), eligible = true } = {}) {
  let records = emptyRecords(), modeRecords = emptyModeRecords(), pot = null;
  const settled = new WeakSet();
  const status = { records: '', pot: '' };
  // `load` returns the usable value (validated, and migrated if it is older), or null.
  function read(key, load, kind) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const value = load(JSON.parse(raw));
      if (!value) throw new TypeError('Invalid saved data');
      return value;
    } catch (error) {
      if (kind) {
        status[kind] = error instanceof SyntaxError || error instanceof TypeError
          ? (kind === 'pot' ? 'The saved pot could not be resumed. You can brew a new pot.'
            : 'The old arcade records could not be read. A fresh record book is open.')
          : (kind === 'pot' ? 'Pot checkpoints cannot be saved in this session.' : 'Arcade records will not be saved for this session.');
      }
      return null;
    }
  }
  records = read(RECORDS_KEY, (data) => (validateRecords(data) ? data : null), 'records') ?? records;
  modeRecords = read(MODE_RECORDS_KEY, (data) => (validateModeRecords(data) ? data : null), null) ?? modeRecords;
  // An older pot is migrated in memory only: the stored save stays as it was
  // until this pot's next checkpoint replaces it.
  pot = read(POT_KEY, migrateCheckpoint, 'pot');
  function write(key, value, kind) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
      if (kind) status[kind] = '';
      return true;
    } catch {
      if (kind) {
        status[kind] = kind === 'pot' ? 'Pot checkpoints cannot be saved in this session.'
          : 'Arcade records will not be saved for this session.';
      }
      return false;
    }
  }
  return {
    get records() { return structuredClone(records); },
    get modeRecords() { return structuredClone(modeRecords); },
    get pot() { return pot ? structuredClone(pot) : null; },
    get potInfo() { return pot ? { round: pot.state.round, mode: pot.state.mode ?? 'arcade', score: pot.state.score } : null; },
    get status() { return { ...status }; },
    recordPot(state, { finished = false, cupCompleted = false } = {}) {
      if (!eligible || !recordEligible(state)) return null;
      const mode = MODE_IDS.includes(state?.mode) ? state.mode : 'arcade';
      const score = count(state?.score) ? state.score : 0;
      const round = count(state?.round) ? state.round : 0;
      const r = modeRecords.modes[mode];
      const improvedScore = score > r.bestScore;
      const improvedRound = round > r.bestRound;
      r.bestScore = Math.max(r.bestScore, score);
      r.bestRound = Math.max(r.bestRound, round);
      if (cupCompleted) r.cups++;
      if (finished) r.plays++;
      r.lastPlayed = now();
      write(MODE_RECORDS_KEY, modeRecords, null);
      return { mode, improvedScore, improvedRound, bestScore: r.bestScore, bestRound: r.bestRound };
    },
    settle(game) {
      if (!eligible || !recordEligible(game)) return null;
      const id = game.practice;
      const summary = game.practiceMission?.()?.summary;
      if (!ARCADE_IDS.includes(id) || !summary || settled.has(game) || !count(summary.points)) return null;
      settled.add(game);
      const r = records.games[id];
      const improved = summary.points > r.bestScore;
      r.plays++;
      r.bestScore = Math.max(r.bestScore, summary.points);
      if (summary.success || summary.result === 'success') r.wins++;
      if (id !== 'teaRun' && summary.perfect) r.perfects++;
      r.lastPlayed = now();
      write(RECORDS_KEY, records, 'records');
      return { improved, score: summary.points };
    },
    saveCheckpoint(checkpoint, source = checkpoint?.state) {
      if (!eligible || !recordEligible(source)) return false;
      if (!validateCheckpoint(checkpoint)) return false;
      if (!write(POT_KEY, checkpoint, 'pot')) return false;
      pot = structuredClone(checkpoint);
      return true;
    },
    clearPot(source) {
      if (!eligible || !recordEligible(source)) return false;
      if (!write(POT_KEY, null, 'pot')) return false;
      pot = null;
      return true;
    },
  };
}
