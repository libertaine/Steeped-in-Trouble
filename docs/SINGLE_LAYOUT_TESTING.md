# Single-layout consolidation

Baseline: published `v0.21.0` (`9a9187d8d52ec089353732fe563754153c30e34b`).
The feature branch starts at clean `main`, `0488875faddf4f4320e21f6171ce804f842a709c`,
whose source tree matches that tag. Package and save-schema versions stay unchanged.

## Presentation changes

The former Compact layout is permanent. Header and Tea Break view switches,
view event handlers, preference loading/writing, Full-only CSS, and the Full
View height observer are removed. The cup uses the same presentation camera
as Compact; canvas-width adaptations in side adventures are retained.
The permanent `game-ui` app class preserves the original CSS selector priority
between phase visibility, touch schemes, and responsive card sizing. It is
never toggled and carries no view preference.
Offer placement always uses `#phaseChoices`. Reference panels still move into
Tea Break when opened and return to the hidden sidebar when closed.

The retired `steeped-in-trouble:view` key is deliberately left inert. It is
never read or written; no save migration or schema change is needed. Existing
`?view=full` and `?view=compact` links load the sole layout normally.
Touch scheme, Auto Steam, and on-screen Auto/Show/Hide settings keep their
existing independent behavior. Gameplay, persistence, audio, analytics, and
progression implementations are unchanged.

## Test accounting

Counts are collected using `npx playwright test --list --reporter=json` on
the baseline and candidate, before running the suites. These are project
executions, not unique source declarations.

| Suite | Before | After | Change |
| --- | ---: | ---: | ---: |
| Chromium | 261 | 254 | -7 |
| Firefox | 261 | 254 | -7 |
| Mobile Chromium | 186 | 178 | -8 |
| Total browser executions per OS | 708 | 686 | -22 |
| Unit tests | 1,338 | 1,333 | -5 |
| Unit files | 59 | 59 | 0 |

Deliberately removed duplicate browser executions:

- Arena/controls/side-adventure viewport matrix: 24 (eight sizes × three projects).
- Numbered choice hints: nine (three sizes × three projects).
- Field guide: 15 (four viewport cases and enlarged text × three projects).
- Resource use/catches/spills/repairs: three (one per project).
- Easy/Classic Touch crossed with the redundant presentation: two mobile cases.

That removes 53 duplicate executions while preserving each distinct viewport,
input method, phase, and assertion. Two desktop Tea Break dismissal executions
that specifically switched the retired view are also retired; click, Enter,
Escape, and controls-review focus/input isolation paths remain. Thirty new
legacy URL/storage executions are added (ten per project), for a net reduction
of 22 after adding three phase-priority executions (one per project). Those
check that Day choices hide both touch schemes with Show, in portrait and
landscape, and restore the appropriate pads after choosing the next Day.
The legacy cases cover all combinations of absent/Full/Compact URLs with
Full/Compact/corrupt stored values, reload, pause/resume, control preference
independence, and denied view-key access without reading or writing that key.

Five unit executions for obsolete view defaults, restoration, URL overrides,
and writes are retired. The four touch-capability cases remain in
`touchCapabilities.test.js`. No supported gameplay or UI behavior coverage is
deliberately removed. Full View's old minimum-width assertion is retired with
that mode; positive canvas visibility, containment, aspect ratio, DPR backing
size, target size, and overlap assertions remain. The control Hide test measures
the 190px rail at 610×600 and reclaimed vertical space at 1024×1000, matching
the retained responsive layout instead of Full View's tall-window rail.

## Remaining coverage

The arena matrix retains 375×667, 800×600, 1280×720, 1366×768, 1920×1080,
844×390, 800×1280, and 1280×800. Classic controls retain separate desktop
cases; Easy Touch retains all eight sizes. Each matrix case also changes
window height by 40px, rotates width/height, and checks simulation continuity.
Initial viewport sizes are browser-context options, avoiding blank-page
Firefox resize stalls while preserving all in-game resize assertions.
Tea Run, Daily Pour, Biscuit Breakout, Crossing the Street, and boss presentation
remain covered. Desktop Auto, manual Show/Hide, primary-pointer changes, held
pointer release/capture, and keyboard navigation remain distinct checks.

Mobile layout tests additionally retain 360×740, 390×844, and 1440×900;
the guide and Tea Break stress tests retain 320×568. Existing 915×412 and
1180×820 reading/adventure cases remain. Required choices, upgrades, Tea
Shortage, reading ceremony, Tea Tray, The Leaves Lie, pause ownership,
backgrounding, focus traps/return, enlarged text, reduced motion, instructions,
settings, and orientation/DPR changes remain exercised.

The field guide still runs system and Georgia-free fallback font tests on
desktop and phone. The full regression workflow runs the complete Chromium,
Firefox, and mobile Chromium suite on both Windows and Ubuntu, using their
native platform fonts. This is browser emulation, not physical-device testing.

## Qualification and visual review

Run `npm run check`, then the focused browser set and full browser suite.
For hosted qualification, use the existing **Full regression** workflow on
the exact PR head SHA (or add the `full-regression` label). The draft PR records
the final tested SHA, results, workflow URLs, and any retries or limitations.
This task does not authorize merging or publication.

The comparison uses a separately built, preserved `v0.21.0` Compact preview
against the candidate: Chromium and Firefox, nine sizes including 320×568,
Auto controls explicitly Show/Hide, and system/Georgia-free fallback fonts.
It measures gameplay, revealed reading/upgrades, Day choices, and Tea Shortage
geometry and captures
representative portrait, desktop, and short-landscape compositions. Raw local
evidence is under ignored `tmp/single-presentation/`.

Removing the view button reclaims its header width. On narrow screens with
shown touch controls, the header is 3.5px shorter and gives that height back
to the stage. The existing reading scrolling and pinned-choice behavior is
preserved. Historical screenshot galleries and published release artifacts
are retained; historical Full/Compact assessments are marked as such.
