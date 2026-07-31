# BYOK live target — design + spike (hosted-release Slice 3)

Status: **the spike's conclusion was accepted and is now
[ADR-0006](../../adr/0006-mcpwn-is-the-mcp-server.md).** Date: 2026-07-27.

> **Read this as the EVIDENCE, not as the plan.** This document set out to build
> the outbound model — the user hands us their agent's endpoint and key and we
> call it — and concluded that it cannot stage ASI01/02/04/05/06 at all, because
> you cannot poison a tool surface you do not serve. That conclusion is now the
> decided model: **MCPwn is the MCP server and the agent connects to us.**
>
> So everything below describing the outbound direction as the live agent path is
> **RETIRED**. What survived, and shipped: the transport / JSON-RPC / Zod /
> bounded-retry layer, scoped to probing a target MCP _server_ (the ASI02 /
> ASI05 surfaces). The live-run pipeline and the Connect wiring sketched here
> were **not merged**; the inverted design is in
> [the Connect design](2026-07-31-connect-inverted-design.md), and the access and
> cost model in [ADR-0007](../../adr/0007-access-and-cost-model.md).
>
> The spike section is kept in full because it is the argument the decision rests
> on, and a decision whose evidence has been deleted is just an assertion.

## What shipped in this slice

| Piece                                             | State                                                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `McpTargetPort` HTTP adapter (`src/harness/mcp/`) | **Real code, tested against fakes and a real loopback socket.** Never run against a real MCP agent.                                                                                |
| Live-run pipeline (`src/live/`)                   | **Real**: authz → Zod → judge check → per-account cap → runner → owner-scoped persist. Driven by injected fakes in tests.                                                          |
| Per-account cap                                   | **Real and enforced.** `countRunsSince` is finally called.                                                                                                                         |
| BYOK secret handling                              | **Real and asserted by tests.**                                                                                                                                                    |
| `/connect` live path                              | **Wired.** Calls the server action, renders the typed outcome.                                                                                                                     |
| The judge                                         | **Not wired, on purpose.** `resolveLiveDetector()` returns `null`, so a live run is refused with `JUDGE_UNAVAILABLE` rather than judged by something unvalidated. Slice 2 owns it. |

Because the judge is absent, **no live run can complete in production today**, and
the Connect screen says exactly that ("LIVE RUNS NOT ENABLED YET") instead of
presenting a working feature.

---

## THE SPIKE — can we observe a black-box MCP agent's internal steps?

### The question

`Trace` wants seven step types. An MCP **server** endpoint exposes tools; it does
not narrate an agent's reasoning. So: what can we actually see, and from which
side of the wire?

### 1 · Which step types are genuinely observable

Two candidate directions. They are not equivalent, and the difference is the
whole answer.

**Direction A — outbound client (what the adapter in this slice does).** MCPwn is
an MCP _client_; it POSTs JSON-RPC at the user's endpoint.

| Step type                      | Observable from direction A?         | Why                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attacker`                     | **Yes**, by construction             | It is the framing MCPwn itself sent.                                                                                                                                                                       |
| `tool_call`                    | **Yes, but it is OUR call**          | We record the request we issued, not a decision the agent made.                                                                                                                                            |
| `tool_result`                  | **Yes**                              | Read off the wire.                                                                                                                                                                                         |
| `agent_reasoning`              | **Only if the target volunteers it** | MCP's `notifications/message` (the logging channel) is the one spec-defined narration path. Targets are not required to emit it. The adapter maps it when present and **synthesizes nothing** when absent. |
| `memory_read` / `memory_write` | **No**                               | The agent's memory is on the agent's side of the wire.                                                                                                                                                     |
| `task_complete`                | **Yes**                              | The call returned.                                                                                                                                                                                         |

**Direction B — MCPwn is the MCP server; the user's agent connects to us.**

| Step type                      | Observable from direction B?                | Why                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attacker`                     | **Yes**, by construction                    | We author the poisoned tool result / resource / tool description.                                                                                                                                                                                                         |
| `tool_call`                    | **Yes, and it is the AGENT's own decision** | Every `tools/call` the agent chooses to make, with its arguments, arrives at our server. This is the signal red-teaming actually needs.                                                                                                                                   |
| `tool_result`                  | **Yes**                                     | We author it. This is _where the attack lives_.                                                                                                                                                                                                                           |
| `memory_read` / `memory_write` | **Yes, if memory is a tool we host**        | `Environment.memory` seeds a store we own; reads and writes become tool calls we observe and can map onto the memory step types.                                                                                                                                          |
| `task_complete`                | **Inferred, not observed**                  | MCP has no "the agent finished" message. It must be inferred from session close or an explicit end-of-task tool, and labelled as inferred.                                                                                                                                |
| `agent_reasoning`              | **No**                                      | Nothing in MCP carries an agent's chain of thought to a server. `sampling/createMessage` lets a server ask the _client's model_ for a completion, which is the server driving the model, not the agent narrating itself. Treating it as reasoning would be a fabrication. |

### 2 · Which direction does the contract imply? **Direction B.**

`src/contract/attack.ts` answers this on its own terms:

```ts
export interface Environment {
  /** MCP tool names exposed to the agent for this scenario. */
  readonly tools: readonly string[];
  /** Seed memory state, if any. */
  readonly memory?: Readonly<Record<string, JsonValue>>;
  /** Optional system-prompt / role framing. */
  readonly systemPrompt?: string;
}
```

Three tells, all pointing the same way:

1. **"tool names _exposed to_ the agent"** — exposing tools is the server's job.
   A client does not expose tools; it consumes them.
2. **"_Seed_ memory state"** — seeding presupposes we hold the store. If memory
   lived inside the user's agent we could neither seed it nor read it, and the
   `memory_read` / `memory_write` step types would be unreachable by construction.
3. **`systemPrompt` framing** — closest MCP analogue is a server-published
   `prompt`, again a server-side artifact.

The mechanism argument is stronger still. Most of the Core-7 attacks _are_ a
poisoned tool surface: ASI01 hijack via a malicious tool result, ASI02 misuse of
an over-broad tool, ASI04 a poisoned tool description, ASI06 poisoned memory
content. **From direction A we cannot stage any of them**, because we do not
control what the agent reads. From direction B we control all of it. Direction A
can only fuzz the user's MCP _server_; it cannot red-team their _agent_.

This also matches what the earlier Slice-1 spec already wrote down
(`docs/superpowers/specs/2026-07-23-auth-persistence-design.md`): "MCPwn serves
poisoned tools, observes steps → Trace". The spike confirms it and pins down why.

**What direction B still cannot do:** hand the agent a task. `Scenario.taskGoal`
has to get into the agent somehow, and MCP has no server-to-agent "here is your
goal" message. So the honest live architecture is a **hybrid**:

```
MCPwn hosts an MCP server per run (poisoned tools + seeded memory + prompts)
   → user points their agent at the per-run endpoint and gives it the task goal
     (pasted by hand, or via an MCP prompt we publish, or via a thin adapter
      they run on their side)
   → every tools/call the agent makes lands on us → Trace
   → LOCKED validated judge reads Trace + goal → Verdict
```

The outbound adapter built in this slice keeps a narrower but real job: probing
and characterizing a _target MCP server_ (ASI02, ASI05 surfaces) and serving as
the transport/JSON-RPC/Zod/retry layer that the hosted-server direction reuses.
It is not the path to a full agent trace and is not documented as one.

### 3 · THE UNVERIFIABLE SURFACE

Everything below is **unverified**. It is implemented against a fake and cannot
be confirmed without a real MCP agent or a real hosted MCP server in hand. None
of it is surfaced in the UI as working.

1. **The `agent` tool convention.** The adapter assumes the target exposes an MCP
   tool that accepts a task (`agentTool`, default `"agent"`). MCP has no standard
   for this. **No real endpoint has been observed to honour it.** This is the
   single largest assumption in the adapter.
2. **Narration in practice.** Whether real targets emit
   `notifications/message` during a `tools/call`, and whether its payload is
   readable prose. Untested outside the fake.
3. **Authentication.** The adapter sends `Authorization: Bearer <key>`. The MCP
   spec's own auth is OAuth 2.1 (`WWW-Authenticate` + protected-resource
   metadata + token exchange). Bearer works for many hosted MCP servers, but the
   **spec flow is not implemented and not verified**; a real endpoint may answer
   401 with a challenge this adapter does not follow.
4. **Transport behaviour in the wild.** Session resumption via `Last-Event-ID`,
   long-lived stream reconnection, redirects, proxies that buffer SSE, servers
   that reject our `initialize` capability set, and real `MCP-Protocol-Version`
   negotiation failures. Verified only against a fake and a loopback
   `node:http` server.
5. **The legacy HTTP+SSE fallback.** Implemented and tested against a fake that
   behaves per the 2024-11-05 spec. **Never run against a real legacy server.**
6. **Timeouts.** The 15s per-request deadline is a guess. A real agent turn can
   run for minutes; the right value is unknown until measured.
7. **The product hypothesis itself.** Whether a real agent, connected to a
   MCPwn-hosted poisoned MCP server, actually takes the bait, and whether the
   resulting trace is rich enough for the judge to anchor a `stepId`. This is the
   thing the whole tool rests on and it has **never been observed once**.
8. **`task_complete` inference.** In direction B this is inferred from session
   close. The inference rule is unwritten and unmeasured.

### 4 · Dependency decision: no `@modelcontextprotocol/sdk`

Not added. Reasons, in order of weight:

- The client surface we need is four methods (`initialize`,
  `notifications/initialized`, `tools/list`, `tools/call`). The SDK's value is
  mostly in the _server_ and stdio/session-management surfaces.
- We need **Zod validation of every inbound message with our own typed
  `McpTargetError`s** for a hostile-by-assumption endpoint. Wrapping the SDK's
  own error and validation model would add a translation layer, not remove one.
- The platform `fetch` + `ReadableStream` cover both transports; the whole
  transport is ~450 lines with no new runtime dependency, and it keeps the
  Vercel bundle and the `audit-ci` surface unchanged.

**This should be revisited if we build direction B.** Hosting a compliant MCP
_server_ (capability negotiation, session lifecycle, resources, prompts,
sampling) is materially more protocol surface than a four-method client, and the
SDK's server half would likely pay for itself there.

---

## The live-run pipeline as built

```
POST (server action)  /connect  launchLiveRun(input)
  1  authz            signed out            → NOT_SIGNED_IN      (before parsing)
  2  Zod              LiveRunRequestSchema  → INVALID_REQUEST
                      endpoint: https only, http for loopback, no user:pass@
  3  judge            resolveLiveDetector() → JUDGE_UNAVAILABLE  (today: always)
  4  cap              countRunsSince(user, now - windowHours)
                      used + categories > maxRuns → CAP_EXCEEDED
  5  run              runMatrix([model], attacks, { target, detect, targetLabel })
  6  persist          repository.saveRun(userId, runResult)  (owner-scoped, RLS)
```

Order is deliberate: authorization precedes parsing, and the cap precedes any
outbound network call (a capped account never even constructs the target).

**Per-account cap.** `LIVE_RUN_CAP` (default 20) runs per `LIVE_RUN_WINDOW_HOURS`
(default 24), env-only per 12-factor. A blank value is treated as unset, never as
`0`, so a blank Vercel variable cannot silently disable the gate. The unit is a
_persisted run_ (one per selected category), so a 7-category launch costs 7.

## BYOK key handling (security-critical)

| Rule                      | How it holds                                                                                                       | Test                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Server-side only          | The key exists in the server action and the target adapter. The client drops it from state once a run is accepted. | `ConnectScreen.launch.test.tsx`                                      |
| HTTPS only                | `ByokEndpointSchema` rejects `http:` except for loopback.                                                          | `endpoint.test.ts`, `live/run.test.ts`                               |
| No credentials in the URL | `https://user:pass@host` is rejected outright.                                                                     | `endpoint.test.ts`                                                   |
| Never logged              | Only `userId`, endpoint **origin**, categories and model reach the logger.                                         | `live/run.test.ts` asserts the key is absent from every emitted line |
| Never persisted           | `RunResult.target` is `endpointLabel(endpoint)` = the origin, so even `?token=…` cannot reach the row.             | `live/run.test.ts` scans the serialized rows                         |
| Never in an error message | Adapter errors are built from method names, status codes and the origin.                                           | `target.test.ts`                                                     |

## Files

```
src/harness/mcp/errors.ts      typed McpTargetError + codes
src/harness/mcp/endpoint.ts    BYOK endpoint validation + endpointLabel
src/harness/mcp/protocol.ts    JSON-RPC 2.0 + MCP schemas + SSE parser
src/harness/mcp/transport.ts   Streamable HTTP + legacy SSE, deadline, retries
src/harness/mcp/target.ts      HttpMcpTarget implements McpTargetPort
src/live/request.ts            LiveRunRequestSchema
src/live/judge.ts              resolveLiveDetector (null until Slice 2)
src/live/run.ts                startLiveRun
src/app/(hud)/connect/actions.ts   server action (thin wiring seam)
src/config/env.ts              getLiveRunCap
```

## What Slice 4 should do with this

1. **Build direction B**: a per-run MCPwn-hosted MCP server endpoint that serves
   the scenario's poisoned tools and seeded memory, and records every
   `tools/call` the connecting agent makes.
2. Decide and document the **task-injection** mechanism (published MCP prompt vs
   copy-paste vs a thin agent-side adapter).
3. Add a `task_complete` inference rule and label it as inferred.
4. Re-evaluate `@modelcontextprotocol/sdk` for the server half.
5. Until a real agent has been observed end to end, **no live-run result may be
   presented as a measured capability**, and no P/R number may be attached to it
   (the variant-count prerequisite in plan.md still stands separately).
