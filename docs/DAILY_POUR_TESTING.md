# The Daily Pour — developer testing

The Daily Pour shipped in 0.12.0. This guide keeps the developer checks,
direct practice launcher and deterministic replay for future changes.

Use Node 24 LTS (22.12+ also works):

```powershell
npm ci
npm run check
npm run test:browser
```

Playwright builds production and starts a new server; an occupied default
port fails instead of reusing an old preview. Set `$env:PLAYWRIGHT_PORT`
to choose another port. Keep `BASE_URL` unset for local qualification.
The existing Chromium, Firefox and mobile Chromium projects all run.
For just this feature:

```powershell
npm run test:browser -- dailyPour.spec.js mobile-daily-pour.spec.js --workers=3
```

## Direct practice and replay

Start `npm run dev`, then open
`http://localhost:5173/Steeped-in-Trouble/?debug&arcade=dailyPour&seed=42`.
The normal route mechanics start in the introduction. In the console:

```js
__TEACUP__.launchDailyPour();   // fresh practice pot, same course again
__TEACUP__.launchDailyPour(7);  // a different deterministic course
```

The helper exists only in Vite development with `?debug`. Production
removes it, and there is no player-facing cheat menu. Production browser
tests reach the offer by finishing a real round-12 cup through a real
dart collision, then advance simulation with timed real input listeners.
They never award deliveries by changing result counters. The coffee-cup
browser fixture supplies one obstacle and uses real seeded aerial impulses.

## What to play

- Play into Chapter 2. Look for EXTRA! EXTRA! after round 12, or a later
  reading when an existing encounter has priority. Check the next offer
  after another 14 normal rounds. The store still returns at 9/16/23/30/37.
- Skip with NO THANKS (mouse, touch or keyboard 2). Cups, score, cash,
  upgrades and the waiting fortune must carry into the next normal cup.
- Accept with DELIVER PAPERS (or 1), then Enter or Ring bell & ride.
  Aim Up for porches, Down for mailboxes, Space to throw; on touch use
  AIM and THROW. Match the marked subscriber to the landing ring.
- Try early, late and wrong-depth throws. Targets should be readable,
  the first two should be forgiving, and well-timed hits should feel earned.
  Hold Space: auto-repeat must not consume the whole bag. Check a dog
  interception or non-subscriber window without losing cups or Tea Cash.
- Finish poorly, reach five deliveries, and try a perfect seven with no
  wasted throws. Expect 25 points per delivery, 5 Tea Cash for five or
  more, and 50 extra points for perfection. No tea restock is awarded.
- Pause with P and Tea Break during a flight, background the tab, and
  resume. The route and pending result must freeze; resuming must not
  throw. Leave the result, check the next cup/fortune/upgrade, and check
  that rewards cannot be paid a second time.
- In the Tea Run, slide under coffee as usual, then try a successful
  double jump over it. The body ends at 118 units; the rope is decorative.
  First-jump physics and the 70% aerial chance are unchanged. Check bird,
  power-line and orbital encounters as in the Flying Spoon testing guide.
- Ride past the pedestrian between houses No. 20 and No. 22 (about 54%
  of the route). A question mark appears, they turn and point, and the
  bubble reads "Is that a spoon riding a bicycle? I didn't think they had
  legs." for three route seconds while the spoon rides on. No input is
  needed and sound is irrelevant. Pause mid-sentence: the bubble and
  animation freeze. A paper thrown at them is an ordinary sidewalk miss.
  The remark is derived from the route clock (`pedestrianRemark()`); jump
  to it in development by riding the route, or advance the simulation to
  `CONFIG.dailyPour.pedestrian.x / speed - notice` as the browser tests do.
- Use Desktop Full and Compact Views, phone portrait/landscape and tablet
  portrait/landscape. No new mobile layout is introduced. Check sound on
  and off, target clarity, button reach and clipping on real devices.

## Automated coverage and screenshots

The unit suite covers route seeds, target validity, aim, fixed trajectories,
arrival timing, cooldown, limited papers, misses, non-subscribers, dog/window
gags, poor/success/perfect results, one-time settlement, 30/60/144 Hz parity,
eligibility, priorities, postponement, no backlog, skipping, restart, pause,
and private random streams. Pedestrian tests check the fixed position against
200 seeds, the exact line, one three-second remark before the spoon passes,
silence in the introduction and result, freezing without simulation time,
papers at the pedestrian resolving as ordinary misses, and unchanged seeded
routes, events and perfect-route rewards.

Browser coverage includes the real offer and return, perfect-route input,
keyboard repeat, exclusive keys, Tea Break/backgrounding, touch cancellation,
and phone/tablet controls. Pedestrian tests read drawn canvas pixels to
confirm the bubble appears and is dismissed, pause mid-remark (state and
pixels unchanged), background the page for longer than the remark lasts,
and check that no paper, delivery or miss changes. Screenshots are generated
in [`docs/images/daily-pour`](images/daily-pour/README.md).

## Release qualification — 2026-10-28

Windows, Node 24.22.1, from a fresh copy of the release candidate:

- `npm ci`: clean installation, 116 packages, 0 vulnerabilities. (Other
  local processes held the workspace's native Vite binding, so the clean
  install ran in a fresh copy; the workspace was restored from it and the
  binding verified byte-identical. No dependency versions changed.)
- `npm run check`: lint, **527 unit tests in 29 files**, production build.
- `npm run test:browser`: fresh production build and server, **124 passed**
  — 36 Chromium, 36 Firefox, 52 mobile Chromium — no failures or retries.
- Pedestrian screenshots inspected at Desktop Full and Compact, phone
  portrait and tablet landscape; all regenerated captures re-inspected.

Automated browser emulation does not establish physical device behavior.
The project owner's playtest approved the route and Tea Run fix for 0.12.0.
