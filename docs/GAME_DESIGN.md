# Game design

## Creative direction

**Steeped in Trouble is a circular arcade survival game in which the player's
actions influence the tea-leaf patterns remaining after each round. Those
patterns determine future gameplay modifiers.**

Themes:

- A storm inside a teacup: a small, contained world that is nonetheless
  turbulent.
- A silver spoon defending the cup.
- Milk and sugar as gameplay resources.
- Procedurally rendered liquid and tea leaves. All art is drawn with
  vector paths.
- Fortunes that carry consequences into subsequent rounds.
- Fast arcade gameplay with strategic decisions: *how* you clear a round
  shapes the next one.

## Implemented in 0.1.0

### The cup

- A circular arena with 16 lanes radiating from the centre.
- Tea leaves appear near the centre in a random lane and drift outward. A
  leaf that reaches the rim spills: you lose one of three cups (lives).
  Losing all three ends the pot (game over).

### The spoon

- Moves continuously around the rim (2.8 rad/s) and fires down the nearest
  lane.
- **Steam:** an unlimited inward dart, at most one every 0.19 s. Hold to fire
  continuously.
- **Milk** (2 per round): leaves a cloud over the spoon's lane for 5.2 s.
  Leaves within about 1.65 lanes of it move at 31% speed.
- **Sugar** (2 per round): three fast darts down the spoon's lane and both
  neighbours.

### Rounds and scoring

- Round *n* ends after 16 + 4(*n* − 1) leaves are cleared.
- Leaves get faster each round (+6 speed per round, capped at +55), and
  spawns come more often (the interval shrinks from about 1.1 s to a floor
  of 0.57 s, with jitter). At most 18 leaves are in the cup at once.
- Steam kills score 10 and sugar kills score 15.

### Tea-leaf residue and fortunes

Each defeated leaf leaves residue in the cup, near the lane where it died.
When a round ends, the leaves are read. They glide into the shape of the
fortune, and the fortune applies to the **next** round only.

Fortunes are checked in this order:

| Fortune | Read when… | Effect next round |
| --- | --- | --- |
| **The Veil** | 3+ kills made in or beside a milk cloud | Milk clouds last 2.5 s longer |
| **The Crown** | ≥ 40% of leaves lie in three adjacent lanes | +1 sugar burst |
| **The Spiral** | Leaves occupy 10+ different lanes | Leaves drift one lane sideways mid-flight; kills score 25% more |
| **The Star** | Otherwise (a clear cup) | Steam darts travel 35% faster |

So fighting in one area tends to bring abundance, spreading out invites
crosswinds, relying on milk brings cover, and a tidy round sharpens your aim.

### Presentation

- Procedural canvas art: the cup, liquid, saucer handle, leaves, spoon,
  steam, sugar crystals, milk clouds, and particles.
- Optional synthesized sound effects (off by default).
- Keyboard and touch controls. Responsive layout for desktop and mobile.

## Future ideas (not implemented)

These are possibilities for later milestones, recorded so they aren't lost.
None are planned commitments.

- New tea-leaf types (for example leaves that split, sink, or hide in
  steam).
- New fortunes, including negative or mixed omens, and readings based on
  more than lane distribution (timing, weapon choice, accuracy).
- Choosing between two possible readings.
- Stacking or longer-lasting omens.
- New weapons or spoon upgrades (lemon, honey, a stirring vortex).
- Richer liquid simulation and more elaborate leaf-settling animation.
- Music and a fuller soundscape.
- Local high scores, with validated persisted data.
- Revisiting the prototype quirks listed in
  [the reference notes](reference/README.md), such as making the spill flash
  visible during play.

Out of scope for now: online leaderboards, multiplayer, accounts, and cloud
saves.
