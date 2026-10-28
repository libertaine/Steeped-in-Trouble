# Pocket Teacup browser testing

Run `npm ci`, `npm run check`, and `npm run test:browser`. Playwright runs
desktop Chromium, Firefox, and mobile Chromium against the production build.
Use `PLAYWRIGHT_PORT` for a free HTTP port when another preview is running.
Set `CI=1` to disable server reuse and guarantee a fresh build is served.
Do not run two suites into the same output directory simultaneously.

`mobile-compact.spec.js` checks 360 × 740, 390 × 844, 800 × 1280, 1280 × 800,
844 × 390, and 1440 × 900: overflow, visible controls, canvas proportions,
HUD separation, reading, upgrade choice, and next cup. It also covers explicit
view/control combinations, coarse and mixed pointers, a touch-capable
desktop-style viewport, saved preferences, modal keyboard isolation and focus,
pause ownership, settings, fortunes, rewards, rotation, DPR scaling, both
graphics modes, boss/bonus encounters, and portrait/landscape Tea Run.
Existing gesture and gameplay tests retain double-tap milk, long-press sugar,
continuous steering, pointer cancellation, boss/bonus order, and runner results.
The earlier tea-pill regression explicitly selects Full View, which retains
that detailed pill; Compact moves that explanation into the Tea Break.

Screenshots saved in Playwright's test output cover gameplay at each size,
the reveal, upgrades, the Tea Break, Tea Run, and desktop Full View. Inspect
the actual composition as well as DOM geometry. Representative captures are
in the [screenshot gallery](images/pocket-teacup/README.md).

For real-device follow-up, use Easy and Classic Touch in both orientations:
hold both steering pads, double-tap milk, hold for sugar, hold Jump/Slide,
cancel a pointer, pause mid-gesture, background and restore the page, and
complete readings, upgrades, Buy/Run/Skip, bonus, boss, and game-over flows.
Repeat with Chrome's Desktop Site enabled and with browser toolbars expanding
and collapsing. Check large text, pinch zoom outside the play surface, safe
areas, focus visibility, and the bottom actions above system navigation.

Browser emulation cannot qualify Samsung firmware, Chrome callouts, hardware
touch arbitration, system edge gestures, or browser toolbar/safe-area behavior.
The application cannot force Chrome out of Desktop Site, lock orientation,
or guarantee the browser will deliver every held pointer. Pointer cancellation
releases controls; gameplay touch handling stays scoped to the play surface.
No native Samsung tablet qualification is claimed.

## Milestone 1 local results — 2026-10-28

Windows, Node 24.22.1:

- `npm ci`: passed with the final 0.11.0 package and lockfile in a clean
  isolated directory. Existing preview processes held a native module in
  the original dependency directory; those previews were left running.
- `npm run check`: lint and production build passed; **466 unit tests in
  25 files passed**.
- Complete `npm run test:browser`: **87 passed** — 24 Chromium, 24 Firefox,
  and 39 mobile Chromium. A fresh production server was used with `CI=1`
  and `PLAYWRIGHT_PORT=5212`.
- After the final Hot Chocolate hint correction, the complete mobile
  project was rerun on a fresh server: **39 passed**. This rerun overlaps
  the 87-test suite and is not an additional 39 unique tests.
- Screenshots inspected at all six target sizes, including reading,
  upgrades, the Tea Break, runner, boss warnings, bonus round, and Full View.

That was the Milestone 1 handoff. Milestone 2 extends the runner; its
[spoiler testing guide](FLYING_SPOON_TESTING.md) records the additional
mechanics, rarity experiment and qualification. On 2026-10-28, the project
owner approved the combined 0.11.0 release after playtesting. Individual
hardware configurations were not recorded; the automated evidence above
remains browser emulation.
