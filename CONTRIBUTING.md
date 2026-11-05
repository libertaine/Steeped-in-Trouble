# Contributing

This is a small, experimental arcade game. The process is meant to stay light.

## Workflow

1. Branch from `main` for gameplay changes (`git switch -c feat/new-leaf`).
2. Make the change and test locally: `npm run check`, plus
   `npm run test:browser:smoke` for routine page changes. Use the complete
   `npm run test:browser` for substantial gameplay, rendering, input,
   persistence or responsive-layout changes, and releases.
3. Open a pull request for meaningful changes. CI runs lint, unit tests, and
   the build on Ubuntu and Windows, plus 35 explicitly tagged Chromium/mobile
   browser smoke executions on Ubuntu. Documentation-only changes complete
   the same named checks successfully without test execution.
4. Merge when CI passes. Every push to `main` is deployed to GitHub Pages
   automatically, after the same checks pass.

The repository owner may push small or experimental changes straight to
`main`. Deployment still waits for CI to pass.

For full Windows/Ubuntu browser qualification, run **Actions → Full regression**
against a selected ref/SHA, or add `full-regression` to the PR. See
[Development](DEVELOPMENT.md#ci-fast-feedback-and-full-qualification) for selection,
coverage, failure diagnosis and release instructions. Full regression preserves
all Chromium, Firefox and mobile Chromium tests.

## Guidelines

- Keep simulation code (`src/core`, `src/gameplay`) free of DOM, canvas,
  audio, `Math.random`, and clock access. See
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Put tuning numbers in `src/config.js`.
- Add or update unit tests for gameplay rules.
- Never edit `docs/reference/prototype-0.1.html`.
- Don't add runtime dependencies, external scripts, analytics, or tracking.
  **One explicitly approved exception:** the published game loads Umami's
  cookie-free tracker under the conditions and event contract in
  [docs/ANALYTICS.md](docs/ANALYTICS.md). The exception covers only that script
  and those events; it stays out of `src/core` and `src/gameplay`, and adds no
  identifiers. Any further script, event or property needs its own approval.

## Versioning

Public builds use semantic versioning: `0.1.0` is the preserved prototype,
and experiments continue as `0.2.0`, `0.3.0`, and so on. Minor versions keep
counting past nine, so `0.9.0` is followed by `0.10.0`, `0.11.0`, and onward.
`1.0.0` has no planned date or milestone and doesn't automatically follow
`0.9.0`; it will come when the game is ready for it. To release, bump
`version` in `package.json` (the in-game badge reads it), add a
`CHANGELOG.md` entry, tag the commit `vX.Y.Z`, and create a GitHub release
from the tag. Before tagging, pass full regression on the exact versioned
candidate SHA on both OSes. Tag deployment repeats that qualification and blocks
Pages on failure; wait for it before approving/publishing the GitHub release.
Passing fast PR checks alone is insufficient for a release.
