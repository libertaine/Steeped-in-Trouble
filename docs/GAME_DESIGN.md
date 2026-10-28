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
| **Not a drop wasted.** | 12+ steam shots in the round, and every one hit something | +250, and one extra sugar burst next round |
| **More leaves than steam.** | 8+ steam shots, and steam destroyed more leaves than shots fired | The Golden Spoon (its 9 s run during the next round) |

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

## Added in 0.6.0 — The Kettle Sings

### The adaptive soundtrack

With sound on, a small procedural synth band plays in D minor (i – VI – III –
VII, two bars per chord). It follows the cup rather than a track:

| Moment | What you hear |
| --- | --- |
| Ready screen | A quiet pad and a music-box melody, about 76 BPM |
| Early round, leaves far away | Pad, half-note bass, kick on the strong beats, the melody wandering on top; 92 BPM, +3 per round up to 120 |
| A leaf closing in | Hats on eighths, quarter-note bass with octave hops, an arpeggio, the filter opening |
| Leaves at the rim | Driving eighth-note bass, sixteenth hats, snare, a pulsing semitone alarm; the melody steps aside |
| Leaves cleared | Everything relaxes over a few seconds |
| Tempestuous Tea | 8 BPM faster, the arpeggio from the start, an octave up |
| Golden Spoon | A high, glittering bell layer |
| Steam Nova | The chord tumbles up three octaves |
| Reading | Back to the pad and music box, slowing to 66 BPM |
| Paused, game over | The band rests |

Tension is mostly the leaf nearest the rim, plus how many are close; it rises
quickly and eases off slowly, and a spill spikes it. Tempo drifts towards its
target (tension adds up to 12 BPM), so it never lurches. The layers carry the
moment-to-moment drama.

## Added in 0.7.0 — Hot Chocolate Havoc

### Aiming

The spoon still circles the rim continuously, but the lane it will fire down
is now highlighted: a pale beam down the lane, a chevron at the firing point,
and a flash when a shot goes. The highlight comes from the same `spoonLane()`
the weapons use, so it can never show a different lane from the one the shot
takes. It cross-fades between lanes instead of sliding. Double Trouble
highlights the shared starting lane, sugar flashes its three lanes, and a
Steam Nova lights all sixteen. Milk keeps its own wedge.

### The bonus round (spoilers)

Sometimes, after the leaves are read (and any spoon upgrade is chosen), the
cup announces **The Chocolate Prophecy** before the next cup. The tea darkens
into hot chocolate, and for 25 seconds marshmallows float up in place of
leaves while the spoon fires little flames. The intro can be skipped with
Enter.

- **When:** the first bonus round always follows round 3, 4, or 5 (chosen at
  random when the pot starts). After that it has a 30% chance after each
  round, never sooner than three rounds after the last. It isn't a numbered
  round (the HUD shows it as "03½"), and it has its own random generator, so
  the next cup plays out exactly as it would have without it.
- **Cooking:** every flame that lands adds one level of doneness and one unit
  of heat. Heat cools at 2.6 per second (1.9 before 0.8.0), and a
  marshmallow catches fire if its heat goes over 1.75. Two flames make it
  toasted, and four make it perfect, at which point it pops out of the cup at
  once for 30 points. Holding fire lands flames about 0.22–0.25 s apart,
  which burns a marshmallow on the fourth. Flames spaced about 0.3 s or more
  apart never do. Flames burn
  out after 175 units, so only the outer two-thirds of the cup is in reach.
- **Scoring:** marshmallows reaching the rim are scooped up, as is anything
  still in the cup at the end: toasted 12, burned 2, raw nothing. A flame
  that hits a burned marshmallow crumbles it to ash, clearing the lane. Five
  perfect marshmallows earn +75 and an extra sugar burst next cup; nine earn
  +200 and the sugar burst.
- **The giant marshmallow** (40% of bonus rounds) can't burn. Every flame
  makes it swell, it looks alarmed towards the end, and the eighth flame
  bursts it into seven little marshmallows: **Marshmallow Catastrophe!**
- **Nothing costs a cup.** The spoon's upgrades carry over: Quick Stir turns
  as usual, and the Polished Spoon makes flames faster and reach further. The
  Golden Spoon fires twice as fast, with gentler flames that toast without
  scorching, and its time stands still until the tea returns. Fortunes don't
  apply in the chocolate; the reading's fortune waits for the next cup.
- **Music:** the band switches to a bouncy F major (I – vi – IV – V, a chord a
  bar) with lighter drums, a busier melody, a little fanfare at the start, a
  quickening beat in the last six seconds, and a flourish when the giant
  bursts.

Tuning came from simple bots playing 40 rounds each: holding fire on one
marshmallow scored about 100, sweeping the rim with fire held about 340,
and a bot that spread its flames between cool marshmallows about 630.

## Added in 0.8.0 — The Daily Grind

### Controls

<kbd>Q</kbd> pours milk and <kbd>E</kbd> fires sugar, beside the turning keys.
<kbd>M</kbd> and <kbd>S</kbd> still work.

### The coffee boss (spoilers)

Between two rounds the cup announces *"Someone ordered trouble. Double
shot."* and a furious little copper espresso machine rises out of a cup of
coffee. Its gauge eyes follow the spoon, and so does its steam wand.

- **When:** the first encounter always follows round 6, 7, or 8. After that
  it has a 25% chance after each round, at least four rounds after the last.
  It never shares a reading with Hot Chocolate Havoc: if both are due, the
  hot chocolate goes first and the machine waits for the next reading. Like
  the hot chocolate it isn't a numbered round, and it has its own random
  generator.
- **Hurting it:** steam stops at a chrome collar round the machine and just
  clanks. The **safety valve** on that collar turns to a lane three to six
  lanes from the spoon (a dashed ring marks where), then blows open for
  2 s with the lane lit gold. Steam down that lane while it's open does 1
  damage; a sugar dart does 3. It has 56 pressure and 38 seconds.
- **Coffee Bean Barrage:** beans fly out along the lanes in a ring (every
  other lane, then the others), a fan aimed at the spoon, or a two- or
  three-armed pinwheel. Steam cracks a bean but is spent doing it; sugar
  crunches straight through. Milk washes beans back and slows them, as it
  does leaves. A bean that reaches the spoon scalds it; anywhere else it
  splats harmlessly.
- **Pressure Release:** the machine swells, then marks a wedge of five to
  seven lanes, every other lane, or four pairs of lanes in red, always
  including the spoon's. After 1.7 s (1.15 s when furious) hot coffee shoots
  down them. Milk poured while it builds makes it sputter and wait 1.3 s
  longer, once per attack.
- **Escalation:** as it loses pressure the valve turns faster, attacks come
  closer together, beans fly faster, wedges widen, and the music speeds up.
  At half health the gauge reads TOO MUCH; past four-fifths it hops, rattles,
  spits defective pods, and complains.
- **Losing:** three scalds (with a moment's protection after each), or the
  clock running out, and it escapes: *"You'll be hearing from my manager."*
  Nothing else changes. The cups, spoon, round, Golden Spoon time, and next
  fortune are exactly as they were.
- **Winning:** +350, and a 12-second Golden Spoon that starts with the next
  cup. Without a single scald it's a **Perfect Brew** (*"Not a single drop
  spilled."*), which restores a cup, up to four, or pays +150 if the cups are
  already full. Valve hits score 10 and beans 5 along the way.
- **Music:** E minor grinding against F, a pulsing eighth-note bass that
  turns to sixteenths when it's desperate, ticking hats and offbeat clanks,
  stabs as the fight starts, a climbing alarm while a pressure attack is
  warned, and a two-octave chromatic tumble when it falls.

Tuning came from bots fighting 300 encounters each. One that chases the
valve and dodges the red lanes with a quarter-second reaction wins about 90%
of the time in about 27 seconds, and about a quarter of those are Perfect
Brews. One that never dodges wins about two-thirds of the time and almost
never perfectly.

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
- A fuller soundscape: richer sound effects, a separate music volume.
- Local high scores, with validated persisted data.
- Revisiting the prototype quirks listed in
  [the reference notes](reference/README.md), such as making the spill flash
  visible during play.

Out of scope for now: online leaderboards, multiplayer, accounts, and cloud
saves.
