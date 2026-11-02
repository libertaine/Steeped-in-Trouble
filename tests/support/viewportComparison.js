// Build the baseline and candidate separately, then pass each preview URL and
// an output directory. Captures deliberately return to the document top after
// starting: baseline Full View's sidebar button can otherwise scroll the arena
// completely out of view on narrow screens.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url, output] = process.argv.slice(2);
if (!url || !output) throw new Error('Usage: node tests/support/viewportComparison.js URL OUTPUT_DIRECTORY');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const rows = [];
try {
  for (const [width, height] of [[375, 667], [800, 600], [1280, 720], [1366, 768], [1920, 1080], [844, 390], [800, 1280], [1280, 800]]) {
    for (const view of ['full', 'compact']) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${url}?debug&noOverlay&seed=42&view=${view}`);
      await page.waitForFunction(() => window.__TEACUP__?.game);
      await page.locator('#mainBtn').click();
      await page.evaluate(() => {
        const g = window.__TEACUP__.game;
        g.state.spawnTimer = Infinity; g.state.enemies = []; g.pause();
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => window.scrollTo(0, 0));
      const metrics = await page.evaluate(() => {
        const b = document.querySelector('#game').getBoundingClientRect();
        const s = document.querySelector('.stage').getBoundingClientRect();
        const controls = [...document.querySelectorAll('.controls-mobile button, #actionDock button')]
          .filter((e) => e.getClientRects().length && !e.hidden).map((e) => e.getBoundingClientRect());
        return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom,
          visiblePercent: Math.min(100, Math.max(0, Math.min(innerHeight, b.bottom) - Math.max(0, b.y)) / b.height * 100),
          stageWidth: s.width, stageHeight: s.height, overflow: document.documentElement.scrollWidth - innerWidth,
          controlsVisible: controls.every((r) => r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1),
          minControlWidth: Math.min(...controls.map((r) => r.width)),
          minControlHeight: Math.min(...controls.map((r) => r.height)) };
      });
      rows.push({ viewport: `${width}x${height}`, view, ...metrics });
      await page.screenshot({ path: `${output}/${view}-${width}x${height}.png` });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${output}/measurements.json`, JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify(rows, null, 2));
