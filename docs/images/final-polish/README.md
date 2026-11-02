# 018-4 review images

Production-build screenshots in headless Chromium. Gameplay uses seed 42;
the frame clock is frozen for a consistent presentation. Reading uses real
simulated collisions for settled leaves, then pins its fortune, time and
upgrade offer, as in the 018-3 presentation scenarios. These are presentation
evidence, not naturally played encounters or physical-device qualification.

| Image | Scenario |
| --- | --- |
| [Desktop before](desktop-before.png) | Actual unmodified baseline `44813bc`, 800×600, Full View, Classic buttons |
| [Desktop Auto](desktop-auto.png) | Same viewport/seed/clock, buttons hidden, menu beside View |
| [Desktop Show](desktop-show.png) | Existing controls restored, 800×600 |
| [Arena Show](arena-show.png) | Width-constrained 1024×1000 comparison, existing 190px rail |
| [Arena Hide](arena-hide.png) | Same viewport/seed/clock with the rail removed |
| [Mobile Auto](mobile-auto.png) | 375×667, Pixel 7 emulation, Compact View, Easy Touch |
| [Reading and upgrades](reading.png) | 1280×720, completed cup, next fortune and both choices |
| [Tea Break](tea-break.png) | Controls & Settings, Auto selected with visible focus |

[Raw measurements](measurements.json) retain CSS-pixel geometry. At 800×600
stage width increases 592 → 782px, recovering the full 190px rail (32% more
width); the canvas remains height-limited at about 523×449px and recenters.
At 1024×1000 stage width increases 780 → 970px, while the canvas grows from
780×670px to about 916×786px (17% wider, 38% more canvas area). The original
920:790 aspect ratio is retained. Show restores the prior layout rather than
leaving an empty column when buttons are hidden.

The original 018-3 images remain separate and unchanged. Manual screen-reader
listening, real browser zoom and physical-device checks remain outstanding.
