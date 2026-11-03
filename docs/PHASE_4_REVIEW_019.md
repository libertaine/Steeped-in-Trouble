# 0.19.0 Phase 4 — The Mycelium Manager and Chapter 3

Status: implemented on `feature/0.19.0-the-cup-has-gone-fungal` (draft PR
#44) and **stopped for human playtesting**. Nothing is merged, tagged or
published. The design reference is
[PHASE_3_REVIEW_019.md](PHASE_3_REVIEW_019.md); player-facing rules are in
[GAME_DESIGN.md](GAME_DESIGN.md#0190--the-mycelium-manager-and-chapter-3-spoilers),
and the code map is in
[ARCHITECTURE.md](ARCHITECTURE.md#the-mycelium-manager-and-chapter-3-0190).

## How to test it

All `?debug` hooks below exist only in development builds (`npm run dev`).

| What | URL (dev server, e.g. `http://localhost:5173/Steeped-in-Trouble/`) |
| --- | --- |
| Meet the Manager at once (first encounter) | `?debug&boss=manager` |
| A rematch with its twist(s) | `?debug&boss=manager&visit=2` (The Reorg), `3` (Back-to-Back), `4` (Synergy), `5`+ (pairs) |
| The real unlock path | `?debug&progress=manager`: Chapter 2's fifth cup, four leaves from done. Finish it, and the reading, the Manager, the Day choice, Chapter 3 and its first Mushroom Tea cup follow for real. |
| Low graphics / reduced motion | add `&graphics=low`; use the OS reduce-motion setting |
| Normal progression | no parameters: beat The Daily Grind after cup 5; the Manager follows cup 10 |

In the console, `__TEACUP__.manager(visit)` and
`__TEACUP__.managerProgression()` do the same as the URLs.
`node tests/support/difficultyReport.js` reprints every measurement below.

## What was built

1. **The Mycelium Manager** (`gameplay/mycelium.js`, `rendering/mycelium.js`):
   - **Roots** are telegraphed, then grow. Steam cuts them back, milk freezes
     them, and sugar clears three lanes at once.
   - **Memos** are the only source of damage. Ignored memos become
     **sticky notes**.
   - **All-hands meetings** invite lanes with long roots or notes. They are
     fixed when called, can only shrink, and always leave a reachable safe
     pocket. They use the Grind's three-scald rules.
   - The **first encounter** introduces roots, then memos, then the first
     meeting.
   - **Rematches** add The Reorg, Back-to-Back Meetings, Synergy, then pairs,
     with the same health and clock.
   - It uses the existing controls, Auto Steam and Easy Touch.
2. **Scheduling**: the Manager is Chapter 2's milestone after its fifth cup.
   An escape retries two cups later, and there is one boss per reading.
   Rematches come only in Chapter 3.
3. **Chapter 3 — The Cup Has Gone Fungal**: beating the Manager opens it,
   and its first cup is always Mushroom Tea (through the existing debut
   rule, so restored pots keep it). Mushroom Tea then joins the rotation.
4. **Strange Happenings by Mushroom Tea cup**: the first is due in the second
   Mushroom Tea cup, and is deferred rather than forced. The cup it played
   in is saved, so restores carry on exactly.
5. **Chapter 3 pace** 1.25 / 0.95 and a **Rush Hour** prototype.
6. **Checkpoint schema 5**.

### Commits (oldest first)

| SHA | |
| --- | --- |
| `24bccce` | the Manager's fight, fairness rules and schedule (and schema 5) |
| `52268a3` | drawing, voice, HUD, audio, dev entry points |
| `ae711f7` | Chapter 3 and the guaranteed Mushroom Tea cup |
| `018a366` | Strange Happenings by Mushroom Tea cup |
| `2a7d9da` | Manager memo supply steady across twists (measured fix) |
| `2d582ea` | Chapter 3 pace and Rush Hour |
| (this doc) | documentation |

## Deviations from the approved design

1. **Schema 5, not a reshaped schema 4.** Schema 4 was pushed in Phase 3, so
   development builds may hold schema 4 saves. Changing its layout would
   have made those saves fail validation silently. The smallest safe option
   was the existing mechanism: an additive 4→5 step, tested explicitly.
   Schemas 3 and 4 then exist only for development builds. If you prefer one
   published schema, the steps could be collapsed before release, at the
   cost of those development saves.
2. **Roots are cut back by a chunk (55 units a dart), not to the base, and
   they shield memos behind their tip.** Memos also usually travel along a
   root. The bot sweeps showed that with roots cleared by one dart, a player
   firing down their own lane was always safe and roots elsewhere never
   mattered. That would have removed the territory decision.
3. **More, weaker memos** (5 damage, 12 to win, about 2 s apart). With 7
   strong memos, every competent player won at the moment the 7th appeared,
   so skill could neither speed the fight up nor lose it.
4. **Twists keep the memo supply steady.** As first built, The Reorg and
   Synergy made rematches easier (about 15 s fights). Now Reorg's pairs come
   half as often, and under Synergy ordinary memos come 1.5× less often.
5. **The safe pocket prefers a short walk (about 2–3 lanes).** When lanes
   must be let off, the farthest go first. Otherwise the guarantee would
   tend to protect wherever a passive player stood.
6. **"Second appearance" means the first rematch after the milestone
   victory.** Retries after an escape stay the gentle first encounter, so
   failing never makes the milestone harder.
7. **Music reuses the Grind's arrangement**, with its own tempo and the
   meeting warning as its alarm. A dedicated arrangement is a follow-up.
8. **Rush Hour spreads round the cup** (5–6 lanes apart, either way). The
   clustered version in neighbouring lanes measured no added pressure. It
   is off in Mushroom Tea (so it never obscures puffballs) and in Chai.
9. **The first Strange Happening's cup is recorded in the simulation**
   (`state.strangeFirst`). main.js passes it through `game.noteStrange()`
   from the controller's existing `strangeStart` event. The controller still
   never writes state, and nothing that plays reads the field.

## Qualification

| Check | Result |
| --- | --- |
| Lint, build | clean |
| Unit tests | **1,018 passed** (53 files), Windows |
| Full browser matrix, all projects, `--workers 4`, at `2d582ea` | **459 passed, 0 failed, 0 flaky** (14.5 min) |
| CI on PR #44 | see the push for this commit |

New coverage:

- `mycelium.test.js` (38 tests):
  - Fairness properties over 4,000 random claims and spoon positions.
  - Whole seeded fights, where a careful player is never scalded at
    appearances 1–7, and invitations never grow during a warning.
  - Every mechanic, the lesson pacing, each twist, the rewards, Auto Steam
    and Easy Touch.
  - The schedule, including no shared readings.
  - Save, restore and schema 4→5 migration.
- `chapter3.test.js`: the Mushroom Tea first cup for 40 seeds × both Day
  choices, the rotation afterwards, escapes, pinned pots, and checkpoints on
  both sides of the unlock.
- `rushHour.test.js`:
  - The safety limits hold.
  - A rush has the right shape and spacing, and keeps the average rate.
  - It never appears outside Chapter 3 or in Mushroom Tea and Chai cups.
  - It draws no extra random numbers elsewhere.
  - It is deterministic and never saved.
- `strange.test.js`: counting by Mushroom Tea cup, deferral of the first
  happening, spacing from the real first, restoration from a fresh
  controller, and the never-twice-running rule.
- Fixture replays (0.16.0, 0.18.0) play every recorded reading identically
  with the Manager out of the way, and match until it arrives exactly after
  cup 10.
- Browser:
  - `manager.spec.js`: the real hand-off, keys, pause, a meeting scald,
    escape, Low graphics, reduced motion, and the Chapter 3 unlock with
    Mushroom Tea.
  - The phone-size boss loop in `mobile-compact.spec.js`, at 390×844 and
    844×390.

Intermittent local issues are still tracked separately, and neither
recurred in the 459-test run:

- The Daily Pour compact-view test.
- The `readingTeaBreak.js` `freeze()` clock race.

## Measurements

Bots press only the game's controls, with reaction delays and aim slips.
They are evidence for comparisons, not a stand-in for people.

### Late-game cups (#13): cups 11–20, 12 seeds × 5 Heat levels each

"Worst" is how close the nearest leaf got to the rim in an average cup.

| | strong worst | casual worst | struggling worst | struggling: cups costing a cup |
| --- | --- | --- | --- | --- |
| Chapter 2, Keep the Kettle On (before) | 37% | 41% | 56% | 0% |
| Chapter 2, Fresh Brew (before) | 36% | 39% | 50% | 0% |
| **Chapter 3, Keep the Kettle On** | **43%** | **47%** | **67%** | **2%** |
| **Chapter 3, Fresh Brew** | **40%** | **44%** | **57%** | 0% |

- The 1.25 / 0.95 step alone raised the struggling player's worst from 56% to
  64% (Keep). Spread-out Rush Hour (about 1.1–1.5 a cup) added another 3–4
  points at every skill.
- Cups are about 2 s shorter in Chapter 3 (32.7 s against 34.7 s under Keep).
- No safety limit was changed.
- Fresh Brew still eases off, but only to Chapter 3's pace, which is above
  Chapter 2 Keep for every skill level.

### The Mycelium Manager: 24 fights per row

| Appearance | careful | casual | reckless (never dodges, ignores roots) |
| --- | --- | --- | --- |
| 1 (first encounter) | 22/24 wins, 0 scalds, 32.6 s | 24/24, 0, 31.9 s | 24/24, 0.04, 30.8 s |
| 2 The Reorg | 17/24, 0, 32.2 s | 24/24, 0, 28.7 s | 24/24, 0.04, 26.1 s |
| 3 Back-to-Back | 21/24, 0, 34.7 s | 24/24, 0, 31.4 s | 23/24, 1.33, 30.9 s |
| 4 Synergy | 23/24, 0, 23.4 s | 24/24, 0, 24.8 s | 24/24, 0.13, 28.0 s |
| 5 Reorg + Back-to-Back | 10/24, 0, 34.9 s | 24/24, 0, 31.2 s | 23/24, 2.04, 28.7 s |

- Losses are by time. The careful bot over-defends: it cuts every root first.
- Meetings rarely scald anyone who keeps firing down their own lane, because
  that cuts the lane's root back. They bite in Back-to-Back fights.
- **These bots aim perfectly once lined up, so they are far stronger than
  people at popping memos. Human difficulty is the open question for the
  playtest.**

## Risks and recommended tuning

- **Difficulty for people is unmeasured.** If the Manager feels easy:
  - `cutBack` 55 → 40, so roots take more darts.
  - `warn` [2, 1.6] → [1.8, 1.5].
  - `memoSpeed` up, so more memos file.

  If it feels hard: delay `lesson.meeting`, or lower `maxInvited` 11 → 9.
- **Meetings may feel toothless to players who hold fire**, since firing
  keeps their own lane clear. If so, consider making a sticky note also
  claim its neighbouring lanes. That would be a rule change, so it's your
  call.
- **Phone readability**: memos and notes are small on a 390-px portrait cup.
  They are legible in screenshots, but need a hands-on check.
- **Cup 11 shows both the Day card and the Chapter card** (the Manager
  follows cup 10, which ends Day 1). They stack cleanly, but it's a lot of
  text at once.
- **Late game is still gentle for strong players** (worst reach 43%).
  Chapter 3 could go to 1.3 speed, or Rush Hour's `chance` 0.1 → 0.15, if
  the playtest agrees. The Heat caps are untouched.
- **Rush Hour is a prototype.** Its effect is modest; remove it if it feels
  arbitrary.
- **Music** is borrowed from The Daily Grind.
