# Development

Steeped in Trouble is a small, experimental arcade game. Work on it should
feel like making a game, not running a program.

1. **Gameplay takes priority.** Spend effort on responsiveness, visual
   effects, interesting mechanics, and fun.
2. **Keep changes small.** Implement features in focused commits. A short
   commit message or PR description is enough; no planning documents.
3. **Use the tests we have.** Keep the existing tests and CI green. Add a
   test when you introduce a new mechanic or fix a bug that could plausibly
   come back. Routine changes don't need test matrices, simulation
   comparisons, or collected evidence.
4. **Avoid unnecessary process.** No research phases, multi-agent reviews,
   qualification gates, evidence archives, acceptance reports, or separate
   implementation and verification teams. Don't document every minor tweak.
5. **Prefer simple solutions.** Stay with vanilla JavaScript and Canvas. Add
   a framework or dependency only when it clearly earns its place. Don't
   optimize or abstract working code before there's a reason.
6. **Experiment freely.** Try ideas quickly and throw them away if they
   aren't fun. Experiments don't need architectural review or permanent
   documentation.
7. **Keep releases simple.** Bump the version, add a line to the changelog,
   tag, and create a normal GitHub release.

For commands and code structure, see the [README](README.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## CI: fast feedback and full qualification

Ordinary PRs and merges to `main` run ESLint, all unit tests and a production
build on Ubuntu and Windows. Browser smoke runs on Ubuntu against the production
build at the Pages base path: `npm run test:browser:smoke`. It selects existing
`@smoke` tests on Chromium and mobile Chromium, currently **33 executions**
(21 desktop, 12 mobile), rather than the complete 370-execution matrix.

The selection covers startup/assets, title/instructions, keyboard gameplay,
Classic and Easy Touch, Milk/Sugar/Strainer depletion, cracks/repairs and loss,
pause/focus, reading/upgrades, continued saves and denied storage, special-mode
entry/return, and phone visibility. Tags select cases explicitly; shared resource
tests contribute three executions per selected project. Test bodies, assertions,
timeouts, retries and the full browser project definitions are unchanged.

Documentation-only PRs and pushes skip test execution and dependency/browser
installation. The existing named check jobs still run a successful explanatory
step, so required checks do not remain pending. The allowlist is deliberately
small: root README/CHANGELOG/CONTRIBUTING/DEVELOPMENT Markdown, Markdown under
`docs/` except `docs/reference/`, and PNG/JPEG/GIF/WebP under `docs/images/`.
Any other path, mixed docs/code change, unavailable comparison base, or manual
CI dispatch runs fast validation. Renames inspect both old and new paths.
Runtime assets, dependencies, tests and workflow/configuration changes always
run checks. No workflow-level path filters are used.

### Full regression and releases

Run the complete suite locally with `npm run check` then `npm run test:browser`.
Install browsers first if needed: `npx playwright install chromium firefox`.
The full command still runs Chromium, Firefox and mobile Chromium; smoke is an
additional command, not a replacement. Use full qualification after substantial
gameplay, rendering, input, persistence or responsive-layout changes, and before
every versioned release. Small routine changes can use fast checks.

On GitHub, choose **Actions → Full regression → Run workflow**. Select the
workflow branch and supply a branch, tag or full commit SHA in `ref` (blank uses
the selected workflow ref). CLI equivalent after this workflow is on `main`:

```sh
gh workflow run full-regression.yml --ref main -f ref=FULL_CANDIDATE_SHA
```

The workflow resolves the candidate once, displays its full SHA in the summary,
and checks out that exact SHA on both Ubuntu and Windows. Each OS runs lint,
all unit tests, build and the entire browser suite. Both OS jobs must succeed.
Before the new workflow reaches `main`, or for convenient PR qualification,
add the `full-regression` label to the PR. Subsequent commits rerun it while the
label remains. This tests the PR head; ordinary fast CI tests GitHub's merge ref.
A passing head run does not qualify a different merge commit.

For a release, commit the version/changelog first, run full regression on that
exact candidate SHA, and check both OS jobs and their recorded SHA before tagging
or approving a GitHub release. Fast CI alone never qualifies a release. A `v*`
tag push also invokes full regression synchronously from Pages deployment;
Pages cannot build/publish that tag until both full jobs and fast CI succeed.
This extra run qualifies the actual tag target even if a prior manual run tested
another commit. Wait for it before publishing the GitHub release. This workflow
gates Pages assets; it cannot prevent an owner manually publishing a GitHub release.

Ordinary `main` pushes call fast CI before Pages builds. Documentation-only
pushes still build the production site before upload. Failed/cancelled validation
blocks publishing. Pages retains its single-deployment concurrency group,
`github-pages` environment and job-scoped `pages: write`/`id-token: write` grants;
test workflows have only `contents: read`. No PR can deploy through these events.

Check names `Browser smoke tests` and `Lint, unit tests, build (ubuntu-latest)` /
`(windows-latest)` are retained for existing protection settings. The browser
name now accurately describes its scope. Do not require the optional full jobs
on every PR. The effective repository ruleset on `main` already requires exactly
these three fast check names, so no settings changes are needed. (The separate
classic-protection endpoint reports none.) This change does not modify rules.

When a run fails, open the failing step first. An assertion failure has a test
name and expected/actual output; failed browsers upload a seven-day HTML report
with retained failure traces. Checkout, npm install, browser installation or
runner startup failures are workflow/environment failures, not passing tests.
Fix or rerun the affected environment step without weakening assertions or
increasing retries/timeouts. A cancelled or incomplete run is not qualification.

### Measured CI baseline

Successful PR run [41481004353](https://github.com/libertaine/Steeped-in-Trouble/actions/runs/41481004353)
on `42dc3c9` (PR #35) took **30m 39s** from creation to completion: 370 browser
executions (29m 42s test step; 30m 36s browser job), plus 860 unit tests on each
OS. Ubuntu lint/unit/build took 50s; Windows took 83s. Successful main deployment
[41462846657](https://github.com/libertaine/Steeped-in-Trouble/actions/runs/41462846657)
took 22m 49s including Pages. Compare optimized Actions runs with these actual
times; local timings are not equivalent to hosted-runner savings.

Optimized PR run [41491426680](https://github.com/libertaine/Steeped-in-Trouble/actions/runs/41491426680)
on implementation commit `4c3fd525a5f32202604cdf3184d3e8c7391b12ae` passed in
**3m 17s** including classification and runner startup: **89.3% less elapsed time**
than the baseline PR. Its 33 browser executions passed in 1m 31s (2m 5s browser
job). Ubuntu and Windows each passed 860 unit tests; their lint/unit/build jobs
took 49s and 73s. These are individual measured runs, not a long-term average.

## 0.16.0 local progress

Version 0.16.0 includes the Arcade Collection and genuine normal-round
checkpoints. See [docs/ARCADE_COLLECTION_TESTING.md](docs/ARCADE_COLLECTION_TESTING.md)
for the two browser-local schemas, deterministic continuation tests, safe
development helpers and playtesting steps. Run the existing check and browser
scripts before review. The project owner approved publication after initial
human playtesting with no errors observed. Gameplay and save behavior were
frozen for release; physical-device qualification is not claimed.
