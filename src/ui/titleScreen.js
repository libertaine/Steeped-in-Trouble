// Title -> instructions -> cup. Only an explicit, fresh activation leaves title.
export function createTitleScreen({ doc = document, onContinue, onGraphics }) {
  const dialog = doc.getElementById('arcadeSplash');
  const button = doc.getElementById('titleContinueBtn');
  const status = dialog.querySelector('[role="status"]');
  const actions = dialog.querySelector('.splash-actions');
  const instructions = doc.getElementById('titleInstructionsBtn');
  const graphics = doc.getElementById('titleGraphicsBtn');
  const win = doc.defaultView;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let time = 0;
  let animated = false;
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
      if (open && ready && !wasHeld && !e.repeat) {
        if (doc.activeElement === graphics) graphics.click();
        else proceed();
      }
    } else if (open && e.code === 'Space') {
      e.preventDefault(); // Space is steam, never a shortcut past title.
    } else if (open && e.code === 'Tab') {
      e.preventDefault();
      if (ready) {
        const buttons = [button, instructions, graphics];
        const index = buttons.indexOf(doc.activeElement);
        buttons[(index + (e.shiftKey ? 2 : 1)) % buttons.length].focus({ preventScroll: true });
      }
    }
  }
  const keyup = (e) => held.delete(e.code);
  const cancel = (e) => e.preventDefault();
  win.addEventListener('keydown', keydown, true);
  win.addEventListener('keyup', keyup, true);
  dialog.addEventListener('cancel', cancel);
  button.addEventListener('click', proceed);
  instructions.addEventListener('click', proceed);
  graphics.addEventListener('click', onGraphics);
  return {
    get blocked() { return open; },
    ready({ bypass = false } = {}) {
      if (bypass) { hide(); return; }
      ready = true;
      status.hidden = true;
      actions.hidden = false;
      button.disabled = false;
      button.focus({ preventScroll: true });
    },
    // Cosmetic steam only; driven by the game's existing loop. No game state/RNG.
    update(dt, quality) {
      const active = open && ready && quality === 'high' && !motion.matches && doc.visibilityState !== 'hidden';
      if (!active) {
        if (animated) {
          dialog.style.removeProperty('--title-steam-y');
          dialog.style.removeProperty('--title-steam-opacity');
        }
        animated = false;
        return;
      }
      time += dt;
      animated = true;
      dialog.style.setProperty('--title-steam-y', `${-3 - Math.sin(time * .8) * 3}px`);
      dialog.style.setProperty('--title-steam-opacity', String(.45 + Math.sin(time * .8) * .15));
    },
    dispose() {
      win.removeEventListener('keydown', keydown, true);
      win.removeEventListener('keyup', keyup, true);
      dialog.removeEventListener('cancel', cancel);
      button.removeEventListener('click', proceed);
      instructions.removeEventListener('click', proceed);
      graphics.removeEventListener('click', onGraphics);
      if (open) hide();
    },
  };
}
