import { hasPrimaryTouch, initialOnScreenControls, saveOnScreenControls } from '../input/settings.js';

export function createOnScreenControls({ doc = document, storage, resetInput, onChange }) {
  const win = doc.defaultView;
  const select = doc.getElementById('onScreenControls');
  const menu = doc.getElementById('menuBtn');
  const dock = doc.getElementById('actionDock');
  const groups = [...doc.querySelectorAll('.controls-mobile')];
  let preference = initialOnScreenControls(storage);
  let visible;
  let pointer;

  function apply(notify = true) {
    visible = preference === 'show' || (preference === 'auto' && hasPrimaryTouch(win));
    // Reset before hiding a captured button. Keyboard input still uses its
    // ordinary listeners, and Easy Touch gestures keep their existing scheme.
    resetInput();
    if (!visible && doc.activeElement?.closest('.controls-mobile')) {
      doc.getElementById('game').focus({ preventScroll: true });
    }
    groups.forEach((group) => { group.inert = !visible; });
    doc.body.dataset.onscreenControls = visible ? 'shown' : 'hidden';
    select.value = preference;
    // A keyboard player's menu belongs in the header; it needs no gameplay rail.
    (visible ? dock : doc.querySelector('.header-actions')).append(menu);
    if (notify) onChange();
  }

  function change() {
    preference = select.value;
    saveOnScreenControls(storage, preference);
    apply();
  }
  function capabilityChanged() { if (preference === 'auto') apply(); }
  try {
    pointer = win.matchMedia('(pointer: coarse)');
    pointer.addEventListener?.('change', capabilityChanged);
  } catch { /* Manual overrides remain available without media queries. */ }
  select.addEventListener('change', change);
  apply(false);

  return {
    get visible() { return visible; },
    dispose() {
      select.removeEventListener('change', change);
      pointer?.removeEventListener?.('change', capabilityChanged);
    },
  };
}
