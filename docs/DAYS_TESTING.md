# Another Day, Another Brew — 0.14.0 playtesting

0.14.0 is in development. **0.13.0 remains the published release.**
Human playtesting is the release gate; this branch must not be merged, tagged
or published as part of this handoff.

## Run the development branch

```powershell
git switch feat/days-difficulty-0.14.0
npm ci
npm run dev
```

Open `http://localhost:5173/Steeped-in-Trouble/?debug&day=end&seed=42`.
Use the URL printed by Vite if its port differs. Practice links work only on
the development server, not `npm run preview` or the published site.

| Query after `?debug&seed=42&` | Starting point |
| --- | --- |
| `day=near` | Last required leaf of cup 10; finish it yourself, then read and continue |
| `day=end` | Real tenth-cup completion and reading resolved, waiting at the Day choice |
| `day=fresh` | Cup 11 after the actual Fresh Brew choice: Heat 0, 16-leaf target |
| `day=keep` | Cup 11 after the actual Keep choice: Heat 10, 32-leaf target |
| `day=max` | Cup 41 after Keep: Heat 28 and all Heat components capped |

Append `&view=full` or `&view=compact`, `&touch=easy` or `&touch=classic`,
and optionally `&tea=house|herbal|earlGrey|chai|green|black` to compare teas.
The default practice checkpoint is in Chapter 2, with unrelated encounters
scheduled in the future. It finishes with real collision, reading, upgrade
and choice code. It is a checkpoint, not a replay of ten fully played cups.
For an exact seeded replay, **reload the same URL**; this resets every RNG.
On a running debug development page, `__TEACUP__.practiceDay('end')` (or any
mode above) prepares another checkpoint; it continues existing RNG streams.

## Human checks

1. Play a normal first Day without shortcuts. Check that the targets are
   16, 18, 20, 22, 24, 26, 28, 30, 32, 32 and the original opening pace feels
   familiar. Complete cup 10; finish its reading and any scheduled activity.
2. At **THE KETTLE HAS SURVIVED ANOTHER DAY**, wait and read. Enter, Space,
   pausing, backgrounding, and the Tea Break must not choose tomorrow.
   Press **1** or click/tap **FRESH BREW**. Look for **A FRESH START**;
   cup 11 starts with Heat 0 and 16 required leaves.
3. Reload `day=end&seed=42`, then press **2** or click/tap **KEEP THE KETTLE
   ON**. Look for **THE KETTLE STAYS ON**; cup 11 keeps a 32-leaf target,
   with slightly faster leaves and shorter arrival gaps. Rapid extra input
   must not skip a cup. The global round remains 11.
4. Try several Days: Fresh every time; Keep every time; Keep then Fresh;
   Fresh then Keep. Fresh should feel easier at the next Day's start while
   advanced teas and Chapter 2 stay available. Compare `day=max` with Fresh.
5. Check the next fortune, spoon upgrades, Tea Cash, score and remaining
   cups before and after a choice. The fortune must apply to the next normal
   cup. Karma must still bounce rim contacts, then puff returning leaves.
6. Keep playing through Tea Shortages, Tea Run, Hot Chocolate Havoc, The
   Daily Grind, Daily Pour and Biscuit Breakout. Scheduled activities come
   before the Day choice; returning from them must not skip it. Heat must
   not change side adventures. Defeating the milestone must still open Chapter 2.
7. Try keyboard, mouse and touch in Full and Compact View, phone portrait,
   phone landscape and tablet landscape. Read every line; check both buttons
   fit, the global cup remains visible, and normal controls return afterwards.
   Try Sound off/on and the OS reduced-motion preference.

Report comfort, clarity and pacing, especially whether Fresh feels like a
useful respite and Keep grows gradually enough. Neither choice should feel
like forfeiting progress. Real phone/tablet handling and perceived balance
remain human checks; browser emulation does not establish them.

## Automated checks

```powershell
npm ci
npm run check
npm run test:browser
```

Install test browsers with `npx playwright install chromium firefox` if needed.
The browser runner builds fresh production assets at the Pages base path.
Development practice code and `practiceDay` must be absent from `dist/assets`;
the existing read-only/debug state hook remains for browser tests.

`tests/unit/days.test.js` covers boundaries, one-time choices, progression
preservation, every encounter return at cups 10 and 20, milestone unlocks,
fatal spills, Karma, tuning and safe combinations of all teas/fortunes/chapters.
`tests/support/daySimulation.js` completes 60 normal rounds per policy through
real finishing collisions, readings, upgrades and encounter returns. Its
controlled finishing fixtures keep combat timing from confounding scheduler
comparisons. This checks deterministic progression, not autonomous survival.

`tests/browser/days.spec.js` and `mobile-days.spec.js` use final-cup checkpoints
and real finishing collisions on production code. They check input, repeated
choices, menus, backgrounding, pending Karma, a completed scheduled paper route,
the global cup and HUD, and card containment at the required screen sizes.

## Implemented values from deterministic simulation

Generated from seed 42 through `simulateDays()` (60 completed normal rounds).
Overall speed includes the actual chapter, tea and fortune; mean gap is before
the seeded 0.72–1.36 jitter and the final 0.45-second floor. Heat factors are
shown separately so content differences remain visible. See
[Game design](GAME_DESIGN.md#days-and-heat-0140-in-development) for exact formulas.

| Scenario | Global cup | Heat | Target | Heat speed | Heat interval | Tea / fortune | Overall speed | Mean gap (s) |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Day 1 | 1 | 0 | 16 | 1.0000 | 1.000 | house / none | 1.00000 | 1.00000 |
| Day 2 Fresh | 11 | 0 | 16 | 1.0000 | 1.000 | earlGrey / star | 1.15000 | 1.00000 |
| Day 2 Keep | 11 | 10 | 32 | 1.0125 | 0.992 | earlGrey / star | 1.16437 | 0.99200 |
| Day 3 Keep | 21 | 20 | 32 | 1.1375 | 0.912 | black / sugarRush | 1.30812 | 0.80256 |
| Day 3 reset | 21 | 0 | 16 | 1.0000 | 1.000 | black / sugarRush | 1.15000 | 0.88000 |
| Day 5 maximum | 41 | 28 | 32 | 1.2000 | 0.850 | green / golden | 1.51800 | 0.85000 |

## Screenshot review

Representative captures from the production browser tests, inspected for text
wrapping, clipping, reach and cup visibility:

| View / flow | Capture |
| --- | --- |
| Day 1 gameplay | [First cup](images/days/day-1-gameplay.png) |
| End of Day, desktop Full | [Day choice](images/days/desktop-full-transition.png) |
| Fresh Brew acknowledgement | [A fresh start](images/days/fresh-selection.png) |
| Keep acknowledgement | [The kettle stays on](images/days/keep-selection.png) |
| Day 2 Fresh Brew | [Heat 0, 16 leaves](images/days/day-2-fresh.png) |
| Day 2 Keep | [Heat 10, 32 leaves](images/days/day-2-keep.png) |
| Desktop Compact | [Day choice](images/days/desktop-compact-transition.png) |
| Phone portrait | [Day choice](images/days/phone-portrait-fresh-transition.png) |
| Tablet landscape | [Day choice](images/days/tablet-landscape-keep-transition.png), [next cup](images/days/tablet-landscape-keep-gameplay.png) |
| Short phone landscape | [Day choice](images/days/phone-landscape-keep-transition.png) |

Full View places the card higher in the cup so it is reachable in a 720px-high
desktop viewport. Compact View hides combat pads during the choice. Short
landscape gives the Day card more width than the ordinary control rail; this
keeps the title and both complete button descriptions on screen. Other mobile
flows retain their existing layout. These are emulated screens, not a claim of
physical-device testing.

## Qualification for this draft

- `npm ci`: passed with the locked dependency versions.
- `npm run check`: passed lint, 620 unit tests across 33 files, and production build.
- `npm run test:browser`: 155 passed, with no retries (45 Chromium, 45 Firefox,
  65 mobile Chromium), against a fresh production build.
- All five development practice modes loaded in a browser without errors;
  reloading seed 42 reproduced the same next tea and fortune. `practiceDay`
  and its preparation helper are absent from the production bundle.
- The representative screenshots linked above were inspected. Full View and
  short-landscape Day-card clipping found during development were corrected;
  final containment assertions pass.
- Remote `main` and `v0.13.0` still resolve to
  `ecee6e8731ccc284d5ca675d5b2d4559921630d8`. No release or tag was changed.

Early development runs exposed legacy test drivers waiting forever at the new
Day choice; those drivers now explicitly choose Keep, and tea comparisons
account for the independent Heat layer. Existing assertions and tests remain.
Firefox could not create a page inside the local sandbox; the successful full
run used normal browser process access. These initial failures are not counted
as passes. Human comfort, sustained high-Heat survival and physical touch-device
play remain unverified until playtesting.
