# The Arcade Collection — 0.16.0 testing

**THE SPOON'S OTHER JOBS**

*Apparently, defending a teacup doesn't pay enough.*

The project owner approved publication of **0.16.0 — The Arcade Collection**
after initial human playtesting: **no errors observed; proceed with release**.
Approved gameplay, physics, timing, scoring, difficulty and save behavior
remain unchanged during release finalization. This approval does not claim
comprehensive human coverage or physical-device qualification.

## Release qualification

The previously qualified implementation at `d9262919f2fea3b76aebf4c33b89b03fbc4dcb51`
passed 779 unit tests, 195 browser tests, the production build, and Windows,
Ubuntu and browser CI. Final documentation-only local qualification on
2026-10-30 used Node 24.22.1, a clean dependency installation and fresh
production builds:

| Check | Result |
| --- | --- |
| `npm ci` | Passed; 0 vulnerabilities reported |
| `npm run check` | Lint passed; 779 unit tests in 38 files passed; production build passed |
| `npm run test:browser -- --workers=6` | 195 passed, no retries: 60 Chromium, 60 Firefox, 75 mobile Chromium |
| Save determinism | Uninterrupted/restored play through round 40 passed from rounds 1 and 31 under both Day choices, including subsequent encounters |

The first install hit a native Rolldown binding held by this project's old
Vite server; only that server was stopped before the successful clean install.
An initial sandboxed browser run recorded 60 Firefox blank-page creation
crashes (`browserContext.newPage: Target crashed`) and one mobile double-tap
assertion failure, then stalled during cleanup. Its logs and traces were
retained. A single Firefox probe reproduced the crash inside the sandbox and
passed outside it. The full unchanged suite then passed outside the sandbox
with six workers and a fresh preview on port 4186, including the double-tap
test. No gameplay changes, test weakening, exclusions or retries were used.
Automated screenshots were regenerated during testing; approved documentation
images were preserved byte-for-byte.

Final-head CI and deployment results are linked from PR #28 and the release.
Physical phone/tablet testing and comprehensive human coverage are not claimed.

## Playing the collection

Choose **THE SPOON'S OTHER JOBS** on the initial screen, game-over screen,
or Tea Break. All four cards are available immediately. Each uses the real
adventure engine and unchanged controls. You can scroll the collection on
small screens, tab to a Play button and press Enter, or tap/click it.

- **The Tea Run:** jump with Space/Up, slide with Down, or use Jump/Slide.
  “The tea shop is closing. The spoon has forgotten how walking works.”
- **The Daily Pour:** Up/Down change delivery aim, Space throws; touch uses
  Aim/Throw. “Deliver the news. Try not to become it.”
- **Biscuit Breakout:** Left/Right or A/D steer, Space launches; touch uses
  the steering pads and Launch. “The biscuits have formed a wall.
  Negotiations have failed.”
- **Crossing the Street:** arrows/WASD or the arrow pad hop the spoon.
  “Why did the spoon cross the road? Nobody knows. But apparently, it's our
  problem now.”

P pauses/resumes. Tea Break still offers Full/Compact View, Easy/Classic
Touch, graphics and sound settings. Existing reduced-motion behavior remains.
An active main pot waits in memory while practicing. Practice owns a separate
state and all its own random streams: its points, currency and restocks
cannot affect your teacup, resources, upgrades, fortune, chapter, Day/Heat
or future adventure schedule.

After the ordinary success/failure/perfect message, **Play Again** starts a
new seed; **Retry This One** starts the same seed and initial conditions.
Inputs and timing still determine the outcome. **Choose Another Job** opens
the cards. **Back to the Teacup** restores the suspended pot. Unfinished
attempts are discarded. There are no recordings or ghost runs.

## Records and personal bests

Records update only on actual settlement, once per practice instance. They
persist completed attempts, wins, best final points and last-played UTC time.
Daily Pour, Biscuit Breakout and Crossing also count their existing perfect
results; Tea Run has no invented perfect condition. Normal encounters do not
update collection records.

Best score is the adventure summary's `points`, including its normal bonuses,
not accumulated main-pot score. Tea Run uses coin/packet points; Daily Pour
uses delivered-paper points plus its existing perfect bonus; Biscuit Breakout
uses broken-biscuit points plus its clear bonus; Crossing uses lane points,
shop bonus and its existing perfect bonus. A strictly higher settled score
shows **NEW PERSONAL BEST!** A tie, unfinished play or zero against an empty
zero baseline does not. Even a failed run can improve a points record.

## Continue Your Pot

One checkpoint is created automatically at the end of each **normal tea
round**, after the next fortune, upgrade offer, encounter decisions, Tea Cash,
secret results and rewards are final. It captures the complete logical state
and all eight seeded RNG cursors. Continue opens that round's reading and
repeats its pending upgrade/encounter/Day choices. It does not reconstruct a
similar round from a counter or silently choose upgrades.

The latest completed normal round is saved. Closing halfway through the
next cup, a boss, chocolate, Tea Run or an Arcade Interlude returns to the
last checkpoint. Opening practice leaves that checkpoint untouched. Closing
while practicing loses the practice attempt; its already-settled record, if
any, remains. Mid-round and mid-adventure saving are deliberately absent.

On a later visit, **CONTINUE YOUR POT** replaces the start button; **BREW A
NEW POT** asks before replacing the old checkpoint. Tea Break shows the saved
Day/round and offers **Clear saved pot**, also with confirmation. Clearing
does not abandon the active pot; a later normal-round completion saves again.
Game over removes continuation. None of these operations clear arcade records
or unrelated settings.

## Storage and compatibility

| Key | Current schema | Data |
| --- | --- | --- |
| `steeped-in-trouble:arcade-records` | `schemaVersion: 1` | Four bounded records keyed by `teaRun`, `dailyPour`, `biscuitBreakout`, `crossingStreet` |
| `steeped-in-trouble:pot-save` | `schemaVersion: 1` | Completed reading state, pinned tea setting, eight `{ seed, state }` RNG cursors |

Progress and arcade records are saved in this browser on this device.
Clearing browser data may erase them. Private sessions, different browsers,
origins and devices have separate storage. There are no cookies, accounts,
analytics, server, cloud sync, databases or storage consent popups.

Missing records start empty. Invalid JSON, unsupported versions, unknown IDs,
bad numeric fields and inconsistent checkpoints fail safely. A bad pot shows
that it could not be resumed and leaves New Pot and the collection available.
Arcade records are validated independently. Access/quota failures show a small
notice and leave gameplay available; arcade records remain in session memory.
A failed checkpoint write retains the previous checkpoint. A failed removal
is reported; the old disk checkpoint may still be offered next visit. A
confirmed new pot can still be played even when storage stops working.

No compatibility promise is made for future save formats. The explicit
`migrateCheckpoint()` entry point currently accepts version 1 only. Future
changes need an intentional migration or a clear unsupported-save message.
No unlimited attempt history or arbitrary saved browser objects are retained.

## Automated checks

Use Node 24 LTS (22.12+ supported):

```powershell
npm ci
npm run check
npm run test:browser
```

The browser suite builds production beneath `/Steeped-in-Trouble/`, then runs
Chromium, Firefox and mobile Chromium. Set `$env:PLAYWRIGHT_PORT` if 4173 is
occupied. Do not reuse an older server. Feature-only commands:

```powershell
npx vitest run tests/unit/collection.test.js tests/unit/localProgress.test.js tests/unit/potCheckpoint.test.js
npm run test:browser -- collection.spec.js mobile-collection.spec.js --workers=4
```

Unit coverage uses an injected fake Storage, never real browser storage.
It checks independent instances/RNGs, every practice settlement, Tea Run
restock isolation, shared interlude reward isolation, failures/timeouts,
same/new seeds, duplicate results, reloads, malformed records, read/write/quota
errors and clearing just the pot key. Checkpoint cases cover round 1, later
Chapter 2 readings, upgrades, fortunes, shortages, all pending interludes,
Day choices, later Heat changes, upgraded abilities and malformed state.

Determinism tests restore checkpoints from rounds 1 and 31, then compare
complete logical state and all RNG cursors against uninterrupted play through
round 40 under both Fresh Brew and Keep the Kettle On. They include actual
normal-round finishing collisions, spawning, combat, upgrade choices, boss,
chocolate, Tea Run and the three scheduled interludes. Fixtures accelerate
long encounters and create known outcomes; this verifies continuation, not
human difficulty or skill. Browser tests likewise use controlled fixtures
through real settlement, alongside real keyboard/pointer/touch input.

Browser coverage checks the production UI, all four jobs, record reloads,
exact suspended-pot state/RNGs, checkpoint reload/Continue, confirmation
cancel/accept, clearing saves, denied storage, invalid data, pause/resume,
input quarantine, missing development helpers and JavaScript/network errors.
The existing regression tests remain intact.

## Development-only helpers

Run `npm run dev` and visit
`http://localhost:5173/Steeped-in-Trouble/?debug&seed=42`.
These helpers are compiled out of the production build:

```js
__TEACUP__.openCollection();
__TEACUP__.launchPractice('teaRun', 42); // any of the four identifiers above
__TEACUP__.personalBest();             // from a practice intro: real known successful settlement
// Return to the main teacup before making a checkpoint:
__TEACUP__.createCheckpoint();         // finishes the current normal cup with a fixture collision
__TEACUP__.restoreCheckpoint();        // restores the locally saved checkpoint
__TEACUP__.saveSchema();               // 1
```

The fixtures write ordinary local records/checkpoints through production
paths; use a disposable browser profile if preserving personal play data.
A known result only announces a record when it actually improves the stored
best. The production collection and Continue work without these helpers.

## Human regression checklist

Initial project-owner playtesting is approved as recorded above. The checklist
below remains useful for future testing; it is not a claim that every item or
physical device has been tested.

1. Try each job from a fresh start without playing normal cups. Read its
   introduction, play naturally and verify the familiar movement, difficulty,
   humor and result. Include wins, losses, timeout and an abandoned attempt.
2. Retry the same seed and then a new layout. Confirm the first repeats the
   starting scenario and the second changes it. Check record ties, genuine
   improvement and persistence after reload.
3. Open Tea Break during a main pot, play several jobs and return. Confirm
   cups, score, Tea Cash, upgrades, fortune, position and progress wait exactly
   as left. Try holding Space/arrows and dragging a touch pad across an exit.
4. Finish normal cups, close during the next cup and continue. Check the
   reading/offer, next fortune, shortage, interlude and Day choice. Try both
   Day choices on later Days and a spoon with upgrades.
5. Cancel New Pot and Clear Saved Pot; verify the old save remains. Accept
   each and verify only the pot is removed. Lose a pot and confirm Continue
   disappears while arcade records remain.
6. Check keyboard Tab/Enter/Escape, mouse, Easy/Classic Touch, full/compact,
   phone portrait/landscape and a real tablet. Scroll to every card; check
   text wrapping, readable results and 44px minimum collection/exit targets.
7. Check sound, graphics quality, reduced motion, continuous steam, perfect
   shots, all fortunes/teas, Day progression and the ordinary encounter
   schedule. Emulation does not establish real-device usability.

Screenshots live in [images/arcade-collection](images/arcade-collection/README.md).
They are automated presentation fixtures, not evidence of human playtesting.
