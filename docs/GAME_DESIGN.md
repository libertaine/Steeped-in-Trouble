# Game design

## Creative direction

The silver spoon is the hero: defender of a temperamental cup and reluctant
star of increasingly unreasonable adventures. The 0.14.0 Days let
players choose a comfortable continuation or sustained challenge.

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
- *Since 0.9.0, speed and spawning are set by the chapter instead, and the
  target grows by two a round up to 32: see [Chapters](#chapters-the-slow-burn).
  Since 0.14.0, resettable Heat controls this growth; see [Days](#days-and-heat-0140).*
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
among all ten, nudged by how the round went:

| Fortune | More likely after… | Effect next round |
| --- | --- | --- |
| **Sugar Rush** | Heavy sugar use | Sugar bursts regrow, one every 6 s, up to the usual supply |
| **Double Trouble** | A clean round (no spills) | Each steam shot is two darts that veer apart |
| **Tempestuous Tea** | Spills | Wilder tea; leaves rise 18% faster |
| **Golden Opportunity** | A clean round | A golden sugar cube appears for 5 s near the spoon; steam it for points, sugar, rarely an extra cup (up to four), or a jackpot |
| **The Leaves Lie** | (rare, slightly less so after a clean round) | No rule changes. The reading claims something grand, then confesses; during the round the cup plays one harmless prank |
| **Karma** (0.13.0) | (rare, whatever the round) | Escaping leaves cannot cost a cup: each bounces off the rim once, then vanishes on its next contact |

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
  *0.9.0 adds a lighter recovery pulse through the whole cup: see
  [Milk's recovery pulse](#milks-recovery-pulse).*

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
  random when the pot starts; round 3 or 4 since 0.9.0, so it never meets
  the first Daily Grind). After that it has a 30% chance after each
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
  generator. *Since 0.9.0 the first encounter is a fixed milestone after
  round 5: see [The milestone](#the-milestone-the-daily-grind-after-round-5).*
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

## Added in 0.9.0 — Strange Brews

### Controls

<kbd>↑</kbd> pours milk and <kbd>↓</kbd> fires sugar, beside the turning
arrows. <kbd>Q</kbd> / <kbd>M</kbd> and <kbd>E</kbd> / <kbd>S</kbd> still work.

### Chapters: the slow burn

The following describes the published chapter baseline. In 0.14.0, Days
add a separate layer of optional combat pressure to it.

The first human playtests reached round 8 without meeting the first boss:
leaves sped up and arrived faster every round, the kill target grew by four,
and five new teas arrived at once. 0.9.0 replaces that with a progression
driven by milestones. A pot is told in **chapters**, and within a chapter
the leaves' speed and the pace of their arrival hold steady whatever the
round. What changes from cup to cup is the tea, the fortune, and the spoon.

| | Chapter 1 — *Learning to Steep* | Chapter 2 — *Things Heat Up* |
| --- | --- | --- |
| Begins | Round 1 | The cup after The Daily Grind is first beaten |
| Leaf speed | 41–57 | × 1.15 (about 47–66) |
| Gap between new leaves | 1 s × jitter 0.72–1.36 | the same |
| Teas on tap | House Blend, Herbal Tea, Earl Grey | + Chai, Green Tea, Black Tea, one at a time |

- Chapter 1's speed sits about where rounds 1 and 2 used to be. Chapter 2
  is a single step up, not a ramp: its first round is as fast as its
  twentieth. Teas and fortunes still modify the speed (and the × 1.35 cap
  on tea and fortune together still applies), and the jitter keeps arrivals
  from becoming a metronome.
- **Round length:** round *n* now ends after 16 + 2(*n* − 1) leaves, up to
  32 (round 9 on), so a round takes about 20–35 seconds rather than
  stretching towards a minute.
- **Losing the milestone keeps the chapter:** a pot stays in Chapter 1, at
  Chapter 1's pace and with its three teas, until the machine is beaten,
  however many attempts that takes.
- **The chapter's first cup** is announced with a shower of gold and a card
  under the leaves, *THE NEXT BREW AWAITS*, naming the chapter and noting
  that new teas are on the shelf, with a warm rising chord. Then the cup's
  own tea card follows.
- Chapters and their teas live in `CONFIG.chapters`; the progress through
  them is a small piece of state (`state.progress`, see
  `gameplay/progress.js`). 0.9.0 has exactly two chapters. A later release
  can add a third with its own milestone.

### The milestone: The Daily Grind after round 5

*(spoilers)* The coffee boss is now Chapter 1's milestone and a
guaranteed encounter:

1. Round 5 ends, and its leaves are read as usual (with the spoon upgrade
   offered after round 5).
2. The machine rises: *"Someone ordered trouble."* The fight itself, its
   rewards, and its use of milk are exactly as in 0.8.0.
3. **Beaten:** +350, the Golden Spoon, and a Perfect Brew's cup as before.
   The next cup opens Chapter 2, once. The result card adds *"Something
   new is steeping. The next brew awaits…"*.
4. **Escaped:** nothing is lost, and the card says when it returns: *"It
   will be back after 2 more cups."* It comes back after every second
   normal round (rounds 7, 9, 11, …), at exactly the same strength, until it
   is beaten. The spoon, its upgrades, the cups, and the fortune carry on as
   usual meanwhile.
5. **After the first victory** it returns now and then as before (a 25%
   chance after a round, at least four rounds after the last), but these
   rematches open nothing and change no difficulty.

**Hot Chocolate Havoc** now first comes after round 3 or 4, so it never
meets the first milestone. If a hot chocolate ever wants the same reading
as a milestone attempt (for example a chance bonus landing on a rematch),
the machine goes first and the hot chocolate follows the very next reading:
put off, never lost, never both at once. Later rematches still give way to
the hot chocolate, as in 0.8.0.

### Tea varieties

Until now the tea was only the arena. Now every normal round brews a
variety, and the variety is the round's environment: it changes how the
leaves arrive and move, and how the cup looks and sounds. The fortune read
from the last round's leaves is a separate layer on top.

- **The first cup** is always the **House Blend**, the familiar tea, so a
  new player can learn the cup.
- **Teas come on tap by chapter.** Chapter 1 brews the House Blend, Herbal
  Tea, and Earl Grey; the House Blend stays in the mix as a breather.
  Chapter 2 brings **Chai** in its first round, **Green Tea** two rounds
  later, and **Black Tea** two rounds after that. A tea stays on tap for
  the rest of the pot. Chai comes first because its movement is predictable
  and whole-cup; Green Tea's darts follow; Black Tea, the high-scoring,
  high-pressure variety, comes last.
- **A new tea is served the round it arrives**, so every player actually
  meets it, with a longer card marked *✦ NEW ON THE SHELF ✦* and *"New on
  the shelf!"* in the tip line.
- **Otherwise** each cup's variety is drawn from its own random generator
  among the teas on tap (so the order depends only on the seed, not on how
  the cups are played or on any hot chocolate between them). A variety
  never comes twice in a row. Its chances grow by one for every round since
  it was last served (up to four times as likely), and one that hasn't been
  served for more than seven rounds is served next.
- **Each variety lasts one round** and expires at the next round start, as
  fortunes do. A new pot starts again in Chapter 1 with the House Blend.
- Each cup after the first is **announced** for a few seconds at the top of
  the cup: *NOW BREWING*, the tea's name, and its motto. The card sits
  beneath the leaves, so it never hides one, and gets shorter after round 8.
  The tea's colours ease in over about 1.6 s. The HUD names the tea in the
  round title ("Cup 3: Earl Grey"), in a pill under the omen, and in a row of
  the cup status panel, and during play the tip line explains it.
- **Practice:** `?tea=<id>` brews one variety every cup, as if it had been
  on tap from the first, without waiting for its chapter. The chapters,
  the milestone, and the leaf speed run as usual around it.

| Tea | Motto | Rules |
| --- | --- | --- |
| **House Blend** | *Just tea. For now.* | The rules as they were. |
| **Green Tea** | *A Little Too Refreshing* | Leaves rise 10% faster, and some of them dart (below): 10% of leaves at first, 30% at full strength. |
| **Earl Grey** | *Trouble with a Touch of Class* | Some leaves wander (below): 15% at first, 40% at full strength. |
| **Chai** | *Spice Things Up* | Spice currents (below), with more warning at first. |
| **Black Tea** | *Properly Strong* | Leaves arrive 12% more often (the gap between them × 0.88), and every leaf scores 25% more. The limit of 18 leaves in the cup is unchanged. |
| **Herbal Tea** | *What Could Possibly Go Wrong?* | Leaves rise 12% slower and arrive a little less often (× 1.06); milk clouds last 1 s longer. The Leaves Lie is likelier at the next reading (its weight +1, from about 4% to about 11% of readings, never certain). Now and then a chamomile flower or a few petals float by, with a remark. |

### The learning curve

Darting, wandering, and spice currents start gentle and reach full
strength in a tea's ninth round on tap, so a player meets each one with
time to learn it before it gets demanding. The stage depends only on the
tea's **age**: the normal rounds since it came on tap, counting the round
it arrives as the first. So Green Tea arriving in round 8 (or round 20,
after a few lost milestones) starts with its gentlest darts, and a tea
brews the same way at a given age however often it happened to be served
before. Earl Grey, on tap from the first cup, has the same age as the
round number. A pinned `?tea=<id>` counts from the first cup too, so it
brews like an ordinary pot's tea of the same age.

| | Rounds 1–4 on tap: learn | 5–8: adapt | 9 on: full strength |
| --- | --- | --- | --- |
| Green Tea: leaves that dart | 10% | 20% | 30% |
| Green Tea: crouch before a dash | 0.75 s | 0.65 s | 0.55 s |
| Green Tea: extra distance of a dash | 10 | 14 | 18 |
| Earl Grey: leaves that wander | 15% | 25% | 40% |
| Earl Grey: lean before a glide | 0.8 s | 0.65 s | 0.55 s |
| Chai: first warning, seconds into the round | 6.5 s | 5.5 s | 5 s |
| Chai: warning before each current | 2.2 s | 1.9 s | 1.6 s |
| Chai: calm between currents | 10 s | 8.5 s | 7.5 s |

Everything else about each tea
(Green Tea's 10% hurry, Black Tea's density and +25%, Herbal Tea's pace
and milk) is the same in every round. The stages are the boundaries in
`CONFIG.teas.stages`, and each value above is a per-stage list in
`CONFIG.darting`, `CONFIG.wandering`, or `CONFIG.currents`. They are a
starting point for today's game, not a limit on future progression.

### New leaf behaviours

Both are ordinary leaves with one extra behaviour: they die to one hit,
score like any leaf, and leave residue for the reading. Each has its own
shape, so colour is never the only clue, and every warning also has a
sound.

- **Darting leaves** (Green Tea) are slim, notched lances that always point
  at the rim. Somewhere between radius 60 and 100 a darter **crouches**
  (0.75 s, 0.65 s, or 0.55 s, by stage): it slows to 35% speed, flickers
  sideways, and shows a pulsing ring and two chevrons pointing outward.
  Then it **dashes** for 0.45 s, trailing a streak: it accelerates, then
  settles back into an ordinary rise, having gone a fixed distance further
  than an ordinary leaf would in that time (10, 14, or 18 units, by stage;
  12, 22, and 35 before the chapters slowed the leaves, which would have let
  a slow full-strength darter reach the rim up to 0.3 s early).
  - The distance is a fixed budget, not a multiple of the leaf's speed, so
    a dash doesn't grow with Chapter 2's faster leaves, and neither Green
    Tea's own hurry nor Tempestuous Tea stretches it. Milk slows a dash
    like any other movement, and a leaf being washed back doesn't dash.
  - The crouch gives back about what the dash takes: a darter never
    reaches the rim noticeably sooner (more than 0.05 s) than an ordinary
    leaf passing the same point. The surprise is the danger, not lost
    reaction time.
  - Even the fastest possible darter, crouching at the furthest point,
    ends its dash more than 30 units inside the rim and takes over 1.2 s
    from its first flicker to reach it. A darter never starts a crouch
    beyond radius 130.
  - The movement is the same at any frame rate: a stage that ends partway
    through a frame is split exactly.
- **Wandering leaves** (Earl Grey) have a curling tendril and a lavender
  edge. Somewhere between radius 65 and 100 a wanderer **leans** (0.8 s,
  0.65 s, or 0.55 s, by stage), with a curved arrow towards the neighbouring
  lane and a dashed ghost where it is going, and does not move sideways.
  Then it **glides** into that lane over 0.35 s and leaves a short lavender
  trail. It changes lane once, ends exactly on the new lane, and is always
  in the middle of the cup: even the fastest leaf a stage can bring
  finishes its glide inside 85% of the rim radius, and a wanderer never
  starts to lean beyond radius 130.

### Spice currents (Chai)

On a fixed clock, every leaf in the cup is carried one lane sideways:

- Early in the round (6.5 s, 5.5 s, or 5 s in, by stage), two rings of
  amber chevrons appear, pointing the current's way round the cup. They
  brighten for the warning (**2.2 s**, **1.9 s**, or **1.6 s**), during
  which nothing moves.
- Then for **0.9 s** every leaf in the cup glides exactly one lane in that
  direction, trailing spice. Leaves that appear during the glide aren't
  carried.
- A calm follows (10 s, 8.5 s, or 7.5 s, by stage), and the next current
  runs the **other way**. The first direction is drawn from the tea
  generator when the round starts.

The timing never varies within a round, so a player can learn to aim one
lane ahead. The clock keeps time at any frame rate.

### Tea and fortune together

The tea's modifiers are folded into the fortune's by fixed rules
(`roundModifiers()` in `gameplay/teas.js`): multipliers multiply, bonuses
add, chances take the larger, and switches combine. Leaf speed from tea and
fortune together is capped at × 1.35. Nothing is special-cased; these come
out of the rules:

| Combination | Result |
| --- | --- |
| Green Tea + Double Trouble | Quick, darting leaves against paired steam |
| Green Tea + Tempestuous Tea | Leaves × 1.10 × 1.18 ≈ 1.30 speed |
| Earl Grey + The Spiral | A wanderer steps first (inside radius 100), then The Spiral nudges it at radius 140; every move ends on a lane |
| Chai + Tempestuous Tea | Faster leaves and currents together, every current still warned |
| Black Tea + The Spiral | Kills score × 1.25 × 1.25 ≈ × 1.56, applied once |
| Black Tea + the Golden Spoon | Twice the steam, and every leaf worth 25% more |
| Herbal Tea + The Veil | Milk clouds last 2.5 + 1 s longer |
| Herbal Tea, then The Leaves Lie | Likelier; still whimsical, still harmless |

The unexpected brews and the secrets work as before under every tea.

### Milk's recovery pulse

Milk used to help only in the wedge in front of the spoon. Now, in a normal
round, every pour also sends a **recovery pulse** through the whole cup: a
short chance to catch up when several leaves get away at once.

- **Every leaf** in the cup is pushed **40 units** back towards the centre
  (never further in than where it started) and moves at **65%** speed for
  **1.5 s**.
- **The local cloud is unchanged:** in front of the spoon, the 120-unit
  backwash and the 5.2 s cloud at 31% speed still apply, with every fortune,
  tea, combination, and upgrade interaction as before.
- **They never add up:** a leaf under the cloud gets the cloud's 120-unit
  push, not 160, and its 31% speed, not 31% × 65%. The stronger push and
  the stronger slowdown win.
- **A second pour restarts the pulse** (and gives each leaf a fresh 40-unit
  push); it never deepens the slowdown. Two pours per round, as before.
- **It awards nothing of its own:** no near misses, milk kills, Veil credit,
  secrets, or points. Those stay with the cloud.
- **Normal rounds only.** Milk against The Daily Grind (washing beans back,
  making the machine sputter) is unchanged, and Hot Chocolate Havoc has no
  milk.
- **Looks and sound:** a pale ripple spreads across the tea while a soft
  crest rolls in from all round the rim, and a faint white ring glows just
  inside the rim until the slowdown ends. All of it sits beneath the leaves
  and aim markers. With reduced motion it is a still glow; Low graphics
  drops the ring's bloom. A soft, low hush plays with it, and the first
  pulse of a pot is explained once.
- Darting, wandering, currents, The Spiral, Tempestuous Tea, and The
  Perfect Storm all work as before: a leaf being washed back doesn't dash,
  glides and drifts still carry it sideways, and speed modifiers multiply
  the slowed speed as usual.

### Bonus encounters

Hot Chocolate Havoc and The Daily Grind keep their own liquids, music, and
rules. Neither reads the tea or the chapter: marshmallows cook, beans fly,
and the boss's health and rewards are exactly as in 0.8.0. The next normal
round brews its own tea and its fortune as usual.

### Music

Each tea touches the band during play, on top of the tension layers:

| Tea | What changes |
| --- | --- |
| Green Tea | 6 BPM brisker, light hats from the start, the melody an octave up, a lighter pad |
| Earl Grey | 4 BPM slower, a ninth in the pad, a raised sixth (B♮) in the melody |
| Chai | 4 BPM quicker, a hand-drum pattern in threes and twos in place of the plain kick |
| Black Tea | 6 BPM quicker, quarter-note bass and kick even when calm |
| Herbal Tea | 10 BPM slower, a chattier melody, no drums until the leaves get close |

### Tuning

Bots played 150 pots with each tea brewed every round, and 200 ordinary pots,
at two skill levels: a casual bot (a quarter-second reaction) and a novice
(almost half a second, sometimes chasing the wrong leaf). For the novice,
rounds 2 to 12:

| Tea | Cups lost per round | Points per round | Median round |
| --- | --- | --- | --- |
| House Blend | 0.40 | 367 | 30.9 s |
| Green Tea | 0.45 | 343 | 29.5 s |
| Earl Grey | 0.41 | 358 | 30.7 s |
| Chai | 0.40 | 362 | 30.5 s |
| Black Tea | 0.45 | 446 | 26.8 s |
| Herbal Tea | 0.32 | 392 | 33.7 s |

The first version of Black Tea (leaves × 0.84 apart) cost novices nearly
twice as many cups as the other teas, and the first Herbal Tea (× 1.12)
dragged, so both were softened. Darting and wandering were first tuned so
that, at the fastest possible speed, a darter could reach the rim
mid-sprint; they now always finish well inside it. Earl Grey and Chai cost
little extra: their movements are learnable rather than punishing.

#### The learning curve, after the first human playtest

The first human playtest found the new behaviours interesting but the
difficulty rising too quickly, with Green Tea's darts the main culprit:
the bots that tuned them react faster and know where every leaf is. Two
things changed. The behaviours now grow through the three stages above
instead of starting at full strength in round 2. And a dash is now a fixed
extra distance rather than double speed: the old sprint went further as
the rounds made leaves faster, about 25 extra units in round 2 and 42 to
50 from round 9.

The same bots replayed the same seeds before and after (150 pots per
tea brewed every round, and 300 ordinary pots, at both skill levels).
For the novice bot with Green Tea every round:

| Rounds | Darters per round | Darters reaching the rim per round | Where a dash ends (median radius) |
| --- | --- | --- | --- |
| 2–4 | 5.9 → 1.9 | 0.09 → 0.02 | 150 → 134 |
| 5–8 | 9.5 → 6.2 | 0.56 → 0.25 | 175 → 158 |
| 9–14 | 10.5 → 10.5 | 1.09 → 0.96 | 194 → 181 |

Earl Grey's wanderers reaching the rim fell from 0.13 to 0.04 per round
in rounds 2–4 and from 0.69 to 0.43 in rounds 5–8. Chai's currents cost
the bots little either way. Cups lost per round barely moved for any tea:
for both bots the base speed and spawn curve decides most losses, and
even the novice bot loses only about 0.03 cups a round in rounds 2–4 of
the House Blend. So base speed was left alone. What the bots can't feel
is surprise, and that is what the gentler start is for.

Black Tea and Herbal Tea are unchanged. Brewed every round, Black Tea
costs the novice bot about 0.08 cups a round in rounds 2–4 (House Blend
0.03, Green Tea 0.06): the most of any tea, as the high-pressure variety
should, but still about one cup in twelve early rounds. Herbal Tea stays
the calmest, with rounds about 1.3 s longer than the House Blend early on.

Darting returns to full strength in round 9, so that is where the bots
feel the step most (novice darters reaching the rim: 0.31 per round in
round 8, 1.00 in round 9, against 0.86 and 1.08 before). The human
playtest should watch that step. *(With the chapters, that step now comes
in Green Tea's ninth round on tap, at the earliest round 16.)*

#### The slow burn, after the second human playtest

A player who reached round 8 several times had still not met the first
boss, and felt overwhelmed when several new teas arrived together. Hence
the chapters, the milestone, the staggered teas, and the recovery pulse
above.

The bots replayed 300 ordinary pots per skill level (seeds 1001–1300, up to
round 16) on the previous 0.9.0 candidate and on this one. Besides the
casual (0.25 s) and novice (0.45 s, a third of the time chasing the wrong
leaf) bots, a **struggling** bot reacts every 0.7 s, chases the wrong leaf
half the time, and pours milk late. On the old curve it plays much like the
human playtest did: a median of round 7, and only 28% of pots reaching the
boss. All bots aim instantly, so they still understate human difficulty;
read the shape, not the numbers.

| Struggling bot | Before | After |
| --- | --- | --- |
| Pots that meet The Daily Grind | 28% | 100% |
| First encounter (median) | after round 6, 200 s in | after round 5, 147 s in |
| Pots that reach round 10 | 2% | 99% |
| Pots that brew Chai / Green Tea / Black Tea | 80% / 84% / 83% | 100% / 100% / 99% |
| Leaves reaching the rim per round, rounds 1–5 | 0.75 | 0.18 |
| … rounds 6–10 | 2.78 | 0.41 |
| Cups lost per round, rounds 1–5 | 0.23 | 0.01 |
| … rounds 6–10 | 1.14 | 0.04 |
| Median round length, rounds 1–5 | 25.9 s | 22.7 s |
| … rounds 6–10 | 34.6 s | 32.2 s |

Round by round (after), leaves reaching the rim go 0.17, 0.14, 0.17, 0.20,
0.22 through Chapter 1, then 0.26 in Chapter 2's first round (Chai), and
about 0.5 when Green Tea and Black Tea arrive (rounds 8 and 10). The
chapter's step is felt without a wall, and most of the added pressure comes
from the new teas. The novice bot meets the boss in every pot (71% before),
and the casual and steady bots after round 5 instead of round 7 (about
145 s in rather than 230 s). The machine itself is unchanged: bots still
win 82–86% of fights.

For the pulse, the same candidate was replayed with the pulse switched off.
Of the leaves near the rim (beyond 80% of its radius) when the struggling
bot poured milk, 72% still reached the rim within 2.5 s without the pulse,
and 8% with it. Overall it cuts the leaves reaching the rim by about a
sixth (0.48 → 0.41 per round in rounds 6–10): a recovery tool, not a
shield. A bot that always loses the boss
meets it after rounds 5, 7, 9, 11, 13, and 15, stays in Chapter 1 with its
three teas throughout, and its rounds settle at about 33 s once the target
reaches 32.

The bots now rarely lose cups at all, in either chapter. That is
deliberate for 0.9.0, which is about meeting the game's content, and it
leaves the late-game plateau (issue #13) for the chapters and bosses still
to come.

## Added in 0.10.0 — The Tea Run

Released after the initial PC playtest. Phone and tablet usability testing
will guide subsequent mobile improvements.

### Tea Cash and the shortage

Tea Cash is separate from score and resets with a new pot: +5 per normal
round completed, +15 for a milestone victory (not a rematch), and +5 for a
successful Tea Run. The first shortage follows round 9's reading, once
Chapter 2 is open. If the milestone is still outstanding it waits; it never
preempts a milestone. In 0.10.0 it happened once per pot; the 0.11.0
recurring schedule is described below.

After the reading and any upgrade selection, choose Buy / Run / Skip with
1 / 2 / 3 or the buttons. Buy costs 20 Tea Cash and grants one extra sugar
burst in the next normal cup. Run can earn the same restock; Skip simply
continues, with no penalty. A shortage never discards the reading's fortune,
upgrades, cups, or pending Hot Chocolate Havoc / Daily Grind encounter.
Restock waits through any such encounter until the next normal cup.

### The Tea Run

The spoon runs automatically along a seeded sidewalk at 330 logical units/s,
with a 34-second course, 3-second skippable intro, and 1.4-second arrival.
The shop closes after 45 running seconds. Jump (Space/↑ or JUMP) over rolling
sugar cubes and tea puddles; slide (↓ or SLIDE) under suspended coffee cups.
Jump and slide last 0.6 seconds, followed by 0.08 seconds of recovery;
the latest press can buffer for 0.18 seconds, without cutting an action short.
The opening shows one of each obstacle. Gaps narrow but retain recovery time.

A stumble slows the spoon for 0.45 seconds, knocks that obstacle out, and
gives 1.3 seconds of safety. Three stumbles or the time limit ends the errand.
No outcome costs cups. Success grants one next-cup sugar burst and 5 Tea Cash;
failure grants neither. Collected coins pay 5 points and tea packets 10,
kept on either outcome and settled once. Pickups supplement ordinary scoring.
The next fortune and the ordinary random sequences stay unchanged.

### Touch and Auto Steam

Phones default to Easy Touch: two steering pads, Auto Steam, double-tap the
cup for milk, and hold 450 ms for sugar. Taps may be up to 300 ms apart;
drags and steering-pad taps do not count. Classic Touch keeps dedicated
buttons and can use manual or automatic steam. Preferences persist.
Auto Steam targets only the spoon's current lane, using ordinary cooldowns
and statistics; it never steers or chooses milk/sugar. Hot chocolate remains
manual (hold the cup for flames in Easy Touch). Runner pads replace cup
input for the errand, and unfinished gestures never carry between phases.

### Compact View and the Tea Break (0.11.0)

Presentation, controls, and firing are separate choices: Compact / Full,
Easy / Classic Touch, and Auto / Manual Steam. Easy Touch still requires
Auto Steam because it has no steam button; its relaxed difficulty is intentional.
No combat tuning changes accompany the mobile presentation.

Touch-capable devices default to Compact, including large and desktop-site
tablets. A saved choice wins; a visible switch and a visit-only `view` URL
override let mouse or hybrid devices use either view. Full retains the sidebar.
Compact uses available viewport height as well as width: a small HUD sits
above an undistorted canvas, thumb controls and actions below it. Short
landscape screens use a right-hand control rail. Safe areas and dynamic
viewport units protect the bottom actions without forcing rotation or fullscreen.

The Tea Break is optional at Ready, after the fortune reveal (including while
an upgrade awaits selection), or when explicitly pausing. It reuses pot, tea,
fortune, settings, and controls panels. Opening it freezes simulation time and resets input;
dismissing resumes only a game it paused itself, unless backgrounded meanwhile.
An existing pause remains paused. Escape and the visible close button dismiss it.
The leaf-reading animation remains unobscured before reveal. Upgrade offers
and Tea Shortage choices remain directly reachable outside the canvas in
Compact View, with their existing ordering and consequences.

Context menus and text selection are suppressed only on the gameplay surface.
Normal document text and links retain browser behavior. Chrome's Desktop Site
configuration and system edge gestures remain browser/system controlled;
emulation is not native Samsung qualification.

## The Flying Spoon (0.11.0 Milestone 2 — spoilers)

Tea Shortages target completed rounds **9, 16, 23, 30, 37, 44…**. Chapter 2
and milestone priority still apply. A blocked target waits until the next
eligible reading/upgrade transition. Starting it schedules the next future
9 + 7n target, so missed visits never accumulate. Buy / Run / Skip remains
optional and preserves the pending bonus, fortune and ordinary cup.

The first jump retains its 0.6-second parabola and 125-unit apex. Each new
airborne Jump press independently succeeds with probability **0.7**. It
starts a new upward impulse at the current height, with the original gravity
and launch speed; it never snaps to the ground. Cumulative chances to reach
jumps 2–6 are 70%, 49%, 34.3%, 24.01%, 16.807%. Failure locks airborne Jump
until landing and is consumed, never buffered. A held key/touch does not
repeat attempts. Ground recovery/slide buffering remains; Slide cannot
interrupt flight. Ordinary obstacles never require this hidden mechanic.

At creation, the errand's seeded stream reserves at most one opportunity.
The reservation does nothing unless the spoon actually crosses its altitude:

| Surprise | Altitude above sidewalk | Opportunity per run | Duration |
| --- | ---: | ---: | ---: |
| Bird | 210 | 14% | 3.6 s |
| Power lines | 380 | 8% | 3.2 s |
| Orbit | 850 | 1% | 5.4 s |
| No encounter | — | 77% | — |

These are mutually exclusive opportunities, not independent rolls every
frame or probabilities conditional on a jump count. A reserved orbital
opportunity cannot be replaced by a bird on the way up. Failing to reach
its altitude means no encounter. Normal jumping alone cannot reach any.

The bird approaches, looks confused, carries the spoon briefly, then drops
it. The wire produces a single restrained tint and a blackened, blinking,
smoking spoon. Orbit passes from the neighborhood/clouds to a curved Earth,
satellite and unexplained teapot, then cartoon reentry. Each returns to the
same course position. Obstacles in the immediate reaction window are
bypassed; pickups are left alone. No stumble, cup, score or cash is lost,
no free finish is granted, and no secret bonus is awarded. Course distance,
shop clock and stumble protection freeze during encounters. Pause, Tea Break
and backgrounding freeze the whole sequence. Existing sound-off behavior
and reduced-motion preferences apply.

Found events produce a discreet message and `runDiscovery` event and are
remembered in `aerialDiscoveries` for this pot only. Restart clears them.
Undiscovered events are never listed. Ordinary instructions and README keep
the secret controls, probabilities and triggers hidden.

The deterministic experiment in `tests/support/aerialSampling.js` uses
runner-stream seeds 1–20,000, real full courses, and Jump taps every 150 ms
through success/failure. It keeps all collisions, stumble limits and shop
timing enabled, with no special-event forcing. It measured **2,789 birds,
1,543 power-line events and 93 orbits** (15,575 runs without encounters).
Orbit rate: **0.465%, about 1 in 215 runs**. Of 207 reserved orbital
opportunities, 93 reached the altitude before the errand ended. This is a
balance sample for that input policy, not a guarantee for human players;
slower taps, sliding and different timing change the rate.

See [qualification and human playtest guide](FLYING_SPOON_TESTING.md).
No new minigame, boss, permanent upgrade or achievement system is included.

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

## The Daily Pour (0.12.0)

The spoon has a paper route. Nobody knows why.

An optional Arcade Interlude becomes eligible after completing round 12,
once Chapter 2 is open. Later opportunities occur 14 normal rounds after
the previous offer. These values live in `CONFIG.arcade.dailyPour`.
Fortune readings and upgrade choices finish first; Tea Shortages, milestone
bosses, rematches and Hot Chocolate Havoc take priority. A conflicting date
waits for a later eligible reading and never builds a backlog. Shortages
continue at 9, 16, 23, 30, 37 and every seven rounds thereafter.

The offer says EXTRA! EXTRA! — The Daily Pour needs a delivery spoon.
DELIVER PAPERS starts the mission; NO THANKS carries on for free. Both
answers consume the opportunity. Mouse, keyboard (1/2) and touch work.

The bicycle travels automatically through nine houses over 30 seconds.
Seven houses subscribe; two display NO PAPER. Subscribers mark either a
near mailbox or far porch. Up selects the porch; Down selects the mailbox;
Space throws. Touch uses AIM (toggle) and THROW. There is no steering,
braking, acceleration or jumping. The first two deliveries are mailboxes
with wider timing windows. A landing ring shows where a released paper
will go; line the marked target up with that ring before throwing.

Papers fly to fixed world-space endpoints. Only arriving at the correct
subscriber target delivers one. The 0.85-second cooldown and nine-paper
bag (seven subscriptions plus two spares) make well-timed throws useful.
One delivery per subscriber. Misses fall onto the sidewalk. Throwing near
the marked non-subscribing dog feeds its appetite for journalism; a far
throw into a non-subscriber's window summons an angry neighbor. A garden
gnome watches the spoon pass. These jokes are predictable route features.

Between houses No. 20 and No. 22 (always the fifth and sixth houses) a
pedestrian stands on the sidewalk. About two seconds before the spoon draws
level, a small question mark appears, they turn to face the bicycle,
raise their eyebrows, point, and say: "Is that a spoon riding a bicycle? I
didn't think they had legs." The bubble stays for three route seconds
while the spoon rides past without comment; the pedestrian's head follows
it. Once per route, no input required, no sound needed. The pedestrian is
not a target, obstacle or collision: a paper thrown at them simply lands
on the sidewalk as an ordinary miss. Timing is derived from route progress,
so pausing freezes the bubble and backgrounding cannot skip it.

Each delivery earns 25 points, settled at the result. Delivering at least
60% (five of seven) earns 5 Tea Cash. Delivering all seven with no wasted
throws or mishaps adds 50 points: DELIVERY OF THE CENTURY! Otherwise a
successful route announces THE NEWS HAS SPREAD.; a poor one announces
YOUR CONTRACT HAS BEEN REVIEWED. There are no cash penalties, lost cups,
restocks, upgrade changes or progression costs. The route always finishes.
All values are provisional and configurable in `CONFIG.dailyPour`.

The existing Sound toggle covers the bicycle bell, throw, delivery, window,
dog and completion effects plus a playful variation of the synthesized
soundtrack. Pausing or backgrounding freezes the entire route and every
flight. Results must remain visible briefly before returning to the
waiting next activity. Rewards settle once.

In the Tea Run, a suspended coffee cup has a 78-unit body beginning 40
units above the paving. Its rope is decorative. Sliding remains reliable;
a well-timed successful aerial jump can now clear it from above, with more
successful impulses improving clearance. The first jump's physics and the
70% aerial success chance are unchanged, as are bird, power-line and orbit
encounters.

Released in 0.12.0 after project-owner playtesting. The route is
deliberately basic; values remain tunable in `CONFIG.dailyPour`. Additional
delivery mechanics, more pedestrians and dialogue, further minigames,
Arcade Collection, Chapter 3, online scoring and permanent progression
remain deferred.

## Biscuit Breakout and Karma (0.13.0)

*"The biscuits have formed a wall. Negotiations have failed."*

### Scheduling

Biscuit Breakout is the second Arcade Interlude. It is first eligible after
round 19 in Chapter 2 and then 14 normal rounds after each offer
(`CONFIG.arcade.biscuitBreakout`). The Daily Pour keeps its own dates (12,
26, 40…), so the two normally alternate seven rounds apart. Fortune
readings and upgrade choices finish first; Tea Shortages, milestone bosses,
rematches and Hot Chocolate Havoc take priority, and postpone without a
backlog. If both adventures are due at one reading, the one that has waited
longest (the earlier due round; ties in registry order) is offered and the
other waits for a later reading. At most one adventure is offered per
reading.

The offer reuses the Daily Pour's card: THE BISCUITS ARE REVOLTING! —
"Their demands are unclear. Their formation is not." BREAK THE BISCUITS
starts it; LEAVE THEM ALONE carries on for free. Both consume the
opportunity. Skipping changes nothing: cups, score, Tea Cash, upgrades,
chapter, tea and the waiting fortune.

### The minigame

A tea tray holds a 4 × 6 wall of biscuits: digestives, bourbons and
shortbread in slightly different shades (cosmetic only; every biscuit is the
same size and takes one hit). The silver spoon is a paddle along the bottom;
a sugar cube rests on it. ← / → (or A / D, or holding ◀ / ▶ on touch) move
the spoon. Space (or LAUNCH) launches the cube, leaning the way the spoon is
moving (or alternately right and left from a standstill). Before play,
Space, LAUNCH or Enter starts the mission; on the result, Space does
nothing and Enter returns to the tea.

The cube bounces off the side and top rails, the spoon and biscuits. A
biscuit it touches crumbles. Where the cube lands on the spoon sets its
angle: dead centre goes straight up, the edges send it up to 60° from
vertical. Every rebound keeps it at most 60° from vertical, so a rally can
never go flat. It starts at 400 units per second and gains 7 per biscuit,
up to 560. If it falls past the spoon, it is lost and a fresh one waits on
the spoon; three cubes in all.

The mission ends when every biscuit is broken (at once), the third cube is
lost, or 45 seconds pass. The clock runs while a cube waits to launch.

### Rewards

| Event | Reward |
| --- | --- |
| Each biscuit broken | 10 points, kept however it ends |
| At least 70% broken (17 of 24) | +5 Tea Cash |
| Every biscuit broken | +50 points: NOTHING LEFT BUT CRUMBS! (a shower of golden crumbs) |
| Some broken, at least 70% | A CRUMBLING SUCCESS. Some biscuits survived. Their victory will be brief. |
| Fewer | THE BISCUITS HAVE WON THIS ROUND. An inquiry has been launched. |
| Losing a cube, skipping | Nothing. No cup is ever at stake. |

Rewards settle once, when the result appears.

### The talking biscuit

One biscuit per wall, chosen from the wall's own generator, has a face. Its
eyes follow the cube. It has no extra health, points or effect on the cube.
When broken it crumbles like any other, and for 2.6 seconds a speech bubble
over the tray reads: "THAT'S A CRUMBY WAY TO TREAT SOMEONE!" The bubble
sits above the tray, so it never covers the cube or the spoon. The other
biscuits do not react.

### Karma

**KARMA** — *What Goes Around…* — *"The leaves have been warned. They chose
not to listen."*

A rare fortune in the weighted draw (weight 0.5, about 3–4% of readings
whatever the round; never a pattern reading or the fallback). For the next
normal cup, escaping leaves cannot cost a cup:

- **First rim contact:** the rim flashes rose where the leaf struck, a few
  sparkling drops fly back, and the leaf is washed 150 units back into the
  cup. It stays in play with a rose return-arrow ring, and can still be
  steamed, sugared or caught in milk for full, ordinary credit. The first
  bounce in a pot explains itself: INSTANT KARMA! The rim sends each leaf
  back once. If it returns: poof. Later bounces say INSTANT KARMA! only now
  and then.
- **Second rim contact** (once the first recoil has settled): the leaf
  vanishes in a pale puff of steam, unlike a kill's green crumbs.

Karma replaces the strainer and the grace period at the rim, so the
strainer is never used, and no cup is lost even with an empty strainer,
one cup left, several leaves arriving at once, or an idle player. A leaf
bounces only once, and cannot be bounced or removed again while recoiling.

A vanished leaf counts towards the cup's target ("Leaves cleared"), so a cup
can always finish, even one played without firing a shot. It is not a kill:
no points, no residue for the reading, no steam, sugar or milk kill, no
shot-accuracy credit, and no progress towards secrets. It is not a spill,
strainer catch or near miss either, so it does not nudge Tempestuous Tea.
Bounces and vanishings are counted separately (`karmaBounces`,
`karmaPuffs`). Karma lasts exactly one normal cup and never affects The
Daily Grind, Hot Chocolate Havoc or the arcade adventures. The HUD omen
reads `Karma · rim rebounds`; the reading card says THE LEAVES FORETELL ·
WHAT GOES AROUND…, and a rose line circles the rim during the cup. Sounds:
a short out-and-back chime at the reveal, a soft boing on a bounce and a
little puff on a vanishing; sound off and reduced motion are respected.

### Not included

No new boss, Chapter 3, other arcade adventures, Arcade Collection,
permanent upgrades, larger economy, online scores, mobile redesign or
physics library. More biscuit characters and secrets may come later.

## Days and Heat (0.14.0)

**Days control difficulty. Chapters control content.** A Day is exactly ten
completed normal teacup rounds. Derive Day as `floor((round - 1) / 10) + 1`
and cup within the Day as `(round - 1) % 10 + 1`. Global `state.round` keeps
increasing: Day 2 begins at round 11, Day 3 at round 21. Readings, upgrades,
pauses, shortages, offers, Tea Run, Daily Pour, Biscuit Breakout, Crossing the
Street, Hot Chocolate Havoc and The Daily Grind never count as normal rounds.

After the tenth completion, finish the reading and upgrade, then resolve all
scheduled encounters in the existing priority order. Immediately before the
next normal cup, the kettle offers two deliberate choices (1 / 2, mouse or
touch), with no timer and no default:

- **Fresh Brew:** set the coming cup's Heat to 0. Targets restart at 16, 18,
  20, 22... and additional speed/spawn pressure disappears.
- **Keep the Kettle On:** increment and carry Heat forward. Players can change
  their choice at every boundary, including after reaching the maximum.

Both preserve chapters and their `starts`, unlocked teas, tea-served history,
tea ages and behavior stages, upgrades, Tea Cash, score, cups, discoveries,
pending fortune, extra sugar, Golden Spoon time and all encounter schedules.
A fresh Day in Chapter 2 still has Chapter 2's content and baseline pace.
Fortunes apply to exactly one normal cup: Karma read after cup 10 protects
cup 11 under either choice. Side adventures receive no Heat modifiers.

### Tuning and safety limits

All Day tuning lives in `CONFIG.days`, with target tuning in `CONFIG.rounds`.
Heat `h` starts at 0; the next normal cup increments it by 1 unless Fresh Brew
resets it. It saturates at 28, derived from the last component to reach its cap.
Let `e = max(0, h - 9)`:

| Component | Implemented formula | Limit |
| --- | --- | --- |
| Leaves required | `min(32, 16 + 2*h)` | 32, reached at Heat 8 |
| Heat speed factor | `1 + min(0.20, 0.0125*e)` | 1.20, reached at Heat 25 |
| Heat interval factor | `1 - min(0.15, 0.008*e)` | 0.85, reached at Heat 28 |
| Overall ordinary speed factor | `min(2, chapterSpeed * cappedTeaFortuneSpeed * heatSpeed)` | 2 times the 41–57 base |
| Arrival gap | `max(0.45, chapterInterval * teaFortuneInterval * heatInterval * jitter)` | at least 0.45 seconds |

The existing tea/fortune speed cap of 1.35 applies **before** Heat, and the
chapter multiplier applies once. Milk still slows movement and fixed Green
Tea dash distances remain fixed; Heat does not scale dashes or warning clocks.
The existing 18-active-leaf limit and 0.95-second first-arrival delay remain.
Jitter remains 0.72–1.36 from the normal seeded stream. No new random draws
are introduced for Days, captions or Heat. No rewards depend on difficulty.

Cups 1–10 have Heat 0–9 and therefore exactly the existing target curve and
neutral extra speed/spawn factors. Keeping the kettle on for Day 2 begins
at Heat 10 (32 leaves, speed factor 1.0125, interval factor 0.992). Another
Keep begins Day 3 at Heat 20 (1.1375, 0.912). Heat reaches all caps during
Day 3 and remains capped on later days until Fresh Brew.

The combined safety ceiling is for ordinary outward rise; fixed dash distance,
backwash and milk retain their separate rules. The fastest current Chapter 2
Green Tea/Tempest combination at maximum Heat is 1.79124 times base ordinary
speed, below the hard factor 2. The shortest current Black Tea interval with
minimum jitter is 0.53856 seconds, above the hard 0.45-second floor.

The HUD shows `DAY 2 · CUP 3/10 · HEAT 2` alongside the global cup/round.
The chosen Day gets a brief Canvas acknowledgement and optional kettle sound.
Reduced motion removes the banner's pop; Sound off covers all new audio.
See [Day testing](DAYS_TESTING.md) for replayable practice and measured values.

## Crossing the Street (0.15.0)

*"Why did the spoon cross the road? Nobody knows. But apparently, it's our
problem now."*

### Scheduling

Crossing the Street is the third Arcade Interlude, first eligible after
round 27 in Chapter 2 and then 14 normal rounds after each offer
(`CONFIG.arcade.crossingStreet`). With the Daily Pour at 12, 26, 40… and
Biscuit Breakout at 19, 33, 47…, a pot that skips every offer sees them at
12, 19, 26, **27**, 33, 40, **41**, 47, 54, **55**… One adventure at most is
offered per reading; if several are due the one waiting longest goes first
(ties in registry order), and an overdue adventure stays eligible without
building a backlog. Fortune readings and upgrades finish first; Tea
Shortages, milestone bosses, rematches and Hot Chocolate Havoc keep their
priority. After a Day-ending reading the offer (and the adventure) come
before the Day choice, which then waits, is shown once, and is applied once.

The shared offer card reads WHY DID THE SPOON CROSS THE ROAD? —
"Nobody knows. But apparently, it's our problem now." CROSS THE ROAD starts
it; STAY RIGHT HERE carries on for free. Behind the card the canvas shows
the street already: traffic going by, the tea shop opposite, and the spoon
waiting on the curb without a care in the world.

Crossing the Street is not the Tea Run. It never restocks tea, adds sugar,
or answers a pending Tea Shortage.

### The street

Seen from above, from the bottom: the near sidewalk where the spoon
starts, three lanes, a planted median, two more lanes, the far sidewalk,
and the tea shop. The street is a grid of 13 columns by 8 rows (72 units);
the paving joints mark the columns. The sidewalks and median are never
driven on, so they are always safe. Neighbouring lanes run in opposite
directions, with faint chevrons painted on the road showing which way.

Each lane has a character: two of small cars (fast, 190–235 units/s), two
of delivery vans with the odd car (130–160), and one milk-truck lane with
vans (100–125). Lengths are 92, 148 and 196 units; every vehicle's hitbox is
exactly its drawn body. Each lane's speed, spacing, paint and order come
from the mission's own seeded generator, and between nose and tail there is
always at least 180 units and 1.15 seconds of that lane's speed. Vehicles
loop off one edge and back on at the other, out of sight. The road never
changes during a mission, including after a bump, so its pattern can be
learnt.

Every road is checked when it is made: a cautious crossing (one move or
wait every 0.15 s, never in a square any vehicle comes near during that
time) must reach the shop within 12 seconds starting from the curb at every
other second of the first 44 (every moment the mission can start or
respawn). A road that fails is redrawn from the same generator (a fixed
gentle road is the last resort); for seeds 0–999 every first draw passed.
With perfect play such a crossing takes 1.4–2.6 seconds (10th–99th
percentile over 300 seeds and 89 starting moments each); a straight dash
works from only 2% of those moments.

### Movement and collisions

Arrow keys or WASD (or the four-way pad on touch) hop one square. A hop
takes 0.11 seconds, with a small jump; holding a direction repeats it every
0.15 seconds. Each fresh press is one hop; a press during a hop waits for
the landing (only the latest is kept). The first hop of the crossing, of
each respawn, and after a pause always needs a fresh press: nothing held
across a transition moves the spoon. The spoon cannot leave the grid.
Space does nothing; Enter only starts or leaves; P pauses.

The spoon's hitbox (24 × 40) moves through the hop exactly with the
drawing. Each tick (120 Hz) it is tested against the space each vehicle
swept during that tick, so no speed can carry a vehicle through it, and
boxes that only touch do not collide. A bump: CLANK!, the spoon is knocked
aside spinning and dazed for 0.9 seconds (it cannot be bumped again), then
stands back on the near curb, frozen for 0.3 seconds. Presses during that
time are dropped. Traffic and the 40-second clock carry on throughout.

### Ending, scoring and rewards

The crossing ends when the spoon lands on the far sidewalk, after the third
bump, or when 40 seconds pass. Bumps cost attempts, never cups.

| Event | Reward |
| --- | --- |
| First landing in each traffic lane | 10 points, once per lane per mission; kept after bumps |
| Reaching the tea shop | +50 points and +5 Tea Cash |
| …without a single bump | +40 points |
| A bump | One of three attempts |
| Skipping | Nothing |

A perfect crossing earns 140 points; success with bumps 100. Results:
NOT A SCRATCH ON THE SILVER! (*The traffic has filed a complaint.*), THE
SPOON MADE IT! (*Against the advice of several motorists.*), or THE TRAFFIC
HAS SPOKEN. (*The spoon intends to appeal.*). Rewards settle once, when the
result appears; the result cannot be dismissed for its first 1.5 seconds.

### Jokes (spoilers)

A sign on the near sidewalk: NO JAYWALKING. NO EXCEPTIONS FOR CUTLERY. It
is scenery. A pedestrian signal beside it shows a red hand, always, and a
countdown of the mission clock. The milk truck is a cow-spotted tanker of
uncertain origin: SUSPICIOUSLY FRESH, with horns on the cab.

After a successful crossing the shop door opens on the shopkeeper, a teapot
with a moustache: "We don't serve spoons." The spoon: "Good. I'm here for
the tea." The bubbles sit above the far sidewalk, never over the road, and
last 3.4 seconds; the result card appears after 0.8 seconds, below them.
No dialogue choices, effects or NPC mechanics.

### Presentation and sound

The spoon is the Tea Run's silver spoon at a smaller scale (a little larger
on phones), leaning into sideways hops. Light metallic hop, a ding per new
lane, a soft whoosh as traffic passes close by (lower for the bigger
vehicles), a comedic clank, a success chime and a short failure cue; no
horns. The soundtrack plays its bouncy section at 128 bpm, pressing on in
the last ten seconds. Reduced motion lowers the hop, stops the dazed spin,
stars, rising popups and ring. Sound off silences everything.

### Not included

More roads or levels, traffic lights that can be changed, power-ups,
pedestrians with behaviour, new teas, fortunes, bosses, upgrades,
persistent achievements, leaderboards, and changes to Days, Heat or
teacup combat. All tuning is provisional and lives in `CONFIG.crossingStreet`.

## 0.16.0 — The Arcade Collection

**THE SPOON'S OTHER JOBS**

*Apparently, defending a teacup doesn't pay enough.*

Four arcade adventures. One extremely overworked utensil. The collection
lets players run, deliver papers, break biscuits or cross the street without
waiting for any normal-round milestone. All four existing adventures retain
their original timing, difficulty, controls, jokes and results.

The start and game-over screens link to the collection; Tea Break opens it
from a pot. The active pot waits exactly where it was, with no elapsed
simulation time. Practice owns separate state and random streams. It may
calculate ordinary rewards internally, but no score, Tea Cash, restock,
upgrades, cups, fortunes, chapters, Day/Heat or schedules transfer home.

Each job card has a miniature original Canvas scene, the familiar pitch and
a local personal best. Records count completed attempts, successful results,
and existing perfect results (Daily Pour, Biscuit Breakout, Crossing the
Street). Tea Run has no perfect counter. Best means the largest final
points from that adventure's normal settlement, including existing bonuses.
A tie does not announce a new record. Unfinished runs do not count.

After the usual result, Play Again draws a new seed, Retry This One rebuilds
the same initial conditions, Choose Another Job returns to the cards, and
Back to the Teacup restores the pot. Controls are released at each boundary.
There is no replay recording or practice difficulty selector.

The spoon also gets one browser-local automatic checkpoint. Each completed
normal round saves the fully settled reading, including next fortune,
upgrade offer, pending encounters and Day choice. Continue Your Pot restores
that genuine reading and the exact future RNG cursors. Closing during the
next cup or any adventure returns to the last completed normal round. This
is deliberately not a save-anywhere feature. Practice never overwrites it.

New Pot and Clear Saved Pot ask before replacing/removing a valid save.
Game over removes continuation. Neither touches arcade records. Tea Break
shows the saved round/Day, checkpoint limitations and the browser-local
privacy note. Denied or corrupt storage leaves gameplay available with a
small explanation. Future save formats may require an explicit migration.

Publication was approved by the project owner after initial human playtesting
with no errors observed. Gameplay and save behavior remain as approved; see
[ARCADE_COLLECTION_TESTING.md](ARCADE_COLLECTION_TESTING.md).
