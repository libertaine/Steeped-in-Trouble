# Changelog

All notable changes to this project are documented here. The project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.8.0...main
[0.8.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/13b097c...v0.5.0
[0.4.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/73e1fad...13b097c
[0.3.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/f0357ee...73e1fad
[0.2.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.1.1...f0357ee
[0.1.1]: https://github.com/libertaine/Steeped-in-Trouble/releases/tag/v0.1.1
[0.1.0]: https://github.com/libertaine/Steeped-in-Trouble/releases/tag/v0.1.0
