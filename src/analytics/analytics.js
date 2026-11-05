// Turns game lifecycle events and foreground time into a few anonymous counts.
// It only listens: it never touches game state, randomness, storage or the DOM,
// and everything it sends is listed in docs/ANALYTICS.md.

export const ROUND_MILESTONES = Object.freeze([1, 5, 10, 20, 30, 50]);

export const ENGAGEMENT_THRESHOLDS = Object.freeze([
  ['engaged_30s', 30_000],
  ['engaged_1m', 60_000],
  ['engaged_3m', 180_000],
  ['engaged_5m', 300_000],
  ['engaged_10m', 600_000],
  ['engaged_20m', 1_200_000],
  ['engaged_30m', 1_800_000],
  ['engaged_60m', 3_600_000],
]);

// Without input, time stops counting after this long in a phase.
export const ACTIVE_IDLE_MS = 60_000; // adventure and result screens can wait forever
export const PASSIVE_IDLE_MS = 30_000; // so can an unattended reading
// A longer gap between frames means suspension or sleep. It is discarded, not caught up.
export const MAX_FRAME_GAP_MS = 1_000;

const ACTIVE_PHASES = new Set(['playing', 'chocolate', 'grind', 'manager', 'teaRun', 'dailyPour',
  'biscuitBreakout', 'crossingStreet']);
const PASSIVE_PHASES = new Set(['reading', 'day', 'shortage', 'arcadeOffer']);

/**
 * @param {{ send: (name: string, data?: object) => void, now: () => number, foreground: () => boolean }} options
 *   `now` is monotonic milliseconds; `foreground` says the page is visible and focused.
 */
export function createAnalytics({ send, now, foreground }) {
  let started = false;
  const milestones = new Set(ROUND_MILESTONES);
  let engaged = 0, nextThreshold = 0;
  let lastFrame = now(), lastActivity = lastFrame, lastPhase = null, wasCounting = false;

  // Analytics may never interrupt the game.
  function emit(name, data) {
    try {
      send(name, data);
    } catch {
      // A broken tracker costs only the count.
    }
  }

  function gameStarted() {
    if (started) return;
    started = true;
    emit('game_start');
  }

  return {
    gameStarted,
    /** One game event. `normal` is false for practice sessions and the collection. */
    handle(event, normal) {
      if (!normal) return;
      if (event.type === 'matchStart') gameStarted();
      else if (event.type === 'roundStart' && milestones.delete(event.round)) {
        emit('round_milestone', { round: event.round });
      }
    },
    noteInput() { lastActivity = now(); },
    /** Once per animation frame. `open` is false behind a modal and in practice. */
    frame(phase, open) {
      const time = now();
      const step = time - lastFrame;
      lastFrame = time;
      if (phase !== lastPhase) {
        lastPhase = phase;
        lastActivity = time;
      }
      const limit = !open || !started ? 0
        : ACTIVE_PHASES.has(phase) ? ACTIVE_IDLE_MS
          : PASSIVE_PHASES.has(phase) ? PASSIVE_IDLE_MS : 0;
      const counting = limit > 0 && time - lastActivity <= limit && foreground();
      if (counting && wasCounting && step > 0 && step <= MAX_FRAME_GAP_MS) {
        engaged += step;
        if (nextThreshold < ENGAGEMENT_THRESHOLDS.length && engaged >= ENGAGEMENT_THRESHOLDS[nextThreshold][1]) {
          emit(ENGAGEMENT_THRESHOLDS[nextThreshold][0]);
          nextThreshold++;
        }
      }
      wasCounting = counting;
    },
    get engagedMs() { return engaged; },
  };
}
