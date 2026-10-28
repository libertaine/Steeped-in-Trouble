# The Pocket Teacup — browser screenshots

Before: exact published `v0.10.0` source at `0e01123`.
After: 0.11.0 Milestone 1 development candidate, with Compact View on touch
devices and Full View on desktop. Images use CSS pixel dimensions.
Captures are from real Chromium rendering with emulated viewports, not native
Samsung hardware. Some encounters use test-prepared states to expose choices
and attack warnings; gameplay and reward behavior are checked separately.

| View | Before (0.10.0) | After (0.11.0 candidate) |
| --- | --- | --- |
| Phone portrait, 360 × 740 | [Before](before-phone.png) | [Compact](phone-portrait.png) |
| Phone landscape, 844 × 390 | [Before](before-landscape.png) | [Compact](phone-landscape.png) |
| Desktop, 1440 × 900 | [Before](before-desktop.png) | [Full](desktop-full.png) |

The active cup is enlarged uniformly, the HUD sits above the canvas, and
Pause / Menu and steering stay inside the viewport. Long explanations remain
in the Tea Break. The desktop keeps its sidebar.

| Additional examples | Screenshot |
| --- | --- |
| Phone portrait, 390 × 844 | [Gameplay](phone-390.png) |
| Tablet portrait, 800 × 1280 | [Gameplay](tablet-portrait.png) |
| Tablet landscape, 1280 × 800 | [Gameplay](tablet-landscape.png) |
| Revealed fortune | [Reading](fortune-reading.png) |
| Phone upgrade choice | [Offer](upgrade-offer.png) |
| Landscape upgrade choice | [Offer](upgrade-landscape.png) |
| Paused Tea Break | [Menu](pause-menu.png) |
| Phone Tea Run | [Runner](tea-run.png) |
| Landscape Tea Run | [Runner](tea-run-landscape.png) |
| Daily Grind health and pressure warning | [Boss](boss.png) |
| Hot Chocolate Havoc | [Bonus](chocolate.png) |

For automated coverage and the remaining hardware checks, see
[mobile browser testing](../../MOBILE_TESTING.md).
