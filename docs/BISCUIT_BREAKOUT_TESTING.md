# Biscuit Breakout and Karma — developer and playtest guide

0.13.0 adds Biscuit Breakout, a second optional Arcade Interlude, and
Karma, a rare fortune. This guide covers the automated checks, the
development-only shortcuts with deterministic replay, and what to look for
when playing.

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
npx vitest run tests/unit/biscuitBreakout.test.js tests/unit/biscuitInterlude.test.js tests/unit/karma.test.js
npm run test:browser -- biscuitBreakout.spec.js mobile-biscuit-breakout.spec.js --workers=4
```

## Shortcuts and replay (development only)

Start `npm run dev`, then open one of:

| URL | What it does |
| --- | --- |
| `http://localhost:5173/Steeped-in-Trouble/?debug&arcade=biscuitBreakout&seed=42` | A fresh practice pot, straight into Biscuit Breakout's introduction (round 19, Chapter 2). |
| `http://localhost:5173/Steeped-in-Trouble/?debug&fortune=karma&seed=42` | A fresh pot whose second cup is brewed under Karma, through the real reading hand-off. |
| `…?debug&fortune=karma&tea=green&seed=42` | The same with one tea variety (`house`, `herbal`, `earlGrey`, `chai`, `green`, `black`). |

In the browser console:

```js
__TEACUP__.launchBiscuitBreakout();     // the same wall again, in a fresh practice pot
__TEACUP__.launchBiscuitBreakout(7);    // a different deterministic wall
__TEACUP__.brewWithFortune('karma');    // cup 2 under Karma
__TEACUP__.brewWithFortune('karma', { cup: 9 }); // a later cup number (targets grow with the cup)
__TEACUP__.launchDailyPour();           // still available for the paper route
```

The same seed always builds the same wall (tints, decorations and the face).
With the same inputs at the same moments, the physics replays exactly: it
runs in fixed 120 Hz steps, independent of display rate.

These helpers exist only in Vite development with `?debug`. Production
removes them; there is no player-facing cheat menu, and a browser test
checks that `launchBiscuitBreakout`, `brewWithFortune` and `launchDailyPour`
are absent from the production build. Production browser tests reach the
offer by finishing a real round-19 cup with a real dart collision, and
break biscuits only through real cube collisions.

## What to play

### Biscuit Breakout

- Play into Chapter 2. The paper route still appears after round 12; look
  for THE BISCUITS ARE REVOLTING! after round 19 (or a later reading when
  another encounter has priority), then again 14 normal rounds after each
  offer. The two adventures should alternate rather than pile up, and never
  appear twice after one reading.
- Skip with LEAVE THEM ALONE (mouse, touch or 2). Cups, score, Tea Cash,
  upgrades, chapter, tea and the waiting fortune must carry on.
- Accept with BREAK THE BISCUITS (or 1). Start with Enter, Space or LAUNCH.
  Move with ← / → (A / D), hold ◀ / ▶ on touch; launch with Space or LAUNCH.
- Does the spoon feel responsive? Can a new player break several biscuits
  straight away? Does catching the cube near the spoon's edge send it off
  at a useful angle, and the centre straight up? Does it ever look stuck,
  pass through a biscuit, or skim flat along the wall? (It should not.)
- Hold Space: only one cube launches. Spam Space on the result: nothing.
- Lose all three cubes, let the 45 seconds run out, break 17 or more, and
  try to clear the wall. Expect 10 points per biscuit, 5 Tea Cash from 17,
  and 50 extra points for a clear, with the three result messages.
- Find the biscuit with a face. Break it: "THAT'S A CRUMBY WAY TO TREAT
  SOMEONE!" appears above the tray for about 2.6 seconds. No extra points.
- Pause with P, open the Tea Break, and background the tab while the cube is
  in flight. Everything must freeze; resuming must not launch. Leave the
  result and check that the next cup, fortune and upgrades are right and
  that nothing was paid twice. Hold Space as you leave the result with
  Enter: the next cup must not fire steam until Space is pressed again.
- Sound on and off; Desktop Full and Compact; phone portrait and landscape;
  tablet portrait and landscape. The mobile layout is unchanged apart from
  the LEFT / LAUNCH / RIGHT row.

### Karma

- Use `?debug&fortune=karma` (or play until it turns up: it should be
  noticeable but uncommon, around one reading in 25–35).
- The reveal reads THE LEAVES FORETELL · WHAT GOES AROUND… KARMA, with a
  return-arrow glyph and its own chime. The omen pill reads
  `Karma · rim rebounds`; the panel explains the rule.
- Let leaves reach the rim. The first contact flashes the rim, sends the
  leaf back with a rose ring, and sometimes says INSTANT KARMA!. Its second
  contact makes it vanish in a pale puff. No cup is lost, the strainer is
  not used, and "Leaves cleared" still advances.
- Steam a bounced leaf: it scores normally. Do nothing for a whole cup: it
  should still end, with no cups lost and no points from vanishings.
- The following cup should spill normally again.
- Try it with Green (darting), Earl Grey (wandering), Chai (currents) and
  Black or Tempestuous (fast) leaves.

## Automated coverage

Unit tests (`tests/unit/biscuitBreakout.test.js`) cover deterministic walls
over 100 seeds, initial positions, paddle bounds, launching, every rail,
paddle angles at six contact offsets, catching only from above, biscuit
breaks from below and from the side, no tunneling at top speed across frame
lengths up to the 0.04 s cap, single scoring, long seeded rallies (12 seeds,
45 s each) that never leave the tray, enter a biscuit or go flat, cube loss
and re-serve, three-cube failure, time-out, a genuine full clear, 17 / 16 /
5 broken, one-time settlement, the talking biscuit's event, timing and
neutrality, and identical results at 30, 60, 120 and 240 Hz.

`tests/unit/biscuitInterlude.test.js` covers the schedule (19, then every
14), a real pot alternating both adventures from round 12 to 50, longest
waiting first, ties, one offer per reading, a 200-reading fairness run,
postponement behind shortages, bosses and bonuses, upgrade choices first,
the offer copy, free skipping, Enter / LAUNCH starts, held steering, every
teacup command ignored, pause freezing and resuming without launch, the
result guard, return to the next cup with everything intact, deferred
encounters, restart, random-stream isolation from teas, leaves, fortunes,
the Tea Run and the paper route, the soundtrack, exclusive keys, and the
held-Space hand-off.

`tests/unit/karma.test.js` covers the weighted draw (never a pattern
reading; 2–5% across 19 representative records), modifiers, the glyph, HUD
text, first bounce (no cup, strainer or near miss), no re-trigger while
recoiling, vanishing (cleared, not killed: no score, residue, kill event or
stats), no accuracy or secret credit, full credit for steaming a bounced
leaf, an empty strainer with one cup left and five simultaneous leaves,
finishing a cup from simultaneous vanishings exactly once, a whole idle cup
of every tea variety, no points from vanishings, expiry after one cup,
restart, the Daily Grind, the unchanged leaf stream, and the effects.

Browser tests (`biscuitBreakout.spec.js`, `mobile-biscuit-breakout.spec.js`)
run Chromium, Firefox and mobile Chromium against a fresh production build:
the real offer, keyboard and mouse skip, real held-key steering and Space
launch, real collisions, the talking biscuit, success and failure results
with one-time rewards and return, auto-repeat, P, Tea Break and
backgrounding, held Space leaving the result, Karma's reveal, bounce and
vanishing with an empty strainer, and touch pads (tap, hold, cancel) on
four phone and tablet viewports. Screenshots are written to
[`docs/images/biscuit-breakout`](images/biscuit-breakout/README.md).
