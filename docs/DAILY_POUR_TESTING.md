# The Daily Pour — Milestone 1 playtesting

0.12.0 is in development. The published release is still 0.11.0.

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
- Use Desktop Full and Compact Views, phone portrait/landscape and tablet
  portrait/landscape. No new mobile layout is introduced. Check sound on
  and off, target clarity, button reach and clipping on real devices.

## Automated coverage and screenshots

The unit suite covers route seeds, target validity, aim, fixed trajectories,
arrival timing, cooldown, limited papers, misses, non-subscribers, dog/window
gags, poor/success/perfect results, one-time settlement, 30/60/144 Hz parity,
eligibility, priorities, postponement, no backlog, skipping, restart, pause,
and private random streams. Existing progression, boss, fortune, upgrade,
Tea Shortage, runner reward and aerial-encounter tests remain in the suite.

Browser coverage includes the real offer and return, perfect-route input,
keyboard repeat, exclusive keys, Tea Break/backgrounding, touch cancellation,
and phone/tablet controls. Screenshots are generated in
[`docs/images/daily-pour`](images/daily-pour/README.md) for introduction,
riding, delivery, miss, angry neighbor, result, Compact/Full View, the four
mobile/tablet viewports and aerial coffee-cup clearance.

Automated browser emulation does not establish physical phone/tablet
behavior or how enjoyable the route is. Human playtesting remains the
release gate; delivery timing and encounter frequency are provisional.

## Local results — 2026-10-28

Windows, Node 24.22.1:

- `npm ci`: final package/lockfile installed successfully in
  `tmp/daily-pour-dependencies` (116 packages). The original dependency tree
  contained a locked native binding; its existing processes were preserved
  and missing files restored from the identical clean dependency installation.
- `npm run check`: lint, **521 unit tests in 29 files**, and production build
  passed in the original workspace. No dependency versions changed.
- Complete production browser suite: **118 passed**, no retries or skips —
  34 Chromium, 34 Firefox, 50 mobile Chromium. Used a fresh build/server on
  port 4282 with three workers and `tmp/daily-pour-qualified-results`.
- After final screenshot inspection, the paper buttons were stacked within
  the existing short-landscape thumb rail to fit the AIM label. Lint and a
  fresh build passed; the **five focused mobile tests passed** with a new
  text-fit assertion. These overlap the 118-test suite and are not additional
  unique tests. Final phone/tablet screenshots were regenerated and inspected.
- Firefox's restricted-sandbox startup crash was resolved by launching the
  browser suite outside that process sandbox.
- The Vite-only launcher reproduced seed 42, changed the route for seed 7,
  and exercised a real delivery and sound on/off without browser errors.
- Source review and the [screenshot gallery](images/daily-pour/README.md)
  cover the requested scenes. Main and the peeled v0.11.0 tag still target
  `1435d6e973673ed1ae42fcb5316cdc371a29f387`; published release notes are unchanged.

GitHub CI status is recorded on the draft PR. Human timing/frequency tuning,
subjective sound/play quality and physical device testing remain open.
