// Reuse the existing panels and choices: one set of buttons, one phase authority.
import { initialView, isTouchDevice, saveView } from '../input/settings.js';

export function createPresentation({ doc = document, game, params, storage, resetInput, onShowControls, onOpenMenu = () => {} }) {
  const win = doc.defaultView;
  const body = doc.body;
  const dialog = doc.getElementById('teaBreak');
  const close = doc.getElementById('closeBreak');
  const breakControls = doc.getElementById('breakControlsBtn');
  const menu = doc.getElementById('menuBtn');
  const viewButton = doc.getElementById('viewBtn');
  const breakView = doc.getElementById('breakViewBtn');
  const aside = doc.querySelector('aside');
  const main = doc.querySelector('main');
  const primary = doc.getElementById('mainBtn');
  const collectionEntry = doc.getElementById('collectionEntry');
  const dock = doc.getElementById('actionDock');
  const choices = doc.getElementById('phaseChoices');
  const stage = doc.querySelector('.stage');
  const offers = ['errandOffer', 'arcadeOffer', 'dayOffer'].map((id) => doc.getElementById(id)).filter(Boolean);
  const sections = [...aside.querySelectorAll('details')];
  sections[3].querySelector('.panel').prepend(doc.querySelector('.settings'));
  sections[0].querySelector('.panel').append(doc.querySelector('.save-controls'));
  let view = initialView({ params, storage, touchDevice: isTouchDevice(win) });
  let resumeOnClose = false;
  let resumeAfterControls = false;

  function closeMenu() {
    if (!dialog.open) return;
    dialog.close();
    main.append(aside);
    resetInput();
    if (resumeOnClose && doc.visibilityState !== 'hidden') game.resume();
    resumeOnClose = false;
    doc.getElementById('game').focus({ preventScroll: true });
  }

  function applyView() {
    body.dataset.view = view;
    viewButton.textContent = `View: ${view}`;
    breakView.textContent = `View: ${view}`;
    // Starting/resuming Full View must not scroll a narrow screen to the sidebar.
    dock.prepend(primary);
    if (collectionEntry) doc.querySelector('.playfield').append(collectionEntry);
    if (view === 'compact') {
      offers.forEach((offer) => choices.append(offer));
    } else {
      offers.forEach((offer) => stage.append(offer));
    }
    resetInput();
  }

  function openMenu() {
    if (dialog.open || menu.disabled) return;
    onOpenMenu();
    const before = game.state.phase;
    game.pause();
    resumeOnClose = before !== 'paused' && game.state.phase === 'paused';
    resetInput();
    close.textContent = resumeOnClose ? 'Resume game' : 'Back to cup';
    doc.getElementById('breakContent').append(aside);
    sections.forEach((section, index) => {
      section.open = index === (game.state.phase === 'reading' ? 1 : 0);
    });
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
  const backgrounded = () => { resumeOnClose = false; resumeAfterControls = false; };
  const visibility = () => { if (doc.visibilityState === 'hidden') backgrounded(); };
  const cancel = (e) => { e.preventDefault(); closeMenu(); };

  function handleBreakControls() {
    if (!dialog.open) return;
    resumeAfterControls = resumeOnClose;
    resumeOnClose = false;
    dialog.close();
    main.append(aside);
    resetInput();
    onShowControls?.(() => {
      openMenu();
      resumeOnClose = resumeAfterControls && doc.visibilityState !== 'hidden';
      resumeAfterControls = false;
      close.textContent = resumeOnClose ? 'Resume game' : 'Back to cup';
      sections[3].open = true;
      breakControls?.focus({ preventScroll: true });
    });
  }

  menu.addEventListener('click', openMenu);
  close.addEventListener('click', closeMenu);
  breakControls?.addEventListener('click', handleBreakControls);
  viewButton.addEventListener('click', switchView);
  breakView.addEventListener('click', switchView);
  dialog.addEventListener('cancel', cancel);
  win.addEventListener('blur', backgrounded);
  doc.addEventListener('visibilitychange', visibility);
  applyView();

  return {
    openMenu,
    closeMenu,
    handleBreakControls,
    get blocked() { return dialog.open; },
    update() {
      const s = game.state;
      body.dataset.phase = s.phase;
      body.dataset.active = String(game.touchGestures() !== null || (s.phase === 'teaRun' && s.run.stage === 'run')
        || (s.phase === 'dailyPour' && s.dailyPour.stage === 'play')
        || (s.phase === 'biscuitBreakout' && s.biscuitBreakout.stage === 'play')
        || (s.phase === 'crossingStreet' && s.crossingStreet.stage === 'play'));
      // The modal can suspend a reading at any point without advancing its clock.
      menu.disabled = s.phase === 'shortage';
      menu.textContent = ['playing', 'chocolate', 'grind', 'teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet'].includes(s.phase) ? 'Pause / Menu' : 'Tea Break';
    },
    dispose() {
      closeMenu();
      menu.removeEventListener('click', openMenu);
      close.removeEventListener('click', closeMenu);
      breakControls?.removeEventListener('click', handleBreakControls);
      viewButton.removeEventListener('click', switchView);
      breakView.removeEventListener('click', switchView);
      dialog.removeEventListener('cancel', cancel);
      win.removeEventListener('blur', backgrounded);
      doc.removeEventListener('visibilitychange', visibility);
    },
  };
}
