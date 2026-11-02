# 018-3 review images

These are deterministic presentation scenarios from the production build,
captured by `tests/browser/readingTeaBreak.js` in desktop Chromium. Leaves
come from real simulated collisions; the fortune and reading time are pinned
for review. They are not naturally played encounters or balance evidence.

- [Normal reading](normal-reading.png)
- [The Leaves Lie: false reveal](lie-false-reveal.png)
- [The Leaves Lie: final explanation](lie-final-reading.png)
- [Upgrade choices](upgrade-offer.png)
- [Four-section Tea Break](tea-break.png)

Normal offers retain 2.7-second eligibility. The Lie's upgrades and player
continuation wait until 4.1 seconds: the existing 3.4-second retraction plus
its existing 0.7-second glyph change. Reveal/retraction events and fortune
selection are unchanged. Choosing an upgrade still continues immediately.

On small screens, the explanation scrolls independently while both choices
and the cup stay visible. Physical-device and screen-reader listening checks,
long-text/zoom visual refinement, and comprehensive release qualification
remain for later review; no version or release change is included.
