# Contributing

This is a small, experimental arcade game. The process is meant to stay light.

## Workflow

1. Branch from `main` for gameplay changes (`git switch -c feat/new-leaf`).
2. Make the change and test locally: `npm run check`, plus
   `npm run test:browser` for anything touching the page, input, or rendering.
3. Open a pull request for meaningful changes. CI runs lint, unit tests, and
   the build on Ubuntu and Windows, plus browser smoke tests.
4. Merge when CI passes. Every push to `main` is deployed to GitHub Pages
   automatically, after the same checks pass.

The repository owner may push small or experimental changes straight to
`main`. Deployment still waits for CI to pass.

## Guidelines

- Keep simulation code (`src/core`, `src/gameplay`) free of DOM, canvas,
  audio, `Math.random`, and clock access. See
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Put tuning numbers in `src/config.js`.
- Add or update unit tests for gameplay rules.
- Never edit `docs/reference/prototype-0.1.html`.
- Don't add runtime dependencies, external scripts, analytics, or tracking.

## Versioning

Public builds use semantic versioning: `0.1.0` is the preserved prototype,
and experiments continue as `0.2.0`, `0.3.0`, and so on. To release, bump
`version` in `package.json` (the in-game badge reads it), add a
`CHANGELOG.md` entry, tag the commit `vX.Y.Z`, and create a GitHub release
from the tag.
