import { describe, expect, it, vi } from 'vitest';
import { drawArcadeCenterpiece } from '../../src/rendering/splashArt.js';
import { createInstructionOverlay } from '../../src/ui/instructionOverlay.js';

describe('arcade splash centerpiece', () => {
  it('gracefully handles missing canvas or unsupported 2D context', () => {
    expect(drawArcadeCenterpiece(null)).toBe(false);
    expect(drawArcadeCenterpiece(undefined)).toBe(false);
    expect(drawArcadeCenterpiece({})).toBe(false);
    expect(drawArcadeCenterpiece({ getContext: () => null })).toBe(false);
  });

  it('renders successfully to a 2D canvas context', () => {
    const operations = [];
    const gradient = { addColorStop: vi.fn() };
    const mockCtx = {
      imageSmoothingEnabled: true,
      save: vi.fn(() => operations.push('save')),
      restore: vi.fn(() => operations.push('restore')),
      clearRect: vi.fn(() => operations.push('clearRect')),
      createRadialGradient: vi.fn(() => gradient),
      createLinearGradient: vi.fn(() => gradient),
      fillRect: vi.fn(() => operations.push('fillRect')),
      beginPath: vi.fn(() => operations.push('beginPath')),
      moveTo: vi.fn(() => operations.push('moveTo')),
      lineTo: vi.fn(() => operations.push('lineTo')),
      stroke: vi.fn(() => operations.push('stroke')),
      fill: vi.fn(() => operations.push('fill')),
      ellipse: vi.fn(() => operations.push('ellipse')),
      arc: vi.fn(() => operations.push('arc')),
      closePath: vi.fn(() => operations.push('closePath')),
      bezierCurveTo: vi.fn(() => operations.push('bezierCurveTo')),
      quadraticCurveTo: vi.fn(() => operations.push('quadraticCurveTo')),
      clip: vi.fn(() => operations.push('clip')),
      translate: vi.fn(() => operations.push('translate')),
      rotate: vi.fn(() => operations.push('rotate')),
      scale: vi.fn(() => operations.push('scale')),
    };

    const canvas = {
      width: 400,
      height: 280,
      getContext: vi.fn((type) => (type === '2d' ? mockCtx : null)),
    };

    const result = drawArcadeCenterpiece(canvas);
    expect(result).toBe(true);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 400, 280);
    expect(mockCtx.imageSmoothingEnabled).toBe(false);
    expect(operations).toContain('ellipse');
    expect(operations).toContain('stroke');
    expect(operations).toContain('fill');
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

    const doc = {
      activeElement: null,
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

    return { doc, dialog, versionEl, primaryBtn, newPotBtn, touchSummary };
  }

  it('initializes with metadata and touch visibility', () => {
    const { doc, versionEl, touchSummary } = makeMockDoc();
    const overlay = createInstructionOverlay({
      doc,
      version: '0.17.0',
      isTouchDevice: true,
    });

    expect(versionEl.textContent).toBe('v0.17.0');
    expect(touchSummary.hidden).toBe(false);
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

  it('Escape key closes overlay cleanly', () => {
    const { doc, dialog } = makeMockDoc();
    const onClose = vi.fn();
    const overlay = createInstructionOverlay({ doc, onClose });

    overlay.show({ hasSavedPot: false });

    const event = {
      type: 'keydown',
      code: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    doc.dispatchEvent(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledWith({ fromTeaBreak: false, escape: true });
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
