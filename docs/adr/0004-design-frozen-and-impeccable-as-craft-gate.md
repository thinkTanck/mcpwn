# 4. Design frozen; Impeccable as the craft gate; the three-role type model

Date: 2026-07-17

## Status

Accepted

## Context

Three consecutive type passes "succeeded" and changed nothing. That is not three
unlucky attempts; it is a structural fault, and it is worth naming precisely.

The design lives as `design-review/MCPwn Sentinel v2.dc.html` — a Claude Design
export that renders **only inside its own host** (a bundled `support.js` template
runtime). Nothing in our toolchain can measure it: Chrome DevTools MCP measures a
running app, `@axe-core/playwright` audits a real DOM, Lighthouse traces a real
navigation, and `impeccable detect` reads source. Against a `.dc.html`, every
instruction we wrote ("make body bigger", "fix the hierarchy") was **unverifiable
by construction** — we could assert it was done, but never measure that it was.
That is precisely the asserted-vs-measured gap this project exists to close (see
[ADR-0002](0002-lighthouse-devtools-throttling.md), [ADR-0003](0003-core-7-scope-and-measurability-bar.md)).

The anti-slop layer and the measurement layer both exist **only on source**. So
craft has to be fixed where it can be measured: in the code.

## Decision

**1. The design is FROZEN.** `design-review/MCPwn Sentinel v2.dc.html` is the Wave C
reference for screens, layout, copy, states, and mobile. Claude Design's role is
complete. We do not iterate the design further; we implement it.

**2. Impeccable is the CRAFT LAYER, and it runs on source.** `init` + per-screen
registers (**BRAND**: Home, Sign-in · **PRODUCT**: Connect, Replay, Leaderboard,
Findings, Threats), `/typeset`, `/polish` per screen, and
**`npx impeccable detect src/` wired as a BLOCKING CI gate** — slop is a gate, not
a hope. It inherits our DTCG tokens rather than introducing its own.

**3. The THREE-ROLE type model**, as built and measured:

| Role       | Family                    | Scale                                                   | For                                                               |
| ---------- | ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| READING    | sans                      | 17 body · 18 lead · 20 · 28 · `clamp(32px, 5cqi, 44px)` | every sentence a human reads                                      |
| INSTRUMENT | mono                      | 12–13px                                                 | telemetry only: labels, chips, metadata, cues, column/row headers |
| DISPLAY    | **per the frozen design** | 15 / 20 / 28 / 40                                       | values that ARE the focus                                         |

Hard rules: prose **never** wears an INSTRUMENT role (a blocking review failure);
the roles stay **measurably** distinct (`--display-sm` and `--reading-body` both
sit above the INSTRUMENT ceiling); headline sizing is **`cqi`, never `vw`** (the
text column tracks the command deck, not the viewport); a tri-state band colour
overrides DISPLAY's default colour at **zero specificity** via `:where()`.

### Corollary: the design OUTRANKS the spec

The frozen design is the **reference**. The token roles **describe** it; they never
redesign it. **If a role and the design disagree, the design wins and the role is
wrong** — flag it, do not "fix" the design.

This is not a platitude. It is the lesson from two spec errors we actually shipped
into the roles, both of which were the role overruling the reference:

- **The 65–75ch measure cap.** A generically-correct typography rule, encoded as a
  role-level `max-inline-size`. It fought the frozen design's own column widths and
  produced **dead side-margins**. Fix: the role pins no measure. The design owns
  layout width; the role owns type.
- **DISPLAY = mono.** The design-system note carried "display / hero counter 40px
  mono", so the role pinned mono — and that **rewrote the frozen design's sans
  numerals** on Home. Fix: DISPLAY pins the **scale** (15/20/28/40); the **family
  follows the design** (sans hero counters, mono readouts).

Both errors were "good typography" defeating "the actual design". The corollary
exists so the next one gets flagged instead of implemented.

## Consequences

**Positive**

- Craft becomes measurable: every screen reports **measured type + CWV + axe** from
  the built app. A screen does not get a PR without its numbers.
- Slop is gated by `impeccable detect` in CI, ahead of the work it gates.
- A type fix lands **once in tokens** and every screen inherits it — the loop the
  three failed passes never had.

**Negative / costs**

- We cannot measure a mockup. The frozen design is verified by eye; only the built
  app is instrumented. A design change now costs a deliberate re-freeze.
- The roles are a lossy description of the design. Where they disagree, humans must
  adjudicate (per the corollary) rather than trusting the token layer.

**Alternatives considered**

- **Keep iterating the design in Claude Design.** Rejected: unverifiable by
  construction — it is what produced three no-op type passes.
- **Re-author the design as measurable source (static mockups).** Rejected: it
  forks the design source of truth. Two artifact formats mean two truths.

_Copy rules that ride with this decision: count **magnitudes**, never evidence
(never animate step numbers, run IDs, severities, or amounts quoted from a trace);
no em dashes in UI copy._
