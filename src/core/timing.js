import { CONFIG } from '../config.js';

/** Convert a frame interval to a safe simulation step in seconds. */
export function frameDelta(nowMs, lastMs, maxSeconds = CONFIG.timing.maxFrameSeconds) {
  const seconds = (nowMs - lastMs) / 1000;
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(maxSeconds, seconds);
}

/**
 * A requestAnimationFrame loop with clamped delta time.
 *
 * The step is capped so returning from a background tab or a long frame never
 * produces a large simulation jump. start() is idempotent: calling it again
 * while running never creates a second loop.
 */
export function createLoop(step, {
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
  maxSeconds = CONFIG.timing.maxFrameSeconds,
} = {}) {
  let handle = null;
  let last = 0;

  function frame(time) {
    const dt = frameDelta(time, last, maxSeconds);
    last = time;
    handle = requestFrame(frame);
    step(dt);
  }

  return {
    start() {
      if (handle !== null) return;
      last = now();
      handle = requestFrame(frame);
    },
    stop() {
      if (handle === null) return;
      cancelFrame(handle);
      handle = null;
    },
    get running() {
      return handle !== null;
    },
  };
}
