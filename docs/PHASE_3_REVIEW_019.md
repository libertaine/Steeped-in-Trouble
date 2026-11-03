# 0.19.0 Phase 3 — Fortune balance, Tea Tray, and the boss design review

Status: #15 and #14 are implemented and qualified on
`feature/0.19.0-the-cup-has-gone-fungal` (draft PR #44). The Mycelium
Manager, Chapter 3 and the #13 changes are **designs for review only**;
nothing in this section is implemented.

All measurements are seeded and reproducible. The play bot is
`tests/support/fortuneSweep.js`; the offer sweep and timing scripts are
described inline.

---

## 1. Issue #15 — fortune pattern balance

### What was wrong

The four pattern rules are checked in order (Veil → Crown → Spiral → Star,
first match wins) against **every** leaf in the cup:

- **The Spiral** (≥ 10 occupied lanes of 16) gets *easier* with more leaves:
  more kills cover more lanes. Expected occupancy is 10.3 lanes at 16 leaves
  and 13.8 at 32.
- **The Crown** (≥ 40% of leaves in three adjacent lanes) gets *harder* with
  more leaves, because large samples look uniform.
- **The Star** is the fallback, so it only gets what the others leave, and
  shrinks to nothing.
- The rules overlap: about half of all Crown readings at 16 leaves also
  qualify as Spiral and win only on priority.

Uniformly random lanes alone reproduce the Phase 1 table almost exactly
(16 kills: Crown 22.1 / Spiral 63.4 / Star 14.5, against the measured
24 / 60.5 / 14.5). Spawn lanes are uniform (`rng.int(LANES)`), so the bias is
structural, not a quirk of the bot.

### The fix

The reading now looks only at the **top layer: the last 16 leaves to
settle** (`CONFIG.fortunes.topLayer`), or every leaf in a sparser cup. That
makes the pattern odds independent of the leaf target for uniform play, and
restores the conditions the thresholds were first tuned for (base target 16).
The Spiral now needs **11** lanes instead of 10. The Crown keeps its 40% share
and its priority. The Veil is unchanged and still tied to milk kills.

The draw still makes exactly one RNG call, so every seeded sequence after a
reading is unchanged. Checkpoints store the drawn fortune, so saved pots
restore it as before. The explanation text names the top layer when the cup
holds more ("9 of the last 16 leaves settled close together.").

### Before / after — pattern match (which pattern the leaves point at)

Uniform residue, 4,000–20,000 seeded cups per target:

| Kills | Before C / S / St | After C / S / St |
| --- | --- | --- |
| 16 | 22.1 / 63.4 / 14.5 | 21.9 / 40.6 / 37.5 |
| 24 | 10.2 / 89.4 / 0.4 | ≈ same as 16 (by construction) |
| 32 | 4.6 / 95.4 / 0.0 | ≈ same as 16 (by construction) |

Real rounds with the bot: 7 teas × 2 paces (calm; second chapter with full
Heat) × 4 styles × 8 seeds per target, 4,032 rounds in total, identical
seeds for before and after.

| Kills | Before V / C / S / St | After V / C / S / St |
| --- | --- | --- |
| 16 | 8.9 / 29.9 / 46.4 / 14.7 | 8.9 / 29.9 / 29.7 / 31.5 |
| 18–20 | 9.8 / 29.6 / 57.7 / 2.9 | 9.8 / 31.8 / 36.5 / 21.9 |
| 22–26 | 10.6 / 24.1 / 64.3 / 1.0 | 10.6 / 34.7 / 26.0 / 28.8 |
| 28–32 | 11.8 / 22.0 / 66.0 / 0.1 | 11.8 / 37.4 / 24.6 / 26.3 |

By style. The sweeper is the 0.8.0 bot; the camper guards half the cup:

| Style, kills | Before C / S / St | After C / S / St |
| --- | --- | --- |
| sweeper, 16 | 19.6 / 58.9 / 21.4 | 19.6 / 38.4 / 42.0 |
| sweeper, 28–32 | 7.4 / 92.6 / 0.0 | 30.4 / 34.2 / 35.4 |
| sweeper, 840 rounds each at 16 / 24 / 32 | — | 23.6/41.8/34.6 · 21.0/40.8/38.2 · 20.8/39.3/39.9 |
| camper, any | Crown ≈ 70%, Veil ≈ 30% | unchanged |

Pattern identity is preserved. Guarding one area still reads as The Crown
about 70% of the time, and the camper can never read as The Spiral. Milk-heavy
play still raises The Veil. With full-cup play no pattern exceeds about 42%
at any target.

### Before / after — fortunes actually awarded

The pattern only adds +6 weight. The award also depends on every fortune's
own weight (clean cups, spills, sugar), so award shares are much flatter
than pattern shares. Same 4,032-round sweep:

| Kills | Spiral awarded, before → after | Star awarded, before → after | Crown awarded, before → after |
| --- | --- | --- | --- |
| 16 | 20.5 → 14.7% | 15.4 → 21.2% | 5.8 → 5.8% |
| 28–32 | 25.9 → 10.9% | 4.1 → 12.9% | 6.1 → 12.2% |

The largest award after the fix is Tempestuous Tea (≈ 19–21%), driven by the
camper style's many spills. That is existing, intended behaviour (spills
invite trouble) and was not changed.

### Regression guards

`tests/unit/fortuneBalance.test.js` checks the bands at every target from 16
to 32, the stability of each share (spread < 5 points), and real-round
sweeps at 16 and 32 leaves. It also checks that a camper still reads as The
Crown and milk still raises The Veil. Under the old rule, three of its four
tests fail.

---

## 2. Issue #14 — the Tea Tray

### Rules as implemented

- **When:** only at ordinary offer readings (cups 1, 3, 5, …), and only for
  the slots that upgrades can no longer fill. Upgrades keep their places
  first. Every offer has two cards.
- **Treats** (next cup only):

  | Card | Effect | Never offered when |
  | --- | --- | --- |
  | A Spare Jug | +1 milk pour | — |
  | A Spare Strainer | +1 strainer catch | the next fortune is Karma (escapes never reach the strainer) |
  | A Sugar Lump | +1 sugar burst | — |
  | A Golden Moment | Golden Spoon for the first 9 s of the cup | The Daily Grind follows this reading (a win gives 12 s, which would swallow it) |

- **Activation:** `startRound()` serves the treat after the cup's supplies
  are set. It is never served in a bonus round or adventure in between
  (shortage, Tea Run, Havoc, The Daily Grind, arcade interlude, Day choice).
- **Expiry:** whatever is left is gone when the following cup starts.
  Supplies are reset there as always, and 9 s of gold cannot outlast a cup.
- **No exploit:** there is one slot (`state.tray`), filled only by taking an
  offer card. Treats cannot stack, carry over or touch `state.spoon`. Reloading
  a save re-offers the same cards with nothing yet served.
- **Tea Cash is not on the tray.** Each cup earns 5, and the only sink is a
  20-cash tin at a shortage every 7 cups, so cash is always in surplus late in
  a pot and a cash card would offer no benefit. The Tea Cash redesign is out of
  scope.
- **Determinism:** tray cards rotate with the offer index and draw no random
  numbers.

### Checkpoint compatibility

Schema **4** adds only `state.tray`, which is always `null` at a saved
reading because a treat is taken after the save. Offers may now hold tray ids
after upgrades. Schema 3 (unreleased; branch saves only) migrates with an
empty tray, and schema 1 and 2 saves migrate through it. The validator
rejects a waiting treat, unknown cards, duplicates, and a tray card ahead of
an upgrade.

### Before / after — offer sizes

200 seeded 39-cup pots, bots alternating between first and second card,
winning The Daily Grind on even seeds. Before = the tree at `193551f`:

| Cups | Before: 2-card / 1-card / none | After: 2-card | Offers with tray cards |
| --- | --- | --- | --- |
| 1–13 | 100 / 0 / 0% | 100% | 0% |
| 15 | 91.5 / 8.5 / 0% | 100% | 8.5% |
| 17 | 59.5 / 40.5 / 0% | 100% | 40.5% |
| 19 | 0 / 100 / 0% | 100% | 100% |
| 21–39 | 0 / 0 / 100% | 100% | 100% |

The 0.16.0 and 0.18.0 fixture pots (eight seeded 30-cup pots) replay with
**zero** differences in fortunes, teas, scores, schedules or any of the nine
random cursors. Only the filled offers differ.

---

## 3. The Mycelium Manager — implementation design (for review)

### Fit with what exists

The Daily Grind already establishes the boss contract this design reuses:
spoon on the rim and boss in the centre (`bodyRadius` 84), threats that travel
along lanes, a three-scald limit that never costs a cup, a safe window after
each scald, milk that washes back and delays, a 38 s clock, its own RNG
stream, and the milestone/retry/rematch scheduling. The Manager needs **no new
controls**: turn, steam, milk (Q/M/↑), sugar (E/S/↓) and the Easy Touch
gestures all carry over.

The real difference is **where damage comes from**. The Grind is a timing
fight: wait for the valve, then steam it. The Manager is a **space** fight:
everything that matters lives in specific lanes, and the player's choices
reshape which lanes are safe.

### The pieces

**Roots: defence and terrain.** A root grows outward from the Manager's
body along a lane, its base glowing for 1 s before it starts. Its **tip** is a
bright node, and steam that reaches the tip cuts the root back to its base.
Steam hits the first thing in its lane, as darts already do in the Grind.
Milk freezes growth for every root under the cloud while the cloud lasts,
using the same width as the leaf slowdown. Sugar cuts all three of its lanes
at once. Roots never scald by themselves.

**Memos: offence.** Puffball memos drift outward along a lane, slower than
beans. Popping one sends a spore puff back down that lane into the Manager,
and that is the only way to damage it. Sugar can pop up to three. An ignored
memo that reaches the rim **files itself** as a sticky note on that lane, and
a filed lane is on the next meeting's invite list.

**All-hands meeting: the telegraphed attack.** The Manager raises the
clipboard ("Let's circle back."), and every **invited lane** pulses. A lane is
invited if its root has grown past the meeting line (half the cup) or it
carries a sticky note. After the warning, a ring sweeps out and scalds the
spoon if it sits in an invited lane, using the existing `hitHalfWidth`,
`safeTime` and three-scald rules. Then the notes clear and the meeting ends.

### The core decision loop

Every few seconds the player chooses between:

1. **Pop a memo** (the only damage, but it may be across the cup), or
2. **Cut the root** about to cross the meeting line (keeps space safe), and
3. **Spend milk** to freeze one side while dealing with the other.

During a meeting warning there is one more call: run to a safe lane, or cut
a root to *make* one where the spoon already is. Good root control means more
safe space and more freedom to chase memos. Neglecting either side shows up
clearly at the next meeting.

### Fair and readable

- **Warning time 2.0 s** at first, never below 1.4 s. The spoon turns about 7
  lanes a second, so any lane is reachable, and the warning is longer than the
  Grind's because the safe lanes depend on the player's own play.
- **A guaranteed safe pocket:** however badly roots are managed, at most 11 of
  16 lanes are invited, and at least two *adjacent* safe lanes lie within four
  lanes of the spoon (the Grind's "always a safe lane within easy reach",
  enforced as a property test over random root states).
- **One meeting at a time**, never overlapping a memo volley's arrival.
- **Not by colour alone:** invited lanes thicken and pulse and the HUD cue
  reads "Leave invited lanes". Roots draw as solid threads, memos as paper
  puffballs, and sticky notes as squares on the rim. Low graphics and reduced
  motion keep the shapes and drop the shimmer.
- **Auto Steam** fires when a memo or root tip is lined up, the same rule as
  `autoSteamWantedInGrind`, and it never steers.

### Dialogue

Intro "Quick sync?" · memo "Per my last spore…" · meeting "Let's circle
back." · a root cut "Who approved this?" · it escapes "Let's take this
offline." · it is beaten "I'll put a pin in it."

### First appearance and the Chapter 3 unlock

- **Chapter 2's milestone**, after the **5th cup of Chapter 2**: cup 10 when
  the Grind was beaten at its first meeting after cup 5. That is the last cup
  of Day 1, and at the reading the order is boss, then the Day choice, which
  suits a manager calling an end-of-day meeting.
- If the Manager escapes, it returns 2 normal cups later (as the Grind does)
  until beaten. Nothing else takes a milestone reading.
- **Beating it opens Chapter 3 with the next cup**, through the same
  `advanceChapter()` path the Grind uses. Mushroom Tea comes on tap at once
  (`teas: { mushroom: 0 }`) and loses `pinnedOnly`. The rewards follow the
  Grind's: points, Tea Cash for a milestone, 12 s of Golden Spoon, and a cup
  for a perfect fight.
- **Discoverability:** measured play time is 17.6 s per 16-leaf cup and
  34.5 s per 32-leaf cup. With readings and the Grind, cup 10 comes about
  **6–7 minutes** into a pot, so Chapter 3 is reachable in one casual session.
  Escapes delay it by about a minute each, and never cost cups.

### Repeat encounters

Rematches share the Grind's cadence (at least 4 cups apart, then 25% a
reading, never both bosses at one reading). Each rematch adds **one
combination**, cycling. Health and the 38 s clock stay the same:

| Visit | Variation |
| --- | --- |
| 2 — "The Reorg" | Roots grow in adjacent pairs; memos come cc'd in pairs (sugar shines) |
| 3 — "Back-to-Back Meetings" | Each meeting has a second wave 1 s later that invites the lanes *next to* the first wave's safe pocket. Move twice. |
| 4 — "Synergy" | Cutting a root drops a memo from its base: defence feeds offence |
| 5+ | Two of the above at once, rotating |

### Complexity estimate

| Part | Size | Notes |
| --- | --- | --- |
| `gameplay/mycelium.js` | ~450 lines (grind.js 434) | Own RNG stream, roots/memos/notes/meeting, fairness cap |
| `rendering/mycelium.js` | ~650 lines (grind renderer 716) | Threads, tips, memos, notes, meeting ring; low/reduced variants |
| game.js / phases / HUD / audio / music | medium | New boss phase (or a generalized boss phase) touches pause, confirm, resources, Easy Touch, music sections |
| Chapters and milestones | small | Milestone per chapter instead of the Grind hard-coded as Chapter 1's |
| Checkpoint | small | New stream + scheduling fields. **Fold into schema 4 before release** (it is unreleased) rather than adding schema 5. |
| Tests | large | Unit (~400 lines), fairness property tests, a fight bot for win-rate bands, fixture replays, about 6 browser tests × desktop/mobile |

This is about the size of 0.8.0's Daily Grind, roughly 4–6 focused commits
plus a playtest round.

---

## 4. Chapter 3 placement and late-game escalation (#13)

### The plateau, measured from config

| Heat (cup if kept) | Target | Speed | Arrival interval |
| --- | --- | --- | --- |
| 8 (cup 9) | 32 (cap) | ×1.000 | ×1.000 |
| 10 (cup 11) | 32 | ×1.0125 | ×0.992 |
| 14 (cup 15) | 32 | ×1.0625 | ×0.96 |
| 19 (cup 20) | 32 | ×1.125 | ×0.92 |
| 28 (cup 29) | 32 | ×1.20 (cap) | ×0.85 (cap) |

Upgrades keep growing until about cup 19. The Tea Tray adds no permanent
power, so it does not make this worse. Fresh Brew resets Heat to 0 (target 16)
but never the chapter baseline.

### Proposal

1. **Chapter 3 arrives in the soft spot.** Starting at cup 11, a step in the
   chapter baseline lands exactly where Keep the Kettle On is weakest. Suggest
   `enemySpeed` 1.15 → **1.25** and `spawnInterval` 1 → **0.95**, inside the
   existing caps (`maxOverallSpeed` 2, `minSpawnInterval` 0.45). No change to
   Days or the safety limits.
2. **Fresh Brew stays a breather, not an escape hatch.** Chapter baselines
   survive Fresh Brew, so a Chapter 3 Fresh Brew is still a Chapter 3 cup.
   No rule change is needed.
3. **Rhythm, not count: "rush hour" arrivals in Chapter 3.** Leaves sometimes
   arrive as a quick run of three with a longer gap after it, keeping the
   *same average* rate. Pressure comes from timing and lane spread, not more
   leaves or health.
4. **Boss rematch escalation** as in section 3. It is also the main late-game
   variety, because each visit is a new combination.
5. **Measure before tuning:** extend the sweep bot to whole pots (spills per
   cup by Heat and chapter) and tune 1 and 3 against target bands, as #15 was.

### Strange Happenings once Mushroom Tea is in rotation

Today the plan counts **rounds** and only Mushroom Tea cups take part, which
is every cup under the pinned prototype. In rotation, Mushroom Tea is served
in only some cups, so a happening planned for cup 14 is silently missed
unless cup 14 is mushroom. Happenings would become rare and erratic.

**Recommendation:** plan by **Mushroom Tea cup ordinal** (the 1st, 2nd, 3rd
mushroom cup served) with the same rules: never the first (its debut cup
stays clean), the first in the 2nd or 3rd, then gaps of 2–4 mushroom cups.
That needs a small `mushroomCups` counter in state, also folded into the
unreleased schema 4. The pinned `?tea=mushroom` prototype behaves exactly as
today, because there every cup is a mushroom cup.

---

## 5. Decisions needed, risks, and qualification

### Decisions for the owner

1. **Tea Tray contents:** confirm that Tea Cash is left off, and that A Golden
   Moment is 9 s from the cup's start.
2. **Spiral at ~40%** in full-cup play is at the top of its band. The next
   integer step (12 lanes) drops it to about 16%, so finer tuning would need a
   different rule. Accept as is?
3. **Mycelium Manager:** the sticky-note rule for ignored memos, the
   first-appearance timing (5th cup of Chapter 2), and the rematch variations.
4. **Chapter 3 tuning** (1.25 / 0.95) and "rush hour" arrivals as the #13
   direction.
5. **Strange Happenings:** schedule by mushroom-cup ordinal.

### Risks

- **Visual density:** roots, memos, notes and spores together on a 16-lane
  rim. This needs a low-graphics pass and a phone-sized playtest before
  tuning.
- **Feel is unmeasured:** bots show balance, not fun. The owner's playtest of
  the Tea Tray and the new fortune mix is the real qualification.
- **Explanation wording on old mid-reading saves:** a 0.18 save restored at
  its reading keeps its fortune, but the explanation is recomputed with the
  top-layer rule and may word the pattern differently.

### Qualification status

The browser runs below are on this machine. CI on PR #44 runs lint, unit and
build on Ubuntu and Windows, plus the browser smoke job.

- Lint, 955 unit tests and build pass. CI passes on the pushed baseline.
- **Full browser matrix at `7f2513e`, `--workers 4`, all projects: 443 of 447
  passed.** The 4 failures (two `cupPorcelain` tests × Chromium/Firefox) were
  hard-coded `schemaVersion: 3` assertions that the schema 4 change made stale.
  After the fix, all 15 porcelain tests pass across every project.
- Known local issues, tracked rather than suppressed:
  - The Daily Pour "bystander remark … compact view" test, which failed at the
    last handoff (also on the pre-0.19 commit), **passed** in this full run on
    Chromium and Firefox. It is intermittent, not deterministic, and stays
    tracked.
  - The Firefox matrix needs `--workers 4` locally (page.goto failures at the
    default worker count). Not re-tested at the default this phase.
  - Intermittent `clock.pauseAt: Cannot fast-forward to the past` in
    `readingTeaBreak.js`'s `freeze()` helper: seen once in 2 tests under
    load, not reproduced in 36 reruns. It comes from the helper's
    `Date.now() + 100` pause point racing a busy worker.
