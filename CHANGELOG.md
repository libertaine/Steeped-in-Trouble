# Changelog

All notable changes to this project are documented here. The project uses
[semantic versioning](https://semver.org/).

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

[0.1.0]: https://github.com/libertaine/Storm-in-a-Teacup/releases/tag/v0.1.0
