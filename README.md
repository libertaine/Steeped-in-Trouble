# Steeped in Trouble

An original, experimental, tea-themed vector arcade game. Defend the rim of a
stormy teacup with a silver spoon, steam the tea leaves that rise towards
you, and let the leaves you defeat tell your fortune.

**[▶ Play it in your browser](https://libertaine.github.io/Steeped-in-Trouble/)**

![Gameplay of Steeped in Trouble: a silver spoon circles the rim of a teacup of swirling brown tea and fires steam at tea leaves drifting out from the centre, then pours milk across one side of the cup and fires a three-lane sugar burst, while the side panel tracks the first cup.](docs/images/gameplay.gif)

*The first cup of a fresh pot: steam, milk, and sugar against the rising leaves.*
Prefer a still image? [See a screenshot](docs/images/screenshot.png).

## Status

Version **[0.12.0 — The Daily Pour](https://github.com/libertaine/Steeped-in-Trouble/releases/tag/v0.12.0)**
is the current release. The spoon has a paper route. Nobody knows why.
The game is experimental and still changing, but there's plenty in the cup
already:

- Arcade defence around a living teacup whose tea swirls, ripples, and
  reacts to every shot.
- New in 0.12.0: **The Daily Pour**, an optional newspaper-delivery side
  mission. A silver spoon rides a bicycle through the neighborhood; aim
  for mailboxes or porches and throw newspapers for modest rewards, or
  skip it at no cost. The Tea Run's suspended coffee cups can now be
  cleared with a well-timed aerial jump, as well as by sliding.
- Compact / Full View, the Tea Break, recurring optional Tea Shortages,
  an optional Tea Run to the shop, Tea Cash, Easy Touch, and Auto Steam for
  a more relaxed pot. Classic Touch remains available.
- Five tea varieties, each changing how its round plays, from
  leaves that dart or change lanes to spice currents that sweep the cup.
  They arrive as you progress, in chapters: a steady first chapter to learn
  the cup, then a milestone to clear before the next brew is poured.
- Tea-leaf fortunes: the leaves you defeat are read at the end of each
  round, and the reading changes the next one. Tea and fortune combine.
- Spoon upgrades that last the whole pot, and combinations that sometimes
  brew something unexpected.
- Occasional bonus rounds and a very angry espresso machine.
- Procedurally drawn vector graphics and an adaptive soundtrack that follows
  the cup, and the tea.

See the [changelog](CHANGELOG.md) for what changed in each version.

## How to play

- Tea leaves drift out from the centre of the cup. Each one that reaches the
  rim spills, costing one of your three cups. Lose them all and the pot runs
  dry.
- The spoon circles the rim and fires down the lane that glows. Steam is
  unlimited. Each round you also get a couple of milk pours, which push
  leaves back and slow them (strongly in front of the spoon, and briefly
  across the whole cup), and a couple of sugar bursts, which fire down three
  lanes at once.
- Clear enough leaves to finish the round. The leaves you defeated are then
  read, and their fortune changes the next round. Every other round you also
  choose an upgrade for your spoon, which lasts for the whole pot.
- Each round brews a tea, and each tea changes how the leaves behave. The
  cup announces it, and the side panel says what it does. New teas join the
  shelf as you progress.
- The game doesn't simply speed up every round. It moves on in chapters,
  when you've earned it.
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
| Milk: wash back and slow a wedge of the cup, and the whole cup briefly | <kbd>Q</kbd>, <kbd>↑</kbd>, or <kbd>M</kbd> | **MILK** |
| Sugar: three-lane burst | <kbd>E</kbd>, <kbd>↓</kbd>, or <kbd>S</kbd> | **SUGAR** |
| Pause / resume | <kbd>P</kbd> | main button |
| Start, next cup, new pot | <kbd>Enter</kbd> | main button |
| Pick a spoon upgrade | <kbd>1</kbd> / <kbd>2</kbd> | tap a card |
| Restart after game over | <kbd>R</kbd> | main button |
| Tea Shortage: Buy / Run / Skip | <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> | tap a choice |
| Tea Run: jump / slide | <kbd>Space</kbd> or <kbd>↑</kbd> / <kbd>↓</kbd> | **JUMP** / **SLIDE** |
| The Daily Pour: Deliver / No thanks | <kbd>1</kbd> / <kbd>2</kbd> | tap a choice |
| The Daily Pour: aim porch / mailbox, throw | <kbd>↑</kbd> / <kbd>↓</kbd>, <kbd>Space</kbd> | **AIM** / **THROW** |

Phones start with **Easy Touch**: hold the two
steering pads, double-tap the cup for milk, and hold the cup for sugar.
Auto Steam fires only at targets lined up with your spoon. Select **Classic
Touch** for the buttons in the table; it also works with Auto Steam.

After round 9, once the first milestone is beaten, the tea tin may run out.
Buy tea for 20 Tea Cash, fetch it in a roughly 34-second run, or skip for
free. Buying and a successful run each add one sugar burst to the next
normal cup; a successful run also earns 5 Tea Cash. Neither a failed run
nor skipping costs a cup. Your spoon and next fortune wait for you.

Later in Chapter 2, the neighborhood may need a delivery spoon. The Daily
Pour is a 30-second paper route: line the marked mailbox or porch up with
your landing ring and throw. Each delivery earns 25 points, five or more
earn 5 Tea Cash, and a perfect route adds a bonus. Skipping is free.

## Options

- **View** chooses Compact or Full independently of controls and firing.
  Touch-capable devices default to Compact, with the HUD above the cup,
  reachable thumb controls, and a **Pause / Menu** button. **The Tea Break**
  holds pot details, tea and fortune explanations, settings, and controls.
  Required upgrade and Buy / Run / Skip choices stay beside the game; the
  leaf reading reveals before details become available. Full keeps the
  desktop sidebar. The choice is remembered; `?view=compact|full` overrides
  it for one visit. You can select Compact even in Chrome's Desktop Site
  mode; the game cannot override that browser setting.
- **Touch** chooses Easy or Classic Touch; **Auto Steam** can be enabled
  with Classic Touch or a keyboard, and is always enabled with Easy Touch.
  Both choices are remembered. URL overrides for one visit are
  `?touch=easy|classic` and `?autosteam=on|off` (Easy Touch keeps Auto Steam on).
- **Sound** is off by default. Turn it on for synthesized sound effects and
  the adaptive soundtrack.
- **Graphics** switches between high quality (full-resolution tea with
  glowing currents) and low quality for older machines. You can also add
  `?graphics=low` or `?graphics=high` to the URL.
- Add `?seed=<number>` to the URL to replay the same sequence of tea leaves.
- Add `?tea=<variety>` to brew only one tea, for practice: `green`,
  `earlGrey`, `chai`, `black`, `herbal`, or `house`. A practice tea is
  available from the first cup.

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

## Support the Project

Enjoying Steeped in Trouble? If you'd like to help keep the kettle boiling, you
can [support development via PayPal](https://www.paypal.com/donate/?hosted_button_id=DRJD388WT8DAL).

Contributions are entirely optional. Playing the game, sharing it with others,
and reporting bugs or suggestions are just as appreciated.
