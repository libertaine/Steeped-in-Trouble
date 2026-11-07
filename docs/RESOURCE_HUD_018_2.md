# 018-2 — Visual resource HUD and mode indicators

Historical assessment: Full/Compact comparisons below describe the recorded
baseline. The current game uses the former Compact layout exclusively; see
[consolidation qualification](SINGLE_LAYOUT_TESTING.md).

Review candidate, November 2, 2026. Application version stays **0.17.1**.
Base: remote `main` verified at `f149f93229e5d59c3b5bc360da072806e39ddcee`
(merged #34 / 018-1). Branch: `feature/018-2-visual-resource-hud`.

The approved revised local study supplies the visual direction: forest-green
surroundings, small navy/silver panels, porcelain, a milk jug, individual sugar
cubes, and a mesh strainer with disappearing catch pips. The ignored prototype,
its renderer snapshot and its development state generator are not shipped.

## Implementation and authority

`src/ui/resources.js` projects the current simulation into a shared strip above
the canvas. `hud.js` retains the existing text, phase and offer authorities;
`main.js` forwards successful engine events to brief local feedback. No gameplay,
resource limit, replenishment, upgrade, scoring, random, input, rendering,
save-schema or timing code changes.

| Indicator | Authority and behavior |
| --- | --- |
| Porcelain | `state.lives`, `cupCondition()`; existing condition name, exact spill margin, next-spill warning, repairs and reinforced fourth spill. No hearts replace porcelain. |
| Leaves | `state.kills / state.target`, including existing Karma semantics; thin native progress element and numeric fraction, without kill animation. |
| Milk | `state.milkLeft / CONFIG.milk.perRound`; jug fill clamps only its drawing. Successful `milk` triggers local feedback. Refill reads state immediately. |
| Sugar | `state.sugarLeft / sugarCapacity(state)`; 0 is hollow, 1–4 are discrete cubes, above 4 uses one cube and `×N`. Counts such as `3/2` remain exact and marked bonus. Regeneration shows its actual countdown; Sugar Scoop and fortune capacity use the existing helper. |
| Leaf catches | `state.strainerLeft / strainerCapacity(state.spoon)`; one mesh pip per catch, zero pips plus exhausted at zero. Successful `strain` triggers local feedback. The actual cup's mesh is unchanged. |
| Secondary line | Existing current-tea, current-fortune/tag/countdown, Auto Steam and recovery/Golden Spoon/Golden Leaf status; quiet normal-pot score, omitted during special modes. Pending fortunes are never read as active effects. |

Numbers and labels are ordinary accessible text; SVGs and mesh pips are
decorative. Native progress has a mode-specific accessible name. Existing
porcelain status and a polite successful-use/catch status announce meaningful
changes, without frame-by-frame announcements. Feedback lasts 220ms and is
suppressed with reduced motion. Numeric resource text remains 15px on narrow
screens. Long labels wrap. Existing keyboard, focus and touch behavior remains.

## Mode substitution

Mode detection uses the existing pause-aware `*InProgress()` helpers and phase
authority. No presentation flag is added to gameplay state. The DOM projection
is recomputed from that authority when returning, pausing or resuming.

| Mode | Primary HUD | Action guidance |
| --- | --- | --- |
| Normal cup | Porcelain/spill margin, leaves fraction, milk, sugar, leaf catches | Current tea/effect and existing temporary status |
| Daily Grind | Machine health/max; actual fight milk and sugar; scalds taken/limit | Fight time, valve stage, pressure-lane warning |
| Hot Chocolate Havoc | Perfect/toasted marshmallows and time | Space or cup-hold flames, space flames apart |
| Tea Run | Stumbles remaining, coins/tea pickups, distance percentage, route bar | Jump obstacles and slide under cups |
| Daily Pour | Deliveries, papers, time and current mailbox/porch aim | Subscriber targets and throwing |
| Biscuit Breakout | Ball cubes, biscuits broken/total, time, biscuit progress | Catch with spoon, launch with Space |
| Crossing the Street | Attempts, credited lanes, time, crossing progress | Arrow hops and safe median |
| Shortage | Tea Cash, shortage status, tin price/free alternatives | Existing purchase/run/skip choices and consequences remain |
| Arcade offers / Day choice | Tea Cash and decision status | Existing offer cards, prices/consequences and Day/Heat explanations remain |

Side adventures/Havoc omit normal milk, sugar and catches. Boss scalds are text
fight damage, never catch pips. Breakout cubes are labeled adventure counters,
never sugar-burst illustrations. The mode heading explicitly marks the normal
pot suspended. Tea Break adds a resource-context note for adventures and boss;
its existing fortune panel continues to label the pending next-cup fortune.

## Reference information and 018-3 boundary

Full and Compact now both use the live strip. Full View's sidebar is hidden in
the document with CSS; the same three original panels still move into the
existing Tea Break dialog. Day/Heat status and the former score/mode summary
move into its first panel. Upgrade inventory, Tea Cash, full tea/fortune text,
chapter information, controls and settings remain there. Existing native-dialog
pause/resume, input reset, background handling and canvas focus restoration
are unchanged; `presentation.js` is untouched. Existing decision cards remain
in their original lifecycle and view-specific locations.

018-3 still owns the four-section Tea Break organization and reading/ceremony
changes. This change preserves existing canvas reading explanations, reveal
timing and upgrade selection. It neither accepts nor implements 018-3/018-4.

## Measured arena comparison

Both sides are independently built production assets: 018-1 baseline above,
then this candidate. Same Chromium procedure: seed 42, empty first cup, paused
without opening a menu, document at top, CSS pixels, Classic Touch. Raw widths,
heights, control sizes and visibility are in the
[evidence gallery](images/resource-hud/README.md). Logical size is still 920×790.

| Viewport | View | 018-1 width | 018-2 width | Width change | Arena visible |
| --- | --- | ---: | ---: | ---: | ---: |
| 375×667 | Full | 287.80 | 312.84 | +8.7% | 100% |
| 375×667 | Compact | 357.00 | 357.00 | 0.0% | 100% |
| 800×600 | Full | 545.41 | 522.83 | −4.1% | 100% |
| 800×600 | Compact | 568.08 | 560.97 | −1.3% | 100% |
| 1280×720 | Full | 579.75 | 579.61 | <0.1% | 100% |
| 1280×720 | Compact | 524.72 | 529.52 | +0.9% | 100% |
| 1366×768 | Full | 634.88 | 634.75 | <0.1% | 100% |
| 1366×768 | Compact | 580.61 | 585.42 | +0.8% | 100% |
| 1920×1080 | Full | 998.22 | 998.09 | <0.1% | 100% |
| 1920×1080 | Compact | 943.95 | 948.77 | +0.5% | 100% |
| 844×390 | Full | 300.84 | 278.27 | −7.5% | 100% |
| 844×390 | Compact | 323.52 | 316.41 | −2.2% | 100% |
| 800×1280 | Full | 746.00 | 746.00 | 0.0% | 100% |
| 800×1280 | Compact | 782.00 | 782.00 | 0.0% | 100% |
| 1280×800 | Full | 672.91 | 672.78 | <0.1% | 100% |
| 1280×800 | Compact | 617.88 | 622.69 | +0.8% | 100% |

The priority desktop Full arena remains approximately **998×857**. Smaller
header/main spacing funds the strip's height. In short landscape, preserving
labeled illustrations and their 15px counts requires about 19.4px more vertical
space than 018-1 Full View (6.1px in Compact); those measured width reductions
are the retained constraint, rather than hiding resources or shrinking touch
targets. All measured arenas/controls fit, controls are at least 44×44, and
horizontal overflow is zero. Height bounds remain the existing 018-1 mechanism.

## Original PR qualification

- `npm run check`: lint, **860 unit tests / 43 files**, and production build pass.
- 11 new unit tests exercise live resource projections with real consumption,
  catches, spills, repairs, reinforcement, replenishment, jackpot, Sugar Scoop,
  regeneration, current/pending timers, mode substitution and pause.
- Six shared browser scenarios run in Chromium, Firefox and mobile Chromium:
  resource use/repair in both views, bonus/large quantities/regeneration,
  boss/Havoc pause/return, all four adventures, reduced motion/focus/long labels.
- Existing viewport matrix additionally checks the visible resource strip
  above the canvas: all eight sizes, both views, live resize/rotation, boss,
  four adventures, Easy/Classic controls, DPR, 44px controls and the >990px
  1920×1080 Full arena guard. Existing input, pause, save and reading tests stay.
- Full browser regression suite: **364 passed**, eight workers, no retries,
  across Chromium, Firefox and mobile Chromium (7.3 minutes). Includes all
  57 existing viewport cases and 18 new HUD cases; these overlap the total.

The initial sandbox browser run encountered Firefox page-creation failures
and was not a passing qualification. A separate Firefox launch outside the
sandbox worked; the final complete run uses normal browser access. Exploratory
logs also retain the intermediate run with three failures from two old sidebar
expectations (361 passed); those checks now exercise the same settings and
reference information through Tea Break, with keyboard/focus assertions.
Logs and original screenshots remain under ignored `tmp/018-2/`. Existing
tracked regression screenshots are archived and restored with hash comparison;
only this milestone's evidence is added.

The 200% zoom check uses the equivalent 960×540 CSS layout for a 1920×1080
display, with separate DPR backing-size coverage. Native browser-chrome zoom,
physical mobile devices and a human screen-reader session are not independently
qualified. The screenshots are presentation fixtures, not evidence of naturally
played encounters, human comprehension or changed game balance.

## PR #35 review amendment

Two bounded corrections follow review of `f10b07e`:

- Successful Milk, Sugar and Strainer messages bypass the cached text writer.
  A presentation-only FIFO clears the polite live region, inserts each message
  in a later task, and spaces notifications so identical same-frame events
  receive distinct live-region updates. Reduced motion still suppresses visual
  animation, while retaining every notification. No gameplay clock or resource
  state is changed.
- Special modes omit the secondary normal-pot score. Their existing primary
  mode indicators remain authoritative. Pause retains the omission; returning
  to the normal pot restores its current score.

Regression coverage observes actual live-region mutations from two successive
successful Milk uses, Sugar uses and engine catches, including both events in
one frame. It requires all six messages with normal and reduced motion, and
no extra messages for failed empty-resource input. Existing mode tests now
check score omission during adventures, boss/Havoc and pause, plus restoration
on return. Unit projections check the same score policy.

Focused qualification: **11 unit tests and 24 browser tests passed** across
Chromium, Firefox and mobile Chromium. Lint, **860 unit tests / 43 files**, and
the production build passed. Full browser regression: **370 passed**, eight
workers, no retries, across Chromium, Firefox and mobile Chromium (7.4 minutes).
The focused tests overlap the full qualification totals.

All **16** measured Full/Compact cases exactly match the retained viewport data
for canvas dimensions/position, visibility, overflow and control bounds. The
1920×1080 Full arena remains **998.09px** wide. The accepted measurements and
original screenshot gallery are retained unchanged; those screenshots document
the original PR before this score-visibility correction. No CSS, layout, game
state, input, reading or Tea Break redesign accompanies these fixes.

Stop at PR review. No version bump, merge, tag, release or publication.
