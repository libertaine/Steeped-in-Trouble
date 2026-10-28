# Flying Spoon testing — spoilers

This is a developer/playtester guide for 0.11.0 Milestone 2.
The normal README and control instructions intentionally omit the surprises.
Milestone 1 history remains in [MOBILE_TESTING.md](MOBILE_TESTING.md).

## Reproduce qualification

Use Node 22.12+ (local qualification uses Node 24.22.1):

```powershell
npm ci
npm run check
$env:CI = '1'
$env:PLAYWRIGHT_PORT = '5324' # a free port; never reuse an old preview
npm run test:browser -- --workers=3 --retries=0
```

Playwright builds production source before starting its own preview. Keep
`CI=1` so server reuse is disabled. It runs Chromium, Firefox and mobile
Chromium, including the complete existing suite. Use a new `--output` path
to retain earlier diagnostic captures. On Windows, an already running Vite
process may lock a native dependency; install/copy source into a fresh
isolated qualification directory instead of killing another preview.

`shortage.test.js` exercises the 9/16/23/30/37/44 schedule, boss delays,
coalesced targets, all choices, run success/failure, bonus preservation and
new-pot reset. `aerial.test.js` covers probability boundaries, failure lock,
actual altitude, ground buffering, frame rates, state preservation, pause,
safe return and one event per run. `aerialRarity.test.js` runs 20,000 seeded
full courses. Repeat its exact experiment with:

```powershell
node --input-type=module -e "import {sampleAerialRuns} from './tests/support/aerialSampling.js'; console.log(JSON.stringify(sampleAerialRuns()));"
```

Measured with runner-stream seeds 1–20,000, tapping Jump every 150 ms, all
real obstacles/collisions enabled: 2,789 bird, 1,543 power, 93 orbit,
15,575 none. Orbit is 0.465% (about 1 in 215). No encounter forcing is used
for that measurement. This is conditional on the described input policy.

## Human playtest

1. Start a fresh pot, beat the first Daily Grind to unlock Chapter 2, then
   complete rounds 9, 16, 23 and 30. Try Buy, Skip, a successful run and a
   failed run. Confirm the normal cup and any pending bonus still follow.
2. In a run, tap Jump once, then again around 150 ms later. Try separate
   taps while rising. A failed extra jump ends the chain until landing.
   Hold Jump and try keyboard auto-repeat: neither should produce a chain.
3. Keep experimenting over several visits; confirm higher flight moves the
   camera, obstacle hitboxes follow the spoon, and normal first jumps still
   clear ordinary obstacles. Slide should wait for landing.
4. During each surprise, use Pause / Menu and background the browser. Both
   the animation and shop clock must stop. Resume and check the same course
   position, score, Tea Cash, cups, pickups, stumbles and pending fortune.
5. After each return, clear the remaining course and reach the shop normally.
   Compare sound on/off, reduced motion, Compact/Full, portrait/landscape.

To make rare events practical, run **Vite development**, then open
`http://localhost:5173/Steeped-in-Trouble/?debug&seed=2` (or the port Vite
prints). Enter a Tea Run normally. With its intro dismissed, use the browser
console, one at a time:

```js
__TEACUP__.previewAerial('bird')
__TEACUP__.previewAerial('power')
__TEACUP__.previewAerial('orbit')
```

This development-only helper raises the spoon to the configured threshold
and reserves that encounter. It deliberately permits repeated previews in
the same run; it is removed from production, has no UI, and does not model
natural rarity. For a short scheduling check while playing a normal cup,
`__TEACUP__.game.state.round = 16` advances the displayed round; finish that
cup normally to exercise the existing reading/scheduler rather than forcing
`shortageDue`. Use 23, 30, etc. for later visits. Unlock Chapter 2 first.
Use a fresh pot afterward; debug edits are for inspection, not qualification.

Browser tests use the existing `?debug` mutable state hook, stop automatic
simulation updates, and advance the real runner explicitly while keeping
actual keyboard/touch input and the renderer live. Secret screenshots force
an opportunity and altitude; they qualify presentation/state transitions,
not rarity. Normal chains use the real seeded RNG (game seed 2). Background
tests dispatch visibility events; real OS/browser suspension remains a
hardware playtest check.

## Qualification and captures

Local results on Windows / Node 24.22.1, 2026-10-28:

- `npm ci`: passed in `tmp/flying-spoon-qualification`, using the unchanged
  package/lockfile. Existing preview processes locked the original native
  dependency. Their processes were preserved; missing local dependencies
  were restored from that locked installation and the final check also ran
  successfully in the original working directory.
- `npm run check`: lint, **488 unit tests in 27 files**, production build
  passed. Source and test files in the isolated browser checkout were
  compared byte for byte with the working source.
- Complete `npm run test:browser`: **103 passed** — 29 Chromium, 29 Firefox,
  45 mobile Chromium. Final run used `CI=1`, port 5325, four workers, no
  retries and `tmp/flying-spoon-final-results`. A fresh production build
  and server were used. An earlier complete 103-test pass and the focused
  16-test pass overlap this final suite; they are not additional unique tests.
- A restricted-sandbox Firefox startup crash was resolved by running the
  browsers outside that process sandbox. Early mobile test-helper mistakes
  were corrected to recognize Compact View's external HUD and Pause / Menu
  button. Final results above include those checks with no skips or retries.
- Screenshots were opened and inspected at all requested scene/layout
  combinations. Inspection caught a detached reentry flame; its attachment
  was corrected before the final full suite and captures.
- The development-only preview helper entered and safely returned from
  bird, power and orbit in the live Vite development loop. Production browser
  tests confirm that helper is absent from the production debug hook.

See the [inspected screenshot gallery](images/flying-spoon/README.md).
Milestone 1's historical 466-unit / 87-browser qualification is retained in
`MOBILE_TESTING.md`; those counts are superseded, not added to this suite.

Browser emulation does not qualify real Samsung/phone/tablet hardware,
system gestures, safe areas, browser toolbars, or Chrome Desktop Site behavior.
The original handoff kept PR #22 in draft for human playtesting. On
2026-10-28, the project owner reported successful testing and authorized
merging and releasing 0.11.0. Individual hardware configurations were not
recorded; the automated evidence above remains browser emulation.
