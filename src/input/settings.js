// Control settings: the touch layout and Auto Steam.
//
// - touch: 'easy' (two big steering pads, Auto Steam, and gestures on the cup
//   for milk and sugar) or 'classic' (the original buttons: turn, steam,
//   milk, and sugar).
// - autoSteam: fire steam automatically at whatever is lined up with the
//   spoon. Easy Touch always has it (it has no steam button); with Classic
//   Touch or a keyboard it is a free choice, so visible milk and sugar
//   buttons can be paired with automatic steam.
//
// Touch screens start with Easy Touch; everything else starts Classic with
// manual steam. A choice is remembered, and ?touch=easy|classic and
// ?autosteam=on|off override both for one visit.

export const SETTINGS_KEY = 'steeped-in-trouble:controls';

/** Capabilities, not a browser name or a width breakpoint (including desktop-site tablets). */
export function isTouchDevice(win = globalThis.window) {
  try {
    return !!(win?.matchMedia?.('(pointer: coarse)').matches
      || win?.matchMedia?.('(any-pointer: coarse)').matches
      || win?.navigator?.maxTouchPoints > 0);
  } catch {
    return false;
  }
}

// Presentation is stored separately so changing controls never resets the view.
export const VIEW_KEY = 'steeped-in-trouble:view';

export function initialView({ params = new URLSearchParams(), storage, touchDevice = false } = {}) {
  const valid = (value) => value === 'compact' || value === 'full';
  const override = params.get('view');
  if (valid(override)) return override;
  try {
    const saved = storage?.getItem(VIEW_KEY);
    if (valid(saved)) return saved;
  } catch { /* Use capability defaults when storage is unavailable. */ }
  return touchDevice ? 'compact' : 'full';
}

export function saveView(storage, view) {
  try {
    if (view === 'compact' || view === 'full') storage?.setItem(VIEW_KEY, view);
  } catch { /* The current visit still works in private mode or when storage is full. */ }
}

/** Keep the rules in one place: Easy Touch always steams by itself. */
export function normalize({ touch, autoSteam }) {
  const scheme = touch === 'easy' ? 'easy' : 'classic';
  return { touch: scheme, autoSteam: scheme === 'easy' || !!autoSteam };
}

function stored(storage) {
  try {
    const value = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/**
 * The settings to start with.
 * @param {{ params?: URLSearchParams, storage?: Storage, touchDevice?: boolean }} options
 */
export function initialSettings({ params = new URLSearchParams(), storage, touchDevice = false } = {}) {
  const defaults = touchDevice ? { touch: 'easy', autoSteam: true } : { touch: 'classic', autoSteam: false };
  const settings = { ...defaults, ...stored(storage) };
  const touch = params.get('touch');
  if (touch === 'easy' || touch === 'classic') {
    settings.touch = touch;
    // A layout chosen in the address bar brings its usual steam with it, unless that is chosen too.
    settings.autoSteam = touch === 'easy';
  }
  const auto = params.get('autosteam');
  if (auto === 'on' || auto === 'off') settings.autoSteam = auto === 'on';
  return normalize(settings);
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(normalize(settings)));
  } catch {
    // Storage may be unavailable (private mode); the choice just won't persist.
  }
}
