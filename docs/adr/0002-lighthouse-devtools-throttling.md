# 2. Lighthouse CI throttling: DevTools (measured) over Lantern (simulated)

Date: 2026-07-13

## Status

Accepted

## Context

The Definition of Done requires Core Web Vitals to be **good @ p75** (LCP ≤ 2.5s,
INP ≤ 200ms, CLS ≤ 0.1), enforced in CI by Lighthouse CI (`lhci autorun`, config
in [`lighthouserc.json`](../../lighthouserc.json)).

Lighthouse can throttle two ways:

- **`simulate`** (the default — "Lantern"): run the page **unthrottled**, then
  apply a mathematical model to _estimate_ what the metrics would have been under
  a throttled network/CPU. Fast and deterministic, but the reported numbers are a
  **prediction**, not an observation.
- **`devtools`**: apply **real** DevTools network + CPU throttling and take the
  metrics from that **actual** throttled run. Slower and noisier run-to-run, but
  the numbers are **measured**.

MCPwn's entire thesis is _measured over asserted_ — the detector ships a
leakage-separated P/R it actually measured, not a claimed one (see
[ADR-0003](0003-core-7-scope-and-measurability-bar.md)). A CI performance gate
that reports **estimated** vitals would be inconsistent with that stance, and it
would diverge from how we spot-check performance during the build (real Chrome
via the Chrome DevTools MCP).

## Decision

**`lighthouserc.json` sets `throttlingMethod: "devtools"`** — Lighthouse CI
measures Core Web Vitals from a real throttled run, not a Lantern simulation.

- `numberOfRuns: 3` — take the median of three real runs to damp the extra
  run-to-run variance that `devtools` throttling introduces.
- The **LCP budget was left unchanged at 2500 ms** (`largest-contentful-paint`
  `maxNumericValue: 2500`, the web.dev "good" @ p75 line). We chose the more
  honest measurement method **without relaxing the threshold** to make it pass —
  measured numbers held to the real bar.
- A real Chrome is already present in CI (installed for Playwright), so `devtools`
  throttling adds no new dependency.

## Consequences

**Positive**

- CI's CWV numbers are **real measurements**, consistent with the project's
  measured-not-asserted ethos and with the Chrome DevTools MCP real-Chrome checks
  used during development.
- No threshold was softened to accommodate the method; a regression that pushes
  LCP over 2.5s still fails the gate.

**Negative / costs**

- `devtools` throttling is slower and noisier than Lantern; mitigated by
  `numberOfRuns: 3` (median) and by asserting on stable budgets rather than exact
  values.

**Alternatives considered**

- **`simulate` / Lantern (the default).** Faster and perfectly deterministic, but
  it reports an _estimate_. Rejected: a simulated pass would let the performance
  gate claim a number the app never actually produced — the exact
  asserted-vs-measured gap this project exists to close.

_Reference: [Lighthouse throttling docs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md); web.dev Core Web Vitals thresholds._
