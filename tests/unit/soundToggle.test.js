import { describe, expect, it, vi } from 'vitest';
import { initialSound, saveSound, SOUND_KEY } from '../../src/input/settings.js';
import { createSoundToggle, isMuteKey } from '../../src/ui/soundToggle.js';

function fakeStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}
const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };

function element(dataset = {}) {
  const el = Object.assign(new EventTarget(), { dataset: { ...dataset }, attributes: {}, title: '', textContent: '' });
  el.setAttribute = (name, value) => { el.attributes[name] = value; };
  return el;
}

/** The audio's switch, without any sound. */
function fakeAudio(enabled = false) {
  return {
    enabled,
    toggle: vi.fn(function toggle() { this.enabled = !this.enabled; return this.enabled; }),
    unlock: vi.fn(() => true),
  };
}

function page({ enabled = false, storage = fakeStorage() } = {}) {
  const win = new EventTarget();
  const speakers = ['title', 'header', 'break'].map((where) => element({ soundToggle: where }));
  const text = element();
  const game = { focus: vi.fn() };
  const doc = { defaultView: win, querySelectorAll: () => speakers, getElementById: (id) => ({ soundBtn: text, game })[id] ?? null };
  const audio = fakeAudio(enabled);
  const toggle = createSoundToggle({ doc, audio, storage });
  return { win, speakers, text, game, audio, storage, toggle };
}

const key = (win, code, { target, ...extra } = {}) => {
  const e = Object.assign(new Event('keydown'), { code, ...extra });
  if (target) Object.defineProperty(e, 'target', { value: target }); // what has focus
  win.dispatchEvent(e);
  return e;
};

describe('the M key', () => {
  it('is an unmodified, fresh M outside text entry', () => {
    const field = (selector) => ({ closest: (s) => (s.includes(selector) ? {} : null) });
    expect(isMuteKey({ code: 'KeyM' })).toBe(true);
    expect(isMuteKey({ code: 'KeyM', repeat: true })).toBe(false);
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) expect(isMuteKey({ code: 'KeyM', [modifier]: true })).toBe(false);
    for (const selector of ['input', 'textarea', 'select', '[contenteditable]']) expect(isMuteKey({ code: 'KeyM', target: field(selector) })).toBe(false);
    expect(isMuteKey({ code: 'KeyM', isComposing: true })).toBe(false);
    expect(isMuteKey({ code: 'KeyN' })).toBe(false);
  });

  it('toggles once per press; holding, modifiers and typing do nothing', () => {
    const { win, audio } = page();
    key(win, 'KeyM');
    expect(audio.enabled).toBe(true);
    for (let i = 0; i < 8; i++) key(win, 'KeyM', { repeat: true });
    key(win, 'KeyM', { ctrlKey: true }); key(win, 'KeyM', { altKey: true }); key(win, 'KeyM', { metaKey: true }); key(win, 'KeyM', { shiftKey: true });
    key(win, 'KeyM', { target: { closest: (s) => (s.includes('input') ? {} : null) } });
    expect(audio.toggle).toHaveBeenCalledTimes(1);
    key(win, 'KeyM');
    expect(audio.enabled).toBe(false);
    expect(audio.toggle).toHaveBeenCalledTimes(2);
  });

  it('counts an event once even if it is seen again', () => {
    const { win, audio } = page();
    const e = key(win, 'KeyM');
    win.dispatchEvent(e);
    expect(audio.toggle).toHaveBeenCalledTimes(1);
  });
});

describe('the speakers', () => {
  it('show the real state on every copy and on the Settings toggle', () => {
    const { win, speakers, text } = page();
    const expectState = (on) => {
      for (const s of speakers) {
        expect(s.dataset.muted).toBe(String(!on));
        expect(s.attributes['aria-label']).toBe(on ? 'Mute audio' : 'Unmute audio');
      }
      expect(text.textContent).toBe(`Sound: ${on ? 'on' : 'off'}`);
    };
    expectState(false);
    speakers[0].dispatchEvent(Object.assign(new Event('click'), { detail: 1 }));
    expectState(true);
    key(win, 'KeyM');
    expectState(false);
    text.dispatchEvent(new Event('click'));
    expectState(true);
  });

  it('a tap on the header speaker hands the keyboard back to the cup; keyboard activation keeps focus', () => {
    const { speakers, game } = page();
    speakers[1].dispatchEvent(Object.assign(new Event('click'), { detail: 0 }));
    expect(game.focus).not.toHaveBeenCalled();
    speakers[1].dispatchEvent(Object.assign(new Event('click'), { detail: 1 }));
    expect(game.focus).toHaveBeenCalledTimes(1);
    speakers[2].dispatchEvent(Object.assign(new Event('click'), { detail: 1 }));
    expect(game.focus).toHaveBeenCalledTimes(1);
  });

  it('stop listening when disposed', () => {
    const { win, speakers, audio, toggle } = page();
    toggle.dispose();
    key(win, 'KeyM');
    speakers[0].dispatchEvent(new Event('click'));
    expect(audio.toggle).not.toHaveBeenCalled();
  });
});

describe('remembering the choice', () => {
  it('saves on and off, and starts from what was saved', () => {
    const storage = fakeStorage();
    const { win } = page({ storage });
    key(win, 'KeyM');
    expect(storage.data.get(SOUND_KEY)).toBe('on');
    expect(initialSound(storage)).toBe(true);
    key(win, 'KeyM');
    expect(storage.data.get(SOUND_KEY)).toBe('off');
    expect(initialSound(storage)).toBe(false);
  });

  it('treats missing, unknown or unreadable values as off, and never throws', () => {
    expect(initialSound(fakeStorage())).toBe(false);
    expect(initialSound(fakeStorage({ [SOUND_KEY]: 'true' }))).toBe(false);
    expect(initialSound(fakeStorage({ [SOUND_KEY]: '{"on":1}' }))).toBe(false);
    expect(initialSound(broken)).toBe(false);
    expect(initialSound(null)).toBe(false);
    expect(() => saveSound(broken, true)).not.toThrow();
    const { win, audio } = page({ storage: broken });
    expect(() => key(win, 'KeyM')).not.toThrow();
    expect(audio.enabled).toBe(true); // still applies for this visit
  });

  it('leaves the other preferences alone', () => {
    const storage = fakeStorage({ 'steeped-in-trouble:controls': '{"touch":"easy","autoSteam":true}', 'steeped-in-trouble:view': 'compact' });
    const { win } = page({ storage });
    key(win, 'KeyM');
    expect([...storage.data.keys()].sort()).toEqual([SOUND_KEY, 'steeped-in-trouble:controls', 'steeped-in-trouble:view'].sort());
    expect(storage.data.get('steeped-in-trouble:controls')).toBe('{"touch":"easy","autoSteam":true}');
  });
});

describe('unlocking audio', () => {
  it('asks the audio to start on gestures until it has, then stops asking', () => {
    const win = new EventTarget();
    const doc = { defaultView: win, querySelectorAll: () => [], getElementById: () => null };
    const audio = fakeAudio(true);
    let running = false;
    audio.unlock = vi.fn(() => running);
    createSoundToggle({ doc, audio });
    expect(audio.unlock).not.toHaveBeenCalled(); // nothing happens on load
    win.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    expect(audio.unlock).toHaveBeenCalledTimes(2);
    running = true;
    win.dispatchEvent(new Event('click'));
    win.dispatchEvent(new Event('touchend'));
    win.dispatchEvent(new Event('pointerup'));
    expect(audio.unlock).toHaveBeenCalledTimes(3);
  });
});
