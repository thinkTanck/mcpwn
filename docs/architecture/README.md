# Architecture diagrams

Two diagrams, each with a **canonical Mermaid source** (reproducible, diffable)
and a **polished `archify` render** (self-contained, themeable dark/light SVG).

| Diagram             | Canonical source                             | Render                                       | archify input                                                  |
| ------------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Module map          | [`architecture.mmd`](architecture.mmd)       | [`architecture.svg`](architecture.svg)       | [`architecture.archify.json`](architecture.archify.json)       |
| The leakage barrier | [`leakage-barrier.mmd`](leakage-barrier.mmd) | [`leakage-barrier.svg`](leakage-barrier.svg) | [`leakage-barrier.archify.json`](leakage-barrier.archify.json) |

The `.mmd` files are the source of truth. The `.archify.json` files are the
layout inputs for the SVG renders, kept so a render can be reproduced rather
than redrawn:

```bash
npx archify render architecture docs/architecture/architecture.archify.json out.html
npx archify render dataflow     docs/architecture/leakage-barrier.archify.json out.html
# then export the dual-theme SVG from the rendered page
```

---

## 1. The module map

![MCPwn module map](architecture.svg)

Eight modules, two external ports (`McpTargetPort`, `JudgeModelPort`), and the
small data contract the whole system agrees on.

**The live agent path is INBOUND** ([ADR-0006](../adr/0006-mcpwn-is-the-mcp-server.md)).
MCPwn hosts the per-run MCP endpoint and the user's agent connects **to** it, so
we serve the poisoned tool surface the attacks are staged through. You cannot
poison what you do not serve, and ASI01/02/04/05/06 are all staged through that
surface.

Consequences the diagram draws explicitly:

- **We hold no credential of the user's.** We never call their agent. What we do
  instead is authenticate the **incoming** connection with a per-run,
  per-account token.
- **`McpTargetPort` is not the agent path.** It keeps the narrower, real job of
  probing a target MCP _server_ (the ASI02 / ASI05 surfaces) and supplying the
  shared transport / JSON-RPC / Zod / retry layer.
- **`taskGoal` travels out of band** (a published MCP prompt, or paste), because
  MCP has no server-to-agent "here is your goal" message.

### What the previous diagram got wrong

The diagram this replaces (`docs/diagrams/architecture.svg`, deleted on this
branch) drew the **outbound** model, in
which the user handed us their agent's endpoint and key and MCPwn called out to
it. Specifically:

1. **`Harness / McpTargetPort` was the live path.** Its only outward edge was
   labelled "drive", so the diagram said MCPwn drives the target. Under ADR-0006
   that is the probe path, not the agent path.
2. **The user's agent did not appear at all.** There was no inbound connection,
   because in the outbound model there was nothing inbound to draw.
3. **No hosted MCP endpoint, no served `Environment`.** The thing that makes the
   Core-7 stageable was absent.
4. **No credential direction.** Neither the retired outbound key nor its
   replacement (the per-run inbound token) was shown, so the security model was
   invisible either way.
5. **`Attack engine -> scenarios -> Runner` implied the scenario drove an
   outbound call.** It now feeds the endpoint we serve.

---

## 2. The leakage barrier

![The leakage barrier](leakage-barrier.svg)

The observable `Trace` is the **feature**; the held-out `GroundTruth` is the
**label**; the detector and the UI see **only** the Trace. This is the standard
anti-leakage rule (Kaufman et al. 2012): never let the model use information
unavailable at prediction time, and keep the label out of the features. If the
label reaches the model, every number downstream is decoration.

There are **two** barriers, and the second is the subtle one.

**Barrier 1 — the Trace boundary.** `GroundTruth` never travels with the Trace,
and nothing in the Trace covaries with it: contract-exact shape, no label token,
positional step ids (`s1..sN`, so the offending step is not marked), sibling
metadata identical across a malicious/benign pair, no metadata value that occurs
with only one kind, and deterministic builds.

**Barrier 2 — the judge boundary.** `Trace.category` **is observable by
contract** — the operator chose which attack to launch, so the UI may legitimately
show it — but the judge is _asked to classify the category_, so handing it the
answer measures nothing. `judgeableTrace()` is therefore an **allow-list**
(`target`, `model`, `steps`), not a delete-list: a field added to `Trace` later
is withheld by default. `runId` is withheld alongside `category`, because the
builders name it after the scenario and that spells the category out in prose.

The counterweight matters as much as the barrier: every rule above is satisfiable
by sending the judge nothing, so a matching law asserts the judge still receives
the task goal and every step, each anchorable by id. Both directions are
verified by mutation, not by a green run
([ADR-0005](../adr/0005-leakage-invariant-is-executable.md);
`tests/unit/attacks/leakage.property.test.ts`).

### What the previous diagram got wrong

The diagram this replaces (`docs/diagrams/leakage-dataflow.svg`, deleted on this
branch) had the barrier itself broadly
right, but:

1. **`Harness / drives target / McpTargetPort`** carried the same retired
   outbound framing as the module map.
2. **Barrier 2 was missing entirely.** The diagram showed the whole Trace
   reaching the detector, which is precisely the leak ADR-0005 records:
   `buildJudgeRequest` used to serialize `trace.category` into the payload while
   the rubric asked the judge to classify the category.
3. **The barrier was one lane among several**, not the dominant element.

---

## Verified against the code, not against the prose

Every claim in both diagrams was checked against `src/` and `tests/`. Where the
code and the docs disagree, the code is what is drawn, and the disagreement is
recorded here.

### Drawn as specified but NOT built

- **The hosted per-run MCP endpoint does not exist.** `src/harness/mcp/index.ts`
  says so in its own header ("OUTBOUND MCP client ... This is **NOT** the live
  agent path"), and there is no route under `src/app/` that serves MCP — only
  `/api/health` and `/auth/callback`. Tagged _not built yet_.
- **The per-run, per-account token does not exist.** No token issuance, storage
  or verification appears anywhere in `src/`. Tagged _not built yet_.
- **Module 8 (wiring + run report) does not exist.** There is no composition
  root. Tagged _not built yet_.
- **The per-account lifetime allowance is not enforced.** The only accounting
  primitive is `RunRepository.countRunsSince(userId, since)`
  (`src/data/run-repository.ts`), which is a rolling window; nothing calls it to
  gate a run.

### Built, but not reachable from the deployed app

Modules 1 (`record`), 3 (`runMatrix`), 4b (`evaluate`), 5 (`buildLeaderboard`)
and 6 (`generateFixReport`) exist and are tested, but **nothing under
`src/app/` imports them**. The deployed screens read curated fixtures and
real builder-constructed traces through `src/data/source.ts` (`DataSource`), and
`/account` reads `RunRepository`. The module map draws the intended wiring; the
"not as shipped" card states this plainly.

### Contradictions found between the code and the documented model

1. **`CLAUDE.md` cites a `resolveLiveDetector()` null fail-safe as existing
   ("down the existing `resolveLiveDetector()` null fail-safe"). It does not
   exist** — the symbol appears nowhere in `src/` or `tests/`. Neither does any
   global spend cap.
2. **`src/harness/mcp/endpoint.ts` still speaks the retired outbound model in
   user-facing copy**: `checkEndpoint` returns "Enter the MCP endpoint URL of
   your agent." and "Remove the username and password from the URL. Send your key
   in the API key field instead." Under ADR-0006 there is no API key field and
   the endpoint being validated is a _probe target_, not the user's agent. The
   module's own doc comment has been updated; these strings have not.
3. **`src/config/env.ts` labels the `McpTargetPort` block "target MCP agent under
   test"** (`MCP_TARGET_URL` / `MCP_TARGET_TOKEN`). Same stale framing: it is a
   target _server_, not an agent.
4. **`src/harness/index.ts` still describes module 1 as "Drives an MCP
   tool-using target through a `Scenario`"**, and `McpTargetPort.run(scenario)`
   is shaped for that. That is the retired direction's shape; under ADR-0006 the
   recorder's live input is a stream of calls arriving at a server we host. The
   diagram draws `record()` as the recorder and keeps `McpTargetPort` as one
   (probe-only) source of events into it.
5. **Two persistence layers exist.** `src/persistence/` (`RunRepositoryPort`,
   in-memory + postgres, keyed by `runId`) is used only by tests;
   `src/data/run-repository.ts` (`RunRepository`, owner-scoped, in-memory +
   Supabase RLS) is the one the app uses. The map draws both, with the app-facing
   one on the main path.

### Still unverified

- **Nothing here has been observed against a real MCP agent.** ADR-0006 records
  that the whole inverted model rests on a hypothesis not yet observed once. The
  inbound half of the module map is a specification, and is drawn as one.
- **No precision/recall number has been measured.** `src/eval/index.ts` says so
  in its own header: every number the harness reports today is scored against a
  mock or oracle detector in unit tests.
