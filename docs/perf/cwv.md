# Core Web Vitals, per route (measured)

The Definition of Done claims _"Core Web Vitals good @ p75"_. Until this page
existed, that claim rested on one route: the CI gate audited `/` and nothing
else, so six of the seven screens shipped with no measurement at all. This file
is the measurement, and `lighthouserc.json` is the budget derived from it.

**How these numbers were produced.** `lhci autorun`, real DevTools throttling
(not Lantern — [ADR-0002](../adr/0002-lighthouse-devtools-throttling.md)), five
runs per route, **median** aggregation
([ADR-0008](../adr/0008-cwv-gate-measures-five-runs-and-asserts-the-median.md)),
against `npm run start` on a production build. Every figure below is the median
of five, on a GitHub `ubuntu-latest` runner — the machine the gate runs on. They
are read out of the raw LHRs, which each CWV job uploads as a
`lighthouse-<n>` artifact.

**Four** independent CI executions are reported side by side, because a single
median is still a single reading of a median. Where they disagree, the budget is
derived from the **worst** of the four.

## Measured (median of 5 · ubuntu-latest · devtools throttling)

Executions A and B are the two attempts of workflow run `30727190996` (commit
`e2c27bd`, still on the CLAUDE.md ceilings). C is run `30727679033` (commit
`65b075d`) and D is run `30727952613` (commit `434fb8e`), both under the
derived budgets below — so C and D are the check that the budgets hold, not
just that they were computed.

| Route              | Perf score                | LCP (ms)                  | CLS                               | TBT (ms)              | A11y |
| ------------------ | ------------------------- | ------------------------- | --------------------------------- | --------------------- | ---- |
| `/`                | 0.97 / 0.95 / 0.97 / 0.97 | 1679 / 1717 / 1684 / 1678 | 0.0032 / 0.0032 / 0.0032 / 0.0032 | 147 / 208 / 146 / 143 | 1.00 |
| `/sign-in`         | 0.97 / 0.98 / 0.98 / 0.97 | 1640 / 1606 / 1625 / 1631 | 0.0032 / 0.0032 / 0.0032 / 0.0032 | 124 / 82 / 93 / 103   | 1.00 |
| `/connect`         | 0.97 / 0.97 / 0.99 / 0.96 | 1686 / 1693 / 1600 / 1719 | 0.0032 / 0.0032 / 0.0032 / 0.0032 | 150 / 138 / 51 / 166  | 1.00 |
| `/runs/sample`     | 0.95 / 0.96 / 0.97 / 0.97 | 1729 / 1706 / 1635 / 1666 | 0.0032 / 0.0032 / 0.0032 / 0.0032 | 164 / 151 / 87 / 132  | 1.00 |
| `/leaderboard`     | 0.95 / 0.96 / 0.97 / 0.96 | 1769 / 1765 / 1700 / 1715 | 0.0032 / 0.0032 / 0.0032 / 0.0032 | 193 / 164 / 131 / 145 | 1.00 |
| `/findings/sample` | 0.98 / 0.99 / 0.97 / 0.98 | 1680 / 1620 / 1655 / 1658 | 0.0032 / 0.0032 / 0.0032 / 0.0032 | 120 / 75 / 126 / 120  | 1.00 |
| `/threats`         | 0.97 / 0.97 / 0.97 / 0.97 | 1715 / 1698 / 1695 / 1694 | 0.0032 / 0.0032 / 0.0032 / 0.0032 | 133 / 142 / 126 / 119 | 1.00 |

Best-practices and SEO measured 1.00 on every route in all four executions.

The medians are stable: across the four executions no route's LCP median moved
by more than 119 ms (`/connect`, 1600 to 1719), no performance median by more
than 0.03, and CLS did not move at all.

`INP` is a field metric and cannot be produced by a lab run at all; **TBT is the
lab proxy** reported in its place, which is why the DoD line reads
"INP-or-TBT". Nothing here is a field measurement: these are lab numbers under
fixed throttling, which is what makes them comparable run to run and useless as
a claim about real users' devices.

### The dynamic routes

`/runs/[id]` and `/findings/[id]` are audited at `sample` — an id the in-memory
`DataSource` resolves to the curated ASI06 run, so both render completely with
no database and no credentials. They are the same code paths a real id takes;
what differs is only the size of the record, and the sample is a full 13-step
trace, not a stub.

`/account` is not audited. Signed out it renders the same gate as `/sign-in`,
and signed in it needs a session no CI run has, so auditing it would measure
`/sign-in` twice under a second name.

## Budgets, and where each number comes from

`lighthouserc.json` asserts these per route, via `assert.assertMatrix`. They are
**derived from the table above, not chosen**:

- **LCP** — the **slowest** of the four measured medians, `+15%`, rounded up to
  the next 50 ms. Fifteen percent is about 2x the largest spread seen between
  executions (119 ms, on `/connect`), so ordinary runner noise cannot trip it
  while a real regression can. Every route's budget lands
  450-600 ms _under_ the 2500 ms web.dev line, so the gate now fails long
  before the app stops being "good".
- **CLS** — `0.01` everywhere. Measured CLS is `0.0032` on every route in every
  run, a number set by the shell rather than by any screen. `0.01` is 3x the
  measurement and 10x tighter than the 0.1 ceiling; a genuine new layout shift
  would clear it immediately.
- **Performance score** — the **lowest** of the four measured medians minus
  `0.03`. Every route therefore sits at or above the 0.90 the gate previously
  demanded of Home; none was relaxed.
- **TBT** — left at the `warn` / 200 ms that
  [ADR-0008](../adr/0008-cwv-gate-measures-five-runs-and-asserts-the-median.md)
  set, unchanged and deliberately not promoted to an error. See the open item
  below.
- **Accessibility** — `error` at a perfect 1.00, met by every route. This is a
  WCAG 2.2 AA requirement, not a performance trade-off, so it is not on the
  table when a budget is being fitted.

| Route            | LCP budget | CLS budget | Perf budget | TBT  |
| ---------------- | ---------- | ---------- | ----------- | ---- |
| `/`              | 2000 ms    | 0.01       | 0.92        | warn |
| `/sign-in`       | 1900 ms    | 0.01       | 0.94        | warn |
| `/connect`       | 2000 ms    | 0.01       | 0.93        | warn |
| `/runs/[id]`     | 2000 ms    | 0.01       | 0.92        | warn |
| `/leaderboard`   | 2050 ms    | 0.01       | 0.92        | warn |
| `/findings/[id]` | 1950 ms    | 0.01       | 0.94        | warn |
| `/threats`       | 2000 ms    | 0.01       | 0.94        | warn |

`tests/unit/config/lighthouse-gate.test.ts` holds every one of these at or under
CLAUDE.md's ceilings (LCP 2500 ms, CLS 0.1) and holds every route to exactly one
budget entry, so a budget cannot be loosened past the DoD line, and a route
cannot be added without one.

## What the measurement showed that we did not already know

### LCP is the shell, not the screen

On all seven routes, in every run, **FCP and LCP are the same timestamp**, and
the LCP element is always the first block of body prose. The page is gated on
one render-blocking stylesheet (~730 ms of blocking time, measured identically
on every route) fetched behind two preloaded fonts. Route content is not the
LCP driver: the widest screen (`/threats`, 467 DOM nodes) and the narrowest
(`/sign-in`, 56) differ by under 100 ms.

That is why the per-route LCP budgets are so close together, and it is the
single lever that would move all seven at once. Not pulled here.

### The cold first run, and what it is not

`lhci` starts `npm run start` and begins collecting the moment the port opens,
so run #1 of each route hits a cold server. Across the 28 route-executions
above (7 routes x 4 executions), **run #1 was the slowest in 26**. In the
remaining two (`/sign-in` and `/findings/sample` in execution B) there was no
cold penalty to find at all — the five runs spanned 32 ms and 29 ms
respectively, so which one came out "worst" was noise.

When the penalty does appear it is large and unmistakable. `/runs/sample`,
execution A, LCP by run in collection order:

```
2377, 1729, 1699, 1729, 1794 ms      perf 0.82, 0.95, 0.96, 0.96, 0.95
```

[ADR-0008](../adr/0008-cwv-gate-measures-five-runs-and-asserts-the-median.md)
recorded the opposite ("the first Lighthouse run against a cold `next start`
measured performance 0.91 and TBT 217 ms, indistinguishable from the warm
runs") and declined to add a warm-up on that evidence. On this larger sample
**that observation does not hold** — though the conclusion it supported still
does, for a different reason: with 4 warm runs and 1 cold one, the median is
always a warm value, so a warm-up would tighten the distribution without
changing the number the gate asserts. No warm-up is added, and no budget is
derived from a cold run.

It is worth knowing mainly because it explains the min column of any artifact:
a run scoring 0.79 next to a 0.97 median is not a regression, it is run #1.

### A developer machine is not the runner

The same sweep on a Windows dev machine, same method, five runs per route:

| Route              | Perf | LCP (ms) | CLS    | TBT (ms) |
| ------------------ | ---- | -------- | ------ | -------- |
| `/`                | 0.87 | 2450     | 0.0044 | 278      |
| `/sign-in`         | 0.93 | 2012     | 0.0044 | 217      |
| `/connect`         | 0.87 | 2399     | 0.0044 | 304      |
| `/runs/sample`     | 0.90 | 2314     | 0.0044 | 254      |
| `/leaderboard`     | 0.89 | 2378     | 0.0044 | 266      |
| `/findings/sample` | 0.79 | 2571     | 0.0044 | 500      |
| `/threats`         | 0.82 | 2602     | 0.0044 | 398      |

Roughly 40-50% slower on LCP, and `/threats` measures _over_ the 2500 ms line
locally while measuring 1.7 s on the runner. **`npx lhci autorun` on a laptop
will fail budgets that CI passes**, and that is expected rather than a bug: the
budgets are set on the machine the gate runs on, as ADR-0008 already noted for
Home. Use a local run to find a defect or compare before/after on the same
machine; do not use it to argue a budget is wrong.

## What it costs CI

Seven routes x five runs is 35 audits. Run in series inside `Build & Test` that
would be roughly 23 minutes added to every push, which is how a gate ends up on
a narrower trigger and then quietly stops covering anything. Instead each route
gets its own runner, fanned out from the same url list in `lighthouserc.json`.

Measured, not estimated:

|                   | Before (main)                    | After                         |
| ----------------- | -------------------------------- | ----------------------------- |
| Routes audited    | 1                                | 7                             |
| `Build & Test`    | 331-395 s (Lighthouse inside it) | 212-229 s                     |
| CWV jobs          | —                                | 7 in parallel, 164-230 s each |
| **CI wall clock** | **~6.5 min**                     | **~4 min**                    |
| Runner-minutes    | ~6                               | ~30                           |

Wall clock went down while coverage went up sevenfold. The trade is
runner-minutes, which on a public repo are free, and a busier checks list.
Nothing was moved to a narrower trigger and no route is sampled: all seven are
audited on every push and every pull request.

## Open items, stated rather than fixed

- **Home's TBT has the least margin of any metric here.** Its median measured
  147, 208, 146 and 143 ms across the four executions — one of them over the
  200 ms warn line — while the other six sit between 51 ms and 193 ms. Home is
  the only screen with a
  `requestAnimationFrame` canvas (`SentinelCore`), already cut down once in
  ADR-0008. TBT was
  deliberately **not** promoted from `warn` to `error`: doing so honestly would
  mean either a per-route TBT budget above 200 ms for Home (a loosening of the
  DoD's own INP figure, and not something to slip into a config change) or
  another round of work on the canvas. Neither belongs in a measurement PR.
- **The render-blocking stylesheet** costs every route ~730 ms and sets LCP for
  all of them. Inlining critical CSS or unblocking the font preloads is the one
  change that would move all seven numbers, and none of it was attempted here.
- **These are lab numbers.** Nothing in this repo measures field CWV at p75 on
  real devices. The DoD's "good @ p75" is, strictly, verified as "good under a
  fixed lab throttle on ubuntu-latest". Closing that gap needs RUM, which does
  not exist yet.
