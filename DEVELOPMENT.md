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

## 0.16.0 local progress

Version 0.16.0 includes the Arcade Collection and genuine normal-round
checkpoints. See [docs/ARCADE_COLLECTION_TESTING.md](docs/ARCADE_COLLECTION_TESTING.md)
for the two browser-local schemas, deterministic continuation tests, safe
development helpers and playtesting steps. Run the existing check and browser
scripts before review. The project owner approved publication after initial
human playtesting with no errors observed. Gameplay and save behavior were
frozen for release; physical-device qualification is not claimed.
