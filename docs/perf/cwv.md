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

Two independent CI executions of the same commit are reported side by side,
because a single median is still a single reading of a median. Where they
disagree, the budget is derived from the **worse** of the two.

## Measured (median of 5 · ubuntu-latest · devtools throttling)

Source: workflow run `30727190996` (commit `e2c27bd`), attempts 1 and 2.

| Route              | Perf score  | LCP (ms)    | CLS             | TBT (ms)  | A11y |
| ------------------ | ----------- | ----------- | --------------- | --------- | ---- |
| `/`                | 0.97 / 0.95 | 1679 / 1717 | 0.0032 / 0.0032 | 147 / 208 | 1.00 |
| `/sign-in`         | 0.97 / 0.98 | 1640 / 1606 | 0.0032 / 0.0032 | 124 / 82  | 1.00 |
| `/connect`         | 0.97 / 0.97 | 1686 / 1693 | 0.0032 / 0.0032 | 150 / 138 | 1.00 |
| `/runs/sample`     | 0.95 / 0.96 | 1729 / 1706 | 0.0032 / 0.0032 | 164 / 151 | 1.00 |
| `/leaderboard`     | 0.95 / 0.96 | 1769 / 1765 | 0.0032 / 0.0032 | 193 / 164 | 1.00 |
| `/findings/sample` | 0.98 / 0.99 | 1680 / 1620 | 0.0032 / 0.0032 | 120 / 75  | 1.00 |
| `/threats`         | 0.97 / 0.97 | 1715 / 1698 | 0.0032 / 0.0032 | 133 / 142 | 1.00 |

Best-practices and SEO measured 1.00 on every route in both executions.

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

- **LCP** — the worse of the two measured medians, `+15%`, rounded up to the
  next 50 ms. Fifteen percent is roughly six times the largest disagreement
  between the two executions (Home, 2.3%), so ordinary runner noise cannot trip
  it while a real regression can. Every route's budget lands 500-600 ms _under_
  the 2500 ms web.dev line, so the gate now fails long before the app stops
  being "good".
- **CLS** — `0.01` everywhere. Measured CLS is `0.0032` on every route in every
  run, a number set by the shell rather than by any screen. `0.01` is 3x the
  measurement and 10x tighter than the 0.1 ceiling; a genuine new layout shift
  would clear it immediately.
- **Performance score** — the worse measured median minus `0.03`. Every route
  therefore sits at or above the 0.90 the gate previously demanded of Home;
  none was relaxed.
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
| `/connect`       | 1950 ms    | 0.01       | 0.94        | warn |
| `/runs/[id]`     | 2000 ms    | 0.01       | 0.92        | warn |
| `/leaderboard`   | 2050 ms    | 0.01       | 0.92        | warn |
| `/findings/[id]` | 1950 ms    | 0.01       | 0.95        | warn |
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
(`/sign-in`, 56) differ by roughly 100 ms.

That is why the per-route LCP budgets are so close together, and it is the
single lever that would move all seven at once. Not pulled here.

### The first run of five is consistently the slowest

`lhci` starts `npm run start` and begins collecting the moment the port opens,
so run #1 of every route hits a cold server. Across 14 route-executions the
first run was the worst one every time, by a wide margin:

| Route          | run #1 LCP | median LCP | run #1 perf | median perf |
| -------------- | ---------- | ---------- | ----------- | ----------- |
| `/`            | 2240-2382  | 1679-1717  | 0.79-0.84   | 0.95-0.97   |
| `/connect`     | 2278-2289  | 1686-1693  | 0.85-0.87   | 0.97        |
| `/leaderboard` | 2010-2274  | 1765-1769  | 0.83-0.91   | 0.95-0.96   |
| `/runs/sample` | 2347-2377  | 1706-1729  | 0.82-0.84   | 0.95-0.96   |
| `/threats`     | 1800-2277  | 1698-1715  | 0.86-0.95   | 0.97        |

[ADR-0008](../adr/0008-cwv-gate-measures-five-runs-and-asserts-the-median.md)
recorded the opposite ("the first Lighthouse run against a cold `next start`
measured performance 0.91 and TBT 217 ms, indistinguishable from the warm
runs") and declined to add a warm-up on that evidence. With five runs on seven
routes the cold penalty is unmistakable, so **that observation was wrong** —
though the conclusion it supported still holds, for a different reason: the
median of five cannot be moved by one outlier, so a warm-up would tighten the
distribution without changing the asserted number. No warm-up is added, and no
budget is set from a cold run.

This is worth knowing mainly because it explains the min column: a run that
scores 0.79 in the artifact is not a regression, it is run #1.

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

Roughly 40% slower on LCP, and `/threats` measures _over_ the 2500 ms line
locally while measuring 1.7 s on the runner. **`npx lhci autorun` on a laptop
will fail budgets that CI passes**, and that is expected rather than a bug: the
budgets are set on the machine the gate runs on, as ADR-0008 already noted for
Home. Use a local run to find a defect or compare before/after on the same
machine; do not use it to argue a budget is wrong.

## Open items, stated rather than fixed

- **Home's TBT has no margin.** Its median measured 147 ms and 208 ms in the two
  executions, straddling the 200 ms warn line, while the other six sit between
  75 ms and 193 ms. Home is the only screen with a `requestAnimationFrame`
  canvas (`SentinelCore`), already cut down once in ADR-0008. TBT was
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
