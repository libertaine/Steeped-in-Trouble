# 018-1 — Viewport Fit

Implementation and measurements: November 1, 2026. Review candidate for U01;
version remains **0.17.1**. This work does not constitute release approval or
acceptance of 018-2, 018-3, or 018-4.

## Implementation brief

Implement U01 on a separate feature branch from the current 0.17.1 baseline.
Fit the entire 920×790 logical arena into the available browser viewport,
reserving space for the existing HUD, controls, and primary actions. Keep the
lower cup, boss attacks, paddle, and side-adventure ground visible. Preserve
rendering coordinates, gameplay rules, input mapping, and device-pixel-ratio
scaling. Check Full and Compact View at all five mandatory design sizes
(1280×720, 1366×768, 1920×1080, 800×600, 375×667), plus 844×390, 800×1280,
and 1280×800. Include resizing during gameplay, rotation, touch controls,
view switching, boss warnings, and all four adventures. Supply a measured
production before/after comparison and open a PR; stop at review without merging.
Resource gauges, reading/Tea Break redesign, retro styling, and a version bump
are outside this implementation.

## Resulting layout

Full View previously sized its canvas solely from the column width. The
playfield now receives a viewport height budget after the measured header and
main padding. Header size changes and window/visual-viewport resize events
refresh that budget; disposal removes the listeners and observer. CSS reserves
the existing HUD and controls, and fits the canvas uniformly within the
remaining stage. Landscape uses a control rail; short landscape reduces control
spacing while retaining 44px or larger action targets. Full View's desktop
sidebar scrolls independently; on narrow screens it remains below the playfield.
The desktop landscape page limit is now 1580px: the original 1390px plus the
190px rail. This recovers arena width on larger displays while the viewport
height budget still limits the canvas. Full View buttons have a 44px minimum
height, including Classic Touch and pause access.

The start/resume and arcade collection actions stay in the playfield in both
views, preventing clicks from scrolling a narrow Full View to the sidebar and
leaving gameplay offscreen. Existing reading offers retain their presentation
behavior. Compact's arena fitting and rendering camera are unchanged.

The logical configuration, renderer, canvas backing-store scaler, input code,
and simulation are unchanged. Full View fits the arena to the available stage:
the whole scene and its controls share the screen instead of extending below
it. Large landscape displays also use the extra desktop width described above.
The existing full resource counts remain in the sidebar; the approved
mode-aware resource redesign belongs to 018-2.

## Measured comparison

Baseline: clean archived build of `d6b8e2b9aa01f3df59e84a9a205ac8937bbb9fe8`.
Initial candidate: `810dcec` (before the required desktop revision below).
Both are production builds, measured in desktop
Chromium at CSS pixel dimensions, seed 42, with an empty paused first cup.
Screenshots return to document top after starting in both builds to compare
the same framing. Baseline narrow Full View also scrolls away from the arena
when its sidebar start button is clicked; the regression test requires the
candidate to fit immediately after starting without corrective scrolling.

“Visible” below is the percentage of the canvas's vertical extent inside the
viewport, not the percentage of active pixels or a player legibility score.
It does not account for the old overlaid HUD. Canvas size is displayed CSS size,
rounded to the nearest pixel; logical coordinates remain 920×790.

| Viewport | Full before visible | Full after visible | Full after canvas | Compact before / after visible |
| --- | ---: | ---: | ---: | ---: |
| 1280×720 | 78.7% | 100% | 580×498 | 100% / 100% |
| 1366×768 | 77.4% | 100% | 635×545 | 100% / 100% |
| 1920×1080 | 100% | 100% | 812×697 | 100% / 100% |
| 800×600 | 77.7% | 100% | 545×468 | 100% / 100% |
| 375×667 | 100% | 100% | 297×255 | 100% / 100% |
| 844×390 | 42.3% | 100% | 301×258 | 100% / 100% |
| 800×1280 | 100% | 100% | 746×641 | 100% / 100% |
| 1280×800 | 89.1% | 100% | 673×578 | 100% / 100% |

All measured Compact canvas sizes match baseline. Both measured layouts have
zero horizontal document overflow at all eight sizes. Review the
[screenshots and raw measurements](images/viewport-fit/README.md).

## Reproduction and validation

Run `npm run check` and `npm run test:browser`. The new
`viewportFit.spec.js` and `mobile-viewport-fit.spec.js` share the matrix in
`viewportFit.js`: 8 sizes × 2 views × 3 browser projects = 48 tests. Each
checks ready/live play, held touch steering, live viewport-height changes,
a real boss state with a pressure warning, all four adventure introductions
and paused play, rotation, and in-place view switching. Checks include canvas
containment, aspect ratio, DPR backing dimensions, control reachability,
control/canvas separation, unchanged paused simulation, and browser errors.
Per-test screenshots use Playwright's output directory.

Two existing checks were updated for the reserved HUD row and relocated actions.
The runner helper now checks visible playfield bounds, mutual pill separation,
and a HUD entirely above the canvas, rather than requiring an overlaid HUD within
the canvas width. The modal test probes each background action for native modal
interception and clicks exposed backdrop points; it avoids unintentionally
clicking the modal's own Start button when that covers the relocated action.
Its focus, inertness, backdrop, and scroll-lock assertions remain in place.

For repeatable before/after captures, build the baseline archive and candidate
separately and serve them on separate preview ports, then run:

```powershell
node tests/support/viewportComparison.js http://localhost:4188/Steeped-in-Trouble/ tmp/018-1/before
node tests/support/viewportComparison.js http://localhost:4187/Steeped-in-Trouble/ tmp/018-1/after
```

Initial candidate local validation (superseded by the revision qualification below):

- `npm run check`: lint, **849 unit tests / 42 files**, and production build passed.
- Complete Playwright suite, **8 workers, no retries: 337 passed**, including
  the 48 new viewport cases; Chromium, Firefox, and mobile Chromium.
- Separate focused verification of the two amended helpers: **14 passed**
  across Chromium and Firefox. This overlaps the full-suite count above.
- Existing documentation screenshots regenerated by the regression suite were
  archived outside tracked documentation, then restored with SHA-256 comparison.
  Only this milestone's new evidence gallery is included in the change.

Exploratory runs retained in ignored `tmp/018-1/` include the original stale
layout assertions and a concurrent unit/browser run that hit two existing
five-second unit-test limits. The final unit check ran separately and passed
without timeout changes, exclusions, or assertion relaxation.

Browser emulation does not qualify physical phone toolbar/safe-area behavior or real
device touch arbitration. Small Full View text still needs visual review;
the later resource HUD/readability work is not accepted by these bounds checks.

## Required desktop revision (2026-11-02)

The initial landscape layout subtracted a fixed 190px rail from the original
1390px page limit. At 1920×1080 the stage was width-limited to 812px despite
having 857px of usable height. Increasing only Full View's landscape page limit
to 1580px gives the rail its own width. At that viewport the arena is now
height-limited to 998.22×857.16, close to the original 1002×860; its displayed
area grows by 51.1% over the initial PR. The existing 315px sidebar and all
rendering, simulation, input, and viewport-height fitting code are unchanged.

Fresh production Chromium captures compare the initial PR build (`810dcec`)
with the revision, using the same paused-cup procedure above. These are displayed
CSS dimensions rounded to the nearest pixel. The original baseline and initial
PR evidence above are retained unchanged.

| Viewport | Initial PR Full canvas | Revised Full canvas | Canvas visible before / after |
| --- | ---: | ---: | ---: |
| 375×667 | 297×255 | 288×247 | 100% / 100% |
| 800×600 | 545×468 | 545×468 | 100% / 100% |
| 1280×720 | 580×498 | 580×498 | 100% / 100% |
| 1366×768 | 635×545 | 635×545 | 100% / 100% |
| 1920×1080 | 812×697 | 998×857 | 100% / 100% |
| 844×390 | 301×258 | 301×258 | 100% / 100% |
| 800×1280 | 746×641 | 746×641 | 100% / 100% |
| 1280×800 | 673×578 | 673×578 | 100% / 100% |

Compact canvas dimensions are unchanged at all eight sizes. Both views have
100% canvas visibility, visible controls, and zero horizontal overflow at every
measured size. Full View's minimum measured button height rises from 36–41px to
44px; the two-dimensional 44px target requirement is also enforced in the
scenario matrix. The small portrait change reserves that extra button height.
The ready screen retains its collection action row: at 1920×1080 its revised
arena is 919×789, then expands to 998×857 during live and paused play.

The [revision gallery and raw measurements](images/viewport-fit/README.md#required-desktop-revision)
include all eight Full View captures and both views' unrounded measurements.
The 1920×1080, 1280×800, and 1366×768 captures were visually inspected.

All original eight-size Full/Compact cases remain. The matrix additionally
opens and resumes the pause menu during live play, checks 44×44px touch targets,
and guards against arena width dropping below 990px during 1920×1080 Full View
play. Three new Classic Touch cases check the priority desktop sizes, live
control visibility, and pause access in each browser project.

Revision qualification:

- `npm run check`: lint, **849 unit tests / 42 files**, and production build passed.
- Complete Playwright suite: **346 passed**, eight workers, no retries, across
  Chromium, Firefox, and mobile Chromium. This includes all **57 viewport cases**.
- Existing regression screenshots were archived and restored with SHA-256
  verification; only the revision gallery and measurements were added.
- The initial sandbox run was stopped after Firefox page creation crashed.
  A standalone launch succeeded outside the sandbox, and the complete final
  run above used normal browser access. The first draft of the size guard also
  targeted the ready screen; it was corrected to assert live-play size, while
  retaining visibility checks in both states. Exploratory logs are retained in
  ignored `tmp/018-1-revision/` separately from the passing final run.

Stop at PR review. No merge, release, version bump, or deployment is authorized.
