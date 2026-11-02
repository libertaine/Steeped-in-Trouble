import { expect } from './fixtures.js';

export async function preference(page, value) {
  await page.locator('#menuBtn').click();
  await page.getByText('Controls & Settings', { exact: true }).click();
  await page.getByLabel('On-screen controls', { exact: true }).selectOption(value);
  await expect(page.locator('#teaBreak')).toBeVisible();
  await page.locator('#closeBreak').click();
}

export async function expectVisibility(page, visible, selector = '.controls-classic') {
  await expect(page.locator('body')).toHaveAttribute('data-onscreen-controls', visible ? 'shown' : 'hidden');
  if (visible) await expect(page.locator(selector)).toBeVisible();
  else {
    for (const group of await page.locator('.controls-mobile').all()) {
      await expect(group).toBeHidden();
      expect(await group.evaluate(e => e.inert)).toBe(true);
    }
  }
  await expect(page.locator('#menuBtn')).toBeVisible();
}

export async function geometry(page) {
  return page.evaluate(() => {
    const box = s => { const r = document.querySelector(s).getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    return { canvas: box('#game'), stage: box('.stage'), width: innerWidth, height: innerHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
      columns: getComputedStyle(document.querySelector('.playfield')).gridTemplateColumns };
  });
}

export async function fits(page) {
  await expect.poll(async () => {
    const { canvas: b, stage: s, width, height, overflow } = await geometry(page);
    return b.width > 0 && b.height > 0 && b.left >= 0 && b.right <= width + 1
      && b.top >= 0 && b.bottom <= height + 1 && overflow <= 1
      && b.left >= s.left - 1 && b.right <= s.right + 1 && b.top >= s.top - 1 && b.bottom <= s.bottom + 1
      && Math.abs(b.width / b.height - 920 / 790) < 0.002;
  }).toBe(true);
}

export async function quietCup(page) {
  await page.locator('#mainBtn').click();
  await page.evaluate(() => { window.__TEACUP__.game.state.spawnTimer = Infinity; });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
}

// Mixed-device emulation independent of viewport width or user-agent text.
export async function primaryPointer(page, coarse = false) {
  await page.addInitScript(coarse => {
    const original = window.matchMedia.bind(window);
    const pointer = Object.assign(new EventTarget(), { matches: coarse });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 10 });
    window.matchMedia = q => q === '(pointer: coarse)' ? pointer
      : q === '(pointer: fine)' ? { matches: !pointer.matches }
      : q === '(any-pointer: coarse)' ? { matches: true } : original(q);
    window.__setPrimaryCoarse = value => { pointer.matches = value; pointer.dispatchEvent(new Event('change')); };
  }, coarse);
}
