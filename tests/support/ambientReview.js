// Short video clips of the ant colony for visual review (not a test). Serve a
// production build, then pass its URL and an output directory:
//
//   npm run build && npx vite preview --port 4191
//   node tests/support/ambientReview.js http://localhost:4191/Steeped-in-Trouble/ tmp/ambient-review [scenario ...]
//
// Each scenario writes <name>.webm (the whole page at its viewport size, from
// load), <name>.png (the page once the scene is set) and <name>.json: when
// the scene began (seconds into the clip), the stage's place on the page
// when it began (ant positions are stage-local), the measured regions and a
// timeline of the ants, any crumb and any sugar cube (once a second, or more
// often for the crumb and cube scenes). Everything goes through the existing
// ?debug hook (summon, socialize, crumble, sweeten, snapshot) with a fixed
// ambient seed; the game itself stays on its calm ready screen. Nothing here
// is committed.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { stageTextReading } from '../browser/textMischief.js';

const [url, output, ...only] = process.argv.slice(2);
if (!url || !output) throw new Error('Usage: node tests/support/ambientReview.js URL OUTPUT_DIRECTORY [scenario ...]');
mkdirSync(output, { recursive: true });

const desktop = (width, height) => ({ ...devices['Desktop Chrome'], viewport: { width, height } });

async function textTheft(page) {
  await page.mouse.move(0, 0);
  await stageTextReading(page);
  await page.waitForFunction(() => window.__TEACUP__.ambient.snapshot().text.eligible);
  if (!await page.evaluate(() => window.__TEACUP__.ambient.stealText())) throw new Error('Text theft was ineligible');
}

/**
 * Ask for a crumb until a wandering ant notices one (an unnoticed crumb just
 * fades away), keeping the colony topped up; returns once it has been noticed.
 */
async function noticedCrumb(page) {
  await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
  await page.waitForFunction(() => window.__TEACUP__.ambient.snapshot().ants
    .filter((a) => a.state === 'wandering' || a.state === 'paused').length >= 3, null, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const a = window.__TEACUP__.ambient, s = a.snapshot();
    if (s.count < 4) a.summon(6);
    if (!s.crumb) a.crumble();
    return s.crumb?.claim != null;
  }, null, { timeout: 90_000, polling: 100 });
}

/**
 * Ask for a sugar cube until a team gathers round one (a team needs free
 * ants in one gutter, and room for any newcomers), keeping the colony topped
 * up; returns once the cube has turned up (`phase`: or once it reaches it).
 */
async function procession(page, { size = null, quirk = null, phase = null } = {}) {
  await page.evaluate(() => window.__TEACUP__.ambient.summon(6));
  await page.waitForFunction(() => window.__TEACUP__.ambient.snapshot().ants
    .filter((a) => a.state === 'wandering' || a.state === 'paused').length >= 3, null, { timeout: 30_000 });
  await page.waitForFunction(({ size, quirk, phase }) => {
    const a = window.__TEACUP__.ambient, s = a.snapshot();
    if (!s.cube) {
      if (s.count < 3) a.summon(6);
      a.sweeten({ size, quirk });
    }
    return !!s.cube && (!phase || s.cube.phase === phase);
  }, { size, quirk, phase }, { timeout: 150_000, polling: 100 });
}

/**
 * name → { context, query, seconds, every, start(page), during(page, t) }. `start` sets the scene; the clip
 * runs `seconds` after it, sampled every `every` ms (1000), calling `during` at each sample.
 */
const SCENARIOS = {
  'text-theft': { context: desktop(1920, 1080), query: '&view=full', seconds: 16, every: 250, start: textTheft },
  'text-carry': { context: desktop(1920, 1080), query: '&view=full', seconds: 5, every: 250,
    async start(page) { await textTheft(page);
      await page.waitForFunction(() => window.__TEACUP__.ambient.snapshot().text.phase === 'carry'); } },
  'text-return': { context: desktop(1920, 1080), query: '&view=full', seconds: 10, every: 250,
    async start(page) { await textTheft(page);
      await page.waitForFunction(() => window.__TEACUP__.ambient.snapshot().text.phase === 'absent'); } },
  'text-advance': { context: desktop(1920, 1080), query: '&view=full', seconds: 6, every: 250, start: textTheft,
    async during(page, t) { if (t === 3) await page.keyboard.press('Enter'); } },
  'text-resize': { context: desktop(1920, 1080), query: '&view=full', seconds: 6, every: 250, start: textTheft,
    async during(page, t) { if (t === 3) await page.setViewportSize({ width: 800, height: 600 }); } },
  'text-low': { context: desktop(1920, 1080), query: '&view=full', seconds: 6, every: 250, start: textTheft,
    async during(page, t) { if (t === 3) await page.locator('#graphicsBtn').evaluate(e => e.click()); } },
  'text-motion': { context: desktop(1920, 1080), query: '&view=full', seconds: 6, every: 250, start: textTheft,
    async during(page, t) { if (t === 3) await page.emulateMedia({ reducedMotion: 'reduce' }); } },
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
  // A crumb noticed, approached, looked over, picked up and carried out of sight.
  crumb: { context: desktop(1280, 720), query: '&view=full', seconds: 16, every: 250, start: noticedCrumb },
  // Once it is being carried, the window narrows: the gutter changes shape, and crumb and carrier go at once.
  'crumb-cancel': { context: desktop(1280, 720), query: '&view=full', seconds: 8, every: 250,
    async start(page) {
      await noticedCrumb(page);
      await page.waitForFunction(() => window.__TEACUP__.ambient.snapshot().crumb?.state === 'carried', null, { timeout: 20_000 });
    },
    async during(page, t) { if (t === 2) await page.setViewportSize({ width: 1100, height: 720 }); } },
  // A sugar cube turns up; nearby ants (and a newcomer or two) gather round, take hold, lift it together,
  // carry it along the gutter, turn it at the corner and take it out of sight.
  cube: { context: desktop(1920, 1080), query: '&view=full', seconds: 55, every: 250, start: (page) => procession(page) },
  // The same with a team of four: one pulling in front, two at the sides, one pushing behind.
  'cube-four': { context: desktop(1920, 1080), query: '&view=full', seconds: 55, every: 250,
    start: (page) => procession(page, { size: 4 }) },
  // A brief lapse early in the carrying: one carrier turns and tugs the wrong way, the cube slows, it turns back.
  'cube-mistake': { context: desktop(1920, 1080), query: '&view=full', seconds: 30, every: 250,
    start: (page) => procession(page, { size: 4, quirk: 'wrong-way' }) },
  // The team stops and looks about, as if reconsidering the route.
  'cube-reconsider': { context: desktop(1920, 1080), query: '&view=full', seconds: 30, every: 250,
    start: (page) => procession(page, { size: 3, quirk: 'reconsider' }) },
  // Once it is being carried, the window narrows: the gutter no longer has room, and cube and team go at once.
  'cube-cancel': { context: desktop(1920, 1080), query: '&view=full', seconds: 8, every: 250,
    start: (page) => procession(page, { phase: 'carry' }),
    async during(page, t) { if (t === 2) await page.setViewportSize({ width: 1000, height: 1080 }); } },
  // High graphics while it is being carried, then Low: a plainer cube and team, straight home, no more lapses.
  'cube-low': { context: desktop(1920, 1080), query: '&view=full', seconds: 40, every: 250,
    start: (page) => procession(page, { phase: 'carry' }),
    async during(page, t) { if (t === 4) await page.locator('#graphicsBtn').evaluate((button) => button.click()); } },
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
    const stage = await page.locator('.stage').evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const timeline = [];
    let shot = false;
    const every = scenario.every ?? 1000;
    for (let i = 0; i < (scenario.seconds * 1000) / every; i++) {
      const t = (i * every) / 1000;
      await scenario.during?.(page, t);
      const s = await page.evaluate(() => window.__TEACUP__.ambient.snapshot());
      const c = s.crumb, k = s.cube;
      timeline.push({ t, count: s.count, spell: s.spell, quality: s.quality,
        text: s.text,
        crumb: c && `${c.state}${c.claim === null ? '' : `<${c.claim}`}@${Math.round(c.x)},${Math.round(c.y)}`,
        cube: k && `${k.phase}${k.exiting ? '*' : ''}${k.quirk ? `!${k.quirk}` : ''}${k.hurry ? '^' : ''}<${k.members.join(',')}@${Math.round(k.x)},${Math.round(k.y)}`,
        ants: s.ants.map((a) => `${a.slot}:${a.state}/${a.mode}${a.cargo ? '*' : ''}${a.partner === null ? '' : `>${a.partner}`}@${Math.round(a.x)},${Math.round(a.y)}`) });
      // The still: the first settled ant, or for the cube scenes the procession under way.
      const ready = name.startsWith('text') ? s.text?.phase === 'carry' || s.text?.phase === 'restored'
        : name.startsWith('cube') ? ['carry', 'turn'].includes(s.cube?.phase) && t >= 1
        : s.count > 0 && s.ants.some((a) => a.state !== 'entering');
      if (!shot && ready) {
        await page.screenshot({ path: `${output}/${name}.png` });
        shot = true;
      }
      await page.waitForTimeout(every);
    }
    const s = await page.evaluate(() => window.__TEACUP__.ambient.snapshot());
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
