// 1980s Arcade-style instruction overlay controller and accessibility handling.

/**
 * Creates and manages the 80s arcade instruction overlay.
 *
 * @param {object} options
 * @param {Document} [options.doc]
 * @param {string} [options.version] application version string (e.g. '0.17.0')
 * @param {boolean} [options.isTouchDevice] whether running on a touch-enabled device
 * @param {(details: { fromTeaBreak: boolean, isNewPot: boolean }) => void} [options.onStart]
 * @param {(details: { fromTeaBreak: boolean, escape?: boolean }) => void} [options.onClose]
 */
export function createInstructionOverlay({
  doc = document,
  version = '',
  isTouchDevice = false,
  onStart = () => {},
  onClose = () => {},
} = {}) {
  const dialog = doc.getElementById('instructionOverlay');
  const versionEl = doc.getElementById('overlayVersion');
  const primaryBtn = doc.getElementById('overlayPrimaryBtn');
  const newPotBtn = doc.getElementById('overlayNewPotBtn');
  const touchSummary = doc.getElementById('overlayTouchSummary');
  const checkTouch = typeof isTouchDevice === 'function' ? isTouchDevice : () => Boolean(isTouchDevice);

  if (versionEl && version) {
    versionEl.textContent = `v${version}`;
  }

  if (touchSummary) {
    touchSummary.hidden = !checkTouch();
  }

  let open = false;
  let fromTeaBreakMode = false;
  let hasSavedPotMode = false;
  let teaBreakCallback = null;
  let lastFocused = null;
  const cleanups = [];

  function getFocusableElements() {
    if (!dialog) return [];
    return [...dialog.querySelectorAll('button:not([hidden]):not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  }

  function trapFocus(e) {
    if (!open || e.code !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (doc.activeElement === first || !dialog.contains(doc.activeElement)) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else {
      if (doc.activeElement === last || !dialog.contains(doc.activeElement)) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  }

  function closeOverlay() {
    if (!open) return;
    open = false;
    if (dialog) {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      dialog.classList.remove('is-open');
    }
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try {
        lastFocused.focus({ preventScroll: true });
      } catch {
        // Element may no longer be attached
      }
      lastFocused = null;
    }
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

  function dismissEscape() {
    if (!open) return;
    const wasFromTeaBreak = fromTeaBreakMode;
    const cb = teaBreakCallback;
    teaBreakCallback = null;
    closeOverlay();
    if (wasFromTeaBreak) {
      cb?.();
    }
    onClose({ fromTeaBreak: wasFromTeaBreak, escape: true });
  }

  function onKeyDown(e) {
    if (!open) return;
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (doc.activeElement === newPotBtn) {
        dismissNewPot();
      } else {
        dismissPrimary();
      }
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dismissEscape();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      if (doc.activeElement === newPotBtn) {
        dismissNewPot();
      }
      return;
    }
    if (e.code === 'Tab') {
      trapFocus(e);
    }
  }

  function onPrimaryClick(e) {
    e.preventDefault();
    dismissPrimary();
  }

  function onNewPotClick(e) {
    e.preventDefault();
    dismissNewPot();
  }

  function onBackdropClick(e) {
    if (e.target === dialog || e.target.classList.contains('overlay-backdrop')) {
      e.preventDefault();
      dismissPrimary();
    }
  }

  if (dialog) {
    dialog.addEventListener('click', onBackdropClick);
    cleanups.push(() => dialog.removeEventListener('click', onBackdropClick));
  }

  // Also listen globally for keydown when open to catch Enter/Escape reliably
  doc.addEventListener('keydown', onKeyDown, true);
  cleanups.push(() => doc.removeEventListener('keydown', onKeyDown, true));

  if (primaryBtn) {
    primaryBtn.addEventListener('click', onPrimaryClick);
    cleanups.push(() => primaryBtn.removeEventListener('click', onPrimaryClick));
  }

  if (newPotBtn) {
    newPotBtn.addEventListener('click', onNewPotClick);
    cleanups.push(() => newPotBtn.removeEventListener('click', onNewPotClick));
  }

  return {
    show({ fromTeaBreak = false, hasSavedPot = false, onReturn = null } = {}) {
      open = true;
      fromTeaBreakMode = fromTeaBreak;
      hasSavedPotMode = hasSavedPot;
      teaBreakCallback = onReturn;
      lastFocused = doc.activeElement;

      if (touchSummary) {
        touchSummary.hidden = !checkTouch();
      }

      if (primaryBtn) {
        if (fromTeaBreak) {
          primaryBtn.textContent = 'BACK TO TEA BREAK (ENTER)';
        } else if (hasSavedPot) {
          primaryBtn.textContent = 'CONTINUE YOUR POT (ENTER)';
        } else {
          primaryBtn.textContent = 'PRESS ENTER OR CLICK TO START';
        }
      }

      if (newPotBtn) {
        newPotBtn.hidden = fromTeaBreak || !hasSavedPot;
      }

      const win = doc.defaultView;
      const prevX = win ? win.scrollX : 0;
      const prevY = win ? win.scrollY : 0;

      if (dialog) {
        dialog.classList.add('is-open');
        if (typeof dialog.show === 'function' && !dialog.open) {
          dialog.show();
        } else {
          dialog.setAttribute('open', '');
        }
      }

      // Defer focus slightly or focus immediately
      if (primaryBtn) {
        primaryBtn.focus({ preventScroll: true });
      }

      if (win && (win.scrollX !== prevX || win.scrollY !== prevY)) {
        win.scrollTo(prevX, prevY);
      }
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
