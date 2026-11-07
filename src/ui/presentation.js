// Reuse the existing panels and choices: one set of buttons, one phase authority.
export function createPresentation({ doc = document, game, resetInput, onShowControls, onOpenMenu = () => {} }) {
  const win = doc.defaultView;
  const body = doc.body;
  const dialog = doc.getElementById('teaBreak');
  const close = doc.getElementById('closeBreak');
  const breakControls = doc.getElementById('breakControlsBtn');
  const menu = doc.getElementById('menuBtn');
  const aside = doc.querySelector('aside');
  const main = doc.querySelector('main');
  const primary = doc.getElementById('mainBtn');
  const collectionEntry = doc.getElementById('collectionEntry');
  const dock = doc.getElementById('actionDock');
  const choices = doc.getElementById('phaseChoices');
  const offers = ['errandOffer', 'arcadeOffer', 'dayOffer'].map((id) => doc.getElementById(id)).filter(Boolean);
  const sections = [...aside.querySelectorAll('details')];
  sections[3].querySelector('.panel').prepend(doc.querySelector('.settings'));
  sections[0].querySelector('.panel').append(doc.querySelector('.save-controls'));
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
  dialog.addEventListener('cancel', cancel);
  win.addEventListener('blur', backgrounded);
  doc.addEventListener('visibilitychange', visibility);
  // One layout: offers stay beside the cup and reference panels live in Tea Break.
  dock.prepend(primary);
  if (collectionEntry) doc.querySelector('.playfield').append(collectionEntry);
  offers.forEach((offer) => choices.append(offer));
  resetInput();

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
      menu.textContent = ['playing', 'chocolate', 'grind', 'manager', 'teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet'].includes(s.phase) ? 'Pause / Menu' : 'Tea Break';
    },
    dispose() {
      closeMenu();
      menu.removeEventListener('click', openMenu);
      close.removeEventListener('click', closeMenu);
      breakControls?.removeEventListener('click', handleBreakControls);
      dialog.removeEventListener('cancel', cancel);
      win.removeEventListener('blur', backgrounded);
      doc.removeEventListener('visibilitychange', visibility);
    },
  };
}
