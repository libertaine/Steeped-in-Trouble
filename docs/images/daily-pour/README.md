# The Daily Pour screenshots

Production-build captures from the Milestone 1 browser tests. Opened and
inspected for text readability, target/collision alignment, clipping,
control placement and layout at desktop, phone and tablet sizes.
Screenshots use CSS-pixel scale; browser emulation is not hardware testing.

| Scene | Capture |
| --- | --- |
| Short introduction | [Introduction](introduction.png) |
| Spoon riding; successful delivery | [Delivery](successful-delivery.png) |
| Miss and sidewalk feedback | [Miss](missed-delivery.png) |
| Wrong window and angry neighbor | [Neighbor](angry-neighbor.png) |
| Poor-route result | [Result](result.png) |
| Desktop Full View, 1440 × 1080 viewport | [Full](desktop-full.png) |
| Desktop Compact View, 1280 × 720 | [Compact](desktop-compact.png) |
| Phone portrait, 393 × 851 | [Intro](phone-portrait-intro.png), [Play](phone-portrait.png) |
| Phone landscape, 851 × 393 | [Intro](phone-landscape-intro.png), [Play](phone-landscape.png) |
| Tablet portrait, 820 × 1180 | [Intro](tablet-portrait-intro.png), [Play](tablet-portrait.png) |
| Tablet landscape, 1180 × 820 | [Intro](tablet-landscape-intro.png), [Play](tablet-landscape.png) |
| Tea Run: actual successful aerial impulse above coffee | [Clearance](coffee-cup-clearance.png) |

The tests use seed 42, including the Tea Run's actual successful 70%-chance
airborne roll. The coffee screenshot is paused during clearance; the test
resumes and checks that the spoon passes the rest of the body without a hit.
Newspaper captures use real flight resolution, not renderer-only scenes.

Inspection caught a dog caption overlapping the non-subscriber sign; it
was moved below the dog. Subscriber target outlines now display the actual
collision width, including the more forgiving first two deliveries.
The short-landscape paper buttons use a vertical stack in the existing
thumb rail so the AIM label fits; a browser assertion checks text overflow.
