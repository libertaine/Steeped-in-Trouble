import { validateCheckpoint } from '../core/checkpoint.js';

export const RECORDS_KEY = 'steeped-in-trouble:arcade-records';
export const POT_KEY = 'steeped-in-trouble:pot-save';
export const RECORD_SCHEMA_VERSION = 1;
export const ARCADE_IDS = Object.freeze(['teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']);
const emptyGame = (id) => ({ plays: 0, bestScore: 0, wins: 0,
  ...(id === 'teaRun' ? {} : { perfects: 0 }), lastPlayed: null });
export const emptyRecords = () => ({ schemaVersion: RECORD_SCHEMA_VERSION,
  games: Object.fromEntries(ARCADE_IDS.map((id) => [id, emptyGame(id)])) });
const object = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const exactKeys = (o, names) => object(o) && Object.keys(o).length === names.length && names.every((k) => Object.hasOwn(o, k));
const count = (n) => Number.isSafeInteger(n) && n >= 0;

export function validateRecords(data) {
  return exactKeys(data, ['schemaVersion', 'games']) && data.schemaVersion === RECORD_SCHEMA_VERSION
    && exactKeys(data.games, ARCADE_IDS) && ARCADE_IDS.every((id) => {
      const r = data.games[id];
      return exactKeys(r, Object.keys(emptyGame(id))) && ['plays', 'bestScore', 'wins'].every((k) => count(r[k]))
        && r.wins <= r.plays && (r.plays > 0 || (r.bestScore === 0 && r.lastPlayed === null))
        && (id === 'teaRun' || (count(r.perfects) && r.perfects <= r.wins))
        && (r.lastPlayed === null || (typeof r.lastPlayed === 'string'
          && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.lastPlayed) && Number.isFinite(Date.parse(r.lastPlayed))));
    });
}

/** Storage is injected: neither tests nor the simulation need a browser. */
export function createLocalProgress(storage, { now = () => new Date().toISOString() } = {}) {
  let records = emptyRecords(), pot = null;
  const settled = new WeakSet();
  const status = { records: '', pot: '' };
  function read(key, validate, kind) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const value = JSON.parse(raw);
      if (!validate(value)) throw new TypeError('Invalid saved data');
      return value;
    } catch (error) {
      status[kind] = error instanceof SyntaxError || error instanceof TypeError
        ? (kind === 'pot' ? 'The saved pot could not be resumed. You can brew a new pot.'
          : 'The old arcade records could not be read. A fresh record book is open.')
        : (kind === 'pot' ? 'Pot checkpoints cannot be saved in this session.' : 'Arcade records will not be saved for this session.');
      return null;
    }
  }
  records = read(RECORDS_KEY, validateRecords, 'records') ?? records;
  pot = read(POT_KEY, validateCheckpoint, 'pot');
  function write(key, value, kind) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
      status[kind] = '';
      return true;
    } catch {
      status[kind] = kind === 'pot' ? 'Pot checkpoints cannot be saved in this session.'
        : 'Arcade records will not be saved for this session.';
      return false;
    }
  }
  return {
    get records() { return structuredClone(records); },
    get pot() { return pot ? structuredClone(pot) : null; },
    get potInfo() { return pot ? { round: pot.state.round } : null; },
    get status() { return { ...status }; },
    settle(game) {
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
    saveCheckpoint(checkpoint) {
      if (!validateCheckpoint(checkpoint)) return false;
      if (!write(POT_KEY, checkpoint, 'pot')) return false;
      pot = structuredClone(checkpoint);
      return true;
    },
    clearPot() {
      if (!write(POT_KEY, null, 'pot')) return false;
      pot = null;
      return true;
    },
  };
}
