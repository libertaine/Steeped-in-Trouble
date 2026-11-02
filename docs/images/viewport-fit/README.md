# 018-1 arena visibility evidence

These are production captures, not the approved HUD prototype. See the
[implementation brief and measurements](../../VIEWPORT_FIT_018_1.md) for scope,
method, and verification limits. Logical rendering remains 920×790.

Baseline is commit `d6b8e2b9aa01f3df59e84a9a205ac8937bbb9fe8`.
The `after/` captures represent the initial PR (`810dcec`); revised evidence
is linked below. Both comparison builds use bundled desktop Chromium,
seed 42, a quiet paused cup, CSS-pixel screenshots, and document-top framing.

| Viewport | Full before | Full after | Compact after |
| --- | --- | --- | --- |
| 1280×720 (mandatory) | [Before](before/full-1280x720.png) | [After](after/full-1280x720.png) | [Compact](after/compact-1280x720.png) |
| 1366×768 (mandatory) | [Before](before/full-1366x768.png) | [After](after/full-1366x768.png) | [Compact](after/compact-1366x768.png) |
| 1920×1080 (mandatory) | [Before](before/full-1920x1080.png) | [After](after/full-1920x1080.png) | [Compact](after/compact-1920x1080.png) |
| 800×600 (mandatory) | [Before](before/full-800x600.png) | [After](after/full-800x600.png) | [Compact](after/compact-800x600.png) |
| 375×667 (mandatory) | [Before](before/full-375x667.png) | [After](after/full-375x667.png) | [Compact](after/compact-375x667.png) |
| 844×390 | [Before](before/full-844x390.png) | [After](after/full-844x390.png) | [Compact](after/compact-844x390.png) |
| 800×1280 | [Before](before/full-800x1280.png) | [After](after/full-800x1280.png) | [Compact](after/compact-800x1280.png) |
| 1280×800 | [Before](before/full-1280x800.png) | [After](after/full-1280x800.png) | [Compact](after/compact-1280x800.png) |

Raw measurements include both views:
[baseline](before/measurements.json), [candidate](after/measurements.json).
Regenerate them with `tests/support/viewportComparison.js` against separate
baseline/candidate production preview servers.

Additional scenario samples from the passing viewport matrix show a real
pressure-warning boss state and each real adventure in paused play:

| Mode | Full 1280×720 | Full mobile Chromium 375×667 |
| --- | --- | --- |
| Boss warning | [Boss](scenarios/boss-desktop.png) | [Boss](scenarios/boss-mobile.png) |
| Tea Run | [Ground](scenarios/teaRun-desktop.png) | [Ground](scenarios/teaRun-mobile.png) |
| Daily Pour | [Route](scenarios/dailyPour-desktop.png) | [Route](scenarios/dailyPour-mobile.png) |
| Biscuit Breakout | [Paddle](scenarios/biscuitBreakout-desktop.png) | [Paddle](scenarios/biscuitBreakout-mobile.png) |
| Crossing the Street | [Street](scenarios/crossingStreet-desktop.png) | [Street](scenarios/crossingStreet-mobile.png) |

Mobile samples use browser emulation and all captures use CSS pixel resolution;
the matrix separately checks device-pixel-ratio backing dimensions. Neither set claims a
physical-device qualification. Small Full View text remains subject to visual
review; the next resource HUD milestone is separate.

## Required desktop revision

The original captures above are retained. Revised Full View captures:

| Viewport | Revised Full View |
| --- | --- |
| 375×667 | [Capture](revision/full-375x667.png) |
| 800×600 | [Capture](revision/full-800x600.png) |
| 1280×720 | [Capture](revision/full-1280x720.png) |
| 1366×768 | [Capture](revision/full-1366x768.png) |
| 1920×1080 | [Capture](revision/full-1920x1080.png) |
| 844×390 | [Capture](revision/full-844x390.png) |
| 800×1280 | [Capture](revision/full-800x1280.png) |
| 1280×800 | [Capture](revision/full-1280x800.png) |

Fresh [initial PR measurements](revision/before-measurements.json) and
[revised measurements](revision/measurements.json) cover all eight sizes in both
views, including control visibility and minimum button dimensions. Compact
dimensions are unchanged. The comparison uses the same production Chromium,
paused cup, seed, and document-top framing as the original captures.
