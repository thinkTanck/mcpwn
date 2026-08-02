# 8. The CWV gate measures five runs and asserts the median

Date: 2026-07-31

## Status

Accepted. Amends [ADR-0002](0002-lighthouse-devtools-throttling.md) (which set
`numberOfRuns: 3`); the devtools-throttling decision itself is unchanged.

## Context

The `Lighthouse CI (CWV budgets)` step failed intermittently on branches that
changed no source at all. On two separate docs-only commits it failed on one of
the two check-runs for the same SHA and passed on the other, and both were
cleared by `rerun-failed-jobs`. A docs-only diff cannot move Core Web Vitals, so
the gate was producing coin-flip results — and a coin-flip gate trains everyone
to reflex-rerun red CI, which is how a real regression eventually gets waved
through.

Two things were wrong: a real performance defect, and a config that was hiding
how bad it was.

### 1. The defect: an animation loop that never let the main thread go idle

Reading the failed jobs' logs, the failing assertion was never LCP or CLS — it
was `categories.performance minScore`:

```
  ✘  categories.performance failure for minScore assertion
        expected: >=0.9
           found: 0.87
      all values: 0.82, 0.87

  ⚠️  total-blocking-time warning for maxNumericValue assertion
        expected: <=200
           found: 441.396
      all values: 473.315, 441.396
```

Three runs, two values. The missing value is the tell: one run's performance
score was `null`, so lhci dropped it. Reproducing locally with devtools
throttling showed why — `total-blocking-time` and `interactive` were erroring
out with `NO_TTI_CPU_IDLE_PERIOD`. Time to Interactive needs a 5-second window
with no long task (>50ms); when the page never provides one, both metrics error
and the whole performance category scores `null`.

`src/components/hud/SentinelCore.tsx`, on Home, drew a 520-point Fibonacci
sphere on every `requestAnimationFrame`, forever — and drew each point as its
own `beginPath`/`fillStyle`/`fill` with `ctx.shadowBlur` set, which is a
gaussian blur per fill, 520 times a frame. Under Lighthouse's 4x CPU throttling
every single frame was a long task, so the quiet window never arrived. Whether a
given run scored 0.87, 0.69 or `null` came down to how the trace window happened
to land. That is the coin flip.

Measured on Home, devtools throttling, n=7 before and n=7 after the fix
(min / median / p75 / max):

| metric                   | before                                                    | after                                        |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------- |
| performance score        | 0.73 / 0.80 / 0.81 / 0.82 (**2 of 7 runs scored `null`**) | 0.90 / 0.91 / 0.915 / 0.92 (**zero `null`**) |
| total blocking time      | 415 / 478 / 637 / 724 ms (2 errored)                      | 196 / 207 / 215 / 231 ms                     |
| time to interactive      | 5310 / 10235 / 12446 / 20800 ms                           | 3132 / 3173 / 3312 / 3462 ms                 |
| bootup time              | 6462 / 7081 / 8895 / 24203 ms                             | 2446 / 2518 / 2541 / 2554 ms                 |
| largest contentful paint | 2298 / 2540 / 2647 / 2724 ms                              | 2215 / 2250 / 2274 / 2332 ms                 |
| cumulative layout shift  | 0.0044 (all runs)                                         | 0.0044 (all runs)                            |

CLS was never involved: it sits at 0.0044 against a 0.1 budget, a 23x margin,
and does not move. LCP was marginal before the fix (p75 2647 ms against a
2500 ms budget) and is not after (p75 2274 ms).

### 2. The config: three runs, aggregated in the most lenient way lhci offers

`lighthouserc.json` set `numberOfRuns: 3`, while CLAUDE.md's Performance clause
mandates _"CWV is verified over multiple runs (5 is the standard) under devtools
throttling, never a single measurement"_. The config did not honour its own
requirement.

Worse, it never set `aggregationMethod`, and lhci's default is `optimistic`
(`@lhci/utils/src/assertions.js`: `aggregationMethod = 'optimistic'`). For a
`minScore` assertion that means the **maximum** across runs, and for a
`maxNumericValue` assertion the **minimum**. The gate was reporting the best run
of three and calling it the measurement — precisely the asserted-over-measured
gap that ADR-0002 chose devtools throttling to close.

That also re-frames the failures: because the gate needed only one lucky run,
every red build meant _all three_ runs were under budget, not one unlucky one.

### 3. Cold start was ruled out, not assumed

`lhci autorun` starts `npm run start` and begins collecting the moment the port
opens, so run #1 always hits a freshly started server. That was checked rather
than assumed: the first Lighthouse run against a cold `next start` measured
performance 0.91 and TBT 217 ms, indistinguishable from the warm runs, and
`server-response-time` stayed between 17 and 50 ms throughout. No warm-up step
is needed and none was added.

### 4. Confirmed on the runner, not just locally

The numbers above come from a developer machine, which is noisier than CI and
sits closer to the budget than the runner does. The gate was therefore verified
where it actually runs. On `ubuntu-latest` with five runs and median
aggregation, the median LHR reported:

| metric                   | CI median run | budget        |
| ------------------------ | ------------- | ------------- |
| performance score        | **0.95**      | ≥ 0.90        |
| largest contentful paint | **1.7 s**     | ≤ 2.5s        |
| cumulative layout shift  | **0.003**     | ≤ 0.1         |
| total blocking time      | 210 ms        | 200 ms (warn) |
| accessibility            | **1.0**       | 1.0           |

`lhci` printed `All results processed!` — every assertion passed, with not even
the total-blocking-time warning firing, so the median TBT across the five runs
was at or under 200 ms. The remaining long tasks are all React hydration on the
framework chunk (175 ms and below); none come from the canvas.

## Decision

1. **Fix the defect, do not loosen the budget.** SentinelCore keeps its 520
   points and its look, but batches them into seven depth bands per colour (a
   bounded number of draw calls per frame instead of 520), draws its bloom as a
   larger fainter disc instead of a per-point blur, runs at ~30fps, and stops
   while the tab is hidden. The frame budget is enforced by unit tests, not by a
   comment: a frame must issue at most 32 fills while still drawing 500+ arcs,
   and must never enable canvas shadow blur.

2. **`numberOfRuns: 5`** — CLAUDE.md's stated standard, now actually configured.

3. **`aggregationMethod: "median"`** — the gate asserts the median of five real
   runs. lhci offers `median`, `optimistic`, `pessimistic` and `median-run`; it
   has no p75 option, so `median` is the closest honest choice. It is _stricter_
   than the `optimistic` default it replaces, and far more stable than any
   single run: with five runs, one cold or noisy outlier can no longer decide
   the gate in either direction.

**No budget was changed.** `largest-contentful-paint` stays at 2500 ms,
`cumulative-layout-shift` at 0.1, `categories:performance` at 0.9,
`total-blocking-time` at a 200 ms warning. The measured numbers now clear them.

## Consequences

**Positive**

- The gate reports the median of five measured runs instead of the luckiest of
  three. It is both more honest and more stable — the two usually pull in
  opposite directions, and here they did not, because the flake was a real
  defect rather than budget-edge noise.
- Home's main-thread cost is genuinely lower for every visitor, not just for
  Lighthouse: TTI p75 fell from 12.4s to 3.3s and bootup time from 8.9s to 2.5s.
- SentinelCore's colours now resolve from the `--status-nominal` /
  `--status-breach` DTCG tokens instead of the `rgb()` literals that duplicated
  them, so a theme swap moves the canvas with everything else.

**Negative / costs**

- Five runs instead of three adds roughly a minute to CI (measured: 3m14s).
- A stricter aggregation leaves less headroom. On the runner there is plenty
  (0.95 against a 0.90 budget), but on a loaded developer machine the same page
  measures 0.87-0.93, so a local `npx lhci autorun` can fail where CI passes.
  Home's remaining score is dominated by React hydration on the 232 KB framework
  chunk (the only long tasks left in the trace) and by an FCP/LCP gated on the
  render-blocking stylesheet, which is fetched behind two preloaded font files.
  Those are baseline costs of a hydrated App Router page, not a defect, and they
  are the next lever if the gate ever tightens further.

**Known gap (unchanged by this ADR)**

- The gate still measures **only** Home (`http://localhost:3000/`). Every other
  screen ships without a CWV measurement in CI, and because CI runs on both
  `push` and `pull_request`, any borderline Home number flakes every stacked PR.
  Widening the URL set is worth doing and is deliberately not bundled here.

**Alternatives considered**

- **Keep `optimistic`, just raise the run count.** Would have made the gate pass
  reliably without fixing anything, since best-of-five would have hidden the
  defect even better than best-of-three. Rejected: that is the reflex-rerun
  habit written into the config.
- **Relax `categories:performance` below 0.9.** Rejected: the honest measured
  median clears 0.9 once the defect is fixed, so there was nothing to relax. A
  budget is only worth moving when the app's real number cannot meet it.
- **Add a server warm-up before collecting.** Rejected on evidence: the cold
  first run measured the same as the warm ones.

_References: [Lighthouse TTI definition](https://developer.chrome.com/docs/lighthouse/performance/interactive/); [lhci assertion docs](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md#assert); web.dev Core Web Vitals thresholds._
