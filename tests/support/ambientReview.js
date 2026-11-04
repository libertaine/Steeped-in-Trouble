// Short video clips of the ant colony for visual review (not a test). Serve a
// production build, then pass its URL and an output directory:
//
//   npm run build && npx vite preview --port 4191
//   node tests/support/ambientReview.js http://localhost:4191/Steeped-in-Trouble/ tmp/ambient-review [scenario ...]
//
// Each scenario writes <name>.webm (the whole page at its viewport size, from
// load), <name>.png (the page once the scene is set) and <name>.json: when
// the scene began (seconds into the clip), the stage's place on the page
// (ant positions are stage-local), the measured regions and a
// once-a-second timeline of the ants. Everything goes through the existing
// ?debug hook (summon, socialize, snapshot) with a fixed ambient seed; the
// game itself stays on its calm ready screen. Nothing here is committed.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const [url, output, ...only] = process.argv.slice(2);
if (!url || !output) throw new Error('Usage: node tests/support/ambientReview.js URL OUTPUT_DIRECTORY [scenario ...]');
mkdirSync(output, { recursive: true });

const desktop = (width, height) => ({ ...devices['Desktop Chrome'], viewport: { width, height } });

/** name → { context, query, seconds, start(page) }. `start` sets the scene; the clip runs `seconds` after it. */
const SCENARIOS = {
  'one-ant': { context: desktop(1280, 720), query: '&view=full&ambientAnts=1', seconds: 20,
    start: (page) => page.evaluate(() => window.__TEACUP__.ambient.summon(1)) },
  'full-colony': { context: desktop(1920, 1080), query: '&view=full', seconds: 25,
    start: (page) => page.evaluate(() => window.__TEACUP__.ambient.summon(6)) },
  ...Object.fromEntries(['follow', 'greet', 'drift'].map((kind) => [kind, {
    context: desktop(1920, 1080), query: '&view=full', seconds: 15,
    // A moment needs suitable ants close enough together (a follower's leader
    // within reach, for one), so keep the colony topped up and ask again until
    // one begins; the clip's scene starts then.
    async start(page) {
      for (let tries = 0; tries < 12; tries++) {
        await page.evaluate((k) => { window.__TEACUP__.ambient.summon(6); window.__TEACUP__.ambient.socialize(k); }, kind);
        const began = await page.waitForFunction((k) => window.__TEACUP__.ambient.snapshot().ants.some((a) => a.mode === k),
          kind, { timeout: 5000 }).then(() => true, () => false);
        if (began) return;
      }
      throw new Error(`No ${kind} moment began`);
    },
  }])),
  'entry-exit': { context: desktop(1280, 720), query: '&view=full&ambientAnts=1', seconds: 30,
    start: (page) => page.evaluate(() => window.__TEACUP__.ambient.summon(1)) },
  // Nothing summoned: the colony's own rhythm, arrivals, a spell and the quiet after it.
  quiet: { context: desktop(1280, 720), query: '&view=full', seconds: 150, start: async () => {} },
  'low-graphics': { context: desktop(1920, 1080), query: '&view=full&graphics=low', seconds: 20,
    start: (page) => page.evaluate(() => window.__TEACUP__.ambient.summon(6)) },
  'narrow-desktop': { context: desktop(1200, 480), query: '&view=full', seconds: 20,
    start: (page) => page.evaluate(() => window.__TEACUP__.ambient.summon(6)) },
  'landscape-phone': { context: { ...devices['Pixel 7'], viewport: { width: 844, height: 390 } }, query: '', seconds: 20,
    start: (page) => page.evaluate(() => window.__TEACUP__.ambient.summon(6)) },
};

const browser = await chromium.launch();
try {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (only.length && !only.includes(name)) continue;
    const { viewport } = scenario.context;
    const context = await browser.newContext({ ...scenario.context, recordVideo: { dir: output, size: viewport } });
    const page = await context.newPage();
    const opened = Date.now();
    await page.goto(`${url}?debug&noOverlay&ambientSeed=7${scenario.query}`);
    await page.waitForFunction(() => window.__TEACUP__?.ambient);
    await page.waitForTimeout(500); // measured and settled
    await scenario.start(page);
    const start = (Date.now() - opened) / 1000;
    const timeline = [];
    let shot = false;
    for (let t = 0; t < scenario.seconds; t++) {
      const s = await page.evaluate(() => window.__TEACUP__.ambient.snapshot());
      timeline.push({ t, count: s.count, spell: s.spell,
        ants: s.ants.map((a) => `${a.slot}:${a.state}/${a.mode}${a.partner === null ? '' : `>${a.partner}`}@${Math.round(a.x)},${Math.round(a.y)}`) });
      if (!shot && s.count > 0 && s.ants.some((a) => a.state !== 'entering')) {
        await page.screenshot({ path: `${output}/${name}.png` });
        shot = true;
      }
      await page.waitForTimeout(1000);
    }
    const s = await page.evaluate(() => window.__TEACUP__.ambient.snapshot());
    const stage = await page.locator('.stage').evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const video = page.video();
    await context.close();
    renameSync(await video.path(), `${output}/${name}.webm`);
    writeFileSync(`${output}/${name}.json`, `${JSON.stringify({ name, viewport, start, stage, shape: s.shape, room: s.room,
      limit: s.limit, quality: s.quality, visible: s.visible, regions: s.regions, timeline }, null, 1)}\n`);
    console.log(`${name}: ${viewport.width}×${viewport.height}, scene from ${start.toFixed(1)} s, room ${s.room}, `
      + `most ${Math.max(...timeline.map((f) => f.count))} ants`);
  }
} finally {
  await browser.close();
}
