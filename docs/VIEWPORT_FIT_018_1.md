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

The start/resume and arcade collection actions stay in the playfield in both
views, preventing clicks from scrolling a narrow Full View to the sidebar and
leaving gameplay offscreen. Existing reading offers retain their presentation
behavior. Compact's arena fitting and rendering camera are unchanged.

The logical configuration, renderer, canvas backing-store scaler, input code,
and simulation are unchanged. Smaller Full View canvases are intentional: the
whole scene and its controls now share the available screen instead of extending
below it. The existing full resource counts remain in the sidebar; the approved
mode-aware resource redesign belongs to 018-2.

## Measured comparison

Baseline: clean archived build of `d6b8e2b9aa01f3df59e84a9a205ac8937bbb9fe8`.
Candidate: this branch. Both are production builds, measured in desktop
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

Final local validation:

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
