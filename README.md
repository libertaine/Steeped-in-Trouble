# Steeped in Trouble

An original, experimental, tea-themed vector arcade game. Defend the rim of a
stormy teacup with a silver spoon: fire steam at rising tea leaves, and spend
your milk and sugar wisely. The leaves you defeat settle in the cup, and their
pattern is read as a fortune that changes the next round.

**[▶ Play it in your browser](https://libertaine.github.io/Steeped-in-Trouble/)**

![Steeped in Trouble in round 3: the silver spoon on the rim of a teacup fires a sugar burst and steam at tea leaves while a milk cloud covers one side. The side panel shows the spoon's upgrades and this cup's omen, The Veil.](docs/images/screenshot.png)

## Status

Version **0.7.0 — Hot Chocolate Havoc** adds the game's first bonus round.
Every so often, between cups, the leaves foresee something sweeter, and the
tea is no longer quite tea. Aiming is easier too: the lane the spoon will
fire down now glows. See the [changelog](CHANGELOG.md) for earlier versions.
The game is experimental, so expect it to keep changing.

The game was called *Storm in a Teacup* up to version 0.1.0.

## How to play

- Tea leaves drift out from the centre of the cup. Each one that reaches the
  rim spills, costing one of your three cups. Lose them all and the pot runs
  dry.
- The spoon circles the rim and fires down the nearest lane, which glows
  so you can see where the shot will go. Steam is unlimited. Each round you also get a couple of milk pours, which push leaves
  back and slow them, and a couple of sugar bursts, which fire down three
  lanes at once.
- Clear enough leaves to finish the round. The leaves you defeated are then
  read, and their fortune changes the next round. Every other round you also
  choose an upgrade for your spoon, which lasts for the whole pot.
- Keep an eye out for sugar cubes, and try unusual combinations. Some of
  them brew something unexpected.
- Now and then, between cups, a bonus round turns the tea into hot
  chocolate. Nothing in it can spill. Be gentle with the fire button.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move the silver spoon | <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> | hold **◀ TURN** / **TURN ▶** |
| Fire steam (hold for continuous fire) | <kbd>Space</kbd> | hold **STEAM ↑** |
| Milk: wash back and slow a wedge of the cup | <kbd>M</kbd> | **MILK** |
| Sugar: three-lane burst | <kbd>S</kbd> | **SUGAR** |
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
