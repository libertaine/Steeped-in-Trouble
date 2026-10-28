// Keyboard and pointer input.
//
// Held controls (turn left/right, fire) are exposed as `held` and read by the
// simulation every frame. One-shot actions call the supplied commands
// immediately. Holds are released whenever the window loses focus, the page
// is hidden, a pointer is released or cancelled, or reset() is called (the
// game calls it on pause and restart). Upgrade cards are picked with 1 / 2 or
// a click or tap. Milk and sugar sit on Q / E beside the turning keys, as
// well as on M / S.

const KEY_BINDINGS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'fire',
};

// Number keys (top row or keypad) that pick an offered upgrade.
const CHOICE_KEYS = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1 };

// Keys whose default browser action (scrolling) is suppressed.
const CAPTURED_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp']);

/**
 * @param {object} options
 * @param {Document} options.doc
 * @param {{ fire(): void, milk(): void, sugar(): void, confirm(): boolean,
 *   togglePause(): boolean, restart(): boolean, pause(): void, choose(index: number): boolean }} options.commands
 */
export function createControls({ doc = document, commands }) {
  const win = doc.defaultView;
  const held = { left: false, right: false, fire: false };
  const cleanups = [];

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function reset() {
    held.left = false;
    held.right = false;
    held.fire = false;
  }

  function release() {
    reset();
    commands.pause();
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
    if (code === 'KeyM' || code === 'KeyQ') commands.milk();
    else if (code === 'KeyS' || code === 'KeyE') commands.sugar();
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

  // On-screen buttons that act while held.
  for (const button of doc.querySelectorAll('[data-hold]')) {
    const hold = button.dataset.hold;
    listen(button, 'pointerdown', (e) => {
      e.preventDefault();
      held[hold] = true;
      if (hold === 'fire') commands.fire();
      try {
        button.setPointerCapture?.(e.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a very quick tap).
      }
    });
    const up = (e) => {
      e.preventDefault();
      held[hold] = false;
    };
    listen(button, 'pointerup', up);
    listen(button, 'pointercancel', up);
    listen(button, 'lostpointercapture', up);
  }

  const milkButton = doc.querySelector('#milkBtn');
  const sugarButton = doc.querySelector('#sugarBtn');
  if (milkButton) listen(milkButton, 'click', () => commands.milk());
  if (sugarButton) listen(sugarButton, 'click', () => commands.sugar());
  for (const card of doc.querySelectorAll('[data-choice]')) {
    listen(card, 'click', () => commands.choose(Number(card.dataset.choice)));
  }

  return {
    held,
    reset,
    dispose() {
      reset();
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
