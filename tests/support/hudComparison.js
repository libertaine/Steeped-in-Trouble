// Production before/after captures. Fixture quantities are deliberately
// constructed; mode entries and controls use the real application lifecycle.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url, output] = process.argv.slice(2);
if (!url || !output) throw Error('Usage: node tests/support/hudComparison.js URL OUTPUT_DIRECTORY');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const rows = [];
try {
  for (const [width, height] of [[1280, 720], [375, 667]]) {
    for (const scene of ['ordinary', 'depleted', 'bonus', 'grind', 'chocolate', 'teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet']) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${url}?debug&noOverlay&seed=42&touch=classic`);
      await page.waitForFunction(() => window.__TEACUP__?.game);
      if (['teaRun', 'dailyPour', 'biscuitBreakout', 'crossingStreet'].includes(scene)) {
        await page.locator('#collectionBtn').click();
        await page.locator(`[data-job="${scene}"]`).click();
        await page.waitForFunction((mode) => window.__TEACUP__.game.practice === mode, scene);
        await page.evaluate(() => window.__TEACUP__.game.primaryAction());
      } else {
        await page.locator('#mainBtn').click();
        await page.evaluate((scene) => {
          const g = window.__TEACUP__.game, s = g.state;
          if (scene === 'grind' || scene === 'chocolate') {
            Object.assign(s, { phase: 'reading', readingTime: 10, offer: null, grindDue: scene === 'grind', havocDue: scene === 'chocolate', shortageDue: false, arcadeDue: null });
            g.primaryAction(); g.primaryAction();
            if (scene === 'grind') {
              s.grind.scalds = 2;
              s.grind.attack = { kind: 'pressure', stage: 'warn', time: 0, length: 1.5, lanes: [0, 1, 2], pattern: 'wedge', milked: false, reach: 0 };
            }
          } else {
            Object.assign(s, { spawnTimer: Infinity, kills: 8, score: 1260, milkLeft: 1, sugarLeft: 1 });
            s.enemies = Array.from({ length: 5 }, (_, i) => ({ angle: i * 1.18, radius: 145 + i * 26, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 }));
            if (scene === 'depleted') Object.assign(s, { milkLeft: 0, sugarLeft: 0, strainerLeft: 0 });
            if (scene === 'bonus') Object.assign(s, { milkLeft: 2, sugarLeft: 3, lives: 4 });
          }
        }, scene);
      }
      await page.evaluate(() => { window.__TEACUP__.game.update = () => {}; window.scrollTo(0, 0); });
      await page.waitForTimeout(150);
      const metrics = await page.evaluate(() => {
        const b = document.querySelector('#game').getBoundingClientRect();
        return { width: b.width, height: b.height, top: b.top, bottom: b.bottom,
          overflow: document.documentElement.scrollWidth - innerWidth,
          phase: window.__TEACUP__.game.state.phase,
          hud: document.querySelector('#resourceStrip')?.textContent ?? document.querySelector('.hud-top').textContent };
      });
      rows.push({ viewport: `${width}x${height}`, scene, ...metrics });
      await page.screenshot({ path: `${output}/${scene}-${width}x${height}.png`, scale: 'css' });
      await page.close();
    }
  }
} finally { await browser.close(); }
writeFileSync(`${output}/scenarios.json`, `${JSON.stringify(rows, null, 2)}\n`);
