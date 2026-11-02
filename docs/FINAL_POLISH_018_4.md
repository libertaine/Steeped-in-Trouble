# 018-4: final presentation and on-screen controls

Based on `main` at `44813bc506fed2ae2c9d31e73679a537b63ec10e` (merged
PR #40). Local/remote main matched, the working tree was clean, and the
Pages deployment for that commit succeeded. Application version stays 0.17.1.

Tea Break → Controls & Settings now has **On-screen controls: Auto / Show /
Hide**. Auto follows the primary coarse pointer, not screen width, secondary
touch capability, or a user-agent string. A primary fine pointer wins on a
touchscreen laptop. If pointer queries are unavailable/unrecognized, touch
capability is the fallback; manual choices remain available. Primary-pointer
changes update Auto during the visit.

The preference has its own local-storage key,
`steeped-in-trouble:onscreen-controls`. Invalid or unavailable storage falls
back to Auto. View, Easy/Classic Touch, Auto Steam, old control preferences,
and pot/checkpoint schemas stay independent. Startup applies visibility in
the same synchronous boot as the other presentation preferences, behind the
existing title screen.

Hidden gameplay buttons are removed from layout and made inert. The existing
grid loses its 190px rail; Pause/Menu moves beside View in the header, with a
44px minimum target. The duplicate gameplay pause action is omitted while
actively playing with hidden buttons. Reading/upgrade/optional adventure
choices, starts, resumes and result actions remain available. Showing buttons
restores the existing mode-specific rail/layout. Resets release held input,
gestures and actual pointer capture before controls disappear. Settings do not
close Tea Break or resume a previously paused game.

Keyboard shortcuts stay available in every visibility choice. Hide on a
touch-only device is honored: steering and adventure actions need a keyboard.
Existing Easy Touch cup gestures still work, and Easy Touch still enforces
Auto Steam. Both onboarding and Tea Break explain the effective visibility.

## Measured presentation

See the [review images and measurements](images/final-polish/README.md).
At 800×600 the stage grows from 592px to 782px wide; the height-limited canvas
retains its size and recenters. At 1024×1000 the width-limited canvas grows
from 780px to about 916px wide (about 38% more area), with the same 920:790
aspect ratio. This is layout recovery, not a change to simulation coordinates.
The reading design, resource artwork, and existing color system are retained.

## Verification

- `npm run check`: lint, 884 unit tests, production build passed.
- Final Chromium/mobile Chromium focused run: **78 passed**. Additional
  Chromium onboarding fit/summary checks: **7 passed**. Existing fast smoke:
  **33 passed**, with a clean exit against the production preview via
  `BASE_URL`. These are separate, overlapping suites, not an additive total.
  The first self-managed-server smoke invocation reported all tests passing
  but stalled during teardown and was interrupted; the clean rerun changed
  no test selection or CI configuration.
- Targeted browser checks cover Auto/Show/Hide, both Views at the eight
  reference sizes, preference reloads, older preferences, unavailable storage,
  mixed pointers, capture release/focus, keyboard-only play, and real emulated
  touch steering, double tap and long press. Representative special modes
  include Hot Chocolate Havoc, The Daily Grind, Tea Run, Daily Pour,
  Biscuit Breakout and Crossing the Street.
- Existing viewport, reading/Tea Break and Easy Touch suites are included in
  the focused run. The visible-controls viewport suite now explicitly selects
  Show on desktop instead of dispatching input to hidden buttons. Smoke uses
  Pause/Menu for the desktop pause action. Onboarding assertions describe the
  new effective control state. No exclusions or weaker geometry assertions.
- Accessibility checks exercise the native labeled select, keyboard tab order,
  visible focus, hidden/inert controls, modal Escape, Tea Break/control-review
  focus restoration, reduced-motion mode, 200% text enlargement with scrolling,
  and unchanged current/pending fortune and concealed-Lie reading boundaries.

Physical phones/tablets, real hybrid hardware, screen-reader listening,
actual browser zoom, and full cross-platform/browser release qualification
remain release-candidate checks. Emulated touch and text enlargement do not
constitute those qualifications. No CI workflow, gameplay, save format or
version change is included. Stop at independent PR review; no merge, tag or
release is authorized here.
