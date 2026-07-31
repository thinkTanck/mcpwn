# Connect / Slice 3 — design under the inverted model

Date: 2026-07-31. Status: approved shape; implementation not started.

Governed by [ADR-0006](../../adr/0006-mcpwn-is-the-mcp-server.md): **MCPwn is the
MCP server; the user's agent connects to us.** This supersedes the Connect UX
described in the earlier BYOK material, which collected an agent endpoint and key.

## What changes for the user

**Before (retired):** paste your agent's endpoint and API key; we call it.

**Now:** we hand you a per-run MCP endpoint and a token. You point your agent at
it and give it the task goal. We serve the trap, watch what your agent does, and
judge the trace.

The thing being tested is unchanged: **your agent, against the Core-7**. What
changed is which side of the wire we sit on, and therefore what we can stage at
all.

## Screen shape

Two modes, as before.

**Sample mode** is untouched: a no-key curated run, `Watch the sample run`.

**Live mode** becomes a four-part panel, in order:

1. **Pick categories.** Core-7 selection, unchanged.
2. **Your run endpoint.** Issued on demand, not typed: a per-run MCP URL plus a
   per-run token, each with a copy control. Shown once the run is provisioned.
   Copy states plainly that the endpoint serves deliberately hostile tools.
3. **Deliver the task goal.** The mechanism (see below) with exact, copyable
   text.
4. **Connection status.** Waiting / connected / running / complete, driven by
   what the server actually sees. Until an agent connects there is nothing to
   show, and the panel says so rather than implying progress.

The detector stays displayed **BLIND · LOCKED**, unchanged and never
user-swappable.

**Removed:** the endpoint field, the API-key field, and the "Used server-side
only, never stored" note that described handling a credential we no longer take.

## Task goal delivery

MCP has no server-to-agent "here is your goal" message, so `Scenario.taskGoal`
travels out of band. **This is the one open implementation detail; the model
itself is decided.**

- **Preferred — a published MCP prompt.** Our server exposes the goal via the
  MCP `prompts` capability, so a client that supports prompts can fetch it from
  the same endpoint it already connected to. No copy-paste, and the goal arrives
  through the protocol.
- **Fallback — paste.** We display the goal and the user pastes it into their
  agent. Always available, because prompt support is not universal.

The UI should offer the prompt route first and the paste text always, since we
cannot detect client capabilities before connection.

## Security model

Inverted from the retired design, and simpler.

**We no longer hold the user's agent credentials.** We never call their agent, so
there is nothing of theirs to store, log, or leak. The previous "BYOK key
handling" requirements do not apply because the key does not exist.

What replaces them:

- **We authenticate the INCOMING connection.** Each run issues a per-run,
  per-account token. The MCP endpoint rejects an unauthenticated or wrong-run
  connection.
- The token is **used server-side, transported over HTTPS, never logged, and
  never persisted in plaintext** — the same discipline, applied to a token we
  issue rather than one we receive.
- Tokens are **scoped to one run** and expire with it, so a leaked token exposes
  one sandboxed run of deliberately fake data, not an account.
- **Per-account caps** still gate live runs, unchanged.
- The operator-provided judge stays **LOCKED**.

**Worth stating plainly:** we are inviting a stranger's agent to connect to an
endpoint we run. That is inbound attack surface, and the tools we serve are
hostile _by design_. Everything the endpoint serves is fabricated attack content
in a sandbox; no real system sits behind it.

## What is observable

Per ADR-0006: `attacker`, `tool_call` (the agent's own decision, with
arguments — the signal that matters), `tool_result`, and `memory_read` /
`memory_write` when memory is a hosted tool. `task_complete` is **inferred** from
session close or an explicit end-of-task tool and must be labelled inferred.
**`agent_reasoning` is not observable** and must never be synthesized.

The replay screen therefore renders fewer `agent_reasoning` nodes for a live run
than the sample traces show. That is a real difference between a constructed
fixture and a live capture, and the UI should not paper over it.

## Salvage from the retired outbound pipeline

The outbound live-run pipeline was removed from `main` when Slice 3 was re-scoped
to [ADR-0006](../../adr/0006-mcpwn-is-the-mcp-server.md). It is preserved in full,
with history, on **`archive/outbound-pipeline`** (tip `8e72ff0`). Nothing is lost;
this section says what to lift from it when the inverted pipeline is built, so the
next person does not re-derive it or, worse, re-derive it worse.

### Salvageable — direction-agnostic, lift these

| From the archive                                                                                                                                                                | Why it still applies                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Typed outcome union, never a throw for an expected failure** — `NOT_SIGNED_IN`, `INVALID_REQUEST`, `JUDGE_UNAVAILABLE`, `CAP_EXCEEDED`, `TARGET_FAILED`, `PERSISTENCE_FAILED` | Every code still names a real refusal inbound. `TARGET_FAILED` just becomes "the agent never connected / the session died".                                                                                  |
| **Authz FIRST, before the payload is parsed**                                                                                                                                   | A signed-out caller must be refused before we spend anything. Identical need.                                                                                                                                |
| **`JUDGE_UNAVAILABLE` fail-safe** — refuse rather than judge with something unvalidated                                                                                         | The single most reusable piece. [ADR-0007](../../adr/0007-access-and-cost-model.md) explicitly reuses this path for the global spend cap.                                                                    |
| **Cap checked BEFORE the target is constructed** — "does not run the target at all once the cap is reached"                                                                     | Check before spending is the whole point of a cost control. The _window_ semantics are superseded (ADR-0007 makes it a lifetime allowance), but the call-site ordering carries over exactly.                 |
| **Owner-scoped persistence through `RunRepository`** — one row per category, RLS at the database, returning ids `/runs/[id]` resolves                                           | Untouched by direction.                                                                                                                                                                                      |
| **`PERSISTENCE_FAILED` rather than throwing** on a failed save                                                                                                                  | Untouched by direction.                                                                                                                                                                                      |
| **`z.strictObject` on the request** so an injected field (e.g. `judge`) is rejected                                                                                             | Untouched by direction, and the strictness is the point.                                                                                                                                                     |
| **The three secret-handling assertions** — the credential never reaches a persisted row, never reaches the logger, never reaches a rejection message                            | The _secret changes identity_ (the per-run token we ISSUE, not a key they gave us) but all three assertions transfer verbatim in shape. They were **verified by mutation**, which is the part worth copying. |
| **Persist an ORIGIN, never a full URL**                                                                                                                                         | Generalises to any URL we ever store: a token pasted into a query string cannot reach the database.                                                                                                          |

### Genuinely retired — do not lift

| From the archive                                                                           | Why it is dead                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTarget({ endpoint, apiKey })`                                                       | We never call their agent. There is no endpoint or key to take.                                                                                                                               |
| Endpoint validation: HTTPS-only, no embedded credentials, `http://localhost` dev exception | These validate a **user-supplied** endpoint. Inbound, the inverse problem replaces it: authenticating a token **we issued** on a connection **we received**. Same discipline, different code. |
| "hands the key only to the target adapter"                                                 | No key, no adapter to hand it to.                                                                                                                                                             |
| `LIVE_RUN_CAP` / `LIVE_RUN_WINDOW_HOURS` rolling window                                    | Superseded by ADR-0007's per-account lifetime allowance.                                                                                                                                      |
| The Connect form that collected an endpoint and a key                                      | Replaced by issuing an endpoint and token; see the screen shape above.                                                                                                                        |

### The shared transport

`src/harness/mcp/` **stayed on `main`** and is not part of the archive. For the
inverted pipeline the reusable parts are the JSON-RPC envelope schemas, the Zod
validate-everything-inbound discipline, the typed error taxonomy, deadlines and
bounded retries. The **request/response direction is not reusable**: that code is
a client, and serving is not the mirror image of calling. Server-side dispatch is
new work.

## What Slice 3 already has, and what it does not

**Keeps its job** (from PR #80): the transport / JSON-RPC / Zod / bounded-retry
layer, and the outbound client narrowed to probing a target MCP _server_ (ASI02 /
ASI05 surfaces). The live-run pipeline's authz, Zod validation, per-account cap
and owner-scoped persistence are direction-agnostic and stand.

**Does not have:** an MCP _server_ implementation. That is the new work.

**Reopened:** whether to take `@modelcontextprotocol/sdk`. PR #80 justified
avoiding it for four client methods; hosting a spec-compliant server is
materially more protocol surface, so the decision is made fresh rather than
inherited.

## Unverified, and it is the important part

**No agent has ever connected to a MCPwn-hosted endpoint.** The product
hypothesis — that a real agent, given a poisoned tool surface, takes the bait and
leaves a trace the judge can anchor a `stepId` in — **has not been observed once.**

That is the first thing to test, before UI polish. A minimal endpoint serving one
category to one real agent answers more than any amount of specification.

The judge also remains unwired (Slice 2b, blocked on the operator's model key),
so even a successful connection cannot yet produce a verdict.
