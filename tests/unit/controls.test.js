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
