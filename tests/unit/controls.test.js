import { describe, expect, it } from 'vitest';
import { createControls } from '../../src/input/controls.js';
import { playingGame } from './helpers.js';

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
