# Architecture

Steeped in Trouble is a static browser game. It uses vanilla JavaScript ES
modules, Canvas 2D, and Vite for builds. There is no runtime dependency and
no backend.

```text
src/
├── main.js              wires everything together; the only file that knows all parts
├── config.js            every gameplay and layout constant
├── core/
│   ├── game.js          simulation: phase machine + per-frame update, emits events
│   ├── state.js         phases and the plain-data state shape
│   ├── random.js        seeded RNG (mulberry32)
│   ├── checkpoint.js    versioned normal-round snapshots and strict validation
│   ├── sessions.js      active instance routing, suspended pot, disposable practice
│   └── timing.js        requestAnimationFrame loop with clamped delta time
├── gameplay/            rules, as pure functions over state
│   ├── arena.js         lanes, angles, polar → canvas mapping
│   ├── player.js        spoon movement
│   ├── enemies.js       tea-leaf spawning and movement, darting and wandering, sideways glides
│   ├── progress.js      the chapters: which one a pot is in, which teas are on tap, each tea's age
│   ├── teas.js          Strange Brews: tea varieties, their draw, modifier composition, Chai's currents
│   ├── strength.js      Strange Brews' learning curve: which stage a tea's age is in, per-stage tuning
│   ├── weapons.js       steam, sugar, milk (its backwash and recovery pulse), hit testing, scoring
│   ├── golden.js        the golden sugar cube and its rewards
│   ├── prismatic.js     the rare prismatic sugar cube and its Steam Nova
│   ├── secrets.js       hidden feats judged when a round is read, and their rewards
│   ├── combos.js        unexpected brews: combinations that unlock new behaviour
│   ├── chocolate.js     Hot Chocolate Havoc: the bonus round's schedule, marshmallows, flames, scoring
│   ├── shortage.js      Tea Cash, shortage scheduling, and restock
│   ├── teaRun.js        seeded runner course, actions, collisions, and settlement
│   ├── arcadeInterludes.js small optional-mission registry, eligibility, scheduling, one-time rewards
│   ├── dailyPour.js     independent paper route, fixed-step flights, delivery testing and settlement
│   ├── biscuitBreakout.js seeded biscuit wall, fixed-step paddle and cube physics, results and settlement
│   ├── crossingStreet.js seeded road and its fairness planner, fixed-step hops, swept collisions, settlement
│   ├── autoSteam.js     pure decisions about firing at aligned targets
│   ├── grind.js         The Daily Grind: the coffee boss's schedule, valve, attacks, scalds, rewards
│   ├── upgrades.js      spoon upgrades: definitions, offers, stacking limits
│   └── fortunes.js      leaf reading, fortune selection, modifiers, glyphs
├── rendering/
│   ├── canvas.js        device-pixel-ratio-aware canvas sizing
│   ├── renderer.js      draws state onto the canvas
│   ├── effects.js       cosmetic particles and the spill flash
│   ├── grind.js         draws the espresso machine and its attacks
│   ├── dailyPour.js     draws the paper route
│   ├── biscuitBreakout.js draws the tray, biscuits, spoon paddle, cube and the talking biscuit
│   └── crossingStreet.js  draws the street, traffic, the spoon, the tea shop and the offer preview
├── dev/                 development-only practice helpers (days.js, crossing.js, collection.js); removed from production
├── storage/localProgress.js injected localStorage adapter: separate arcade records and pot checkpoint
├── input/               controls.js wires input; gestures.js recognises touches; settings.js persists preferences
├── audio/
│   ├── audio.js         optional synthesized sound effects; owns the AudioContext
│   └── music.js         the adaptive procedural soundtrack
└── ui/                  hud.js, presentation.js, collection.js: HUD, views/Tea Break, collection/save controls
```

## The one rule: simulation vs. presentation

The Daily Pour adds `rendering/dailyPour.js` alongside the existing painters.
It reads simulation state, including animation clocks, and never generates
a route or chooses a delivery result.

`core/` and `gameplay/` never touch the DOM, canvas, audio, `Math.random`, or
the clock. They mutate a plain state object and push **events** describing
what happened (`kill`, `escape`, `reading`, …).

Everything else is presentation. It reads state and reacts to events, but
never changes gameplay state. This is why the whole game can be unit-tested
in Node, and why a seed reproduces a match exactly.

## The soundtrack

`audio/music.js` is presentation like the rest: it reads state and events
and never changes the game. Three pure functions make the musical decisions,
so they can be unit-tested: `rawTension(enemies)` (how close the leaves are to
the rim, 0–1), `musicMood(state, tension)` (section, target tempo, Golden
Spoon, stormy tea), and `arrange(step, mood)` (the notes to start on one
sixteenth-note step). `createMusic()` smooths the tension (quick to rise, slow
to fall), glides the tempo, and schedules each step's notes about 0.12 s ahead
on the Web Audio clock, so tempo changes never bend pitch. A pause, game over,
or hidden tab simply stops scheduling. The band shares `audio.js`'s
AudioContext and the Sound toggle.

## Main loop

`main.js` starts one `createLoop()` (calling `start()` again is a no-op). Each
frame:

1. `effects.update(dt)` ages particles.
2. `controls.update()` notices gestures, then input-generated events are
   drained before simulation so phase changes reset held input immediately.
3. `game.update(dt, controls.held)` advances the simulation, then its events
   are passed to `effects`, `audio`, and (for phase/input boundaries)
   `controls.reset()`.
4. `audio.update(state, dt)` keeps the soundtrack scheduled.
5. `renderer.draw(state, fx, dt)` paints the frame, and `hud.update(state)`
   updates changed DOM text.

`dt` is capped at 0.04 s (`CONFIG.timing.maxFrameSeconds`), so a slow frame
or a return from a background tab never causes a large jump. One-shot
actions (fire, milk, sugar, Enter, P, R) call game methods immediately from
input handlers. Their events are handled on the next frame.

## State transitions

```text
          Enter / button                       last kill of the round
  ready ─────────────────▶ playing ─────────────────────────▶ reading
                           │  ▲  │                               │
              P / button / │  │  │ last life lost                │ Enter / button
              blur / hidden▼  │  ▼                               │ (round + 1,
                         paused  gameover ── Enter/R/button ─┐   │  fortune applied)
                                                             ▼   ▼
                                                      new match / next round → playing
```

The update only advances during `playing`. During `reading` it advances just
`readingTime`, which drives the leaf animation.

Leaving a reading normally brews the next cup. When `state.havocDue` is set
(decided by `havocDue()` at the reading), it goes to `chocolate` instead: Hot
Chocolate Havoc, which runs through `state.chocolate.stage` `intro` (Enter
skips it) → `play` (P pauses) → `outro` (Enter, after a moment), then brews
the next cup as usual. The bonus round never touches the round number,
`nextFortune`, the spoon, or the lives, and the Golden Spoon's timer doesn't
run during it. Rewards go through `state.score` and `state.extraSugar`.

The Daily Grind, the coffee boss, works the same way. `grindDue()` is decided
at the reading after `havocDue()` and is never true alongside it, and a due
boss goes to the `grind` phase (the scheduling, and what a victory opens, are
under [Chapters and the milestone](#chapters-and-the-milestone)): `state.grind.stage` `intro` (Enter skips it)
→ `fight` (P pauses) → `outro` (Enter, after a moment), then the next cup.
The fight reuses the real `fireSteam()`, `sugarBurst()`, and `pourMilk()`
(so upgrades and the Golden Spoon apply) with neutral fortune modifiers and
fresh milk and sugar. Its three scalds are its own; losing never touches the
cups, and only a victory changes them (a Perfect Brew restores one, up to
four). The Golden Spoon a victory awards starts with the next cup.

## The Tea Shortage and Tea Run

A reading also decides `shortageDue`: round 9 or later, in Chapter 2, and
never alongside a milestone. After any upgrade choice,
`continueFromReading()` enters `shortage` before a pending bonus or rematch.
The Buy / Run / Skip choice opens after 1.2 seconds. Enter never chooses.
Starting a shortage consumes its schedule; `scheduleNextShortage` advances
`shortageAfter` to the next future target in 9 + 7n. Delays coalesce into one
visit, never a queue. A new match resets the target to 9.

Buy deducts Tea Cash and adds next-cup sugar; Skip changes neither.
Run enters `teaRun`: `intro → run → finish → outro` on success, or
`intro → run → outro` on failure. Only intro and active running can pause.
`gameplay/teaRun.js` owns the course, plain runner state, jump/slide buffer,
collisions, and one-time settlement. It uses its own seeded generator,
independent of leaves, teas, fortunes, and bonus encounters. Both exits call
`continueFromReading()` again, preserving pending encounters and fortunes.
Restock uses `extraSugar`, consumed only by `startRound()`.

`rendering/teaRun.js` paints a separate street scene. A 1.25× transform about
the spoon's feet scales only the street, obstacles, pickups, and spoon.
The progress bar and cards draw after restoring that transform; DOM pills
show time, pickups, and stumbles. Compact cards depend on displayed canvas
width, never on simulation coordinates. `ui/hud.js` sets `body[data-mode]`
for the runner controls and phone HUD layout, including while paused.

The Flying Spoon keeps all movement inside the existing runner. `updateRun`
accumulates display deltas into 1/120-second ticks. A jump's analytic parabola
uses `launchHeight`, the original impulse and gravity. Each fresh airborne
Jump press draws from `runSim.rng` (the errand stream); failure sets `locked`
until landing, consumes the press, and cannot become a queued ground jump.
Slide/recovery buffering retains its original scope. The hitbox reads the
same `spoonHeight` as the painter; passed obstacles cannot hit from behind.

After course planning, one errand-stream draw chooses a hidden opportunity:
orbit 1%, power 8%, bird 14%, otherwise none. `opportunity` only becomes an
`encounter` after its configured altitude is reached. `encountered` prevents
another event in that attempt. `state.aerialDiscoveries` records only found
ids, emits `runDiscovery` on first discovery in a pot, and resets on restart.
There are no persistent achievements or score bonuses.

`encounter` is a substate of active running, so existing pause, Tea Break,
visibility and input isolation continue to work. Only its presentation time
advances during a detour: course clock, distance, timer, obstacles, pickups
and stumble protection freeze. Returning retains the same course location;
hazards overlapping or entering the reaction window are marked `bypassed`,
without hit/pickup/reward settlement. The normal shop finish is still needed.

The painter follows altitude above the ordinary jump envelope, without
changing collision coordinates. `run.age` drives all runner animation and
freezes with simulation. Bird, wire, smoke, Earth, satellite, teapot and
reentry use canvas paths. Reduced motion suppresses the zap tint and smoke,
wing flaps and space rotation. Short event sounds reuse the global sound
toggle. A `?debug` Vite-development-only `previewAerial` helper is removed
from production; automated production tests use the existing mutable state
hook and explicit simulation steps, documented in `FLYING_SPOON_TESTING.md`.

## Chapters and the milestone

Leaf speed and spawning no longer grow with the round. `gameplay/progress.js`
keeps a pot's progress as plain data, `state.progress = { chapter, starts }`
(`starts[i]` is the first normal round of chapter *i* + 1), and the tuning
of each chapter in `CONFIG.chapters`: its `enemySpeed` multiplier (applied
once, to each new leaf's speed in `spawnEnemy()`, outside the × 1.35 cap on
tea and fortune), its `spawnInterval` (read by `updateSpawning()`), and its
`teas`, each with the number of rounds after the chapter's start before it
comes on tap. Nothing else checks the chapter number: `currentChapter()`,
`teasOnTap()`, `debutTea()`, and `teaAge()` answer every question.

Chapter 1's milestone is The Daily Grind. `state.grindAfter` holds the round
it must follow (`CONFIG.grind.milestoneAfter`, 5, at a new match) until it is
beaten; `milestoneDue()` reads it. At a reading `readLeaves()` asks
`havocDue()` first and, if the hot chocolate wants a reading the milestone
needs, puts it off (`state.havocAfter = round + 1`) instead of dropping it;
then `grindDue()` is true for the milestone, or after the first victory an
occasional rematch that still gives way to the hot chocolate. `startGrind()`
marks the encounter `milestone` if it was the scheduled one, and
`leaveGrind()`, the only way out of the fight, settles it: a victory calls
`advanceChapter(progress, round + 1)` and clears `grindAfter`; an escape sets
`grindAfter = round + CONFIG.grind.retryAfter`. Rematches after the first
victory aren't milestones, so they can't advance anything. The fight itself
never reads the chapter.

`roundStart` carries `chapter`, `opens` (this cup begins a chapter after the
first), and `debut` (the tea has just come on tap), for the chapter card,
the *new on the shelf* tea card, and the chord. A new match resets
`state.progress` with everything else.

## Coordinate system

- **Logical canvas:** 920 × 790 units, origin at the top-left, y pointing
  down. The renderer always draws in these units, and `draw()` scales them to
  the canvas backing store. `canvas.js` sizes the backing store to the
  displayed size × devicePixelRatio (capped at 2). CSS `aspect-ratio` keeps
  the display proportional, so nothing is distorted. Resizing never touches
  game state.
- **Simulation positions are polar:** a `radius` from the cup centre
  (451, 400) and an `angle` in radians. Angle 0 points right and angles
  increase clockwise. The rim is at radius 273.
- **Lanes:** 16 lanes. Lane 0 is at the top (−π/2) and lanes increase
  clockwise. `laneOf(angle)` snaps to the nearest lane, and
  `laneAngle(lane)` gives its centre line.

## Randomness

`createGame({ seed })` builds a seeded generator. All gameplay randomness
(spawn lanes, speeds, timers, residue scatter, Spiral drift direction) comes
from it. Hot Chocolate Havoc and The Daily Grind each draw from their own
generator derived from the same seed (`treats` and `brew` in
`createGame()`), so neither changes the sequence the normal rounds see. The
tea varieties draw from a fourth (`steep`), which advances by exactly two
numbers per round start, so the teas come in the same order however the
cups are played. Effects use `Math.random`, so changing particles can never
change gameplay. The URL parameter `?seed=` sets the seed in the browser,
`?tea=<id>` brews only one variety (`createGame({ tea })`; unknown ids are
ignored), and the `?debug` parameter exposes `window.__TEACUP__.game` for
tests and tinkering.

## Tea varieties

`gameplay/teas.js` holds Strange Brews. Each normal round has one tea, kept
in `state.tea`; it is the round's environment, and the fortune is a separate
layer on top. `startRound()` in `core/game.js`:

1. calls `chooseTea(state, steep)`. Round 1 is always `house`; a tea that
   comes on tap this round (`debutTea()`) is served at once; otherwise it
   draws from `teasOnTap()`, never repeating `state.tea`, weighted by rounds
   since each was last served (`state.teaServed`), with any variety missing
   for more than `CONFIG.teas.maxAbsence` rounds served next. It always
   draws exactly one number. Then `state.teaAge` is set from `teaAge()` (a
   pinned tea's age is the round number);
2. sets `state.modifiers = roundModifiers(state.fortune, state.tea, state.teaAge)`,
   which folds the tea's modifiers at its age (`teaModifiers()`: its
   fixed `modifiers` plus whatever its `strength(age)` gives) into the
   fortune's by the rules in `COMBINE`
   (multiply, add, max, or) and caps leaf speed. As with fortunes, gameplay
   reads only `state.modifiers` and never checks tea ids, and the next round
   start recomputes everything;
3. for Chai (`modifiers.spiceCurrents`), puts a current clock in
   `state.current` (`createCurrent(dir, age)`), which `updateCurrent()`
   runs each frame: `calm` → `warning` → `flowing` → `calm`, emitting
   `currentWarn`, `currentFlow`, and `currentEnd`. The clock carries its
   own warning and calm lengths for the round, and keeps any overshoot
   from one stage into the next, so it keeps time at any frame rate.

How strongly a variety brews grows with its age (`gameplay/strength.js`):
the normal rounds since it came on tap, counting the first. `teaStage(age)`
finds the stage from `CONFIG.teas.stages`, and `byStage(values, age)` picks
the value from a per-stage list in `CONFIG` (`CONFIG.darting.chance`,
`CONFIG.currents.warnTime`, and so on). Only the age counts, not how often
the tea was served, so a tea arriving late still starts gentle, and a pinned
tea and an ordinary pot brew a tea of the same age alike.

`roundStart` carries the tea for the presentation. At a reading,
`teaFortuneNudges(state.tea)` adds a tea's extra fortune weights to the round
record (`record.nudges`), which is how Herbal Tea makes The Leaves Lie
likelier. `startGrind()` resets the modifiers to `modifiersFor(null)` and
`clearField()` drops the current, so neither bonus encounter ever sees the
tea. A new match resets `state.tea` and `state.teaServed`.

### Leaf kinds and glides

`spawnEnemy()` gives every leaf a `kind`. With the tea's `dartChance` or
`wanderChance` it may be a `darter` (with `dart: { stage, at, time, warn,
distance }`) or a `wanderer` (with `wander: { stage, at, dir, time, warn }`),
taking its warning time and dash distance from the tea's age that round;
otherwise it is a
plain `leaf`, and no random number is drawn for it. `advanceEnemy()` runs each
behaviour as a little stage machine (`waiting` → `warning` → …), emitting
`dartWarn`/`dart` and `wanderWarn`/`wander`, and the renderer's `drawEnemy()`
draws the telegraph from the same stage, so a warning is shown exactly when
the rules give one. A dash adds `distance` on top of the leaf's ordinary
movement, eased over `CONFIG.darting.dashTime`, so speed modifiers don't
stretch it; stage changes partway through a frame are split exactly.

A glide (`enemy.glide = { shift, length, time, done }`, started by `glide()`)
moves a leaf sideways smoothly. It adds its movement to the angle each frame
instead of setting it, so a wanderer's step, a spice current, and The
Spiral's drift all compose; a new glide folds in what is left of an old one.

## Input

`controls.js` keeps `held = { left, right, fire }` and calls command
callbacks for one-shot keys (milk on Q, ↑, or M; sugar on E, ↓, or S). It
prevents page scrolling only for the arrow keys and Space, and it ignores key presses that use Ctrl, Alt, or Meta. Held
state is released on window blur, page hide, pointer up, pointer cancel, and
lost pointer capture, and (through the game's events) on pause and on a new
match.

Easy Touch recognises double-tap milk and long-press sugar on the canvas
alone. In Hot Chocolate Havoc it instead holds flames; in the runner,
Space/↑ and ↓ plus dedicated pads call jump and slide. `controls.update()`
runs before simulation to notice held gestures and changed phases.
Pause, match start, shortage, run start, and run end reset held input and
gestures. Changing gesture mode also forgets unfinished touches.
`input/settings.js` reads/writes guarded local storage; Easy Touch always
normalises to Auto Steam on. The game preserves that setting between pots.
`gameplay/autoSteam.js` only decides whether to call ordinary `fireSteam()`;
it never steers or spends milk/sugar, and never toasts automatically.

## Fortune system

At the end of a round, `game.js` builds a round record
(`{ milkKills, milkUses, sugarUses, escapes, leafLanes }`) and calls
`drawFortune(record, rng)`. First `selectFortune()` finds the pattern the
leaves point at: `readLeafPattern()` summarizes them (densest three-lane
cluster, occupied lanes), and the first fortune in `FORTUNE_PRIORITY` whose
`matches(reading)` accepts wins. Then every fortune's `weight(record)` is
added up, with `CONFIG.fortunes.patternWeight` extra for the pattern's
fortune, and one fortune is drawn with the gameplay generator. The pattern is
a strong tendency, never a guarantee.

Mid-round fortune mechanics live with the rules they change: Sugar Rush in
`updateSugarRegen()` and Double Trouble in `fireSteam()` (`weapons.js`),
Tempestuous Tea in `advanceEnemy()`, and the Golden Opportunity cube in
`gameplay/golden.js`. The Leaves Lie changes no rules; its reading twist and
prank are cosmetic, in `rendering/effects.js` and `rendering/tea.js`.

When the next round starts, `modifiersFor(fortuneId)` merges the fortune's
`modifiers` over `BASE_MODIFIERS` into `state.modifiers`. Gameplay code reads
only `state.modifiers` (for example `steamSpeedMultiplier`) and never checks
fortune ids. Modifiers last exactly one round, because the next round start
recomputes them, and a new match clears the fortune.

## Spoon upgrades and the Golden Spoon

Spoon upgrades last for the whole pot and are kept apart from fortunes:
`state.spoon` holds one level per upgrade (`createSpoon()` in
`gameplay/upgrades.js`), and `state.goldenSpoon` holds the seconds of Golden
Spoon left. Neither is touched by `modifiersFor()`. Each effect is read where
its rule lives (`steamSpeed()` and `steamCooldown()` in `weapons.js`,
`turnSpeed()` in `player.js`, `sugarCapacity()`, and `strainerCapacity()` at
round start), and every bonus multiplies the others, so a temporary effect
never replaces a lasting one. A new match resets both.

The Prismatic Sugar Cube is not a fortune. `startRound()` rolls for it with
`rollPrismatic()` from round 2 on, whatever the fortune, and
`gameplay/prismatic.js` places it and checks for a strike. A strike calls
`steamNova()` in `weapons.js`, which launches ordinary steam (the same
`launchSteam()` that `fireSteam()` uses) down every lane, so every bonus to
steam applies to the nova too. Nova darts carry `nova: true`.

Unexpected brews (`gameplay/combos.js`) put each rule where the rule it bends
lives: The Perfect Storm in `pourMilk()` and `updateClouds()` (through the
Tempestuous Tea modifier `stormyMilk`), The Silver Tornado's wake
(`tornadoWake()`, from `state.stir`) and Double Gilt's splash
(`giltSplashTarget()`) in `updateEnemies()`. Each calls `discover()` when it
first takes effect, which records it in `state.discovered` and emits
`discover` once per pot.

Each steam shot is a *volley*: `fireSteam()` gives its darts a shared
`volley` id and records how many are in flight in `state.volleys`. Every way
a dart is used up goes through `spendDart()`: a hit (a leaf or a sugar cube)
settles the volley at once, and the volley counts as wasted
(`roundStats.wastedVolleys`) only when its last dart fizzles out at the
centre. `readLeaves()` passes the round's stats to `findSecrets()`
(`gameplay/secrets.js`), applies each secret's award, and keeps the ids in
`state.secrets` for the reading to show.

When an upgrade is due, `readLeaves()` puts `drawOffer()`'s choice in
`state.offer`. The reading then waits: Enter and the main button do nothing
until `chooseUpgrade(index)` applies one and brews the next cup. The HUD
shows the offer as DOM buttons (`#upgradeOffer`).

## Milk: cloud, backwash, and recovery pulse

`pourMilk()` (`weapons.js`) lays a cloud over the spoon's lane and sets the
`backwash` of the leaves in its wedge. In a normal round the game's
`pourMilk` command then calls `milkPulse()`, which sets every leaf's
`backwash` to at least `CONFIG.milk.pulse.backwash` and `state.pulse` to the
pulse's duration (a second pour restarts it). `updateClouds()` runs both
down. `advanceEnemy()` scales movement by `milkSlow()`, the smaller of the
cloud's and the pulse's factors, and backwash only ever takes the larger
distance, so the two never stack. The pulse touches no stats; milk kills,
near misses, and the Perfect Storm stay with the cloud. Against The Daily
Grind the command calls `milkTheMachine()` instead, and `clearField()` zeroes
`state.pulse` between phases, so neither the boss nor the hot chocolate ever
sees a pulse. `milkPulse` is its own event for the presentation.

## Escaping leaves

A leaf reaching the rim goes through `escape()` in `core/game.js`. During the
short grace period after a spill it is washed back into the cup
(`washBack()`, the same eased push milk uses). Otherwise the tea strainer
catches it while `state.strainerLeft` lasts, and only then does it cost a
cup and start a new grace period.

Under Karma (`state.modifiers.karma`) `updateEnemies()` sends the leaf to
`karmaRim()` instead, before the grace period or strainer are consulted.
The first contact marks the leaf `karma: 'bounced'`, calls `washBack()` with
`CONFIG.karma.recoil`, and counts `roundStats.karmaBounces`. While its
`backwash` is still playing out, further contacts are ignored. The next
contact removes the leaf and calls `clearLeaf()`, which is the only thing a
kill and a Karma removal share: `state.kills` (the cup's cleared-leaf
progress, shown as "Leaves cleared") and the check that starts the reading.
`killEnemy()` alone adds score, residue, `kill` events, and the steam and
milk kill counts that secrets and fortunes read. Karma emits `karmaBounce`
and `karmaPuff` instead of `escape`, `strain` or `recoil`. Like every
removal in the loop, it returns as soon as the reading starts, so
simultaneous contacts cannot finish a cup twice.

## Extending the game

### Adding a fortune

1. Add an entry to `FORTUNES` in `gameplay/fortunes.js` with `name`,
   `quote`, `info`, `tag` (for the HUD pill), `tone` (`good`, `trouble`, or
   `odd`), `color`, `modifiers`, `weight(record)`, and a `glyph(t)` that maps
   t ∈ [0, 1] to an offset from the cup centre (the shape the leaves form).
2. Only if it is read from the leaf pattern, give it `matches(reading)` and
   insert its id into `FORTUNE_PRIORITY`.
3. If it needs a new effect, add a neutral default to `BASE_MODIFIERS` and
   read `state.modifiers.<name>` where the rule lives.
4. Put any tuning numbers in `CONFIG.fortunes` and add tests.

### Adding a tea variety

1. Add an entry to `TEAS` in `gameplay/teas.js` (`name`, `quip`, `title`,
   `info`, `tag`, `color`, `modifiers`, and optionally `fortuneNudges`, and
   `strength(age)` for modifiers that grow with the stage), and add its id
   to a chapter's `teas` in `CONFIG.chapters`, with the round it arrives.
2. If it needs a new effect, add a neutral default to `BASE_MODIFIERS`, a
   rule to `COMBINE`, and read `state.modifiers.<name>` where the rule lives.
3. Give it a liquid in `TEA_LIQUIDS` (`rendering/tea.js`), a pill colour in
   `styles/main.css`, and a touch in `TEA_MUSIC` (`audio/music.js`).
4. Put tuning numbers in `CONFIG.teas` (or a per-stage list read with
   `byStage()`) and add tests.

### Adding a chapter

1. Add an entry to `CONFIG.chapters` (`name`, `enemySpeed`, `spawnInterval`,
   and the `teas` it brings, each with the rounds after its start before it
   arrives).
2. Give the chapter before it a milestone that calls `advanceChapter()` when
   it is beaten, scheduled the way `grindAfter` schedules The Daily Grind
   (and kept clear of Hot Chocolate Havoc the same way).
3. Add tests: the chapter's speed and arrivals, its teas' arrival order, and
   that losing its milestone keeps the pot where it was.

### Adding an enemy type

1. Give spawned enemies a `kind` in `spawnEnemy()` (`gameplay/enemies.js`),
   and decide when each kind spawns. `darter` and `wanderer` are examples:
   their behaviour is plain data on the leaf, advanced in `advanceEnemy()`.
2. Branch on `kind` in `advanceEnemy()` for movement, and in the renderer's
   `drawEnemy()` for appearance.
3. If it scores or dies differently, extend `killEnemy()` in `core/game.js`
   or `killScore()`.

### Adding a spoon upgrade

1. Add an entry to `UPGRADES` in `gameplay/upgrades.js` (with `max`) and a
   level to `createSpoon()`.
2. Read `state.spoon.<id>` where its rule lives, and put tuning numbers in
   `CONFIG.upgrades`.
3. Optionally dress the spoon for it in the renderer's `drawSpoonAt()`.

### Adding a weapon

1. Write the action in `gameplay/weapons.js` as a function of
   `{ state, rng, emit }`. Check and spend its resource, add shots or zones
   to state, and `emit()` an event.
2. Expose it from `createGame()` behind the `playing()` check, and bind a key
   and button in `input/controls.js` / `main.js`.
3. Give its event a sound in `audio.js` and particles in `effects.js` if
   wanted, and draw any new shot type in `renderer.js`.

## Testing

- `ui/presentation.js` owns presentation preference, moves the existing
  primary action and choice cards between Compact and Full, and hosts the
  existing panels in one native Tea Break dialog. It never chooses a reward
  or a phase transition. Opening calls the existing `pause()` and clears
  input; the frame loop skips simulation updates while the dialog is open.
  Close resumes only a pause owned by that dialog; blur/hidden revokes it.
- `input/settings.js` keeps the view preference in a separate storage key
  from control settings. Primary/any coarse pointer and `maxTouchPoints`
  detect touch without user-agent strings. CSS combines width, available
  dynamic height, orientation, safe areas, and size-container measurements.
  The canvas keeps its logical 920 × 790 coordinates, DPR cap, and both
  graphics qualities. A uniform 1.16× camera enlarges the active cup without
  changing simulation coordinates or hitboxes; text overlays and the runner
  keep their existing transforms. Compact HUD/choices occupy separate rows.
- `tests/unit/` (Vitest, Node) tests gameplay through `createGame()` with
  fixed seeds and fixed time steps.
- `tests/browser/` (Playwright) holds smoke tests against the production
  build served under `/Steeped-in-Trouble/`, in Chromium, Firefox, and a
  mobile viewport. These assert state, HUD text, layout geometry, and input
  isolation. `mobile-compact.spec.js` captures screenshots for composition
  inspection; see [mobile browser testing](MOBILE_TESTING.md) for coverage
  and hardware limits. `PLAYWRIGHT_PORT` selects a separate local preview
  port when another server is already running.

## Biscuit Breakout and Karma (0.13.0)

`INTERLUDES` now lists `dailyPour` and `biscuitBreakout`, each with its own
`CONFIG.arcade` rule; `createArcadeSchedule()` builds one due round per
entry. `eligibleInterlude()` returns nothing if a shortage, boss or bonus is
due or an offer was already made at this reading, and otherwise the
eligible adventure with the earliest due round (ties in registry order), so
neither can starve the other. `state.interlude.id` tells `chooseInterlude()`
which mission to create, and the HUD (`ARCADE_OFFERS` in `ui/hud.js`) which
words to put on the shared offer card.

```text
reading → [upgrade choice] → arcadeOffer → biscuitBreakout.intro → play → outro
                                  │                                        │
                                  └── skip ──→ continueFromReading ←───────┘
```

`gameplay/biscuitBreakout.js` owns the mission. Its generator is the game
seed XOR `BREAKOUT_SALT` (`0xb15c0175`), used only by `planWall()` when the
mission is created (tints, decorations, the talking biscuit), so playing it
never changes teas, leaves, fortunes, bosses, the Tea Run or paper routes.
`updateBreakout(sim, dt, input)` runs 120 Hz ticks from a carried
accumulator, reading only `input.left` / `input.right`; `launchCube()` is a
one-shot command. The cube is a square hitbox moved one axis at a time:
after each axis it is reflected off rails, and pushed back out of the
biscuit it overlaps most, which breaks. At top speed it moves under 5 units
a tick against a 22-unit cube and 38-unit biscuits, so it cannot tunnel.
The spoon catches only a falling cube whose bottom crosses its top edge in
that tick, and sets the rebound angle from the contact offset, capped at
`cube.maxAngle`; since reflections keep the angle, every rally stays within
60° of vertical. `finish()` settles through `awardInterlude()`.

The talking biscuit's remark is `biscuitRemark(m)`, derived from the
mission clock, so it freezes with pauses. `rendering/biscuitBreakout.js`
draws everything from mission state and the mission clock (crumbs scatter
by a fixed hash of the biscuit id) and consumes no randomness. The HUD pills
show time, biscuits and cubes; the canvas keeps a slim time bar and the
speech bubble above the tray, clear of the cube and spoon.

Input: `game.breakoutControls()` gives Space, ↑ and ↓ to the mission
(`launchCube`, once per press, never on keyboard repeat) while the turning
keys keep filling `held.left` / `held.right`. Touch adds a LEFT / LAUNCH /
RIGHT row (`.controls-breakout`; the pads reuse `data-hold`, LAUNCH is
`data-biscuit`). On `pourEnd` and `breakoutEnd`, `main.js` calls
`controls.settle()`: holds are cleared, and a Space still down is ignored
until released, so it cannot become steam in the next cup. Pause, Tea
Break, blur and hidden pages freeze the mission like the Daily Pour.

Karma is described under [Escaping leaves](#escaping-leaves); its fortune
entry has `modifiers: { karma: true }`, a constant `weight()` of
`CONFIG.karma.weight`, and no `matches()`. Its effects are `karmaBounce` and
`karmaPuff` handlers in `rendering/effects.js` (fewer particles under
reduced motion) drawn by `drawRebounds()`, plus a rim line and a ring on
bounced leaves in `renderer.js`.

Development-only helpers (inside `import.meta.env.DEV`, removed from
production builds) are documented in
[the testing guide](BISCUIT_BREAKOUT_TESTING.md).

## Arcade Interludes and The Daily Pour (0.12.0)

`gameplay/arcadeInterludes.js` is a small registry and scheduling helper,
not a replacement phase engine. At each reading, after existing encounters
are decided, `eligibleInterlude()` selects at most one eligible mission.
Shortage, Havoc, and Grind flags postpone it to a later reading. An upgrade
choice remains in the reading phase and must be resolved before continuing.
The current mission's offer and gameplay are ordinary phases:

```text
reading → [upgrade choice] → arcadeOffer → dailyPour.intro → play → outro
                                  │                              │
                                  └── skip ──→ continueFromReading ←┘
                                                   │
                                     deferred encounter / next cup
```

`state.arcade.after` stores one due round per registered mission, not a
queue. Offering consumes the opportunity (including a skip), records the
normal round in `offeredAt`, and schedules the next opportunity 14 rounds
later. `resetMatch()` clears all arcade state. Existing adventures retain
their own phases and mechanics. `awardInterlude()` applies positive points
and cash once, using the mission summary as the settlement guard.

The paper RNG is seeded from the game's seed XOR `0xda11b007`; it never
advances the normal, tea, boss, bonus, or Tea Run streams. `planRoute()`
produces all house data before rendering. `updateDailyPour()` advances in
120 Hz simulation ticks using a carried accumulator. Each paper locks its
aim and world-space landing point at release. Arrival tests that point
against a physical target's width and required aim; rendering draws the
same trajectory endpoints. No homing or proximity-based instant rewards.

The pedestrian is not mission state. `CONFIG.dailyPour.pedestrian` fixes a
world x in the gap between houses 5 and 6 (clear of every seed's targets),
and `pedestrianRemark(m)` derives the speech window from `m.clock` alone.
No random draws, collisions, events or rewards are involved, so pausing,
frame rate and backgrounding cannot change it, and seeded results are
identical. `rendering/dailyPour.js` word-wraps the line with `measureText`,
clamps the bubble inside the arena, and draws it under the bicycle, papers
and HUD.

Pausing saves `pausedFrom = dailyPour` and skips all simulation ticks.
Input routes Up/Down/Space exclusively to aim/throw in this phase, ignores
keyboard repeats, and resets at offer, intro, play, result and return
boundaries. The existing blur/visibility handlers pause it; Tea Break
blocks both input and simulation. Compact/Full View reuses the existing
choice and control placement. No new layout mode is introduced.

Coffee-cup collision and rendering share `CONFIG.teaRun.obstacles.coffeeCup.height`.
The upper hitbox boundary is `clearance + height` (118 logical units), so
aerial impulses can clear the cup and its decorative rope is non-solid.

## Day transitions (0.14.0)

`gameplay/days.js` derives Day and cup from the global normal-round number,
computes bounded Heat, and composes it after the existing tea/fortune modifiers.
`state.heat` and `state.dayPending` are the only new stored progression values.
A new pot resets them. Day number and local cup are derived, and the phase plus
pending flag makes a separate consumed-choice flag unnecessary.

`readLeaves()` marks a boundary pending only on a successful tenth normal-round
completion. Fatal spills enter game over without offering a Day. No special
encounter increments Heat or global round. The next-normal-cup handoff is:

```text
normal completion -> reading / next fortune -> upgrade (if due)
  -> shortage / Tea Run -> hot chocolate -> coffee boss -> arcade offer / mission
  -> day (if pending) -> Fresh Brew / Keep -> next normal cup
```

Only scheduled activities run; the existing scheduler still controls conflicts
and deferral. All encounter returns, including `leaveHavoc()` and `leaveGrind()`,
now call `continueFromReading()` so pending activities and the Day choice survive.
Returning to this handler never redraws a fortune or rewards a completed round.

The `day` phase has no clock, automatic choice, or primary-button action.
`chooseDay('fresh'|'keep')` validates the phase and pending flag, clears pending
before applying the choice, and calls `brewNextCup()` once. That function alone
increments the global round, progresses Heat, transfers `nextFortune`, and starts
normal combat. Repeated choice calls return false once the phase has changed.
`dayEnd` and `dayStart` events drive input resets, synthesized sounds and the
short existing Canvas banner. Captions rotate by derived Day, without RNG.

`withHeat()` composes normal-cup modifiers only; boss and bonus setup remains
independent. `updateSpawning()` clamps the final jittered normal arrival gap.
Exact formulas and caps are in [Game design](GAME_DESIGN.md#days-and-heat-0140).
The existing tea/fortune cap remains a separate first step.

The accessible DOM `#dayOffer` uses existing choice-card styles. `ui/hud.js`
controls visibility and text, and `ui/presentation.js` moves it into
`#phaseChoices` in Compact View, just like upgrade and arcade choices. Number
keys dispatch through the phase-validated command; repeated keydown events are
ignored. Touch/mouse use `data-day`; hidden-page and open-menu input is blocked.
The Day phase does not advance during pause, blur or backgrounding.

`src/dev/days.js` prepares deterministic practice checkpoints and finishes them
through real collisions, readings, upgrades and choices. It is referenced only
inside the `import.meta.env.DEV` branch in `main.js`, so its implementation and
`practiceDay` hook are removed from production. The pre-existing `?debug` state
inspection facility remains available for production browser tests.

## Crossing the Street (0.15.0)

`INTERLUDES` gains `crossingStreet` with its own `CONFIG.arcade` rule; the
scheduler itself is unchanged, and with three entries still offers the
earliest-due adventure (ties in registry order), one per reading.
`chooseInterlude(true)` creates the mission in the new `crossingStreet`
phase:

```text
reading → [upgrade choice] → arcadeOffer → crossingStreet.intro → play → outro
                                  │                                       │
                                  └── skip ──→ continueFromReading ←──────┘
                                                   │
                         deferred encounter / pending Day choice / next cup
```

`gameplay/crossingStreet.js` owns the road, the spoon, hops, collisions,
attempts, the clock and settlement, as plain data with no DOM or canvas.
Its generator is the game seed XOR `CROSSING_SALT` (`0x0c2055ed`), used only
by `planRoad()` when the mission is created, so playing or skipping it never
changes teas, leaves, fortunes, bosses, the Tea Run, paper routes or biscuit
walls (tested). After that nothing draws randomness.

`updateCrossing(sim, dt, walk)` runs 120 Hz ticks from a carried accumulator
(non-finite or negative `dt` counts as none; one call is capped at 0.25 s).
Each tick increments `m.ticks`, and every vehicle's position is the closed
form `vehicleX(lane, v, ticks / 120)` on a loop from `-margin` to
`-margin + span`, so traffic never drifts and frame rate cannot matter
(30, 60, 120 and 240 Hz replay identically). The spoon's position is a cell
plus an optional `hop` (`from`, `time`); `spoonPoint()` interpolates it, and
the renderer draws at that same point. `struckBy()` compares the spoon's box
with each vehicle's swept x-range over the tick (two ranges if it wrapped),
and only in rows the box overlaps; boxes must overlap, not merely touch.

Input is split into a fresh-press command and a held state.
`game.hop(dir)` (only in `play`) sets the single-slot `m.pressed`, which is
taken when the spoon is free; `walk = { up, down, left, right }` only
continues the direction of the latest press, every `repeat` seconds. A
held key never starts a hop on its own. `pause()` clears `m.pressed`; a
bump or respawn clears both.

Fairness is checked at creation: `planCrossing(lanes, t0)` is a
breadth-first search over (step, cell), one move or wait every `repeat`
seconds, where a cell is blocked for a step if any vehicle's swept range
during it (padded by two ticks) comes within `fair.margin` of the spoon's
box. Because the search is per cell and per step, one search is a fraction
of a millisecond and checking a whole road about 3 ms. `fairRoad()` requires a route from the curb from every
`fair.every` seconds up to `fair.until`; `planRoad()` redraws (from the same
generator) until one is fair, with `gentleRoad()` as a never-yet-needed
fallback. Tests replay planner routes through the real simulation, and
`src/dev/crossing.js`'s `crossForMe()` uses it as an autopilot.

`awardInterlude()` settles once at the result. `shopExchange(m)` derives
the doorstep conversation from the outro clock, so it freezes with pauses.
`rendering/crossingStreet.js` draws from mission state; its only
randomness is a fixed, private preview road drawn behind the offer card
(`drawPreview()`), from the renderer's own clock.

`controls.js` gives the arrows and WASD exclusively to the street while
`game.crossingControls()` is true (including when paused from it): a fresh
keydown sets `walk[dir]` and calls `hop`; auto-repeat is ignored; every
other key except Enter, P and R is swallowed, so Space, milk, sugar and
turning do nothing. The touch pad (`.controls-crossing`, `data-walk`) does
the same on `pointerdown`, releasing on up, cancel and lost capture.
`held` is never written by the street. `crossingStart`, `crossingGo`,
`crossingFinish` and `crossingEnd` reset input; on `crossingEnd`,
`controls.settle(true)` additionally marks every key still physically down
as stale, so neither a held Space nor a held arrow can steam or turn the
spoon in the next cup until it is released and pressed again. The existing
`settle()` used by the other adventures is unchanged.

Development-only helpers (inside `import.meta.env.DEV`) are documented in
[the testing guide](CROSSING_STREET_TESTING.md).

## Arcade Collection and Continue Pot (0.16.0 development)

`createGame({ seed, practice: id })` creates a new simulation and all eight
new generators. It launches an existing adventure without running normal
rounds or consuming the real pot's schedules. The usual Tea Run restock and
`awardInterlude()` execute only against this disposable state. A settled
practice instance cannot continue into a normal cup; replay creates another
instance. The adventure engines, fixed steps, input and rewards are unchanged.

`createSessions()` retains the main game object while the collection blocks
its updates. The current RAF delta is discarded while a menu is open; no
simulation time accumulates for return. The stable game facade dispatches
input to the current instance. Its `update` method retains normal instance
semantics so the existing deterministic browser harness can freeze the clock.
Transitions call `controls.settle(true)`; keys pressed while menus block
input are also quarantined until keyup. Native buttons retain keyboard focus,
and auto-repeat cannot activate collection or confirmation buttons twice.

`readLeaves()` emits a detached `checkpoint` **after** fortune and offer
selection, all encounter scheduling, Tea Cash, secrets and secret rewards.
Only the main session's checkpoint events can write the pot key. The reading
animation may advance before the event is drained, so storage uses the event's
snapshot, never the then-current live state. Capturing does not draw RNG.
Game over clears the key; practice settlement writes only the record key.

The schema-1 checkpoint contains the entire validated plain logical state,
`pinnedTea`, and `{ seed, state }` for normal combat/fortunes, tea varieties,
chocolate, boss, Tea Run, Daily Pour, Biscuit Breakout and Crossing the Street.
Mulberry32's algorithm and initial seeded sequence are unchanged.
`createRandom(seed, cursor)` restores without drawing; `exportState()` reads
without drawing. `createGame({ checkpoint })` validates, constructs fresh
closures and copies logical state without resetMatch/startRound or events.
No DOM, renderer, audio, pending browser callback or event queue is serialized.

Only a completed-round `reading` with empty transient fields and consistent
choices, identifiers, finite numeric values, chapter and Day state is
accepted. `migrateCheckpoint()` is the explicit future migration entry point;
it currently accepts schema 1 only. Changes to the state shape require a
save-schema decision rather than silently accepting partial state. Settings
are still independent browser preferences and the current Auto Steam setting
is applied when a saved pot is activated.

`storage/localProgress.js` accepts an injected Storage-like object. It catches
reads, parsing, quota failures and removals independently for each key. It
never calls `clear()`. Failed record writes still keep session records in
memory and show a small notice. Failed checkpoint writes retain the last
saved checkpoint. A failed clear reports the error and retains the old save;
a confirmed new pot can still be played. If storage stays inaccessible, the
previous disk checkpoint may remain on the next visit. No frame writes occur.

Records use the adventure summary's total `points`, not main-pot score.
Completions are deduplicated by practice-instance identity with a WeakSet.
Tea Run records success/failure but has no invented perfect result; the other
three persist their existing `perfect` flag. New personal best requires
strictly greater points, so ties and an initial zero are not improvements.
See [the testing guide](ARCADE_COLLECTION_TESTING.md) for commands, limitations
and the human playtesting checklist.
