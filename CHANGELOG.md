# Changelog

All notable changes to this project are documented here. The project uses
[semantic versioning](https://semver.org/).

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

[0.3.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/f0357ee...main
[0.2.0]: https://github.com/libertaine/Steeped-in-Trouble/compare/v0.1.1...f0357ee
[0.1.1]: https://github.com/libertaine/Steeped-in-Trouble/releases/tag/v0.1.1
[0.1.0]: https://github.com/libertaine/Steeped-in-Trouble/releases/tag/v0.1.0
