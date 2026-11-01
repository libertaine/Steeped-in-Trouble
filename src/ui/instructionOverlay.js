// The arcade instruction overlay: the controls, shown as a modal dialog over
// the cup before the first cup of a visit, and again from the Tea Break.
//
// - It opens with showModal(), so it sits in the top layer, centred in the
//   browser window, and the page behind it is inert.
// - Enter (or a click) on the main button starts, continues, or goes back to
//   the Tea Break. Space only presses the focused secondary button, so a
//   held steam key cannot dismiss it by accident.
// - Escape never skips the first screen: the start button is nudged and
//   keeps focus. When the overlay was opened from the Tea Break, Escape goes
//   back to the Tea Break, like its main button.
// - A click on the dimmed backdrop does nothing.

/** What the touch line says for each layout. */
export function touchSummary({ scheme, autoSteam }) {
  if (scheme === 'easy') {
    return {
      label: 'Easy Touch:',
      text: 'hold ◀ / ▶ to steer. Steam fires by itself. Double-tap the cup for milk; hold a finger on the cup for sugar.',
    };
  }
  return {
    label: 'Classic Touch:',
    text: autoSteam
      ? 'hold ◀ TURN / TURN ▶ to steer. Auto Steam is on, so steam fires by itself. Tap MILK or SUGAR.'
      : 'hold ◀ TURN / TURN ▶ to steer and STEAM to fire. Tap MILK or SUGAR.',
  };
}

/**
 * @param {object} options
 * @param {Document} [options.doc]
 * @param {string} [options.version] application version string (e.g. '0.17.0')
 * @param {() => ({ scheme: 'easy' | 'classic', autoSteam: boolean } | null)} [options.touch]
 *   the touch layout to explain, or null to leave touch out (a keyboard and mouse)
 * @param {(details: { fromTeaBreak: boolean, isNewPot: boolean }) => void} [options.onStart]
 * @param {(details: { fromTeaBreak: boolean, escape?: boolean }) => void} [options.onClose]
 */
export function createInstructionOverlay({
  doc = document,
  version = '',
  touch = () => null,
  onStart = () => {},
  onClose = () => {},
} = {}) {
  const dialog = doc.getElementById('instructionOverlay');
  const versionEl = doc.getElementById('overlayVersion');
  const primaryBtn = doc.getElementById('overlayPrimaryBtn');
  const newPotBtn = doc.getElementById('overlayNewPotBtn');
  const touchBox = doc.getElementById('overlayTouchSummary');
  const touchLabel = doc.getElementById('overlayTouchScheme');
  const touchText = doc.getElementById('overlayTouchText');

  if (versionEl && version) versionEl.textContent = `v${version}`;

  let open = false;
  let fromTeaBreakMode = false;
  let hasSavedPotMode = false;
  let teaBreakCallback = null;
  let lastFocused = null;
  let nudgeTimer = null;
  const cleanups = [];

  function describeTouch() {
    const layout = touch();
    if (touchBox) touchBox.hidden = !layout;
    if (!layout) return;
    const { label, text } = touchSummary(layout);
    if (touchLabel) touchLabel.textContent = label;
    if (touchText) touchText.textContent = text;
  }
  describeTouch();

  function getFocusableElements() {
    if (!dialog) return [];
    return [...dialog.querySelectorAll('button:not([hidden]):not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  }

  function trapFocus(e) {
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const outside = !dialog.contains(doc.activeElement);
    if (e.shiftKey ? doc.activeElement === first || outside : doc.activeElement === last || outside) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus({ preventScroll: true });
    }
  }

  function closeOverlay() {
    if (!open) return;
    open = false;
    clearTimeout(nudgeTimer);
    primaryBtn?.classList.remove('nudge');
    if (dialog) {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
      dialog.classList.remove('is-open');
    }
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try {
        lastFocused.focus({ preventScroll: true });
      } catch {
        // Element may no longer be attached
      }
    }
    lastFocused = null;
  }

  function dismissPrimary() {
    if (!open) return;
    const wasFromTeaBreak = fromTeaBreakMode;
    const cb = teaBreakCallback;
    teaBreakCallback = null;
    closeOverlay();
    if (wasFromTeaBreak) {
      cb?.();
      onClose({ fromTeaBreak: true });
    } else {
      onStart({ fromTeaBreak: false, isNewPot: false });
    }
  }

  function dismissNewPot() {
    if (!open) return;
    teaBreakCallback = null;
    closeOverlay();
    onStart({ fromTeaBreak: false, isNewPot: true });
  }

  function nudge() {
    primaryBtn?.focus({ preventScroll: true });
    primaryBtn?.classList.remove('nudge');
    // Restart the animation even when Escape is pressed again mid-shake.
    void primaryBtn?.offsetWidth;
    primaryBtn?.classList.add('nudge');
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => primaryBtn?.classList.remove('nudge'), 400);
  }

  function escape() {
    if (!open) return;
    if (!fromTeaBreakMode) {
      nudge();
      return;
    }
    const cb = teaBreakCallback;
    teaBreakCallback = null;
    closeOverlay();
    cb?.();
    onClose({ fromTeaBreak: true, escape: true });
  }

  function onKeyDown(e) {
    if (!open) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (doc.activeElement === newPotBtn) dismissNewPot();
      else dismissPrimary();
      return;
    }
    if (e.code === 'Escape') {
      // Cancelling the keydown also stops the browser closing the modal itself.
      e.preventDefault();
      e.stopPropagation();
      escape();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      if (doc.activeElement === newPotBtn) dismissNewPot();
      return;
    }
    if (e.code === 'Tab') trapFocus(e);
  }

  // Escape is handled above; a close request that still reaches the dialog is refused.
  function onCancel(e) {
    e.preventDefault();
  }

  // If the browser closes the dialog anyway (some close requests cannot be
  // cancelled), treat it as Escape: the first screen comes straight back.
  function onBrowserClose() {
    if (!open || dialog.open) return;
    if (fromTeaBreakMode) {
      escape();
      return;
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    nudge();
  }

  function onPrimaryClick(e) {
    e.preventDefault();
    dismissPrimary();
  }

  function onNewPotClick(e) {
    e.preventDefault();
    dismissNewPot();
  }

  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  // Capture on the document, so Enter, Space, and Escape never reach the game's own keys.
  listen(doc, 'keydown', onKeyDown, true);
  listen(dialog, 'cancel', onCancel);
  listen(dialog, 'close', onBrowserClose);
  listen(primaryBtn, 'click', onPrimaryClick);
  listen(newPotBtn, 'click', onNewPotClick);

  return {
    show({ fromTeaBreak = false, hasSavedPot = false, onReturn = null } = {}) {
      open = true;
      fromTeaBreakMode = fromTeaBreak;
      hasSavedPotMode = hasSavedPot;
      teaBreakCallback = onReturn;
      lastFocused = doc.activeElement;
      describeTouch();

      if (primaryBtn) {
        if (fromTeaBreak) primaryBtn.textContent = 'BACK TO TEA BREAK (ENTER)';
        else if (hasSavedPot) primaryBtn.textContent = 'CONTINUE YOUR POT (ENTER)';
        else primaryBtn.textContent = 'PRESS ENTER OR CLICK TO START';
      }
      if (newPotBtn) newPotBtn.hidden = fromTeaBreak || !hasSavedPot;

      const win = doc.defaultView;
      const prevX = win ? win.scrollX : 0;
      const prevY = win ? win.scrollY : 0;

      if (dialog) {
        dialog.classList.add('is-open');
        if (!dialog.open) {
          if (typeof dialog.showModal === 'function') dialog.showModal();
          else if (typeof dialog.show === 'function') dialog.show();
          else dialog.setAttribute('open', '');
        }
      }
      primaryBtn?.focus({ preventScroll: true });

      if (win && (win.scrollX !== prevX || win.scrollY !== prevY)) win.scrollTo(prevX, prevY);
    },

    dismissPrimary,

    close() {
      closeOverlay();
    },

    get isOpen() {
      return open;
    },

    get blocked() {
      return open;
    },

    get fromTeaBreak() {
      return fromTeaBreakMode;
    },

    get hasSavedPot() {
      return hasSavedPotMode;
    },

    dispose() {
      closeOverlay();
      for (const cleanup of cleanups) cleanup();
    },
  };
}
