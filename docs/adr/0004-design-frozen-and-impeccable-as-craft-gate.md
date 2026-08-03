# 4. The design as default reference; Impeccable as the design method; the three-role type model

Date: 2026-07-17 (amended 2026-07-18)

## Status

Accepted. **Amended 2026-07-18** to precedence A: the design is the _default reference_, not immutable, and Impeccable is the _design method_ (an opinionated partner), not an invented "craft gate." The amendment is folded into the sections below; the original framing it replaces is noted in the Amendment section at the end.

## Context

Three consecutive type passes "succeeded" and changed nothing. That is not three unlucky attempts; it is a structural fault, and it is worth naming precisely.

The design was authored as `design-review/MCPwn Sentinel v2.dc.html` — a Claude Design export that renders **only inside its own host** (a bundled `support.js` template runtime). Nothing measures a `.dc.html`: `@axe-core/playwright` audits a real DOM, Lighthouse traces a real navigation, `impeccable detect` and `/impeccable audit` read the built source. Against a `.dc.html`, every instruction we wrote ("make body bigger", "fix the hierarchy") was **unverifiable by construction** — we could assert it was done, never measure it. That is precisely the asserted-vs-measured gap this project exists to close (see [ADR-0002](0002-lighthouse-devtools-throttling.md), [ADR-0003](0003-core-7-scope-and-measurability-bar.md)).

The consequence is not that the design is frozen forever. It is that design work has to happen **in the built code, where it can be both practiced and measured** — which is exactly where Impeccable's method operates.

We adopted Impeccable ([impeccable.style](https://impeccable.style)) as the design method for all UI work. Its own documented stance is load-bearing here: it is **an opinionated design partner, not a validator** — "push back with a reason and it works with you." Run honestly, its absolute bans and slop catalog flag some of the Sentinel Fields reference's own moves (the hero-metric stat treatment, per-section eyebrows, dark-mode glow, numbered markers). An earlier version of this ADR treated the design as frozen and outranking everything, which would have required either silently overruling Impeccable or silently overwriting the design. Neither is honest. Precedence A resolves it.

## Decision

**1. The design is the DEFAULT reference, not immutable.** `design-review/MCPwn Sentinel v2.dc.html` is the Wave C reference for screens, layout, copy, states, and mobile. Claude Design's role is complete. We implement it in code and design it further there with Impeccable. It is the default we start from, not a locked artifact.

**2. Impeccable is the design METHOD, and it runs on the built source.** It is an opinionated design partner (not a gate that only measures), run through the site's four-phase loop:

- **START** — `init` (captures `PRODUCT.md` + `DESIGN.md`; skipping it is the documented cause of generic-SaaS output), `shape`, `craft`.
- **ITERATE** — `polish` · `typeset` · `layout` · `colorize` · `animate` · `bolder` · `quieter` · `live` · `critique`.
- **POLISH** (on a narrow target) — `audit` (accessibility · performance · theming · responsive · anti-patterns, scored 0–4, findings P0–P3), `clarify`, `harden`.
- **MAINTAIN** — `extract`, `document`.

Register (BRAND: Home, Sign-in · PRODUCT: Connect, Replay, Leaderboard, Findings, Threats) is picked per task from the cue + `PRODUCT.md`. It inherits our DTCG tokens and never introduces its own. `npx impeccable detect src/` is the **blocking CI slop gate**; `/impeccable audit` is the **per-screen verification**. We run Impeccable alone — running a second design/taste skill beside it collides on vocabulary (the site names this an anti-pattern).

**3. The THREE-ROLE type model**, as built and measured:

| Role       | Family                                        | Scale                                                   | For                                                               |
| ---------- | --------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| READING    | sans                                          | 17 body · 18 lead · 20 · 28 · `clamp(32px, 5cqi, 44px)` | every sentence a human reads                                      |
| INSTRUMENT | mono                                          | 12–13px                                                 | telemetry only: labels, chips, metadata, cues, column/row headers |
| DISPLAY    | **per the design (sans hero / mono readout)** | 15 / 20 / 28 / 40                                       | values that ARE the focus                                         |

Hard rules: prose **never** wears an INSTRUMENT role (a blocking review failure); the roles stay **measurably** distinct (`--display-sm` and `--reading-body` both sit above the INSTRUMENT ceiling); headline sizing is **`cqi`, never `vw`** (the text column tracks the command deck, not the viewport); a tri-state band colour overrides DISPLAY's default colour at **zero specificity** via `:where()`.

### The adjudication protocol (how precedence A runs per screen)

Each screen: run the loop, then `/impeccable audit`. For every finding that hits a design move, do exactly one of:

- **Push back with a documented reason** (the site says do exactly this). Pre-decided KEEPs: the **tri-state glow** is a functional signal language (cyan/amber/red = nominal/caution/breach), not decorative dark-mode glow; the **01–10 numbering** is the real OWASP ASI taxonomy, an ordered sequence the reader needs, not AI section markers.
- **Accept the fix** where we have no real defense, and **propose the reworked version for sign-off** rather than overwriting frozen visuals unilaterally. Likely accepts: the tiny uppercase tracked **eyebrows**; the generic **hero-metric treatment** of the 0.94/0.89 hero figures (the numbers stay, the templated presentation is fair game). _(Historical note, 2026-08-03: those figures were illustrative, never measured — this line's original wording called them "measured", which was untrue at the time. They have since been replaced by genuinely measured values under [ADR-0009](0009-compromise-vs-exposure.md).)_

Each screen PR lists every audit finding and its disposition (pushed back + reason, or accepted + proposed change).

### Corollary: token roles describe the design; design findings may change it

Two different things get flagged, and they resolve differently:

- **A token role disagreeing with the design.** The design is the default and the _role_ is re-examined — the role is a lossy description and must not silently redesign the reference. Two spec errors proved this, both the role overruling the reference:
  - **The 65–75ch measure cap.** A generically-correct typography rule encoded as a role-level `max-inline-size`. It fought the design's own column widths and produced **dead side-margins**. Fix: the role pins no measure. The design owns layout width; the role owns type.
  - **DISPLAY = mono.** The design-system note carried "display / hero counter 40px mono", so the role pinned mono — and that **rewrote the design's sans numerals** on Home. Fix: DISPLAY pins the **scale** (15/20/28/40); the **family follows the design** (sans hero counters, mono readouts).
- **An Impeccable design finding disagreeing with the design.** This is a legitimate design opinion. It becomes a **proposed change surfaced for sign-off**, with the finding and our reason — never a unilateral overwrite, never an automatic veto.

## Consequences

**Positive**

- Craft becomes measurable and _improvable_: every screen reports its type table + CWV + axe + audit findings and dispositions from the built app. A screen does not get a PR without its numbers.
- Slop is gated by `impeccable detect` in CI; design quality is checked by `/impeccable audit` per screen.
- The design can improve where it was generic (the flagged tells) without being thrown away, because changes are proposed and signed off, not reflexively applied.
- A type fix lands **once in tokens** and every screen inherits it — the loop the three failed passes never had.

**Negative / costs**

- Adjudication is per-screen human work: each design finding needs a keep-with-reason or a propose-for-sign-off decision. That is the cost of not letting either side (frozen design, or the tool) win automatically.
- The token roles remain a lossy description of the design; where they disagree, humans adjudicate per the corollary.

**Alternatives considered**

- **Keep the design strictly frozen; Impeccable only measures.** Rejected (this ADR's original framing): it makes Impeccable a validator, which its own docs reject, and it preserves generic tells we have no defense for.
- **Let Impeccable unilaterally rewrite the design.** Rejected: discards deliberate, defensible choices (the functional tri-state, the real OWASP numbering) and overwrites frozen visuals without sign-off.
- **Keep iterating the design in Claude Design.** Rejected: unverifiable by construction — it is what produced three no-op type passes.

## Amendment (2026-07-18)

This ADR originally read "the design is FROZEN" and "Impeccable is the CRAFT LAYER / craft gate," with a corollary that "the design wins and the role is wrong — flag it, do not fix the design." That framing miscast Impeccable as a validator and treated the design as immutable. Corrected to precedence A above: the design is the **default reference** (not frozen), Impeccable is the **design method** (an opinionated partner running the four-phase loop), and a flag on a design move becomes a **proposed change surfaced for sign-off**, not a forbidden edit and not a unilateral overwrite.

_Copy rules that ride with this decision: count **magnitudes**, never evidence (never animate step numbers, run IDs, severities, or amounts quoted from a trace); no em dashes in UI copy._
