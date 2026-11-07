const HEADINGS = ['FIRST, THE SPOON.', 'THE LEAVES WANT OUT.', 'MILK BUYS YOU TIME.',
  'SUGAR COVERS MORE GROUND.', 'RIGHT. NOW TRY A CUP.', 'TRAINING COMPLETE.'];

export function trainingInstruction(stage, { touch, autoSteam, visible }) {
  const steer = visible ? 'Hold ◀ / ▶ (or ← / →, A / D) to move around the rim in both directions.'
    : 'Use ← and → (or A and D) to move around the rim in both directions.';
  return [steer,
    autoSteam ? 'Aim at the leaf. Steam fires automatically when aligned with a target. Start by steering.'
      : `Aim at the leaf and fire steam with SPACE${visible ? ' or STEAM' : ''}.`,
    `Aim at the leaf. ${touch === 'easy' ? 'Double-tap the cup (or press Q)' : visible ? 'Tap MILK (or press Q)' : 'Press Q'} to push leaves back and slow them down.`,
    `Aim between the leaves. ${touch === 'easy' ? 'Hold the cup (or press E)' : visible ? 'Tap SUGAR (or press E)' : 'Press E'} to fire across three lanes.`,
    'Stop the leaves before they reach the rim. Five ordinary leaves; mistakes cost no lives.',
    'The leaves have requested a different instructor. Normal cups lead to readings, fortunes and upgrades.',
  ][stage];
}

export function createTrainingUI({ doc, sessions, controls, settings, visible, presentation, overlay, collectionUI }) {
  const el = (id) => doc.getElementById(id);
  const cleanups = [];
  const on = (id, action) => {
    const node = el(id);
    node.addEventListener('click', action);
    cleanups.push(() => node.removeEventListener('click', action));
  };
  const focusCup = () => el('game').focus({ preventScroll: true });
  function launch() {
    presentation.closeMenu(); overlay.close(); controls.settle(true);
    sessions.train({ released: () => controls.released });
    sessions.game.setAutoSteam(settings().autoSteam);
    update(); focusCup();
  }
  function leave(menu = true) {
    presentation.closeMenu(); overlay.close(); controls.settle(true);
    sessions.back(); update();
    focusCup();
    if (menu) presentation.openMenu();
  }
  for (const id of ['trainingBtn', 'breakTrainingBtn']) on(id, launch);
  on('trainingExit', () => leave());
  on('trainingRetry', () => {
    controls.settle(true); sessions.training?.training.retry(); el('phaseChoices').scrollTop = 0; focusCup();
  });
  on('trainingAgain', launch);
  on('trainingGuide', () => { sessions.game.pause(); presentation.openMenu(); presentation.handleBreakControls(); });
  on('trainingStart', () => {
    leave(false);
    const game = sessions.game;
    if (game.state.phase === 'ready' || game.state.phase === 'gameover') {
      if (!collectionUI.primary()) game.confirm();
    } else if (game.state.phase === 'paused') game.resume();
    focusCup();
  });
  const escape = (e) => {
    if (!sessions.training || e.code !== 'Escape' || doc.querySelector('dialog[open]')) return;
    e.preventDefault(); e.stopImmediatePropagation(); leave();
  };
  doc.addEventListener('keydown', escape, true);
  function text(id, value) { if (el(id).textContent !== value) el(id).textContent = value; }
  let lastStage = -1;
  function update() {
    const active = sessions.training;
    doc.body.dataset.training = String(!!active);
    el('trainingPanel').hidden = !active;
    if (!active) { lastStage = -1; return; }
    const v = active.training.view;
    text('trainingStep', v.complete ? 'TRAINING CUP · COMPLETE' : `TRAINING CUP · ${v.stage + 1} / 5`);
    text('trainingHeading', HEADINGS[v.stage]);
    text('trainingInstruction', trainingInstruction(v.stage, { ...settings(), visible: visible() }));
    text('trainingHint', v.success ? 'Well done. Release your controls for the next exercise.'
      : v.failures > 1 ? v.stage === 0 ? 'Move a little in each direction. Holding both directions cancels movement.'
        : 'Line up the spoon with a leaf. Retry restores the targets and charges.'
      : v.complete ? '' : v.stage === 0 ? 'Waiting for movement in both directions.'
      : !v.engaged ? 'Waiting for you. Steer or try the action; the leaves will wait.'
      : v.stage === 2 && active.state.pulse > 0 ? 'Watch the leaf move back and slow down.' : 'Take your time. Retry whenever you like.');
    el('trainingRetry').hidden = v.complete;
    el('trainingStart').hidden = !v.complete;
    el('trainingAgain').hidden = !v.complete;
    if (lastStage !== v.stage) {
      lastStage = v.stage;
      controls.settle(true);
      el('phaseChoices').scrollTop = 0;
      if (v.complete) el('trainingHeading').focus({ preventScroll: true });
    }
  }
  return { launch, update, dispose() {
    doc.removeEventListener('keydown', escape, true);
    for (const cleanup of cleanups) cleanup();
  } };
}
