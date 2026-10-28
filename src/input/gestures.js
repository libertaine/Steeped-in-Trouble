// Easy Touch gestures on the cup: double-tap for milk, long-press for sugar.
//
// A pure recogniser, fed pointer positions (CSS px) and times (ms) by the
// controls; it never touches the DOM, so it can be tested with made-up times.
//
// - A tap is a touch lifted within CONFIG.touch.tapMax without wandering
//   more than moveSlop.
// - Milk: a touch that lands within doubleTap ms of a tap, and within tapSlop
//   of it. It fires as the second finger lands, and that touch is spent: it
//   can never also become a long press, and a third tap starts afresh.
// - Sugar: a touch held still for longPress ms. It fires once per press,
//   however long the finger stays down.
//
// One finger at a time: a second touch while one is down is ignored, so a
// thumb resting on the cup never turns another tap into a gesture.

import { CONFIG } from '../config.js';

const T = CONFIG.touch;

export function createGestures(options = {}) {
  const { doubleTap, tapSlop, tapMax, longPress, moveSlop } = { ...T, ...options };
  let press = null; // { id, x, y, t, spent, moved }
  let lastTap = null; // { x, y, t }

  const far = (a, x, y, limit) => Math.hypot(a.x - x, a.y - y) > limit;
  const held = (p, t) => !p.spent && !p.moved && t - p.t >= longPress;

  return {
    /** A finger lands. Returns 'milk' if it completes a double tap. */
    down(id, x, y, t) {
      if (press) return null;
      const tap = lastTap;
      lastTap = null;
      if (tap && t - tap.t <= doubleTap && !far(tap, x, y, tapSlop)) {
        press = { id, x, y, t, spent: true, moved: false };
        return 'milk';
      }
      press = { id, x, y, t, spent: false, moved: false };
      return null;
    },
    move(id, x, y) {
      if (press?.id === id && !press.moved && far(press, x, y, moveSlop)) press.moved = true;
    },
    /** Call every frame. Returns 'sugar' when the finger has been held long enough. */
    tick(t) {
      if (!press || !held(press, t)) return null;
      press.spent = true;
      return 'sugar';
    },
    /** A finger lifts. Returns 'sugar' if it was held long enough but no tick noticed in time. */
    up(id, x, y, t) {
      if (press?.id !== id) return null;
      const p = press;
      press = null;
      if (held(p, t)) return 'sugar';
      if (!p.spent && !p.moved && t - p.t <= tapMax) lastTap = { x, y, t };
      return null;
    },
    cancel(id) {
      if (press?.id === id) press = null;
    },
    /** Forget everything: a half-finished gesture never carries into another part of the game. */
    reset() {
      press = null;
      lastTap = null;
    },
    /** Is a finger down on the cup (and not yet spent)? For the charge-up ring. */
    get pressing() {
      return !!press && !press.spent && !press.moved;
    },
  };
}
