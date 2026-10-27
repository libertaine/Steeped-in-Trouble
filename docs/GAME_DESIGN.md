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

The leaf pattern points at one of four classic fortunes, checked in this
order:

| Fortune | Read when… | Effect next round |
| --- | --- | --- |
| **The Veil** | 3+ kills made in or beside a milk cloud | Milk clouds last 2.5 s longer |
| **The Crown** | ≥ 40% of leaves lie in three adjacent lanes | +1 sugar burst |
| **The Spiral** | Leaves occupy 10+ different lanes | Leaves drift one lane sideways mid-flight; kills score 25% more |
| **The Star** | Otherwise (a clear cup) | Steam darts travel 35% faster |

So fighting in one area tends to bring abundance, spreading out invites
crosswinds, relying on milk brings cover, and a tidy round sharpens your aim.

The pattern is only a strong favourite. The actual fortune is a weighted draw
among all nine, nudged by how the round went:

| Fortune | More likely after… | Effect next round |
| --- | --- | --- |
| **Sugar Rush** | Heavy sugar use | Sugar bursts regrow, one every 6 s, up to the usual supply |
| **Double Trouble** | A clean round (no spills) | Each steam shot is two darts that veer apart |
| **Tempestuous Tea** | Spills | Wilder tea; leaves rise 18% faster |
| **Golden Opportunity** | A clean round | A golden sugar cube appears for 5 s near the spoon; steam it for points, sugar, rarely an extra cup (up to four), or a jackpot |
| **The Leaves Lie** | (rare, slightly less so after a clean round) | No rule changes. The reading claims something grand, then confesses; during the round the cup plays one harmless prank |

Frequent milk use also nudges towards The Veil. Every fortune lasts exactly
one round and is cleared by a new match.

## Added in 0.4.0 — A Spoonful of Trouble

### Defences

- **Grace period:** after a spill the cup recovers for 1 s (its rim pulses).
  Leaves reaching the rim then are sloshed 150 units back into the cup instead
  of costing a cup, so they cannot drain lives the moment it ends. Several
  cups can still be lost in one round.
- **Tea strainer:** catches the first escaping leaf of each round, with a
  metallic glint and a clink. It refills every round. Shown as `STRAINER n/m`
  and as silver mesh rings on the rim.
- **Milk backwash:** pouring milk now also sends a pale wave in from the rim
  that pushes leaves in the slowed wedge 120 units back towards the centre
  (never further in than where they started). The slowing is unchanged.

### Spoon upgrades

After rounds 1, 3, 5, 7 and so on, the reading offers two different upgrades.
Pick one with <kbd>1</kbd> / <kbd>2</kbd>, a click, or a tap. Upgrades last
until the pot runs dry.

| Upgrade | Per level | Limit |
| --- | --- | --- |
| **Polished Spoon** | Steam 20% faster; a brighter spoon and luminous trails | 3 |
| **Quick Stir** | Spoon turns 15% faster; engraved chevrons and afterimages | 3 |
| **Sugar Scoop** | +1 sugar burst per round (Sugar Rush regrows up to it) | 2 |
| **Strainer Attachment** | +1 strainer catch per round | 2 (3 catches) |

With three or more upgrades the spoon grows a filigree handle.

### The Golden Spoon

The golden sugar cube may now award the Golden Spoon (and every jackpot does):
for 9 s of play, steam fires twice as often and 15% faster, in gold, on top of
any upgrades and fortunes, including both of Double Trouble's darts.

### Fortune tweaks

- Strainer catches, grace recoils, and milk rescues from near the rim count as
  near misses, each making Tempestuous Tea a little more likely (up to four).
- The Leaves Lie has a new prank: it recommends a bigger spoon.

### Presentation

- Procedural canvas art: the cup, liquid, saucer handle, leaves, spoon,
  steam, sugar crystals, milk clouds, and particles.
- Optional synthesized sound effects (off by default).
- Keyboard and touch controls. Responsive layout for desktop and mobile.

## Added in 0.5.0 — Something's Brewing

### The Prismatic Sugar Cube and the Steam Nova

From the second round on, each round has a 20% chance of a Prismatic Sugar
Cube, under any fortune. It appears within four lanes of the spoon and lasts
only 2.5 s. Steam (or sugar) that strikes it sets off a **Steam Nova**:
ordinary steam down all 16 lanes at once.

Nova darts are plain steam, so everything that improves steam carries over:
Polished Spoon and The Star make them faster, the Golden Spoon gilds them, and
Double Trouble doubles them to 32. No combination is special-cased; they fall
out of the rules.

### Unexpected brews

Some combinations unlock a new behaviour instead of a bigger number. The
first time each happens in a pot, the cup announces **UNEXPECTED BREW
DISCOVERED!** with its name. After that it works without comment.

| Brew | Ingredients | Effect |
| --- | --- | --- |
| **The Perfect Storm** | Milk + Tempestuous Tea | Clouds are 60% wider and drift around the cup at 0.35 rad/s, slowing and washing back everything they pass |
| **The Silver Tornado** | Polished Spoon + Quick Stir (any level) | After 0.5 s of steady turning, the rim the spoon swept in the last 0.25 s is a wake that destroys leaves within 16 units of the rim (+6 per further level of either upgrade) |
| **Double Gilt** | Golden Spoon + Double Trouble | When a golden twin dart destroys a leaf, the nearest other leaf within 48 units is splashed too |

The Silver Tornado rewards movement rather than shooting: it guards the rim
the spoon sweeps, so circling the cup becomes a defence. Wake and splash kills
score like steam but don't count as steam kills for the secrets.

### Secrets (spoilers)

The game never explains these, and the README doesn't mention them. When a
finished round earns one, the reading shows **THE LEAVES ARE IMPRESSED.**
with its name and reward.

| Secret | Earned when… | Reward |
| --- | --- | --- |
| **Not a drop wasted.** | 12+ steam shots in the round, and every one hit something | +250, and one extra sugar burst next cup |
| **More leaves than steam.** | 8+ steam shots, and steam destroyed more leaves than shots fired | The Golden Spoon (its 9 s run during the next cup) |

A *shot* is one press of fire: a Double Trouble pair is one shot, and it hits
if either dart does. Striking a sugar cube counts as a hit. Sugar bursts and
the Steam Nova are not shots, and their kills don't count as steam kills.
Darts still in flight when the round ends are ignored.

Without help, one shot destroys one leaf, so *More leaves than steam* needs
Double Trouble or the cream (below).

### Accidents

Not everything is announced. When a steam dart destroys a leaf inside or
beside a milk cloud, there is a 20% chance the cream carries it on to the
next leaf in its path (once per dart, shown only as a pale streak behind it).

## Future ideas (not implemented)

These are possibilities for later milestones, recorded so they aren't lost.
None are planned commitments.

- New tea-leaf types (for example leaves that split, sink, or hide in
  steam).
- More fortunes, and readings based on timing or accuracy.
- Choosing between two possible readings.
- Stacking or longer-lasting omens.
- New weapons or more spoon upgrades (lemon, honey, a stirring vortex).
- Persistent upgrades across sessions, upgrade trees, shops (deliberately
  not yet).
- Richer liquid simulation and more elaborate leaf-settling animation.
- Music and a fuller soundscape: the likely focus of 0.6.0, starting with an
  adaptive procedural soundtrack that follows the tension in the cup.
- Local high scores, with validated persisted data.
- Revisiting the prototype quirks listed in
  [the reference notes](reference/README.md), such as making the spill flash
  visible during play.

Out of scope for now: online leaderboards, multiplayer, accounts, and cloud
saves.
