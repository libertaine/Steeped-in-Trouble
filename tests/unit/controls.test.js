import { describe, expect, it } from 'vitest';
import { createRandom } from '../../src/core/random.js';
import { createHavoc } from '../../src/gameplay/chocolate.js';
import { createControls } from '../../src/input/controls.js';
import { atShortage, playingGame } from './helpers.js';

/** Just enough of a page for the controls: a window and document to listen on, and no buttons. */
function fakePage() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    defaultView: win, visibilityState: 'visible', querySelectorAll: () => [], querySelector: () => null,
  });
  return { win, doc };
}

const press = (win, code) => win.dispatchEvent(Object.assign(new Event('keydown'), { code }));

describe('keyboard controls', () => {
  it('pours milk with Q or M, and fires sugar with E or S', () => {
    const game = playingGame();
    game.state.sugarLeft = 4;
    const { win, doc } = fakePage();
    createControls({
      doc,
      commands: {
        fire: game.fireSteam, milk: game.pourMilk, sugar: game.sugarBurst, confirm: game.confirm,
        togglePause: game.togglePause, restart: game.restart, pause: game.pause, choose: game.chooseUpgrade,
      },
    });
    press(win, 'KeyQ');
    expect(game.state.milkLeft).toBe(1);
    press(win, 'KeyM');
    expect(game.state.milkLeft).toBe(0);
    press(win, 'KeyE');
    expect(game.state.sugarLeft).toBe(3);
    game.state.shots = [];
    press(win, 'KeyS');
    expect(game.state.sugarLeft).toBe(2);
  });
});

/** A page with Easy Touch's pieces: the cup (the gesture area), two steering pads, JUMP and SLIDE, and the shortage's answers. */
function touchPage() {
  const element = (data = {}) => Object.assign(new EventTarget(), { dataset: data, setPointerCapture() {} });
  const area = element();
  const pads = [element({ hold: 'left' }), element({ hold: 'right' })];
  const runPads = [element({ run: 'jump' }), element({ run: 'slide' })];
  const errands = ['buy', 'run', 'skip'].map((errand) => element({ errand }));
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    defaultView: win,
    visibilityState: 'visible',
    querySelectorAll: (selector) => ({ '[data-hold]': pads, '[data-run]': runPads, '[data-errand]': errands })[selector] ?? [],
    querySelector: (selector) => (selector === '[data-gestures]' ? area : null),
  });
  return { win, doc, area, pads, runPads, errands };
}

const pointer = (target, type, { id = 1, x = 100, y = 100 } = {}) => {
  const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: x, clientY: y });
  target.dispatchEvent(event);
  return event;
};

/** A game wired to Easy Touch controls on a fake page, with a hand-turned clock (ms). */
function easyTouch({ scheme = 'easy', game = playingGame() } = {}) {
  const page = touchPage();
  const clock = { now: 0 };
  const said = [];
  const controls = createControls({
    doc: page.doc,
    commands: {
      fire: game.fireSteam, milk: game.pourMilk, sugar: game.sugarBurst, confirm: game.confirm,
      togglePause: game.togglePause, restart: game.restart, pause: game.pause, choose: game.chooseUpgrade,
      jump: game.jump, slide: game.slide, errand: game.chooseErrand,
    },
    gestureMode: game.touchGestures,
    scheme: () => scheme,
    now: () => clock.now,
    onGesture: (kind) => said.push(kind),
  });
  const tapAt = (id, t, at = {}) => {
    clock.now = t;
    pointer(page.area, 'pointerdown', { id, ...at });
    clock.now = t + 60;
    pointer(page.area, 'pointerup', { id, ...at });
  };
  return { game, controls, clock, said, tapAt, ...page };
}

describe('Easy Touch gestures', () => {
  it('pours milk on a double tap of the cup, once', () => {
    const { game, tapAt } = easyTouch();
    tapAt(1, 0);
    tapAt(2, 200);
    expect(game.state.milkLeft).toBe(1);
    expect(game.state.sugarLeft).toBe(2);
  });

  it('fires one sugar burst for a long press, however long it is held', () => {
    const { game, controls, clock, area, said } = easyTouch();
    clock.now = 0;
    pointer(area, 'pointerdown');
    for (clock.now = 16; clock.now < 2000; clock.now += 16) controls.update();
    pointer(area, 'pointerup');
    expect(game.state.sugarLeft).toBe(1);
    expect(game.state.milkLeft).toBe(2);
    expect(said).toContain('press'); // the charge-up ring
    expect(said).toContain('sugar');
  });

  it('never takes the browser’s side: no scroll, zoom, or menu from a touch on the cup', () => {
    const { area } = easyTouch();
    expect(pointer(area, 'pointerdown').defaultPrevented).toBe(true);
    expect(pointer(area, 'contextmenu').defaultPrevented).toBe(true);
  });

  it('is never set off by steering: hammering the pads pours no milk', () => {
    const { game, pads, clock } = easyTouch();
    for (let i = 0; i < 10; i++) {
      clock.now = i * 90;
      const pad = pads[i % 2];
      pointer(pad, 'pointerdown', { id: 10 + i });
      pointer(pad, 'pointerup', { id: 10 + i });
    }
    expect(game.state.milkLeft).toBe(2);
    expect(game.state.sugarLeft).toBe(2);
  });

  it('works while a thumb holds a steering pad', () => {
    const { game, pads, tapAt, controls } = easyTouch();
    pointer(pads[1], 'pointerdown', { id: 5 });
    expect(controls.held.right).toBe(true);
    tapAt(1, 0);
    tapAt(2, 150);
    expect(game.state.milkLeft).toBe(1);
    expect(controls.held.right).toBe(true);
  });

  it('does nothing in Classic Touch, where the buttons do the work', () => {
    const { game, tapAt, area, clock, controls } = easyTouch({ scheme: 'classic' });
    tapAt(1, 0);
    tapAt(2, 150);
    clock.now = 1000;
    expect(pointer(area, 'pointerdown', { id: 3 }).defaultPrevented).toBe(false);
    clock.now = 2000;
    controls.update();
    expect(game.state.milkLeft).toBe(2);
    expect(game.state.sugarLeft).toBe(2);
  });

  it('does nothing between rounds or while paused, and a half-made double tap does not carry over', () => {
    const { game, tapAt, controls } = easyTouch();
    tapAt(1, 0); // the first tap of a double tap, in play…
    game.pause();
    controls.update(); // …then the game moves on
    tapAt(2, 150);
    expect(game.state.milkLeft).toBe(2);
    game.resume();
    controls.update();
    tapAt(3, 300); // a single tap after resuming is only a first tap again
    expect(game.state.milkLeft).toBe(2);
  });

  /** A game in the middle of Hot Chocolate Havoc. */
  function toasting() {
    const game = playingGame();
    game.state.phase = 'chocolate';
    game.state.chocolate = { ...createHavoc(createRandom(1)), stage: 'play' };
    return game;
  }

  it('holds a flame in the hot chocolate instead, released when the finger lifts', () => {
    const game = toasting();
    const { controls, area } = easyTouch({ game });
    controls.update();
    pointer(area, 'pointerdown', { id: 4 });
    expect(controls.held.fire).toBe(true);
    expect(game.state.chocolate.flames).toHaveLength(1);
    pointer(area, 'pointerup', { id: 4 });
    expect(controls.held.fire).toBe(false);
  });

  it('lets go of a held flame if the game moves on mid-hold', () => {
    const game = toasting();
    const { controls, area } = easyTouch({ game });
    controls.update();
    pointer(area, 'pointerdown', { id: 4 });
    game.state.chocolate.stage = 'outro';
    controls.update();
    expect(controls.held.fire).toBe(false);
  });
});

describe('controls in the Tea Shortage and the Tea Run', () => {
  it('answers the shortage with its buttons and with 1 / 2 / 3', () => {
    const game = atShortage(6);
    const { errands } = easyTouch({ game });
    errands[2].dispatchEvent(new Event('click'));
    expect(game.state.phase).toBe('playing');
  });

  it('jumps and slides with the keyboard and with the pads, but only on the sidewalk', () => {
    const game = atShortage(6);
    game.chooseErrand('run');
    game.primaryAction();
    const { win, runPads } = easyTouch({ game });
    const before = game.state.milkLeft;
    press(win, 'ArrowUp');
    expect(game.state.run.spoon.action).toBe('jump');
    expect(game.state.milkLeft).toBe(before); // no milk on the sidewalk
    game.state.run.spoon = { ...game.state.run.spoon, action: 'run', time: 0, recover: 0 };
    pointer(runPads[1], 'pointerdown');
    expect(game.state.run.spoon.action).toBe('slide');
  });

  it('keeps the arrows on milk and sugar in a cup: no jumping there', () => {
    const { game, win } = easyTouch();
    press(win, 'ArrowUp');
    expect(game.state.milkLeft).toBe(1);
    expect(game.state.run).toBe(null);
  });
});

describe('arrow keys for milk and sugar', () => {
  function wired() {
    const game = playingGame();
    game.state.sugarLeft = 4;
    const { win, doc } = fakePage();
    createControls({
      doc,
      commands: {
        fire: game.fireSteam, milk: game.pourMilk, sugar: game.sugarBurst, confirm: game.confirm,
        togglePause: game.togglePause, restart: game.restart, pause: game.pause, choose: game.chooseUpgrade,
      },
    });
    return { game, win };
  }

  it('pours milk with the up arrow and fires sugar with the down arrow', () => {
    const { game, win } = wired();
    press(win, 'ArrowUp');
    expect(game.state.milkLeft).toBe(1);
    press(win, 'ArrowDown');
    expect(game.state.sugarLeft).toBe(3);
  });

  it('keeps the page from scrolling on either arrow', () => {
    const { win } = wired();
    for (const code of ['ArrowUp', 'ArrowDown']) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { code });
      win.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('leaves browser shortcuts alone', () => {
    const { game, win } = wired();
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
      for (const code of ['ArrowUp', 'ArrowDown']) {
        const event = Object.assign(new Event('keydown', { cancelable: true }), { code, [modifier]: true });
        win.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    }
    expect(game.state.milkLeft).toBe(2);
    expect(game.state.sugarLeft).toBe(4);
  });

  it('acts once per press, not on key repeat', () => {
    const { game, win } = wired();
    press(win, 'ArrowUp');
    win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'ArrowUp', repeat: true }));
    expect(game.state.milkLeft).toBe(1);
  });
});
