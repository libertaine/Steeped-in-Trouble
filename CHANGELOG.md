# Changelog

All notable changes to this project are documented here. The project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

## [0.15.0] - 2026-10-30 — Crossing the Street

WHY DID THE SPOON CROSS THE ROAD? *"Nobody knows. But apparently, it's our
problem now."*

### Added

- **Crossing the Street:** a third optional Arcade Interlude, offered after
  round 27 in Chapter 2 and then every 14 normal rounds. CROSS THE ROAD
  starts it; STAY RIGHT HERE costs nothing. Behind the offer, the street is
  already busy.
- A top-down street crossing: hop the silver spoon one square at a time
  (arrow keys or WASD, or a four-way touch pad; hold to repeat every
  0.15 s) across three lanes, a safe median and two more lanes to the tea
  shop. Small cars, delivery vans and a milk truck run in alternating
  directions at each lane's own speed and spacing, in seeded, learnable
  patterns.
- Three attempts and 40 seconds. A bump knocks the spoon aside, dazed, then
  back to the curb, costing one attempt, never a cup; the traffic pattern
  carries on unchanged.
- Scoring: 10 points for the first landing in each lane, +50 and 5 Tea Cash
  for reaching the shop, +40 for doing it without a bump. Results: NOT A
  SCRATCH ON THE SILVER!, THE SPOON MADE IT!, or THE TRAFFIC HAS SPOKEN.
  Rewards settle once.
- Original procedural street art and humor: a roadside sign with views on
  cutlery, a pedestrian signal that counts down the clock, a SUSPICIOUSLY
  FRESH milk truck, and a short doorstep exchange with the shopkeeper.
- Synthesized hop, lane, whoosh, clank, success and failure sounds and a
  hurried variation of the soundtrack.
- Fixed 120 Hz steps with closed-form traffic positions, swept-box
  collisions (no tunnelling at any speed), an independently salted road
  generator, and a fairness check: every road must admit a cautious
  crossing from the curb at every sampled moment, or it is redrawn.
- Development-only practice shortcuts and deterministic replay; see the
  [testing guide](docs/CROSSING_STREET_TESTING.md).

### Changed

- The Arcade Interlude schedule now holds three adventures. When more than
  one is due, the one that has waited longest is offered first; shortages,
  bosses and bonuses keep their priority.
- A crossing due after a Day-ending round resolves (played, failed or
  skipped) before the Day choice, which then appears and applies once.
- Input stays with the street: every first hop needs a fresh press after
  the introduction, a bump or a pause, and leaving the crossing, any key
  still held (not only Space) is ignored in the next cup until released.
  The other adventures keep their existing behaviour. Pause, the Tea Break,
  backgrounding, sound-off and reduced motion are respected.

Teacup combat, continuous steam, Auto Steam, shot statistics and secrets,
the Day system and Heat, and the other adventures are unchanged.

Released following project-owner playtesting approval. Gameplay, timing and
scoring were frozen for publication.

## [0.14.0] - 2026-10-29 — Another Day, Another Brew

### Added

- **0.14.0 — Another Day, Another Brew:** Days of ten completed normal tea
  rounds. After readings, upgrades and scheduled adventures, choose **FRESH
  BREW** (reset additional combat Heat) or **KEEP THE KETTLE ON** (carry Heat
  forward to a bounded maximum). Both preserve chapters, unlocked teas,
  fortunes, spoon upgrades, score, Tea Cash and scheduled arcade encounters.
- Day/cup/Heat HUD text, keyboard 1 / 2 and large touch/mouse choices, short
  Canvas acknowledgements, and optional synthesized kettle sounds.
- Deterministic sixty-round tests and development-only `?debug&day=...`
  practice scenarios; see [Day testing](docs/DAYS_TESTING.md).

### Changed

- Normal-cup targets use Heat instead of global round. Cups 1–10 retain
  their existing curve; continued Heat adds up to 20% speed and 15% shorter
  spawn intervals, with overall safety limits. Chapters still control content.
- README introduction puts the overworked silver spoon and its adventures first.
- Bonus and boss return paths now pass through the shared between-round
  handler so pending Day choices and encounters are preserved.

Released following project-owner playtesting approval of both Day choices.
Maximum Heat was challenging but manageable; no further tuning was requested.

## [0.13.0] - 2026-10-29 — Biscuit Breakout & Karma

The biscuits have formed a wall. Negotiations have failed.

### Added

- **Biscuit Breakout:** a second optional Arcade Interlude, offered after
  round 19 in Chapter 2 and then every 14 normal rounds (THE BISCUITS ARE
  REVOLTING!). BREAK THE BISCUITS starts it; LEAVE THEM ALONE costs nothing.
- A 45-second brick-breaker: move the silver-spoon paddle (← / → or A / D;
  hold ◀ / ▶ on touch) and launch a sugar cube (Space, or LAUNCH) into a
  4 × 6 wall of biscuits. Three cubes. Where the cube meets the spoon sets
  its angle; it never goes flat. Fixed 120 Hz steps, an independently seeded
  wall, and axis-by-axis collision with push-out: no tunneling or sticking.
- Scoring: 10 points per biscuit (always kept), 5 Tea Cash for breaking at
  least 70% (17 of 24), and 50 bonus points for a clear. Results: NOTHING
  LEFT BUT CRUMBS!, A CRUMBLING SUCCESS., or THE BISCUITS HAVE WON THIS ROUND.
- One biscuit per wall has a face. Breaking it earns no extra points but
  prompts: "THAT'S A CRUMBY WAY TO TREAT SOMEONE!"
- **Karma**, a rare fortune (about 3–4% of readings): *What Goes Around…*
  For one normal cup, a leaf reaching the rim bounces back once (INSTANT
  KARMA!); if it returns, it vanishes in a puff of steam. No cup is lost and
  the strainer is untouched. A vanished leaf counts towards finishing the
  cup but is not a kill: no points, no residue, no shot or secret credit.
  Karma has its own colour, return-arrow glyph, `rim rebounds` HUD tag,
  sounds, and fortune-panel explanation.
- Arcade Interludes now support several adventures. When more than one is
  due, the one waiting longest is offered first; at most one per reading.
  The offer card is shared and reworded per adventure.
- Development-only helpers: `?debug&arcade=biscuitBreakout&seed=42` and
  `?debug&fortune=karma` (see `docs/BISCUIT_BREAKOUT_TESTING.md`).

### Changed

- A Space still held when a Daily Pour or Biscuit Breakout ends is ignored
  in the next cup until it is released and pressed again.
- Adding Karma to the weighted draw changes which fortune a given seed
  produces. Seeded tests that depended on the old sequence now set their
  preconditions explicitly.

The Daily Pour, Tea Shortage schedule, boss and bonus priorities, Auto Steam
and teacup combat outside Karma are unchanged. Released following
project-owner playtesting of Biscuit Breakout and a complete idle Karma cup.

## [0.12.0] - 2026-10-29 — The Daily Pour

The spoon has a paper route. Nobody knows why.

### Added

- **The Daily Pour:** an optional arcade adventure offered after round 12
  in Chapter 2, then every 14 normal rounds after an offer. Skipping costs
  nothing; cups, score, upgrades, Tea Cash and the waiting fortune carry on.
- A 30-second, independently seeded neighborhood route ridden by a silver
  spoon on a bicycle. Aim for mailboxes (↓) or porches (↑) and throw (Space,
  or AIM / THROW on touch); papers fly to fixed landing points.
- Delivery scoring and modest rewards: 25 points per delivery, 5 Tea Cash
  for five or more of seven, and a 50-point bonus for a perfect route.
- Neighborhood humor: a dog with an appetite for journalism, an extremely
  unwilling non-subscriber, a watchful garden gnome, and one pedestrian with
  questions about spoon anatomy. All are scenery, not obstacles or targets.
- Lightweight Arcade Interlude scheduling that waits behind existing
  encounters and preserves readings, upgrades, Tea Shortages, bosses and
  bonus rounds without building a backlog.
- Original Canvas vector art, synthesized sounds and soundtrack variation,
  keyboard and touch controls, and a development-only direct launcher with
  deterministic course replay (see `docs/DAILY_POUR_TESTING.md`).

### Fixed

- Suspended Tea Run coffee cups now have finite physical collision boxes
  (height 78, clearance 40). The rope is decorative.
- Successful aerial jumps can genuinely clear the cups, while sliding
  remains valid. Aerial success remains 70%.

Teacup combat, Auto Steam and existing Tea Run encounters are unchanged.
Released following project-owner playtesting.

## [0.11.0] - 2026-10-28 — The Flying Spoon

### Added

- **0.11.0 Milestone 2 — The Flying Spoon:** optional Tea Shortages return
  after rounds 9, 16, 23, 30, 37 and every seven rounds thereafter. Delayed
  visits retain their opportunity and skip missed targets without a backlog.
- Unexpected detours in the existing Tea Run, with vector animation,
  synthesized sounds, reduced-motion support and discoveries remembered for
  the current pot. Spoiler details and practical playtest steps are in
  `docs/FLYING_SPOON_TESTING.md` and the design document.
- **The Pocket Teacup:** independent, remembered Compact
  / Full View. Touch capabilities choose the initial view, including wide
  tablets and mixed-input devices; a visible switch always overrides it.
- Compact HUD outside the canvas, viewport-fitted portrait and landscape
  layouts, safe-area spacing, reachable actions, and large steering/runner
  controls. Upgrade and Tea Shortage cards sit outside the playfield.
- **The Tea Break:** pause safely to read pot statistics, tea mechanics,
  fortunes, and controls or change settings. Required choices and the
  existing side-mission sequence retain their own flow.
- Focused capability, persistence, responsive, menu, and input regression
  checks, plus browser screenshots for human device testing.

### Fixed

- Scoped long-press callout and selection protection across the game surface
  in Easy and Classic Touch; pointer cancellation and phase changes release
  holds. Keyboard and assistive activation work on steering and runner pads.
- Menu keyboard input cannot leak into gameplay, and dismissing a backgrounded
  or previously paused menu does not resume the simulation.

Auto Steam and teacup combat rules are unchanged. Released following
project-owner playtesting.

## [0.10.0] - 2026-10-28 — The Tea Run

### Added

- **The Tea Shortage:** after round 9, once Chapter 2 is open, buy a tin
  with Tea Cash, run to the shop, or skip. The first milestone takes priority;
  upgrade choices, pending bonus encounters, and the next fortune are kept.
- **The Tea Run:** a seeded, automatically running sidewalk errand. Jump
  sugar cubes and puddles, slide under coffee cups, and reach the shop for
  the same one-sugar restock as buying, plus 5 Tea Cash. Three stumbles end
  the errand without costing a cup. Coins pay 5 points and tea packets 10,
  kept even on failure; failure and skipping grant no restock or cash.
- **Easy Touch and Auto Steam:** two steering pads, double-tap milk, and
  long-press sugar, with remembered preferences. Classic Touch remains
  available. Runner controls replace cup gestures during the errand.
- Returning from the runner clears held input before the next cup advances,
  preventing the Space used to go home from also firing a steam shot.
- Runner statistics use the DOM HUD, with a separate road progress bar.
  A 1.25× street zoom leaves collision coordinates and UI unchanged; phone
  instruction/result cards and HUD layout support both graphics modes.

## [0.9.0] - 2026-10-28 — Strange Brews

The tea has developed a personality. Several, actually.

### Added

- **Strange Brews:** the tea has developed a personality. Several, actually.
  The first cup is still the familiar House Blend; every cup brews a
  variety, announced as it pours, each changing how the round plays. A
  variety never comes twice in a row, and none stays away for long.
  - **Green Tea** — *A Little Too Refreshing.* Leaves rise a little faster,
    and some of them dart: a flickering crouch, then a sprint.
  - **Earl Grey** — *Trouble with a Touch of Class.* Some leaves change
    lanes, after a lavender curl shows which way.
  - **Chai** — *Spice Things Up.* Spice currents sweep every leaf one lane
    sideways on a steady clock, with arrows round the rim to warn which way.
  - **Black Tea** — *Properly Strong.* Leaves arrive more often, and every
    leaf scores 25% more.
  - **Herbal Tea** — *What Could Possibly Go Wrong?* A gentler cup: slower
    leaves, and milk lingers. The leaves may get ideas.
- **Chapters: a slow burn with milestones.** The pot now unfolds in
  chapters instead of speeding up every round. *Learning to Steep* keeps a
  steady, approachable pace with three teas: the House Blend, Herbal Tea,
  and Earl Grey. Beat The Daily Grind and *Things Heat Up*: the leaves get a
  little livelier (once, not every round), and the rest of the shelf opens
  up, one tea at a time, each served the round it arrives and marked as new.
  A new chapter is announced with a little ceremony: *The next brew awaits.*
- **The Daily Grind is now a milestone:** it always arrives after round 5.
  Lose, and it costs nothing; it simply comes back two cups later, no
  tougher than before, until you beat it. After that it still drops in now
  and then, just for fun. Hot Chocolate Havoc now comes after round 3 or 4
  and always makes way for the boss, turning up a cup later instead.
- **Milk's recovery pulse:** every pour in a tea round now ripples through
  the whole cup, nudging every leaf back a little and slowing the cup for a
  moment, on top of the familiar cloud in front of the spoon (the stronger
  of the two always wins; they never stack). Still two pours a cup.
- The new tricks are introduced gently. A tea's first rounds on tap bring
  fewer darting or wandering leaves, longer warnings, shorter dashes, and
  more calm between Chai's currents; each variety reaches full strength in
  its ninth round on tap, however late in the pot it arrived. A dash always
  covers a set distance, so it never grows with faster leaves.
- The tea and the fortune are separate layers, and they combine: Earl Grey
  under The Spiral, Black Tea with the Golden Spoon, Chai in Tempestuous
  Tea. Hot Chocolate Havoc and The Daily Grind keep their own liquids and
  rules.
- Each tea has its own colours and currents, easing in as the cup is poured,
  and its own touch on the soundtrack. Every warning has a sound as well as a
  sight, and each behaviour has its own shape, not just its own colour.
- <kbd>↑</kbd> pours milk and <kbd>↓</kbd> fires sugar, beside the turning
  arrows. <kbd>Q</kbd> / <kbd>M</kbd> and <kbd>E</kbd> / <kbd>S</kbd> still work.
- `?tea=<id>` (`green`, `earlGrey`, `chai`, `black`, `herbal`, or `house`)
  brews only that variety, for practice, without waiting for its chapter.

### Changed

- **More approachable pacing.** Leaves no longer speed up or arrive faster
  every round: each chapter holds its own steady pace, about where rounds 1
  and 2 used to be, and the second chapter is a single step up. Rounds need
  two more leaves each time instead of four, up to 32, so they stay brisk.
- Darting leaves' dashes are shorter (10, 14, and 18 units by stage), to
  match the calmer leaves: a dart still never reaches the rim noticeably
  sooner than an ordinary leaf would.
- The HUD names the tea: in the round's title, in a pill under the omen, and
  in a new row of the cup status panel. The boss's result card says what
  happens next.
- README: a "Support the Project" section.

## [0.8.0] - 2026-10-27 — The Daily Grind

### Added

- **The Daily Grind:** the game's first boss. Somewhere around round 7, and
  now and then after that, someone orders trouble, and a furious little
  espresso machine rises out of the cup. Steam its safety valve while it's
  open, dodge the lanes it warns about, and deal with the beans. Beat it for
  a big bonus and a Golden Spoon for the next cup. If it gets away, your
  cups, spoon, and next fortune are untouched; the pot carries on.

### Changed

- **Controls:** <kbd>Q</kbd> pours milk and <kbd>E</kbd> fires sugar, next to
  the turning keys. <kbd>M</kbd> and <kbd>S</kbd> still work.
- **Hot Chocolate Havoc:** marshmallows cool a little faster, so flames about
  0.3 s apart toast them perfectly (it was about 0.4 s). Holding fire still
  burns them.

## [0.7.0] - 2026-10-27 — Hot Chocolate Havoc

### Added

- **Hot Chocolate Havoc:** an occasional bonus round between cups. The tea
  turns to hot chocolate, marshmallows float up, and the spoon fires little
  flames. Toast them well for bonus points; burn them and the cup will
  notice. It costs no cups and keeps your spoon, upgrades, and next fortune.
  The first one always comes by round 6. There may be a surprise or two.

### Changed

- **Aiming:** the lane the spoon will fire down now glows, with a marker at
  the firing point and a flash when a shot goes (three lanes for sugar, all
  sixteen for a Steam Nova). The spoon still turns smoothly.

## [0.6.0] - 2026-10-27 — The Kettle Sings

### Added

- **Adaptive soundtrack:** with sound on, a procedural synth band follows the
  cup. Tempo drifts with the round and the fortune; layers build as leaves
  near the rim and relax when they're cleared. The Golden Spoon, Tempestuous
  Tea, and the Steam Nova each colour it.

### Changed

- Fortune descriptions no longer say "next cup" while that cup is being
  played.
- README: a new screenshot, a short "How to play", and the sound, graphics,
  and seed options gathered in one place.

## [0.5.0] - 2026-10-27 — Something's Brewing

### Added

- **The Prismatic Sugar Cube:** a rare, fleeting crystal (from round 2, any
  fortune) that sets off a **Steam Nova** down all 16 lanes when steamed. The
  nova is ordinary steam, so Double Trouble makes it 32 darts and the Golden
  Spoon gilds it.
- **Unexpected brews:** some combinations unlock new behaviours, announced
  the first time they happen. Three to find for now.
- The leaves now notice certain feats and reward them. They don't say which
  in advance.
- Milk occasionally does something nobody mentions.

## [0.4.0] - 2026-10-27 — A Spoonful of Trouble

### Added

- **Tea strainer:** catches the first escaping leaf each round (more with
  upgrades), with a metallic glint, leaf fragments, and a clink.
- **Grace period:** for a second after a spill, further escaping leaves are
  sloshed back into the cup instead of costing cups.
- **Milk backwash:** pouring milk pushes leaves in its wedge back towards the
  centre with a visible wave, as well as slowing them.
- **Spoon upgrades**, offered two at a time after rounds 1, 3, 5, …, kept for
  the whole pot: Polished Spoon, Quick Stir, Sugar Scoop, and Strainer
  Attachment, each with stacking limits and its own look on the spoon.
- **The Golden Spoon:** a rare golden-cube reward (and part of every jackpot)
  that fires faster golden steam for 9 seconds.
- A new Leaves Lie prank: a briefly enormous spoon.
- `STRAINER` pill and spoon summary in the HUD.

### Changed

- Near misses make Tempestuous Tea slightly more likely.
- Enter no longer skips a reading that is offering an upgrade.

## [0.3.0] - 2026-10-27 — The Leaves Have Opinions

### Added

- Five new fortunes, each lasting one round: **Sugar Rush** (sugar bursts
  regrow), **Double Trouble** (twin, veering steam darts), **Tempestuous Tea**
  (wilder currents, faster leaves), **Golden Opportunity** (a short-lived
  golden sugar cube with a random reward, occasionally an extra cup), and the
  rare **The Leaves Lie** (a confident prophecy, a change of mind, and a
  harmless prank during the next round).
- Fortune choice is now a weighted draw: the leaf pattern is a strong
  favourite, and sugar use, milk use, spills, and clean rounds nudge the odds.
- A more theatrical reading: leaves settle, light up along the glyph, and a
  card with a shimmer, the fortune's quip, and its own sound appears.
- An omen pill in the HUD showing the active fortune and any countdown, and
  short messages under the cup.

## [0.2.0] - 2026-10-27 — The Living Teacup

### Added

- A living tea surface: drifting currents, reflections, and ripples that react
  to the spoon, kills, spills, milk, and sugar, plus rare surprises. It settles
  while paused and tones down under reduced-motion settings. Gameplay is
  unchanged.
- A **Graphics** toggle (High by default, Low for older machines), remembered
  between visits and selectable with `?graphics=low|high`.

## [0.1.1] - 2026-10-27

Name-only maintenance release.

### Changed

- Renamed the game from *Storm in a Teacup* to *Steeped in Trouble*. The
  repository is now `libertaine/Steeped-in-Trouble` and the game is served at
  <https://libertaine.github.io/Steeped-in-Trouble/>. The old Pages address no
  longer serves the game. Gameplay is unchanged.

## [0.1.0] - 2026-10-27

The original single-file prototype, restructured into a maintainable project
with the same gameplay.

### Added

- Vite project with ES modules: separate simulation, rendering, input, audio,
  and HUD code, and central gameplay configuration.
- Seeded gameplay randomness (`?seed=` URL parameter) for reproducible
  matches.
- Unit tests (Vitest) and browser smoke tests (Playwright: Chromium, Firefox,
  mobile viewport).
- CI on Ubuntu and Windows, and automatic deployment to GitHub Pages.
- The original prototype, preserved in `docs/reference/` with its SHA-256
  checksum.

### Fixed (compared with the prototype)

- Pressing Enter on a focused main button no longer triggers it twice.
- Browser shortcuts with Ctrl, Alt, or Meta no longer trigger game actions.
- Held controls are released on pause, restart, and when the page is hidden,
  and the game also pauses when the tab is hidden.
- A failed pointer capture on the touch buttons no longer throws an error.

See [docs/reference/README.md](docs/reference/README.md) for the complete
list of differences.

[Unreleased]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.15.0...main
[0.15.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/13b097c...v0.5.0
[0.4.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/73e1fad...13b097c
[0.3.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/f0357ee...73e1fad
[0.2.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.1.1...f0357ee
[0.1.1]: https://github.com/libertaine/Steeped-in-Trouble/releases/tag/v0.1.1
[0.1.0]: https://github.com/libertaine/Steeped-in-Trouble/releases/tag/v0.1.0
