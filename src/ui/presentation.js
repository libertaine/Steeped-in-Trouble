// Reuse the existing panels and choices: one set of buttons, one phase authority.
import { CONFIG } from '../config.js';
import { initialView, isTouchDevice, saveView } from '../input/settings.js';

export function createPresentation({ doc = document, game, params, storage, resetInput }) {
  const win = doc.defaultView;
  const body = doc.body;
  const dialog = doc.getElementById('teaBreak');
  const close = doc.getElementById('closeBreak');
  const menu = doc.getElementById('menuBtn');
  const viewButton = doc.getElementById('viewBtn');
  const breakView = doc.getElementById('breakViewBtn');
  const aside = doc.querySelector('aside');
  const main = doc.querySelector('main');
  const primary = doc.getElementById('mainBtn');
  const primaryHome = primary.parentElement;
  const dock = doc.getElementById('actionDock');
  const choices = doc.getElementById('phaseChoices');
  const stage = doc.querySelector('.stage');
  const offers = [doc.getElementById('upgradeOffer'), doc.getElementById('errandOffer'), doc.getElementById('arcadeOffer')].filter(Boolean);
  const panels = [...aside.children];
  const sections = panels.map((panel, index) => {
    const details = doc.createElement('details');
    const summary = doc.createElement('summary');
    summary.textContent = ['Current pot', 'Tea and fortune', 'Settings and controls'][index];
    details.append(summary);
    return details;
  });
  let view = initialView({ params, storage, touchDevice: isTouchDevice(win) });
  let resumeOnClose = false;

  function closeMenu() {
    if (!dialog.open) return;
    dialog.close();
    panels.forEach((panel) => aside.append(panel));
    sections.forEach((section) => section.remove());
    panels[2].append(doc.querySelector('.settings'));
    main.append(aside);
    resetInput();
    if (resumeOnClose && doc.visibilityState !== 'hidden') game.resume();
    resumeOnClose = false;
    menu.focus({ preventScroll: true });
  }

  function applyView() {
    body.dataset.view = view;
    viewButton.textContent = `View: ${view}`;
    breakView.textContent = `View: ${view}`;
    if (view === 'compact') {
      dock.prepend(primary);
      offers.forEach((offer) => choices.append(offer));
    } else {
      primaryHome.insertBefore(primary, doc.getElementById('gameTip'));
      offers.forEach((offer) => stage.append(offer));
    }
    resetInput();
  }

  function openMenu() {
    if (dialog.open || menu.disabled) return;
    const before = game.state.phase;
    game.pause();
    resumeOnClose = before !== 'paused' && game.state.phase === 'paused';
    resetInput();
    close.textContent = resumeOnClose ? 'Resume game' : 'Back to cup';
    doc.getElementById('breakContent').append(aside);
    sections.forEach((section, index) => {
      section.open = index === (game.state.phase === 'reading' ? 1 : 0);
      section.append(panels[index]);
      aside.append(section);
    });
    // Put settings first in their section, before the longer keyboard reference.
    panels[2].prepend(doc.querySelector('.settings'));
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  function switchView() {
    closeMenu();
    view = view === 'compact' ? 'full' : 'compact';
    saveView(storage, view);
    applyView();
  }

  // A backgrounded app must stay paused when the sheet is later dismissed.
  const backgrounded = () => { resumeOnClose = false; };
  const visibility = () => { if (doc.visibilityState === 'hidden') backgrounded(); };
  const cancel = (e) => { e.preventDefault(); closeMenu(); };
  menu.addEventListener('click', openMenu);
  close.addEventListener('click', closeMenu);
  viewButton.addEventListener('click', switchView);
  breakView.addEventListener('click', switchView);
  dialog.addEventListener('cancel', cancel);
  win.addEventListener('blur', backgrounded);
  doc.addEventListener('visibilitychange', visibility);
  applyView();

  return {
    get blocked() { return dialog.open; },
    update() {
      const s = game.state;
      body.dataset.phase = s.phase;
      body.dataset.active = String(game.touchGestures() !== null || (s.phase === 'teaRun' && s.run.stage === 'run')
        || (s.phase === 'dailyPour' && s.dailyPour.stage === 'play')
        || (s.phase === 'biscuitBreakout' && s.biscuitBreakout.stage === 'play'));
      // Keep the animation and reveal unobscured, and required choices directly reachable.
      menu.disabled = s.phase === 'shortage' || (s.phase === 'reading'
        && s.readingTime < CONFIG.fortunes.revealAt);
      menu.textContent = ['playing', 'chocolate', 'grind', 'teaRun', 'dailyPour', 'biscuitBreakout'].includes(s.phase) ? 'Pause / Menu' : 'Tea Break';
    },
    dispose() {
      closeMenu();
      menu.removeEventListener('click', openMenu);
      close.removeEventListener('click', closeMenu);
      viewButton.removeEventListener('click', switchView);
      breakView.removeEventListener('click', switchView);
      dialog.removeEventListener('cancel', cancel);
      win.removeEventListener('blur', backgrounded);
      doc.removeEventListener('visibilitychange', visibility);
    },
  };
}
