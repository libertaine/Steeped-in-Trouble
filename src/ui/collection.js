import { ARCADE_IDS } from '../storage/localProgress.js';
import { dayOf } from '../gameplay/days.js';

const JOBS = {
  teaRun: ['The Tea Run', 'The tea shop is closing. The spoon has forgotten how walking works.'],
  dailyPour: ['The Daily Pour', 'Deliver the news. Try not to become it.'],
  biscuitBreakout: ['Biscuit Breakout', 'The biscuits have formed a wall. Negotiations have failed.'],
  crossingStreet: ['Crossing the Street', "Why did the spoon cross the road? Nobody knows. But apparently, it's our problem now."],
};

// Small original Canvas vignettes, in the same ink and mint as the cup.
function illustrate(canvas, id) {
  const c = canvas.getContext('2d');
  c.lineWidth = 2; c.strokeStyle = '#b4e9cf'; c.fillStyle = '#b4e9cf';
  const line = (x, y, x2, y2) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); };
  const spoon = (x, y, angle = 0) => {
    c.save(); c.translate(x, y); c.rotate(angle);
    c.beginPath(); c.ellipse(0, -17, 7, 11, 0, 0, Math.PI * 2); c.stroke();
    line(0, -6, 0, 23); c.restore();
  };
  if (id === 'teaRun') {
    line(10, 69, 290, 69); spoon(91, 40, 0.5);
    line(88, 62, 71, 69); line(88, 62, 106, 68);
    c.strokeRect(185, 45, 23, 23); line(30, 30, 62, 30); line(40, 41, 63, 41);
    c.fillText('TEA →', 234, 35);
  } else if (id === 'dailyPour') {
    for (const x of [80, 134]) { c.beginPath(); c.arc(x, 63, 18, 0, Math.PI * 2); c.stroke(); }
    line(80, 63, 108, 34); line(108, 34, 134, 63); line(80, 63, 134, 63); spoon(110, 22, 0.35);
    c.strokeRect(199, 18, 32, 14); line(173, 39, 190, 28); line(247, 67, 247, 42); c.strokeRect(235, 30, 29, 13);
  } else if (id === 'biscuitBreakout') {
    c.strokeStyle = '#e3c486';
    for (let r = 0; r < 2; r++) for (let x = 0; x < 6; x++) c.strokeRect(37 + x * 39, 8 + r * 18, 32, 13);
    c.strokeStyle = '#b4e9cf'; c.strokeRect(166, 52, 9, 9); line(170, 49, 186, 35); spoon(130, 73, Math.PI / 2);
  } else {
    for (const y of [18, 44, 70]) for (let x = 14; x < 290; x += 35) line(x, y, x + 16, y);
    c.strokeStyle = '#e3c486'; c.strokeRect(58, 23, 45, 14); c.strokeRect(207, 51, 53, 14);
    c.strokeStyle = '#b4e9cf'; spoon(149, 50, 0.2); c.fillText('TEA', 248, 12);
  }
}

export function createCollectionUI({ doc, sessions, progress, presentation, settleInput, onActivate = () => {} }) {
  const el = (id) => doc.getElementById(id);
  const text = (id, value) => { const element = el(id); if (element.textContent !== value) element.textContent = value; };
  const dialog = el('arcadeCollection'), confirm = el('potConfirmation');
  const cleanups = [];
  let confirmAction = null, lastInfo = '', lastRecord = '';
  function on(id, event, fn) {
    const target = typeof id === 'string' ? el(id) : id;
    target.addEventListener(event, fn);
    cleanups.push(() => target.removeEventListener(event, fn));
  }
  const cards = {};
  for (const id of ARCADE_IDS) {
    const card = doc.createElement('article'); card.className = 'job-card';
    const picture = doc.createElement('canvas'); picture.width = 300; picture.height = 90;
    picture.setAttribute('aria-hidden', 'true'); illustrate(picture, id);
    const title = doc.createElement('h3'); title.textContent = JOBS[id][0];
    const copy = doc.createElement('p'); copy.textContent = JOBS[id][1];
    const record = doc.createElement('p'); record.className = 'job-record';
    const button = doc.createElement('button'); button.textContent = 'PLAY'; button.dataset.job = id;
    button.setAttribute('aria-label', `Play ${JOBS[id][0]}`);
    card.append(picture, title, copy, record, button); el('jobCards').append(card); cards[id] = record;
    on(button, 'click', () => { settleInput(); sessions.launch(id); dialog.close(); el('game').focus({ preventScroll: true }); });
  }
  function showRecords() {
    for (const [id, r] of Object.entries(progress.records.games)) {
      cards[id].textContent = r.plays ? `Personal best: ${r.bestScore} points`
        : "NO RECORD YET · The spoon's employment history is incomplete.";
    }
    el('recordNotice').textContent = progress.status.records;
  }
  function open() {
    presentation.closeMenu();
    settleInput(); sessions.open(); showRecords();
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function back() {
    settleInput(); sessions.back();
    if (dialog.open) dialog.close();
    el('game').focus({ preventScroll: true });
  }
  function ask(action, clear = false) {
    settleInput();
    confirmAction = action;
    el('confirmPotTitle').textContent = clear ? 'Clear your saved pot?' : 'Replace your saved pot?';
    el('confirmPotText').textContent = clear ? 'Remove this checkpoint? Your active pot and arcade records stay.'
      : 'Your saved pot will be replaced. Arcade records stay.';
    el('confirmPotBtn').textContent = clear ? 'Clear saved pot' : 'Replace pot';
    confirm.showModal();
  }
  function cancelConfirm() { confirm.close(); confirmAction = null; settleInput(); }
  on('collectionBtn', 'click', open); on('breakCollectionBtn', 'click', open);
  on('chooseJobBtn', 'click', open); on('closeCollectionBtn', 'click', back); on('backPotBtn', 'click', back);
  on('closeCollectionTop', 'click', back);
  on(dialog, 'cancel', (e) => { e.preventDefault(); back(); });
  on('playAgainBtn', 'click', () => { settleInput(); sessions.replay(); el('game').focus({ preventScroll: true }); });
  on('retryBtn', 'click', () => { settleInput(); sessions.replay(true); el('game').focus({ preventScroll: true }); });
  on('newPotBtn', 'click', () => ask(() => { if (sessions.newPot(true)) onActivate(); }));
  on('clearPotBtn', 'click', () => ask(() => progress.clearPot(), true));
  on('cancelPotBtn', 'click', cancelConfirm);
  on(confirm, 'cancel', (e) => { e.preventDefault(); cancelConfirm(); });
  on('confirmPotBtn', 'click', () => {
    const action = confirmAction; cancelConfirm(); action?.();
    if (!el('teaBreak').open) el('game').focus({ preventScroll: true });
  });
  // Native buttons still get fresh Enter/Space activation. Auto-repeat must
  // never dismiss a confirmation or launch a second session.
  const stopRepeat = (e) => { if (e.repeat && ['Enter', 'Space'].includes(e.code)) e.preventDefault(); };
  on(doc, 'keydown', stopRepeat);
  return {
    open,
    get blocked() { return dialog.open || confirm.open; },
    primary() {
      if (this.blocked) return true;
      if (!sessions.practice && sessions.game.state.phase === 'gameover' && progress.potInfo) {
        ask(() => { sessions.newPot(true); onActivate(); }); return true;
      }
      if (!sessions.practice && sessions.game.state.phase === 'ready' && progress.pot) {
        settleInput(); sessions.continuePot(); onActivate();
        el('game').focus({ preventScroll: true }); return true;
      }
      return false;
    },
    update() {
      const practice = sessions.practice, s = sessions.game.state;
      doc.body.dataset.practice = String(!!practice);
      el('practiceBar').hidden = !practice;
      el('collectionEntry').hidden = !!practice || !['ready', 'gameover'].includes(s.phase);
      const saved = progress.potInfo;
      el('newPotBtn').hidden = !saved || s.phase !== 'ready';
      if (!practice && s.phase === 'ready') {
        text('mainBtn', saved ? 'CONTINUE YOUR POT' : 'Brew the first cup →');
        text('gameTip', saved ? `The leaves have been waiting. Day ${dayOf(saved.round)} · round ${saved.round} completed.`
          : 'Defend the rim. Your defeated leaves are the seeds of the next fortune.');
      }
      const mission = practice?.practiceMission();
      const finished = mission?.stage === 'outro';
      doc.body.dataset.practiceResult = String(!!finished);
      el('playAgainBtn').hidden = !finished; el('retryBtn').hidden = !finished;
      el('mainBtn').hidden = !!practice && !!mission?.summary;
      el('personalBest').hidden = !finished || !sessions.result?.improved;
      if (practice && finished) text('gameTip', 'Rewards stay in practice. Replay a new layout or retry this seed.');
      const info = saved ? `Saved pot: Day ${dayOf(saved.round)} · round ${saved.round} completed.` : 'No saved pot.';
      if (info !== lastInfo) { el('savedPotInfo').textContent = info; lastInfo = info; }
      el('clearPotBtn').hidden = !saved;
      const notice = practice ? progress.status.records : progress.status.pot || (saved
        ? "YOUR POT IS SAVED · The spoon has left things exactly as unreasonable as it found them. Latest completed normal round saved; closing mid-round returns here."
        : 'The latest completed normal round is saved automatically.');
      if (notice !== lastRecord) { el('potNotice').textContent = notice; lastRecord = notice; }
    },
    dispose() { for (const cleanup of cleanups) cleanup(); if (dialog.open) dialog.close(); if (confirm.open) confirm.close(); },
  };
}
