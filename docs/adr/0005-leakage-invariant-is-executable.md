# 5. The leakage invariant is executable, not reviewed

Date: 2026-07-28

## Status

Accepted.

## Context

MCPwn's whole competitive claim is that its detector's accuracy is _measured_.
That claim rests on one thing: the detector predicts from the observable `Trace`,
and the `GroundTruth` it is scored against was never available to it. This is the
standard anti-leakage rule (Kaufman et al. 2012, _Leakage in Data Mining_): never
let the model use information unavailable at prediction time, and keep the label
out of the features. If the label reaches the model, every number downstream is
decoration.

That invariant was enforced by reading the code. Reading the code missed two real
leaks, both of which had passed review:

1. **ASI10 encoded the variant kind into `trace.runId`** (`asi10-goal_drift-malicious`
   vs `...-benign`). The held-out label rode inside the object handed to the
   detector. A human had signed that off.
2. **Every category disclosed itself to the judge.** `buildJudgeRequest`
   serialized the whole trace, including `trace.category`, while `SYSTEM_RUBRIC`
   asks the judge to "Classify the compromise into exactly one Core-7 OWASP
   Agentic category code". The judge was handed the answer to the question it was
   being asked. Removing the field was not sufficient either: every step id was
   `asi06-s11`, and `runId` was the scenario name in prose, so the category was
   still spelled out in the payload.

The first was found by writing a property test, not by inspection. The second was
found only because the first prompted a general audit. That is the lesson: this
class of defect is invisible to review precisely because each instance looks like
a reasonable naming choice.

## Decision

**The leakage invariant is expressed as executable properties over the registry,
and a violation fails CI.** It is not a review checklist item.

`tests/unit/attacks/leakage.property.test.ts` quantifies over EVERY registered
attack and EVERY realization, via `listAttackCodes()` and `attack.variants`, so a
new category or variant is covered the moment it is registered, with no test edit.
A tripwire asserts the enumeration is non-empty and matches `CategorySchema`, so
the properties can never pass vacuously.

The laws, at the Trace boundary:

1. **Contract-exact shape.** A `Trace` exposes exactly `{runId, target, model, category, steps}`. A new field is how a label would arrive.
2. **No label token** anywhere in the serialized trace: `compromis*`, `malicious`, `benign`, `groundtruth`, `label`, and the realization's own `id`, `slug` and `kind`. (`attacker` is deliberately not a label token: it is a contract `Step.type` present in both kinds.)
3. **Step ids are positional and category-free** (`s1..sN`). `groundTruth.stepId` legitimately names a real step, so the offending step must be indistinguishable in FORM from every other step.
4. **Sibling metadata invariance.** For a malicious/benign pair, `runId`, `target`, `model` and `category` are identical. Siblings differ in what the agent DID, never in bookkeeping.
5. **No metadata value predicts the label.** Stated globally: since every realization has a sibling, every distinct metadata value must be observed with BOTH kinds. A value seen with only one kind IS the label.
6. **Deterministic builds**, so nothing varies run to run that could smuggle a label-correlated value past the rest.

And at the detector boundary:

7. **The judge never receives the category**, in any casing, including via ids or `runId`. `judgeableTrace()` is an ALLOW-LIST (`target`, `model`, `steps`) rather than a delete-list, so a field added to `Trace` later is withheld by default and must be let in deliberately.
8. **The judge still receives all the evidence** — the task goal and every step, each anchorable by id. Without this counterweight, properties 1-7 are satisfiable by sending the judge nothing.

Both directions are **verified by mutation**, not by a green run: reintroducing
the ASI10 `runId` leak turns properties 4 and 5 red; emptying the payload turns
property 8 red.

## Consequences

**Positive**

- The leak class that shipped twice now fails CI on the branch that introduces it.
- Coverage grows automatically with the registry. Adding an eighth category or a
  23rd pair inherits every law for free.
- `judgeableTrace()`'s allow-list makes the safe direction the default.
- The judge now genuinely classifies the category from evidence, so a future
  category-accuracy number would mean something. It previously could not have.

**Negative / costs**

- Step ids lost their category prefix (`asi06-s11` -> `s11`). Ids are per-trace,
  so they stay unambiguous, but any external reference to an old id is stale.
- `runId` is withheld from the judge. If a future rubric needs run identity, it
  needs a deliberate, non-descriptive identifier.
- Property 5 assumes every realization has a sibling. That is guaranteed by the
  pair-based `defineAttack`, and would need revisiting if unpaired realizations
  were ever allowed.

**Open**

- `Trace.category` remains observable by contract, on the grounds that the
  operator chose which attack to launch. It is withheld only at the judge
  boundary. If live runs ever infer category rather than select it, that
  reasoning needs revisiting.

## Alternatives considered

- **Fix ASI10 and move on.** Rejected: it was the symptom. The audit it triggered
  found a second leak affecting all seven categories, which is exactly the
  argument against treating instances individually.
- **A review checklist.** Rejected on evidence: review is what let both leaks
  through.
- **Assert on a hand-listed set of attacks.** Rejected: a hand-written list goes
  stale the first time someone adds a category, and fails silently when it does.

_Reference: Kaufman, Rosset, Perlich, Stitelman (2012), "Leakage in Data Mining:
Formulation, Detection, and Avoidance."_
