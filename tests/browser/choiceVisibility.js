import { expect } from './fixtures.js';

/** Read every rendered word, including content that needs vertical scrolling. */
export async function expectChoiceText(page, selector) {
  const failures = await page.locator(selector).evaluate((offer) => {
    const pane = document.getElementById('phaseChoices');
    const field = document.querySelector('.playfield');
    const clip = () => {
      const p = pane.getBoundingClientRect(), f = field.getBoundingClientRect();
      return { left: Math.max(0, p.left + pane.clientLeft, f.left),
        right: Math.min(innerWidth, p.left + pane.clientLeft + pane.clientWidth, f.right),
        top: Math.max(0, p.top + pane.clientTop, f.top),
        bottom: Math.min(innerHeight, p.top + pane.clientTop + pane.clientHeight, f.bottom) };
    };
    const errors = [];
    const panel = pane.getBoundingClientRect(), hud = document.querySelector('.hud-top').getBoundingClientRect();
    if (panel.width <= 0 || panel.height <= 0 || panel.left < -1 || panel.right > innerWidth + 1
      || panel.top < hud.bottom - 1 || panel.bottom > innerHeight + 1) errors.push('choices panel outside its reserved space');
    for (const selector of ['#game', '#actionDock', '#menuBtn']) {
      const other = document.querySelector(selector).getBoundingClientRect();
      if (other.width > 0 && other.height > 0 && Math.min(panel.right, other.right) - Math.max(panel.left, other.left) > 1
        && Math.min(panel.bottom, other.bottom) - Math.max(panel.top, other.top) > 1) errors.push(`panel overlaps ${selector}`);
    }
    const walker = document.createTreeWalker(offer, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent.getClientRects().length) continue;
      for (const word of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, word.index); range.setEnd(node, word.index + word[0].length);
        const before = range.getBoundingClientRect(), area = clip();
        pane.scrollTop += (before.top + before.bottom - area.top - area.bottom) / 2;
        const box = range.getBoundingClientRect(), visible = clip();
        // Include inner clipping, not just the viewport and outer scrollport.
        for (let a = parent; a && a !== pane; a = a.parentElement) {
          const css = getComputedStyle(a), r = a.getBoundingClientRect();
          if (css.overflowX !== 'visible') {
            visible.left = Math.max(visible.left, r.left + a.clientLeft);
            visible.right = Math.min(visible.right, r.left + a.clientLeft + a.clientWidth);
          }
          if (css.overflowY !== 'visible') {
            visible.top = Math.max(visible.top, r.top + a.clientTop);
            visible.bottom = Math.min(visible.bottom, r.top + a.clientTop + a.clientHeight);
          }
        }
        if (box.left < visible.left - 1 || box.right > visible.right + 1
          || box.top < visible.top - 1 || box.bottom > visible.bottom + 1) {
          errors.push(`clipped word: ${word[0]}`);
        } else {
          const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
          if (!parent.contains(hit)) errors.push(`covered word: ${word[0]}`);
        }
      }
    }
    return errors;
  });
  expect(failures, `complete readable text in ${selector}`).toEqual([]);
}

/** Check the whole exposed button area, beyond Playwright's single click point. */
export async function expectChoiceClickable(card) {
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeEnabled();
  const result = await card.evaluate((button) => {
    const b = button.getBoundingClientRect(), pane = document.getElementById('phaseChoices');
    const p = pane.getBoundingClientRect(), field = document.querySelector('.playfield').getBoundingClientRect();
    const left = Math.max(0, b.left, p.left + pane.clientLeft, field.left);
    const right = Math.min(innerWidth, b.right, p.left + pane.clientLeft + pane.clientWidth, field.right);
    const top = Math.max(0, b.top, p.top + pane.clientTop, field.top);
    const bottom = Math.min(innerHeight, b.bottom, p.top + pane.clientTop + pane.clientHeight, field.bottom);
    const hits = [];
    for (const x of [left + 3, (left + right) / 2, right - 3]) {
      for (const y of [top + 3, (top + bottom) / 2, bottom - 3]) {
        hits.push(button.contains(document.elementFromPoint(x, y)));
      }
    }
    return { target: b.width >= 44 && b.height >= 44,
      exposed: right - left >= 44 && bottom - top >= 44,
      wholeWhenFits: b.height > pane.clientHeight || (top <= b.top + 1 && bottom >= b.bottom - 1),
      contentFits: button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1,
      hits };
  });
  expect(result).toEqual({ target: true, exposed: true, wholeWhenFits: true, contentFits: true, hits: Array(9).fill(true) });
}
