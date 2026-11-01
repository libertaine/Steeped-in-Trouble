// Title -> instructions -> cup. Only an explicit, fresh activation leaves title.
export function createTitleScreen({ doc = document, onContinue }) {
  const dialog = doc.getElementById('arcadeSplash');
  const button = doc.getElementById('titleContinueBtn');
  const status = dialog.querySelector('[role="status"]');
  const win = doc.defaultView;
  let open = true;
  let ready = false;
  const held = new Set();
  // The static open attribute paints the loading screen before JS initializes.
  dialog.close();
  dialog.showModal();

  function hide() {
    open = false;
    dialog.close();
    dialog.hidden = true;
    dialog.classList.add('dismissed');
  }
  function proceed() {
    if (!open || !ready) return;
    hide();
    onContinue();
  }
  function keydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const wasHeld = held.has(e.code);
    if (open) held.add(e.code);
    // Retain the activation key until keyup, even after instructions open.
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!open && !wasHeld) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (open && !wasHeld && !e.repeat) proceed();
    } else if (open && e.code === 'Space') {
      e.preventDefault(); // Space is steam, never a shortcut past title.
    } else if (open && e.code === 'Tab') {
      e.preventDefault();
      if (ready) button.focus({ preventScroll: true });
    }
  }
  const keyup = (e) => held.delete(e.code);
  const cancel = (e) => e.preventDefault();
  win.addEventListener('keydown', keydown, true);
  win.addEventListener('keyup', keyup, true);
  dialog.addEventListener('cancel', cancel);
  button.addEventListener('click', proceed);
  return {
    get blocked() { return open; },
    ready({ bypass = false } = {}) {
      if (bypass) { hide(); return; }
      ready = true;
      status.hidden = true;
      button.hidden = false;
      button.disabled = false;
      button.focus({ preventScroll: true });
    },
    dispose() {
      win.removeEventListener('keydown', keydown, true);
      win.removeEventListener('keyup', keyup, true);
      dialog.removeEventListener('cancel', cancel);
      button.removeEventListener('click', proceed);
      if (open) hide();
    },
  };
}
