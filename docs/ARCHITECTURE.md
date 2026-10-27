# Architecture

Storm in a Teacup is a static browser game. It uses vanilla JavaScript ES
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
│   ├── weapons.js       steam, sugar, milk, hit testing, scoring
│   └── fortunes.js      leaf reading, fortune selection, modifiers, glyphs
├── rendering/
│   ├── canvas.js        device-pixel-ratio-aware canvas sizing
│   ├── renderer.js      draws state onto the canvas
│   └── effects.js       cosmetic particles and the spill flash
├── input/controls.js    keyboard and pointer input
├── audio/audio.js       optional synthesized sound
└── ui/hud.js            DOM HUD text
```

## The one rule: simulation vs. presentation

`core/` and `gameplay/` never touch the DOM, canvas, audio, `Math.random`, or
the clock. They mutate a plain state object and push **events** describing
what happened (`kill`, `escape`, `reading`, …).

Everything else is presentation. It reads state and reacts to events, but
never changes gameplay state. This is why the whole game can be unit-tested
in Node, and why a seed reproduces a match exactly.

## Main loop

`main.js` starts one `createLoop()` (calling `start()` again is a no-op). Each
frame:

1. `effects.update(dt)` ages particles.
2. `game.update(dt, controls.held)` advances the simulation.
3. Queued events are drained and passed to `effects`, `audio`, and (for
   `paused` / `matchStart`) `controls.reset()`.
4. `renderer.draw(state, fx, dt)` paints the frame, and `hud.update(state)`
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
from it. Effects use `Math.random`, so changing particles can never change
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
(`{ milkKills, leafLanes }`) and calls `selectFortune()`. `readLeafPattern()`
summarizes the leaves (densest three-lane cluster, occupied lanes). Each
fortune in `FORTUNE_PRIORITY` is then asked `matches(reading)`, and the first
match wins.

When the next round starts, `modifiersFor(fortuneId)` merges the fortune's
`modifiers` over `BASE_MODIFIERS` into `state.modifiers`. Gameplay code reads
only `state.modifiers` (for example `steamSpeedMultiplier`) and never checks
fortune ids. Modifiers last exactly one round, because the next round start
recomputes them, and a new match clears the fortune.

## Extending the game

### Adding a fortune

1. Add an entry to `FORTUNES` in `gameplay/fortunes.js` with `name`, `info`,
   `color`, `modifiers`, `matches(reading)`, and a `glyph(t)` that maps
   t ∈ [0, 1] to an offset from the cup centre (the shape the leaves form).
2. Insert its id into `FORTUNE_PRIORITY`.
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
  build served under `/Storm-in-a-Teacup/`, in Chromium, Firefox, and a
  mobile viewport. These tests assert on state and HUD text, not pixels.
