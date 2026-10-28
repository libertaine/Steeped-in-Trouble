// Keyboard, pointer, and touch input.
//
// Held controls (turn left/right, fire) are exposed as `held` and read by the
// simulation every frame. One-shot actions call the supplied commands
// immediately. Holds are released whenever the window loses focus, the page
// is hidden, a pointer is released or cancelled, or reset() is called (the
// game calls it on pause, restart, and on the way into and out of the Tea
// Shortage and the Tea Run). Upgrade cards are picked with 1 / 2 or a click
// or tap, and the Tea Shortage is answered with 1 / 2 / 3. Milk and sugar sit
// on Q / E beside the turning keys, on the up and down arrows beside the
// other arrows, and on M / S; in the Tea Run the same arrows (and Space)
// jump and slide instead.
//
// Every command is answered by the game only in the part of the game it
// belongs to (a jump does nothing in a cup, milk nothing on the sidewalk), so
// a key can safely mean different things in different places.
//
// Easy Touch adds gestures on the cup itself (input/gestures.js): double-tap
// for milk, long-press for sugar, or in the hot chocolate, hold for flames.
// They are read only on the element marked [data-gestures] (the canvas), so
// steering pads, upgrade cards, and buttons never take part, and a
// half-made gesture is forgotten whenever the game moves on to something else.

import { createGestures } from './gestures.js';

const KEY_BINDINGS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'fire',
};

// Number keys (top row or keypad) that pick an offered upgrade, or answer the Tea Shortage.
const CHOICE_KEYS = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2 };

// Keys whose default browser action (scrolling) is suppressed.
const CAPTURED_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowDown']);

const MILK_KEYS = new Set(['KeyQ', 'KeyM', 'ArrowUp']);
const SUGAR_KEYS = new Set(['KeyE', 'KeyS', 'ArrowDown']);
const JUMP_KEYS = new Set(['Space', 'ArrowUp']);
const SLIDE_KEYS = new Set(['ArrowDown']);

/**
 * @param {object} options
 * @param {Document} options.doc
 * @param {{ fire(): void, milk(): void, sugar(): void, confirm(): boolean,
 *   togglePause(): boolean, restart(): boolean, pause(): void, choose(index: number): boolean,
 *   jump?(): boolean, slide?(): boolean, errand?(choice: string): boolean }} options.commands
 * @param {() => ('cup' | 'flame' | null)} [options.gestureMode] what the cup's gestures do right now
 * @param {() => ('easy' | 'classic')} [options.scheme] the touch layout; gestures only work in Easy Touch
 * @param {(kind: string, point?: { x: number, y: number }) => void} [options.onGesture]
 *   feedback: 'press' (a finger is charging a long press), 'milk', 'sugar', or 'release'
 * @param {() => number} [options.now] milliseconds, for timing gestures
 */
export function createControls({
  doc = document, commands, gestureMode = () => null, scheme = () => 'classic', onGesture = () => {},
  now = () => performance.now(), gestures = createGestures(),
}) {
  const win = doc.defaultView;
  const held = { left: false, right: false, fire: false };
  const cleanups = [];
  let mode = null; // the gesture mode last seen
  let flamePointer = null; // the finger holding the flame in the hot chocolate
  let point = null; // where the gesture finger last landed

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function forgetGestures() {
    gestures.reset();
    if (flamePointer !== null) held.fire = false;
    flamePointer = null;
    onGesture('release');
  }

  function reset() {
    held.left = false;
    held.right = false;
    held.fire = false;
    forgetGestures();
  }

  function release() {
    reset();
    commands.pause();
  }

  /** The gesture mode now, forgetting any half-made gesture if it has changed. */
  function currentMode() {
    const next = scheme() === 'easy' ? gestureMode() : null;
    if (next !== mode) {
      forgetGestures();
      mode = next;
    }
    return mode;
  }

  function act(kind) {
    if (kind === 'milk') commands.milk();
    else if (kind === 'sugar') commands.sugar();
    onGesture(kind, point);
  }

  listen(win, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    const code = e.code;
    if (CAPTURED_KEYS.has(code)) e.preventDefault();
    const hold = KEY_BINDINGS[code];
    if (hold) {
      held[hold] = true;
      if (hold === 'fire') commands.fire();
    }
    if (e.repeat) return;
    let handled = false;
    if (JUMP_KEYS.has(code)) commands.jump?.();
    else if (SLIDE_KEYS.has(code)) commands.slide?.();
    if (MILK_KEYS.has(code)) commands.milk();
    else if (SUGAR_KEYS.has(code)) commands.sugar();
    else if (code === 'Enter') handled = commands.confirm();
    else if (code === 'KeyP') commands.togglePause();
    else if (code === 'KeyR') commands.restart();
    else if (code in CHOICE_KEYS) handled = commands.choose(CHOICE_KEYS[code]);
    // Stops a focused button from also receiving the Enter as a click.
    if (handled) e.preventDefault();
  });

  listen(win, 'keyup', (e) => {
    const hold = KEY_BINDINGS[e.code];
    if (hold) held[hold] = false;
  });

  listen(win, 'blur', release);
  listen(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') release();
  });

  /** Capture a pointer so its release reaches the element even if the finger slides off. */
  function capture(element, e) {
    try {
      element.setPointerCapture?.(e.pointerId);
    } catch {
      // The pointer may already be gone (e.g. a very quick tap).
    }
  }

  // On-screen buttons that act while held (both touch layouts' steering pads, and STEAM).
  for (const button of doc.querySelectorAll('[data-hold]')) {
    const hold = button.dataset.hold;
    listen(button, 'pointerdown', (e) => {
      e.preventDefault();
      held[hold] = true;
      if (hold === 'fire') commands.fire();
      capture(button, e);
    });
    const up = (e) => {
      e.preventDefault();
      held[hold] = false;
    };
    listen(button, 'pointerup', up);
    listen(button, 'pointercancel', up);
    listen(button, 'lostpointercapture', up);
  }

  // The Tea Run's JUMP and SLIDE act as the finger lands, not on click, so they answer at once.
  for (const button of doc.querySelectorAll('[data-run]')) {
    const action = button.dataset.run;
    listen(button, 'pointerdown', (e) => {
      e.preventDefault();
      commands[action]?.();
    });
  }

  const milkButton = doc.querySelector('#milkBtn');
  const sugarButton = doc.querySelector('#sugarBtn');
  if (milkButton) listen(milkButton, 'click', () => commands.milk());
  if (sugarButton) listen(sugarButton, 'click', () => commands.sugar());
  for (const card of doc.querySelectorAll('[data-choice]')) {
    listen(card, 'click', () => commands.choose(Number(card.dataset.choice)));
  }
  for (const button of doc.querySelectorAll('[data-errand]')) {
    listen(button, 'click', () => commands.errand?.(button.dataset.errand));
  }

  // Easy Touch: gestures on the cup.
  const area = doc.querySelector('[data-gestures]');
  if (area) {
    listen(area, 'pointerdown', (e) => {
      const gesture = currentMode();
      if (!gesture) return;
      e.preventDefault(); // no text selection, callouts, or zoom
      capture(area, e);
      point = { x: e.clientX, y: e.clientY };
      if (gesture === 'flame') {
        if (flamePointer !== null) return;
        flamePointer = e.pointerId;
        held.fire = true;
        commands.fire();
        return;
      }
      const hit = gestures.down(e.pointerId, e.clientX, e.clientY, now());
      if (hit) act(hit);
      else if (gestures.pressing) onGesture('press', point);
    });
    listen(area, 'pointermove', (e) => {
      if (mode === 'cup') gestures.move(e.pointerId, e.clientX, e.clientY);
    });
    const lift = (e, cancelled) => {
      if (e.pointerId === flamePointer) {
        flamePointer = null;
        held.fire = false;
        return;
      }
      if (mode !== 'cup') return;
      if (cancelled) gestures.cancel(e.pointerId);
      else {
        const hit = gestures.up(e.pointerId, e.clientX, e.clientY, now());
        if (hit) act(hit);
      }
      if (!gestures.pressing) onGesture('release');
    };
    listen(area, 'pointerup', (e) => lift(e, false));
    listen(area, 'pointercancel', (e) => lift(e, true));
    listen(area, 'lostpointercapture', (e) => lift(e, true));
    // A long press must not open the browser's menu for the canvas.
    listen(area, 'contextmenu', (e) => {
      if (scheme() === 'easy') e.preventDefault();
    });
  }

  return {
    held,
    reset,
    /** Call every frame: notices a long press, and forgets gestures when the game moves on. */
    update() {
      if (currentMode() !== 'cup') return;
      const hit = gestures.tick(now());
      if (hit) act(hit);
    },
    dispose() {
      reset();
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
