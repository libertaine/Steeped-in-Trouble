# Strange Happenings — 0.19.0 Phase 2B testing

*The cup has gone fungal, and now the game has too.*

A prototype on `feature/0.19.0-the-cup-has-gone-fungal`, for owner
playtesting. It is not released. Mushroom Tea is still brewed only with
`?tea=mushroom`, so no ordinary pot can meet a Strange Happening.

## What it is

About once every two or three Mushroom Tea cups (never the first), one of
three things happens:

| Happening | What the player sees | What it can change |
|---|---|---|
| Time Rewind | Play catches, a tape tint, the last 3 s run backwards (the leaf just steamed comes back, steam returns to the spoon, the score winds down), then it fast-forwards to now. | Nothing. The simulation stands still for about 2 s, exactly as if paused. Steam, milk and sugar presses during it are ignored. |
| The Cup Is Breathing | About 12 s: the broth swells and settles, rings run out on each breath, rim caps and porcelain respond, the music muffles. | Nothing. Only the liquid's picture changes. |
| The Impostor Spoon | About 10 s: a translucent violet spoon with eyes follows yours a second behind, copies your steam with hollow rings, does a lap or walks the wrong way, and leaves. | Nothing. It has no collision, score or resources. |

See [ARCHITECTURE.md](ARCHITECTURE.md#strange-happenings-0190-prototype) for
how it works and [GAME_DESIGN.md](GAME_DESIGN.md) for the player-facing rules.

## Trying each one locally

Start a development server (`npm run dev`, at
<http://localhost:5173/Steeped-in-Trouble/>) or a production preview
(`npm run build && npm run preview`, at
<http://localhost:4173/Steeped-in-Trouble/>), then add one of these to the
address. `?debug` is
needed for `?strange=`; without it the parameter is ignored. The happening
arrives about 4–5 s into the first cup (a rewind waits until there are 3 s to
wind back, and every happening waits while a leaf is near the rim).

- Time Rewind: `?debug&tea=mushroom&strange=rewind`
- The Cup Is Breathing: `?debug&tea=mushroom&strange=breathing`
- The Impostor Spoon: `?debug&tea=mushroom&strange=impostor`
- One every cup, in turn: `?debug&tea=mushroom&strange=often`
- The real schedule: `?debug&tea=mushroom&seed=42` (any seed). In the
  console, `__TEACUP__.strange.schedule(12)` lists the cups that will have one.
- None at all: `?debug&tea=mushroom&strange=off`

Add `&graphics=low` for Low graphics. For reduced motion, turn on the
operating system's reduce-motion setting (or emulate
`prefers-reduced-motion: reduce` in the browser's developer tools). Turn
Sound on to hear them.

From the console during a cup: `__TEACUP__.strange.force('rewind')` (or
`'breathing'`, `'impostor'`) starts one as soon as it can;
`__TEACUP__.strange.active` and `.holding` show what is going on.

Captions follow a session's memory: the first of each kind always speaks,
and the first rewind's line is always "That wasn't in the patch notes." To
hear the first lines again, reload the page.

## Automated coverage

- `tests/unit/strange.test.js` (Node): the schedule's determinism, first
  cup, gaps, no repeats, overall rate and kind shares over 400 seeds; the
  caption rules; a planned happening starting in its cup, once; never in
  cup 1 or other teas; waiting while a leaf is near the rim; the rewind
  holding the simulation byte-for-byte still and a twin cup ending
  identically; recorded leaves, scores and angles shown during playback;
  score, cups, milk and sugar unchanged; pause ending a rewind; reduced
  motion's still frames; the bounded history; breathing and the impostor
  leaving a twin cup identical; breaths and rings (none with reduced motion);
  the impostor's delay, distance and pretend steam; pausing, menus, the cup
  ending and another pot clearing them.
- `tests/browser/strange.spec.js` (Chromium, Firefox): a rewind in the
  production build (presses swallowed, HUD score wound back, state returned,
  the patch-notes line, steam working at once afterwards; `@smoke`); pausing
  a rewind; breathing with leaves, a kill by aimed steam, and a graphics
  switch mid-breath; reduced motion with Low graphics (no rings, still-frame
  rewind); the impostor never scoring or hitting; `?strange=` and the cup
  ending. Every test asserts no console or page errors.

## Qualification

Local, 2026-11-02, Node 24.22.1, production build:

- `npm run check`: lint, 934 unit tests in 48 files, build. Passed.
- Strange Happenings and Mushroom Tea browser specs, Chromium and Firefox,
  each run twice: 40 passed.
- Full browser matrix (`npm run test:browser`, 444 executions): Chromium
  and mobile Chromium passed except one test below. Firefox, run with the
  default workers on this machine, failed 159 tests at `page.goto`
  ("navigation interrupted by another navigation") before the game loaded;
  rerun with `--workers 4`, all 160 Firefox executions passed.
- `dailyPour.spec.js` "the bystander's remark ... in compact view" fails
  locally on Chromium both here and on the commit before this work
  (`e003a4e`, 3 of 3 runs), so it is a pre-existing local failure, not a
  regression. It never brews Mushroom Tea.

## Known limitations

- The plan counts rounds. Mushroom Tea is pinned-only today, so every round
  is a Mushroom Tea cup; if it ever joins a shelf, a happening planned for a
  cup of another tea is simply skipped, and the rate per Mushroom Tea cup
  would need revisiting.
- A happening whose moment comes after its cup has ended is missed, not
  carried over, so short cups see slightly fewer than planned.
- During a rewind only leaves, darts, spores, the residue, the spoon, the
  score and the kill count are wound back. Milk clouds, sugar cubes, the
  Golden Leaf, particles and on-screen messages hold still at their live
  state.
- A rewind costs the player about 2 s (1.2 s with reduced motion) without
  control of steam, milk and sugar. Held directions carry on afterwards.
- The impostor may slip past the real spoon (under it, translucent) when
  the player reverses into its path; it never stays there.
- The sounds are first-pass synthesis and have only been checked for errors,
  not for taste.

## What most needs human playtesting

1. **Does the rewind read as deliberate, not as lag or a fault?** Especially
   the first one, before its caption. Is two seconds without steam too long?
2. **Frequency.** Is one in about 2.7 cups right, and is the timing within a
   cup unpredictable enough?
3. **The impostor's presence.** Is it noticeable but never confusing about
   which spoon is yours, in High and Low?
4. **Breathing.** Is it uncanny-funny, or merely a pretty effect? Is it
   comfortable with and without reduced motion?
5. **Captions.** Funny, rare enough, and never in the way?
6. **Sound.** The reversed chirps, the breaths and the woo, with music on.
