# 3. Core-7 scope and the measurability bar

Date: 2026-07-15

## Status

Accepted

> Numbering note: this is the second decision record after
> [ADR-0001](0001-record-architecture-decisions.md); `0002` is intentionally
> reserved/unused so this record can carry its assigned number.

## Context

The [OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
defines ten categories (ASI01–ASI10). MCPwn's whole value proposition is a
detector whose accuracy is **measured**, not asserted — leakage-separated
precision/recall against held-out ground truth (see
[ADR context in CLAUDE.md](../../CLAUDE.md): the observable `Trace` is the
feature, the held-out `GroundTruth` is the label, and the detector never sees the
label).

That claim only holds for categories we can actually **measure**. Our data
contract is deliberately small and single-run: a `Trace` is a bounded sequence of
OBSERVABLE steps — `attacker`, `agent_reasoning`, `tool_call`, `tool_result`,
`memory_read`, `memory_write`, `task_complete` — and a `Verdict` anchors a
compromise to exactly one offending step (`stepId`). Some OWASP categories fit
that shape cleanly; others describe harms that are not observable in a single
agent's own steps, or that have no single anchor step, or that resolve inside a
human's head. Shipping a category we cannot measure would mean publishing a P/R
number we cannot honestly stand behind — the exact failure this project exists to
avoid.

## Decision

**Cover 7 of the 10 categories — the Core-7 — and gate inclusion on a
measurability bar.** This wave adds **ASI03** and **ASI05** to the existing five.

Core-7 (titles verbatim from the official OWASP 2026 PDF, genai.owasp.org):

| Code  | Title                                |
| ----- | ------------------------------------ |
| ASI01 | Agent Goal Hijack                    |
| ASI02 | Tool Misuse and Exploitation         |
| ASI03 | Identity and Privilege Abuse         |
| ASI04 | Agentic Supply Chain Vulnerabilities |
| ASI05 | Unexpected Code Execution (RCE)      |
| ASI06 | Memory & Context Poisoning           |
| ASI10 | Rogue Agents                         |

### The measurability bar

A category ships **only if all four hold**:

1. **Observable** — the compromise shows up in the agent's **own** steps, i.e. in
   the `Trace` step types above.
2. **Bounded** — it happens inside **one bounded run**, not across many runs or
   agents over time.
3. **Anchorable** — there is a crisp verdict, _"compromised at step N — or not"_,
   that `Verdict.stepId` can point at.
4. **Precision-bearing** — a **benign variant** can score not-compromised. Without
   a benign control we can measure recall but **never precision**; a detector you
   can only measure for recall is not a detector you can trust.

The Core-7 all clear the bar: each has a marker-free malicious trace with an
anchored offending step **and** a benign control that scores not-compromised (the
false-positive that makes precision measurable).

### Why ASI07, ASI08, ASI09 are excluded (in OWASP's own terms)

- **ASI07 — Insecure Inter-Agent Communication.** The compromise lives in
  agent-to-agent messaging — a step type our observable `Trace` does not model.
  There is no step to observe or anchor to (fails bars 1 and 3). This becomes
  measurable only if the contract gains an inter-agent step type.
- **ASI08 — Cascading Agent Failures.** OWASP defines this as the **propagation**
  of a fault, _not the initial vulnerability itself_. The harm is emergent across
  steps/agents/runs, so there is no single offending step to anchor
  `Verdict.stepId` to, and it is not contained in one bounded run (fails bars 2
  and 3).
- **ASI09 — Human-Agent Trust Exploitation.** The compromise completes inside a
  **human's decision**, which the trace cannot observe. No observable ground truth
  can be held out, so no leakage-separated P/R is possible (fails bars 1 and 4).

## Consequences

**Positive**

- **Seven measured beats ten unmeasurable.** Every shipped category has honest,
  leakage-separated P/R with a precision-bearing benign control — the claim the
  product is built on stays true.
- The bar is a reusable, explicit gate for future categories, not a one-off
  judgement.
- The UI can be honest about coverage: a **Threat Model / Coverage** view
  (`/threats`) shows which of the ten are covered and marks the rest as _not
  measurable_ using a neutral fourth state (`--status-inert`) — never the breach
  red, which is reserved for an actual compromise (spending red on an uncovered
  category would corrupt the signal language).

**Negative / costs**

- Three real OWASP risks (ASI07/08/09) are out of scope for now; MCPwn does not
  claim to test them.
- Re-evaluation is required if the data contract grows — e.g. an inter-agent or
  multi-run step type would let ASI07/ASI08 re-enter under the same bar.

**Alternatives considered**

- **Cover all ten.** Rejected: three cannot be measured under the current
  contract, so their P/R would be asserted, not measured — the dishonesty this
  project is a reaction to.
- **Cover only the original five.** Rejected: ASI03 and ASI05 clear the bar
  cleanly (observable privileged tool-call reuse; observable exec/shell tool-call
  carrying an injected command), each with a benign control, so excluding them
  would leave measurable coverage on the table.

_Reference: OWASP Top 10 for Agentic Applications 2026 — genai.owasp.org._
