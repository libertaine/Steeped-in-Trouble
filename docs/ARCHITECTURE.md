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
│   └── timing.js        requestAnimationFrame loop with clamped delta time
├── gameplay/            rules, as pure functions over state
│   ├── arena.js         lanes, angles, polar → canvas mapping
│   ├── player.js        spoon movement
│   ├── enemies.js       tea-leaf spawning and movement
│   ├── weapons.js       steam, sugar, milk (and its backwash), hit testing, scoring
│   ├── golden.js        the golden sugar cube and its rewards
│   ├── prismatic.js     the rare prismatic sugar cube and its Steam Nova
│   ├── secrets.js       hidden feats judged when a round is read, and their rewards
│   ├── combos.js        unexpected brews: combinations that unlock new behaviour
│   ├── chocolate.js     Hot Chocolate Havoc: the bonus round's schedule, marshmallows, flames, scoring
│   ├── grind.js         The Daily Grind: the coffee boss's schedule, valve, attacks, scalds, rewards
│   ├── upgrades.js      spoon upgrades: definitions, offers, stacking limits
│   └── fortunes.js      leaf reading, fortune selection, modifiers, glyphs
├── rendering/
│   ├── canvas.js        device-pixel-ratio-aware canvas sizing
│   ├── renderer.js      draws state onto the canvas
│   ├── effects.js       cosmetic particles and the spill flash
│   └── grind.js         draws the espresso machine and its attacks
├── input/controls.js    keyboard and pointer input
├── audio/
│   ├── audio.js         optional synthesized sound effects; owns the AudioContext
│   └── music.js         the adaptive procedural soundtrack
└── ui/hud.js            DOM HUD text
```

## The one rule: simulation vs. presentation

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
2. `game.update(dt, controls.held)` advances the simulation.
3. Queued events are drained and passed to `effects`, `audio`, and (for
   `paused` / `matchStart`) `controls.reset()`.
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
boss goes to the `grind` phase: `state.grind.stage` `intro` (Enter skips it)
→ `fight` (P pauses) → `outro` (Enter, after a moment), then the next cup.
The fight reuses the real `fireSteam()`, `sugarBurst()`, and `pourMilk()`
(so upgrades and the Golden Spoon apply) with neutral fortune modifiers and
fresh milk and sugar. Its three scalds are its own; losing never touches the
cups, and only a victory changes them (a Perfect Brew restores one, up to
four). The Golden Spoon a victory awards starts with the next cup.

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
`createGame()`), so neither changes the sequence the normal rounds see. Effects use `Math.random`, so changing particles can never change
gameplay. The URL parameter `?seed=` sets the seed in the browser, and the
`?debug` parameter exposes `window.__TEACUP__.game` for tests and tinkering.

## Input

`controls.js` keeps `held = { left, right, fire }` and calls command
callbacks for one-shot keys. It prevents page scrolling only for the arrow
keys and Space, and it ignores key presses that use Ctrl, Alt, or Meta. Held
state is released on window blur, page hide, pointer up, pointer cancel, and
lost pointer capture, and (through the game's events) on pause and on a new
match.

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

## Escaping leaves

A leaf reaching the rim goes through `escape()` in `core/game.js`. During the
short grace period after a spill it is washed back into the cup
(`washBack()`, the same eased push milk uses). Otherwise the tea strainer
catches it while `state.strainerLeft` lasts, and only then does it cost a
cup and start a new grace period.

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

### Adding an enemy type

1. Give spawned enemies a `kind` in `spawnEnemy()` (`gameplay/enemies.js`),
   and decide when each kind spawns.
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

- `tests/unit/` (Vitest, Node) tests gameplay through `createGame()` with
  fixed seeds and fixed time steps.
- `tests/browser/` (Playwright) holds smoke tests against the production
  build served under `/Steeped-in-Trouble/`, in Chromium, Firefox, and a
  mobile viewport. These tests assert on state and HUD text, not pixels.
