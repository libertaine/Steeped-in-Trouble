# Biscuit Breakout and Karma screenshots

Production-build captures from the 0.13.0 browser tests (seed 42), opened
and inspected for legibility, clipping, control placement and whether the
speech bubble or overlays cover the cube or the spoon. CSS-pixel scale;
browser emulation is not hardware testing.

| Scene | Capture |
| --- | --- |
| The offer | [Offer](offer.png) |
| Introduction | [Introduction](introduction.png) |
| Biscuit wall and spoon | [Wall](wall-and-spoon.png) |
| Sugar cube in motion | [Cube](cube-in-motion.png) |
| Biscuits crumbling | [Crumbs](biscuit-destruction.png) |
| The talking biscuit | [Full](talking-biscuit.png), [Phone](talking-biscuit-phone-portrait.png), [Tablet](talking-biscuit-tablet-landscape.png) |
| Successful result | [Success](result-success.png) |
| Failed result | [Failure](result-failure.png) |
| Desktop Full View, 1440 × 1080 | [Full](desktop-full.png) |
| Desktop Compact View, 1280 × 800 | [Compact](desktop-compact.png) |
| Phone portrait, 393 × 851 | [Intro](phone-portrait-intro.png), [Play](phone-portrait.png) |
| Phone landscape, 851 × 393 | [Intro](phone-landscape-intro.png), [Play](phone-landscape.png) |
| Tablet portrait, 820 × 1180 | [Intro](tablet-portrait-intro.png), [Play](tablet-portrait.png) |
| Tablet landscape, 1180 × 820 | [Intro](tablet-landscape-intro.png), [Play](tablet-landscape.png) |
| Karma revealed | [Reveal](karma-reveal.png) |
| Karma: leaves bouncing off the rim | [Bounce](karma-bounce.png) |
| Karma: leaves vanishing | [Vanish](karma-vanish.png) |

Inspection changes made before release candidate:

- The canvas first repeated the time, biscuit count and cubes in a header
  that the HUD pills overlap in Full View. It now draws only a slim time bar
  there; the pills carry the numbers.
- The status pill showed `1s` on a timed-out result; it now reads CRUMBS
  COUNTED.
- In short landscape layouts the LAUNCH label overflowed the thumb rail.
  LAUNCH now takes the full rail width above ◀ / ▶; a browser assertion
  checks text overflow on all four mobile viewports.
- On phones the talking biscuit's bubble was small. On small canvases it
  now uses larger type over two lines, still above the tray.
- Simultaneous first bounces could replace Karma's one-time explanation
  with a shorter remark; remarks now wait their turn.
- The bubble no longer stays up over the result card.
