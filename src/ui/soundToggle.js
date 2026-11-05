// The quick sound switch: M, the speaker buttons, and the Settings toggle.
//
// audio.enabled is the only on/off there is; this module flips it, shows it on
// every [data-sound-toggle] speaker and on the Settings "Sound" button, and
// remembers it (input/settings.js). There is a speaker in the title screen, the
// page header (gameplay, pauses and readings) and the Tea Break, because a
// modal dialog leaves everything outside it inert.
//
// M toggles from anywhere except while typing, once per physical press: auto-
// repeat and Ctrl, Alt, Meta or Shift combinations are ignored, and an event
// is only ever counted once. M has no other meaning in the game.
//
// It also unlocks audio for a player whose saved choice is "on": nothing is
// created until their first key press, click or tap (browser autoplay rules).

import { saveSound } from '../input/settings.js';

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const GESTURES = ['keydown', 'pointerdown', 'pointerup', 'click', 'touchend'];
const CAPTURE = { capture: true };

/** A fresh, unmodified press of M, outside anything the player is typing into. */
export function isMuteKey(e) {
  if (e.code !== 'KeyM' || e.repeat || e.isComposing) return false;
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  return !e.target?.closest?.(EDITABLE);
}

/**
 * @param {object} options
 * @param {Document} options.doc
 * @param {{ enabled: boolean, toggle(): boolean, unlock(): boolean }} options.audio
 * @param {Storage | null} [options.storage]
 */
export function createSoundToggle({ doc = document, audio, storage = null }) {
  const win = doc.defaultView;
  const speakers = [...doc.querySelectorAll('[data-sound-toggle]')];
  const text = doc.getElementById('soundBtn');
  const counted = new WeakSet();
  const cleanups = [];
  let unlocking = true;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function render() {
    const on = audio.enabled;
    for (const speaker of speakers) {
      speaker.dataset.muted = String(!on);
      speaker.setAttribute('aria-label', on ? 'Mute audio' : 'Unmute audio');
      speaker.title = on ? 'Mute audio (M)' : 'Unmute audio (M)';
    }
    if (text) text.textContent = `Sound: ${on ? 'on' : 'off'}`;
  }

  function toggle() {
    const on = audio.toggle();
    saveSound(storage, on);
    render();
    return on;
  }

  function unlock() {
    if (!unlocking || !audio.unlock()) return;
    unlocking = false;
    for (const type of GESTURES) win.removeEventListener(type, unlock, CAPTURE);
  }
  for (const type of GESTURES) win.addEventListener(type, unlock, CAPTURE);
  cleanups.push(() => { for (const type of GESTURES) win.removeEventListener(type, unlock, CAPTURE); });

  listen(win, 'keydown', (e) => {
    if (counted.has(e)) return;
    counted.add(e);
    if (isMuteKey(e)) toggle();
  }, CAPTURE);

  for (const button of [...speakers, text].filter(Boolean)) {
    listen(button, 'click', (e) => {
      toggle();
      // A tap on the header speaker hands the keyboard back to the cup, so the next Space is steam.
      if (e.detail > 0 && button.dataset.soundToggle === 'header') doc.getElementById('game')?.focus({ preventScroll: true });
    });
  }

  render();
  return {
    get enabled() { return audio.enabled; },
    toggle,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
