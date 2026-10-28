# Steeped in Trouble

An original, experimental, tea-themed vector arcade game. Defend the rim of a
stormy teacup with a silver spoon, steam the tea leaves that rise towards
you, and let the leaves you defeat tell your fortune.

**[▶ Play it in your browser](https://libertaine.github.io/Steeped-in-Trouble/)**

![Gameplay of Steeped in Trouble: a silver spoon circles the rim of a teacup of swirling brown tea and fires steam at tea leaves drifting out from the centre, while the side panel tracks the cup. Later the tea turns to hot chocolate for a bonus round full of marshmallows.](docs/images/gameplay.gif)

*A fresh pot: steam the rising leaves, then an unexpected change of drink.*
Prefer a still image? [See a screenshot](docs/images/screenshot.png).

## Status

Version **0.8.0 — The Daily Grind** is the current release. The game is
experimental and still changing, but there's plenty in the cup already:

- Arcade defence around a living teacup whose tea swirls, ripples, and
  reacts to every shot.
- Tea-leaf fortunes: the leaves you defeat are read at the end of each
  round, and the reading changes the next one.
- Spoon upgrades that last the whole pot, and combinations that sometimes
  brew something unexpected.
- Occasional bonus rounds and, new in 0.8.0, a very angry espresso machine.
- Procedurally drawn vector graphics and an adaptive soundtrack that follows
  the cup.

See the [changelog](CHANGELOG.md) for what changed in each version.

## How to play

- Tea leaves drift out from the centre of the cup. Each one that reaches the
  rim spills, costing one of your three cups. Lose them all and the pot runs
  dry.
- The spoon circles the rim and fires down the lane that glows. Steam is
  unlimited. Each round you also get a couple of milk pours, which push
  leaves back and slow them, and a couple of sugar bursts, which fire down
  three lanes at once.
- Clear enough leaves to finish the round. The leaves you defeated are then
  read, and their fortune changes the next round. Every other round you also
  choose an upgrade for your spoon, which lasts for the whole pot.
- Now and then something different happens between cups. The side panel
  explains what to do, and none of it costs a cup.
- Experiment. The cup rewards curiosity, and some things are best found for
  yourself. The full rules are in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md),
  spoilers and all.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move the silver spoon | <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> | hold **◀ TURN** / **TURN ▶** |
| Fire steam (hold for continuous fire) | <kbd>Space</kbd> | hold **STEAM ↑** |
| Milk: wash back and slow a wedge of the cup | <kbd>Q</kbd> or <kbd>M</kbd> | **MILK** |
| Sugar: three-lane burst | <kbd>E</kbd> or <kbd>S</kbd> | **SUGAR** |
| Pause / resume | <kbd>P</kbd> | main button |
| Start, next cup, new pot | <kbd>Enter</kbd> | main button |
| Pick a spoon upgrade | <kbd>1</kbd> / <kbd>2</kbd> | tap a card |
| Restart after game over | <kbd>R</kbd> | main button |

## Options

- **Sound** is off by default. Turn it on for synthesized sound effects and
  the adaptive soundtrack.
- **Graphics** switches between high quality (full-resolution tea with
  glowing currents) and low quality for older machines. You can also add
  `?graphics=low` or `?graphics=high` to the URL.
- Add `?seed=<number>` to the URL to replay the same sequence of tea leaves.

## Running locally

Prerequisites: [Node.js](https://nodejs.org/) 24 LTS (22.12 or newer also
works) and npm, which ships with Node.js. The project works on Windows,
macOS, and Linux.

```bash
git clone https://github.com/libertaine/Steeped-in-Trouble.git
cd Steeped-in-Trouble
npm ci
npm run dev
```

Then open the URL Vite prints (normally
<http://localhost:5173/Steeped-in-Trouble/>).

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:browser` | Browser smoke tests (Playwright) against a fresh production build |
| `npm run check` | Lint, unit tests, and build in one go |

Before running browser tests for the first time, install the browsers:

```bash
npx playwright install chromium firefox
```

On Linux you may also need `npx playwright install-deps` (requires sudo).

To smoke-test the published site instead of a local build:

```bash
BASE_URL=https://libertaine.github.io/Steeped-in-Trouble/ npm run test:browser
```

On Windows PowerShell, run `$env:BASE_URL="https://libertaine.github.io/Steeped-in-Trouble/"; npm run test:browser`.

## Project documentation

- [Architecture](docs/ARCHITECTURE.md): how the code fits together, and how to
  add enemies, weapons, and fortunes
- [Game design](docs/GAME_DESIGN.md): creative direction, the full rules
  (secrets included, so beware of spoilers), and future ideas
- [Development](DEVELOPMENT.md): the principles for working on the game
- [Contributing](CONTRIBUTING.md): branching, checks, and releases
- [Reference prototype](docs/reference/README.md): the preserved original and
  its differences from 0.1.0
- [Changelog](CHANGELOG.md)

## Feedback

Bug reports and ideas are welcome in
[GitHub Issues](https://github.com/libertaine/Steeped-in-Trouble/issues).

## License

[MIT](LICENSE). All artwork is drawn procedurally with Canvas paths, and all
sound is synthesized at runtime. The game uses no third-party art, fonts,
audio, or runtime libraries, and it is not affiliated with or adapted from
any commercial arcade game.
