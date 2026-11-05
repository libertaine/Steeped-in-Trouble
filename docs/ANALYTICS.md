# Analytics

Since 0.21.0 the published game reports a few anonymous counts to
[Umami Cloud](https://umami.is/). They answer four questions: how many people
visit, how many of them start a game, how far they get, and whether they play
for a meaningful time. Nothing else is collected, and the simulation knows
nothing about it.

Code: [src/analytics/](../src/analytics/). Tests:
[tests/unit/analytics.test.js](../tests/unit/analytics.test.js) and
[tests/browser/analytics.js](../tests/browser/analytics.js).

## When the tracker loads

`index.html` contains no tracker. `startAnalytics()` adds one script element,
first thing in `boot()`, only when all of these hold:

| Condition | Check |
|---|---|
| Production build | `import.meta.env.PROD` |
| Published host | hostname is exactly `libertaine.github.io` |
| Published page | path is exactly `/Steeped-in-Trouble/` or `/Steeped-in-Trouble/index.html` |
| No opt-out | `?analytics=off` is absent (the value ignores case) |
| No test scenario | none of `SCENARIO_PARAMS` is in the URL (`debug`, `noOverlay`, `seed`, `tea` and so on) |
| Not automated | `navigator.webdriver` is not set |
| No Do Not Track | `doNotTrack` and its variants do not say so |

Otherwise `startAnalytics()` returns `null`, and `main.js` calls nothing further.
A preference such as `?view=compact` or `?graphics=low` does not stop tracking; a
unit test fails if the game starts reading a URL parameter that is not sorted
into one list or the other.

`?analytics=off` applies to that page load. It is not remembered, because the
game keeps no analytics data in the browser.

The script is `https://cloud.umami.is/script.js`, with these attributes:

```text
data-website-id="6f121a0f-990e-4457-8269-6f4833c81820"   public configuration, not a credential
data-domains="libertaine.github.io"
data-exclude-search="true"
data-exclude-hash="true"
data-do-not-track="true"
```

Error capture (`data-errors`), performance telemetry (`data-performance`) and
`data-distinct-id` are left off, which is Umami's default. No element in the page has
`data-umami-event`, so there are no automatic button events. Umami has no session
replay in this script. The tracker sends its requests to `gateway.umami.is`.

If the script is blocked or fails, there is no retry, the events waiting for it
are dropped, and the game carries on. Exceptions and rejected promises from the
tracker are swallowed.

## Event contract

| Event | Properties | At most |
|---|---|---|
| (pageview) | Umami's own | Once per page load |
| `game_start` | none | Once per page load |
| `round_milestone` | `round`: 1, 5, 10, 20, 30 or 50 | Once per milestone per page load |
| `engaged_30s`, `engaged_1m`, `engaged_3m`, `engaged_5m`, `engaged_10m`, `engaged_20m`, `engaged_30m`, `engaged_60m` | none | Once each per page load |

A "page load" is what the deduplication state lives in: reloading the page starts
a new one.

### Pageview

Umami's automatic pageview, sent when the script runs, so a visitor who never
starts a game is still counted. The game does not call `umami.track()` at startup
and has no second visitor counter. The game does not change its URL, so no further
pageviews follow.

### `game_start`

Sent the first time, in a page load, that a normal game actually begins or resumes:

- **New pot:** the main pot raises `matchStart`.
- **Continued pot:** the player chooses Continue Your Pot and the restored pot takes
  over. A restore raises no game events, so `collectionUI`'s `onActivate` reports it.

Not sent for the title screen, the instructions, the Tea Break, a practice
adventure, debug scenarios, or pausing and resuming. A second pot in the same
page load does not send it again, so `game_start / pageviews` stays a true
visit-to-start ratio. New and continued pots are deliberately not distinguished
in the event.

### `round_milestone`

Sent from the `roundStart` game event, never by polling. Restoring a saved pot
raises no `roundStart`, so no history is replayed: continuing a pot saved after
round 4 sends nothing until round 5 starts, and then `{ round: 5 }`.

**This is not a strict new-player funnel.** A returning player can continue a pot
beyond earlier milestones, so `round: 20` can outnumber `round: 10` and is not
guaranteed to have passed through it. A restart in the same page load does not
send round 1 again.

### `engaged_*`

Cumulative time in the current page load, measured with `performance.now()` rather
than the game's capped simulation step. These thresholds estimate how long a
session held someone. They are not an exact departure time.

| Phase | Counts |
|---|---|
| `playing`, `chocolate`, `grind`, `manager`, `teaRun`, `dailyPour`, `biscuitBreakout`, `crossingStreet` | Yes, until 60 s pass with no input (`ACTIVE_IDLE_MS`) |
| `reading`, `day`, `shortage`, `arcadeOffer` | Yes, until 30 s pass with no input (`PASSIVE_IDLE_MS`) |
| `ready`, `paused`, `gameover` | No |
| Any phase behind the title, instructions, Tea Break, collection or a confirmation | No |
| Any phase in a practice session | No |
| Any phase while the page is hidden or the window is unfocused | No |

The idle clock restarts on a key press, a pointer press or a change of phase, and
counting resumes on the next input. Only the moment of an input is kept, never
which key or where. The active limit exists because adventure result and launch
screens wait indefinitely. It can briefly undercount someone holding one touch
button for over a minute.

Time never catches up. A gap of over one second between frames
(`MAX_FRAME_GAP_MS`) means suspension or sleep and is discarded, as is any frame
where the previous one was not counting.

## What is not sent

Names, email addresses, account or device identifiers, scores, inputs, save data,
seeds, fortunes, upgrades, location coordinates, user-entered text, full query
strings or URL fragments, and error stacks or console logs.

`umami.identify()` is never called. The game creates no identifiers, cookies or
storage entries for analytics. The tracker reads a `umami.disabled` localStorage
key if one exists, and sends no cookies.

Umami receives what any such request carries: the page URL without its query and
fragment, page title, referrer, screen size, language, and the browser and network
details it derives its anonymous counts and device type from.

## Returning visitors and devices

Both come from Umami's dashboard; the game adds nothing.

- **Device type:** Umami's own desktop, tablet and mobile classification.
- **Retention:** this describes returning *website visitors*, not identifiable
  returning *players*. Umami's anonymous visitor identifiers rotate, and a
  person looks new after changing browser or device, after a network change, or
  when the rotation period passes. Blocked trackers are not counted at all.
  Treat retention as a trend, not a headcount.

## Owner checks in the Umami dashboard

These need the owner's login. The website is `6f121a0f-990e-4457-8269-6f4833c81820`.

1. **Overview:** visitors and pageviews appear for `libertaine.github.io`.
2. **Events:** `game_start`, `round_milestone` and the `engaged_*` events appear.
3. **Event data:** `round_milestone` has a numeric `round`, and nothing else has properties.
4. **Devices:** desktop, tablet and mobile appear.
5. **Retention:** fills in only after enough days have passed.

## Removing it

Delete `src/analytics/`, its import and its calls in `src/main.js` (all
`analytics?.` or `startAnalytics`), the `allowTrackerStub` and
`noAnalyticsRequests` fixtures, the tests, the disclosures, and this file. No
gameplay code or save format refers to it.

## Testing

Automated tests never reach the service: hostname, `navigator.webdriver` and
scenario checks all stop the tracker, and a fixture on every browser test fails
it if any request reaches an Umami host. The published-page tests serve the
address from the local build and answer the tracker's address with a stub.

To verify the real thing, use an ordinary browser's network panel on the published
page, and expect `script.js` from `cloud.umami.is` and `POST`s to
`gateway.umami.is/api/send`. Such a visit is real traffic and is counted.
