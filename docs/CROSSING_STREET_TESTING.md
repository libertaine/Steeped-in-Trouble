# Crossing the Street — 0.15.0 testing

**0.15.0 — Crossing the Street** was approved for release by the project
owner on 2026-10-30 after playtesting: the game looks good. Gameplay,
traffic, scoring, movement timing and controls were frozen for
publication; only release documentation changed afterwards. Physical
phone/tablet playtesting has not been independently verified; the
screen-size evidence below uses browser emulation.

Crossing the Street is a third optional Arcade Interlude. This guide covers
the automated checks, the development-only shortcuts with deterministic
replay, and what to look for when playing.

Use Node 24 LTS (22.12+ also works):

```powershell
npm ci
npm run check
npm run test:browser
```

Playwright builds production and starts a new server; an occupied port
fails instead of reusing an old preview. Set `$env:PLAYWRIGHT_PORT` to
choose another port. Keep `BASE_URL` unset for local qualification. Just
this feature:

```powershell
npx vitest run tests/unit/crossingStreet.test.js tests/unit/crossingInterlude.test.js
npm run test:browser -- crossingStreet.spec.js mobile-crossing-street.spec.js --workers=4
```

## Shortcuts and replay (development only)

These are tools for developers, not player features: they work only on the
development server, not `npm run preview` or the published site. Start
`npm run dev`, then open one of:

| URL | What it does |
| --- | --- |
| `http://localhost:5173/Steeped-in-Trouble/?debug&arcade=crossingStreet&seed=42` | A fresh practice pot, straight into the crossing's introduction (round 27, Chapter 2), through the real offer. |
| `…?debug&arcade=crossingStreet&seed=42&crossing=late` | Already under way with 5 seconds left: for the timeout. |
| `…?debug&arcade=crossingStreet&seed=42&crossing=last` | One attempt left: the next bump ends it. |
| `…&view=compact&touch=easy` | Add to any of these for the phone layout and arrow pad. |

In the browser console:

```js
__TEACUP__.launchCrossingStreet();          // the same road again, in a fresh practice pot
__TEACUP__.launchCrossingStreet(7);         // a different deterministic road
__TEACUP__.launchCrossingStreet(7, 'late'); // ...with 5 seconds left ('last': one attempt left)
__TEACUP__.crossForMe();                    // once under way: a cautious, collision-free crossing from where the spoon stands
```

The same seed always builds the same road: lane characters and directions,
speeds, vehicles, spacing and paint. Traffic positions are a function of the
mission clock alone, in fixed 120 Hz steps, so the same presses at the same
moments replay exactly at any display rate, and a bump never reshuffles the
traffic. `crossForMe()` is useful for checking the success result, the
tea-shop exchange and the return; it declines while the spoon is mid-hop,
dazed or getting up.

These helpers exist only in Vite development with `?debug`. Production
removes them; there is no player-facing cheat menu, and a browser test
checks that `launchCrossingStreet` and `crossForMe` are absent from the
production build. Production browser tests reach the offer by finishing a
real round-27 cup with a real dart collision, hop with real key presses and
pad taps, and finish routes through the real collision checks.

## What to play

Try at least these, preferably on a keyboard and on a phone or tablet:

1. **The offer.** Reach it with the shortcut, or play to round 27 in
   Chapter 2. The card reads WHY DID THE SPOON CROSS THE ROAD? — *"Nobody
   knows. But apparently, it's our problem now."* Behind it, traffic moves
   and the spoon waits on the curb. **STAY RIGHT HERE** (or 2) should cost
   nothing: same cups, score, Tea Cash, spoon and fortune, next cup.
2. **The introduction.** **CROSS THE ROAD** (or 1). It starts by itself
   after about three seconds; Enter (or the main button) skips it. A tap on
   the pad or an arrow during it does nothing.
3. **Moving.** Arrows or WASD hop one square. Tap quickly and hold: one hop
   per tap, and a steady repeat while held. The spoon should never move by
   itself, never leave the street, and stop as soon as you let go.
4. **Reading the road.** Without explanation, can you tell which areas are
   safe (the sidewalks and the median), which way each lane runs, and the
   car, van and milk truck apart? Does the first crossing feel achievable
   within a few tries?
5. **A bump.** Walk into a vehicle. CLANK!, the spoon spins aside and lies
   dazed, then stands back on the curb, losing one attempt (the pills show
   `ATTEMPTS ● ● ○`). Traffic and clock carry on; the same pattern can be
   learnt. Lanes already crossed keep their points.
6. **The tea shop.** Reach the far sidewalk. The door opens, the
   shopkeeper speaks, the spoon replies, and the result follows: NOT A
   SCRATCH ON THE SILVER! without bumps (140 points, 5 Tea Cash), THE SPOON
   MADE IT! with them (100 points, 5 Tea Cash).
7. **Failure.** Three bumps, or 40 seconds (`crossing=late`): THE TRAFFIC
   HAS SPOKEN. Only lane points are kept; no cup is lost.
8. **Pause.** P, the main button, the Tea Break and switching tabs all
   freeze traffic, spoon, hop, daze and clock. Resuming must not hop.
9. **Back to the cup.** Leave the result with Enter while holding an arrow
   or Space: the spoon must not turn or fire until you press again. Then
   hold Space: steam must fire continuously, as before.
10. **A Day boundary.** Finish cup 30 (or 40) with the crossing due, play or
    skip it, and the Day choice should appear once afterwards and apply
    once.

Notes worth recording: the number of attempts needed for a first
crossing, whether any bump felt unfair (a visible gap, or too far from a
vehicle), whether the 150 ms repeat feels quick or slippery, and readability
on a phone.

## Automated coverage

`tests/unit/crossingStreet.test.js` (simulation, 37 tests): deterministic
roads; five lanes around a safe median; opposing directions and all three
vehicle types on every road; movement at each lane's speed; wrapping
out of sight within each loop; minimum spacing in time and distance; a
cautious crossing for 300 seeds from every sampled moment, an impossible
road refused and the gentle fallback; four-direction hops, hop timing and
interpolated hitbox, one hop per press, held repeat only after a press,
buffered presses, grid bounds; overlaps, visible gaps and touching edges,
row isolation, a 60 000 units/s vehicle that cannot tunnel, one attempt per
bump with no second bump while dazed, respawn, freeze and unchanged
traffic, the curb and median always safe; timeout, three-bump failure,
perfect and bumped successes on real roads through real collisions, lane
points once per lane, one settlement, the doorstep exchange; invalid and
huge time steps; identical replay at 30, 60, 120 and 240 Hz; 120 erratic
seeded missions checked every tick for bounds, finite values, no bump while
dazed, exactly one attempt per bump and an ending; 80 cautious crossings
from different moments and 25 after a bump.

`tests/unit/crossingInterlude.test.js` (integration, 32 tests): first offer
after round 27 and only in Chapter 2; a real pot from round 12 to 70 seeing
all three adventures on their own dates; three-way fairness when all are
due; shortage, boss and bonus priority without backlog; the offer's words;
free skip; intro, Enter and no teacup or other-adventure commands; moving
through the game; full freeze while paused with no hop on resume; pause in
intro and outro; perfect and failed results with round, Heat, fortune, cups,
spoon, chapter, teas, dates and schedule intact and rewards paid once;
hand-over to a waiting shortage (no restock) or bonus; restart; music;
Day choices after rounds 30 and 40 with the crossing completed, failed or
skipped, applied exactly once; independent random streams for teas, leaves,
fortunes, upgrade offers, the Tea Run, the paper route and the biscuit
wall; continuous steam and *Not a drop wasted.* after the crossing;
exclusive keys, auto-repeat, stale keys after the crossing and the pointer
pad; the development launcher.

The existing Biscuit Breakout tests were extended, not loosened, for a
third adventure: their schedule expectations now include it, and their
two-adventure fairness test keeps the third out of the way.

`tests/browser/crossingStreet.spec.js` and
`tests/browser/mobile-crossing-street.spec.js` run Chromium, Firefox and
mobile Chromium against a fresh production build: the real offer and
keyboard skip; real keys in all four directions and a held repeat; a
perfect crossing with one settlement and return; continuous steam
afterwards; a bump, a success after it, and three-bump failure with no cup
lost; timeout; auto-repeat, P, Tea Break and backgrounding freezing
everything with no hop on resume; a held arrow and Space leaving the result
without turning or steaming; the Day choice after rounds 30 (completed) and
40 (skipped); the arrow pad (tap, hold, cancel) and Tea Break on phone
portrait and landscape and tablet portrait and landscape; the shop exchange
and result on a phone and tablet; touch skip. Screenshots are written to
[`docs/images/crossing-street`](images/crossing-street/README.md).

## Automated qualification and release approval

Candidate qualification on 2026-10-29 (Windows, Node 24.22.1, branch
`feat/crossing-the-street-0.15.0`, head `de61617`):

- `npm ci`: clean, 0 vulnerabilities.
- `npm run check`: lint, **689 unit tests in 35 files** (620 before this
  release, plus 69), production build.
- `npm run test:browser`: fresh production build and server, **176 passed**
  (Chromium, Firefox, mobile Chromium), no failures or retries.
- [CI run](https://github.com/libertaine/Steeped-in-Trouble/actions/runs/40950560781)
  passed Windows and Ubuntu lint/unit/build checks and the browser suite.
- Screenshots inspected at Desktop Full and Compact, phone portrait and
  landscape, tablet portrait and landscape; see the image README.

Final release qualification on 2026-10-30, after the documentation-only
release changes, repeated the clean install, `npm run check` and the full
browser suite against a fresh production build:

- `npm ci`: clean, 0 vulnerabilities.
- `npm run check`: lint, **689 unit tests in 35 files**, production build.
- `npm run test:browser`: **176 passed** (Chromium, Firefox, mobile
  Chromium), no failures or retries.

Project-owner playtesting approved the adventure; no gameplay, traffic,
scoring or timing changes were made after approval. Automated browser
emulation does not establish physical device behavior, and physical
phone/tablet play remains unverified.
