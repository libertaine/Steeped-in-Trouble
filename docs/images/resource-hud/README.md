# 018-2 before/after evidence

Baseline: `f149f93229e5d59c3b5bc360da072806e39ddcee` / merged 018-1.
Candidate: 018-2 visual resource HUD, version 0.17.1. Independently built
production assets, desktop Chromium, Classic Touch, seed 42. All scene captures
are Full View at the stated CSS viewport. The baseline and candidate use the
same deliberately constructed resource/leaf fixtures. After entering each
mode through the application, simulation updates stop for stable captures;
they are live-phase renders, without a pause overlay. Boss captures set two
scalds and a real pressure-warning structure. Adventures enter through the
existing practice collection. These are presentation evidence, not natural
playthroughs or balance results. No prototype renderer is involved.

| Scene | 1280×720 before / after | 375×667 before / after |
| --- | --- | --- |
| Ordinary resources | [Before](before-ordinary-1280x720.png) / [After](after-ordinary-1280x720.png) | [Before](before-ordinary-375x667.png) / [After](after-ordinary-375x667.png) |
| Depleted | [Before](before-depleted-1280x720.png) / [After](after-depleted-1280x720.png) | [Before](before-depleted-375x667.png) / [After](after-depleted-375x667.png) |
| Bonus sugar / reinforcement | [Before](before-bonus-1280x720.png) / [After](after-bonus-1280x720.png) | [Before](before-bonus-375x667.png) / [After](after-bonus-375x667.png) |
| Boss / scalds | [Before](before-grind-1280x720.png) / [After](after-grind-1280x720.png) | [Before](before-grind-375x667.png) / [After](after-grind-375x667.png) |
| Havoc | [Before](before-chocolate-1280x720.png) / [After](after-chocolate-1280x720.png) | [Before](before-chocolate-375x667.png) / [After](after-chocolate-375x667.png) |
| Tea Run | [Before](before-teaRun-1280x720.png) / [After](after-teaRun-1280x720.png) | [Before](before-teaRun-375x667.png) / [After](after-teaRun-375x667.png) |
| Daily Pour | [Before](before-dailyPour-1280x720.png) / [After](after-dailyPour-1280x720.png) | [Before](before-dailyPour-375x667.png) / [After](after-dailyPour-375x667.png) |
| Biscuit Breakout | [Before](before-biscuitBreakout-1280x720.png) / [After](after-biscuitBreakout-1280x720.png) | [Before](before-biscuitBreakout-375x667.png) / [After](after-biscuitBreakout-375x667.png) |
| Crossing the Street | [Before](before-crossingStreet-1280x720.png) / [After](after-crossingStreet-1280x720.png) | [Before](before-crossingStreet-375x667.png) / [After](after-crossingStreet-375x667.png) |

Priority desktop arena comparison, empty paused first cup:
[1920×1080 before](before-full-1920x1080.png) /
[after](after-full-1920x1080.png). Canvas width: 998.22 → 998.09 CSS pixels.

Raw data: [before viewport measurements](before-measurements.json),
[after viewport measurements](after-measurements.json),
[before scenes](before-scenarios.json), [after scenes](after-scenarios.json).
Viewport measurements cover all eight required sizes in Full and Compact View.
Further Compact/mode screenshots are retained in each browser test's output.

Reproduce with independent baseline/candidate preview servers:

```powershell
node tests/support/viewportComparison.js http://localhost:4188/Steeped-in-Trouble/ tmp/018-2/before
node tests/support/viewportComparison.js http://localhost:4187/Steeped-in-Trouble/ tmp/018-2/after
node tests/support/hudComparison.js http://localhost:4188/Steeped-in-Trouble/ tmp/018-2/scenes-before
node tests/support/hudComparison.js http://localhost:4187/Steeped-in-Trouble/ tmp/018-2/scenes-after
```

The linked [implementation notes](../../RESOURCE_HUD_018_2.md) record mappings,
qualification, short-landscape constraints and deferred 018-3 work.
