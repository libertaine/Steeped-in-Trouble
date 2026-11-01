import { describe, expect, it, vi } from 'vitest';
import { drawArcadeCenterpiece, paintSplash, SPLASH_HEIGHT, SPLASH_PALETTE, SPLASH_WIDTH } from '../../src/rendering/splashArt.js';
import { createInstructionOverlay, touchSummary } from '../../src/ui/instructionOverlay.js';

describe('arcade splash centerpiece', () => {
  it('gracefully handles missing canvas or unsupported 2D context', () => {
    expect(drawArcadeCenterpiece(null)).toBe(false);
    expect(drawArcadeCenterpiece(undefined)).toBe(false);
    expect(drawArcadeCenterpiece({})).toBe(false);
    expect(drawArcadeCenterpiece({ getContext: () => null })).toBe(false);
  });

  it('paints a low-resolution picture in a fixed 16-colour palette', () => {
    const { width, height, pixels } = paintSplash();
    expect([width, height]).toEqual([SPLASH_WIDTH, SPLASH_HEIGHT]);
    expect([width, height]).toEqual([256, 160]);
    expect(pixels).toHaveLength(width * height);
    expect(SPLASH_PALETTE).toHaveLength(16);
    expect(Math.max(...pixels)).toBeLessThan(16);
    // Every colour of the palette is put to work, and the picture is the same every time.
    expect(new Set(pixels).size).toBe(16);
    expect(paintSplash().pixels).toEqual(pixels);
  });

  it('puts the pixels on the canvas at native size, without smoothing', () => {
    let image;
    const ctx = {
      imageSmoothingEnabled: true,
      createImageData: vi.fn((w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })),
      putImageData: vi.fn((data) => { image = data; }),
    };
    const canvas = { width: 400, height: 280, getContext: vi.fn((type) => (type === '2d' ? ctx : null)) };

    expect(drawArcadeCenterpiece(canvas)).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([256, 160]);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(ctx.putImageData).toHaveBeenCalledWith(image, 0, 0);
    const { pixels } = paintSplash();
    const hex = (i) => `#${[...image.data.slice(i * 4, i * 4 + 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    for (const i of [0, 5000, 20000, pixels.length - 1]) expect(hex(i)).toBe(SPLASH_PALETTE[pixels[i]]);
    expect(image.data[3]).toBe(255);
  });
});

describe('instruction overlay controller', () => {
  function makeMockDoc() {
    const listeners = new Map();
    const elements = new Map();

    function createElement(id, tagName = 'div') {
      const elListeners = new Map();
      const el = {
        id,
        tagName: tagName.toUpperCase(),
        textContent: '',
        hidden: false,
        open: false,
        className: '',
        classList: {
          add: vi.fn((cls) => { el.className += ` ${cls}`; }),
          remove: vi.fn(),
          contains: vi.fn((cls) => el.className.includes(cls)),
        },
        style: {},
        focus: vi.fn(),
        show: vi.fn(() => { el.open = true; }),
        showModal: vi.fn(() => { el.open = true; }),
        close: vi.fn(() => { el.open = false; }),
        setAttribute: vi.fn((name, _val) => {
          if (name === 'open') el.open = true;
        }),
        removeAttribute: vi.fn((name) => {
          if (name === 'open') el.open = false;
        }),
        addEventListener: vi.fn((event, handler) => {
          if (!elListeners.has(event)) elListeners.set(event, []);
          elListeners.get(event).push(handler);
        }),
        removeEventListener: vi.fn((event, handler) => {
          const list = elListeners.get(event) || [];
          elListeners.set(event, list.filter((h) => h !== handler));
        }),
        dispatchEvent: (event) => {
          const list = elListeners.get(event.type) || [];
          for (const h of list) h(event);
        },
        querySelectorAll: vi.fn(() => []),
        contains: vi.fn(() => true),
        offsetParent: {},
        getClientRects: () => [{ width: 100, height: 40 }],
      };
      elements.set(id, el);
      return el;
    }

    const dialog = createElement('instructionOverlay', 'dialog');
    const versionEl = createElement('overlayVersion', 'span');
    const primaryBtn = createElement('overlayPrimaryBtn', 'button');
    const newPotBtn = createElement('overlayNewPotBtn', 'button');
    const touchSummary = createElement('overlayTouchSummary', 'div');
    const touchScheme = createElement('overlayTouchScheme', 'strong');
    const touchText = createElement('overlayTouchText', 'span');

    dialog.querySelectorAll = vi.fn(() => [primaryBtn, newPotBtn].filter((b) => !b.hidden));

    const doc = {
      activeElement: null,
      defaultView: { scrollX: 0, scrollY: 0, scrollTo: vi.fn() },
      getElementById: vi.fn((id) => elements.get(id) || null),
      addEventListener: vi.fn((event, handler) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(handler);
      }),
      removeEventListener: vi.fn((event, handler) => {
        const list = listeners.get(event) || [];
        listeners.set(event, list.filter((h) => h !== handler));
      }),
      dispatchEvent: (event) => {
        const list = listeners.get(event.type) || [];
        for (const h of list) h(event);
      },
      elements,
    };

    return { doc, dialog, versionEl, primaryBtn, newPotBtn, touchSummary, touchScheme, touchText };
  }

  it('initializes with metadata and touch visibility', () => {
    const { doc, versionEl, touchSummary, touchScheme } = makeMockDoc();
    const overlay = createInstructionOverlay({
      doc,
      version: '0.17.0',
      touch: () => ({ scheme: 'easy', autoSteam: true }),
    });

    expect(versionEl.textContent).toBe('v0.17.0');
    expect(touchSummary.hidden).toBe(false);
    expect(touchScheme.textContent).toBe('Easy Touch:');
    expect(overlay.isOpen).toBe(false);
    expect(overlay.blocked).toBe(false);
  });

  it('shows standard first-time player prompt and primary button', () => {
    const { doc, dialog, primaryBtn, newPotBtn } = makeMockDoc();
    const overlay = createInstructionOverlay({ doc, version: '0.17.0' });

    overlay.show({ hasSavedPot: false });
    expect(overlay.isOpen).toBe(true);
    expect(overlay.blocked).toBe(true);
    expect(primaryBtn.textContent).toBe('PRESS ENTER OR CLICK TO START');
    expect(newPotBtn.hidden).toBe(true);
    expect(dialog.open).toBe(true);
    // Modal, so the page behind it cannot be used.
    expect(dialog.showModal).toHaveBeenCalled();
    expect(dialog.show).not.toHaveBeenCalled();
    expect(primaryBtn.focus).toHaveBeenCalled();
  });

  it('shows Continue Pot and Brew New Pot when returning with a saved pot', () => {
    const { doc, primaryBtn, newPotBtn } = makeMockDoc();
    const overlay = createInstructionOverlay({ doc, version: '0.17.0' });

    overlay.show({ hasSavedPot: true });
    expect(primaryBtn.textContent).toBe('CONTINUE YOUR POT (ENTER)');
    expect(newPotBtn.hidden).toBe(false);
  });

  it('shows Back to Tea Break in review mode', () => {
    const { doc, primaryBtn, newPotBtn } = makeMockDoc();
    const overlay = createInstructionOverlay({ doc, version: '0.17.0' });

    overlay.show({ fromTeaBreak: true });
    expect(primaryBtn.textContent).toBe('BACK TO TEA BREAK (ENTER)');
    expect(newPotBtn.hidden).toBe(true);
  });

  it('dismissPrimary starts normal game for first-time player', () => {
    const { doc, dialog } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });

    overlay.show({ hasSavedPot: false });
    overlay.dismissPrimary();

    expect(dialog.open).toBe(false);
    expect(overlay.isOpen).toBe(false);
    expect(overlay.blocked).toBe(false);
    expect(onStart).toHaveBeenCalledWith({ fromTeaBreak: false, isNewPot: false });
  });

  it('dismissPrimary returns to Tea Break without starting game', () => {
    const { doc } = makeMockDoc();
    const onStart = vi.fn();
    const onClose = vi.fn();
    const onReturn = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart, onClose });

    overlay.show({ fromTeaBreak: true, onReturn });
    overlay.dismissPrimary();

    expect(onStart).not.toHaveBeenCalled();
    expect(onReturn).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith({ fromTeaBreak: true });
  });

  it('Enter key dismisses overlay with preventDefault to prevent action leakage', () => {
    const { doc } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });

    overlay.show({ hasSavedPot: false });

    const event = {
      type: 'keydown',
      code: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    doc.dispatchEvent(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith({ fromTeaBreak: false, isNewPot: false });
    expect(overlay.isOpen).toBe(false);
  });

  it('Escape cannot skip the first screen: it nudges the start button instead', () => {
    const { doc, dialog, primaryBtn } = makeMockDoc();
    const onStart = vi.fn();
    const onClose = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart, onClose });

    overlay.show({ hasSavedPot: false });

    const event = { type: 'keydown', code: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    doc.dispatchEvent(event);
    doc.dispatchEvent({ ...event });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(dialog.open).toBe(true);
    expect(overlay.isOpen).toBe(true);
    expect(primaryBtn.classList.add).toHaveBeenCalledWith('nudge');
    expect(primaryBtn.focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(onStart).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape from the Tea Break review goes back to the Tea Break', () => {
    const { doc, dialog } = makeMockDoc();
    const onStart = vi.fn();
    const onClose = vi.fn();
    const onReturn = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart, onClose });

    overlay.show({ fromTeaBreak: true, onReturn });
    doc.dispatchEvent({ type: 'keydown', code: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(dialog.open).toBe(false);
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ fromTeaBreak: true, escape: true });
    expect(onStart).not.toHaveBeenCalled();
  });

  it('refuses the dialog cancel event, and reopens the first screen if the browser closes it anyway', () => {
    const { doc, dialog } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });
    overlay.show();

    const cancel = { type: 'cancel', preventDefault: vi.fn() };
    dialog.dispatchEvent(cancel);
    expect(cancel.preventDefault).toHaveBeenCalled();

    dialog.open = false;
    dialog.dispatchEvent({ type: 'close' });
    expect(dialog.showModal).toHaveBeenCalledTimes(2);
    expect(dialog.open).toBe(true);
    expect(overlay.isOpen).toBe(true);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('a click on the backdrop does not start the game', () => {
    const { doc, dialog } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });
    overlay.show();

    dialog.dispatchEvent({ type: 'click', target: dialog, preventDefault: vi.fn() });
    expect(overlay.isOpen).toBe(true);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('clicking New Pot button triggers new pot confirmation flow', () => {
    const { doc, newPotBtn } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });

    overlay.show({ hasSavedPot: true });

    newPotBtn.dispatchEvent({
      type: 'click',
      preventDefault: vi.fn(),
    });

    expect(onStart).toHaveBeenCalledWith({ fromTeaBreak: false, isNewPot: true });
  });

  it('Enter key on focused New Pot button triggers new pot confirmation flow', () => {
    const { doc, newPotBtn } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });

    overlay.show({ hasSavedPot: true });
    doc.activeElement = newPotBtn;

    const event = {
      type: 'keydown',
      code: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    doc.dispatchEvent(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith({ fromTeaBreak: false, isNewPot: true });
    expect(overlay.isOpen).toBe(false);
  });

  it('Space key on focused New Pot button triggers new pot confirmation flow', () => {
    const { doc, newPotBtn } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });

    overlay.show({ hasSavedPot: true });
    doc.activeElement = newPotBtn;

    const event = {
      type: 'keydown',
      code: 'Space',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    doc.dispatchEvent(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith({ fromTeaBreak: false, isNewPot: true });
  });

  it('Space key on focused primary button does not dismiss overlay to prevent input leak', () => {
    const { doc, primaryBtn } = makeMockDoc();
    const onStart = vi.fn();
    const overlay = createInstructionOverlay({ doc, onStart });

    overlay.show({ hasSavedPot: false });
    doc.activeElement = primaryBtn;

    const event = {
      type: 'keydown',
      code: 'Space',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    doc.dispatchEvent(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(overlay.isOpen).toBe(true);
  });

  it('Tab key traps focus within dialog buttons', () => {
    const { doc, primaryBtn, newPotBtn } = makeMockDoc();
    const overlay = createInstructionOverlay({ doc });

    overlay.show({ hasSavedPot: true });
    doc.activeElement = newPotBtn; // last focusable element

    const tabForward = {
      type: 'keydown',
      code: 'Tab',
      shiftKey: false,
      preventDefault: vi.fn(),
    };
    doc.dispatchEvent(tabForward);
    expect(tabForward.preventDefault).toHaveBeenCalled();
    expect(primaryBtn.focus).toHaveBeenCalledWith({ preventScroll: true });

    doc.activeElement = primaryBtn; // first focusable element
    const tabBackward = {
      type: 'keydown',
      code: 'Tab',
      shiftKey: true,
      preventDefault: vi.fn(),
    };
    doc.dispatchEvent(tabBackward);
    expect(tabBackward.preventDefault).toHaveBeenCalled();
    expect(newPotBtn.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('explains the touch layout in use, refreshed each time it opens', () => {
    const { doc, touchSummary, touchScheme, touchText } = makeMockDoc();
    let layout = null;
    const overlay = createInstructionOverlay({ doc, touch: () => layout });

    expect(touchSummary.hidden).toBe(true);

    layout = { scheme: 'easy', autoSteam: true };
    overlay.show();
    expect(touchSummary.hidden).toBe(false);
    expect(touchScheme.textContent).toBe('Easy Touch:');
    expect(touchText.textContent).toContain('Double-tap the cup for milk');

    overlay.close();
    layout = { scheme: 'classic', autoSteam: false };
    overlay.show();
    expect(touchScheme.textContent).toBe('Classic Touch:');
    expect(touchText.textContent).toContain('STEAM to fire');

    overlay.close();
    layout = null;
    overlay.show();
    expect(touchSummary.hidden).toBe(true);
  });

  it('describes Easy Touch and Classic Touch as they actually play', () => {
    const easy = touchSummary({ scheme: 'easy', autoSteam: true });
    expect(easy.label).toBe('Easy Touch:');
    expect(easy.text).toMatch(/Steam fires by itself/);
    expect(easy.text).toMatch(/Double-tap the cup for milk/);
    expect(easy.text).toMatch(/hold a finger on the cup for sugar/);
    expect(easy.text).not.toMatch(/MILK|SUGAR|STEAM/);

    const classic = touchSummary({ scheme: 'classic', autoSteam: false });
    expect(classic.label).toBe('Classic Touch:');
    expect(classic.text).toMatch(/STEAM to fire/);
    expect(classic.text).toMatch(/Tap MILK or SUGAR/);
    expect(classic.text).not.toMatch(/double-tap/i);

    const classicAuto = touchSummary({ scheme: 'classic', autoSteam: true });
    expect(classicAuto.text).toMatch(/Auto Steam is on/);
    expect(classicAuto.text).not.toMatch(/STEAM to fire/);
  });

  it('restores focus safely when closed', () => {
    const { doc } = makeMockDoc();
    const previousElement = { focus: vi.fn() };
    doc.activeElement = previousElement;

    const overlay = createInstructionOverlay({ doc });
    overlay.show();
    overlay.close();

    expect(previousElement.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
