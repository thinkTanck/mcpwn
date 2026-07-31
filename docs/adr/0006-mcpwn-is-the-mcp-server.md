# 6. MCPwn is the MCP server; the user's agent connects to us

Date: 2026-07-31

## Status

Accepted. **Supersedes the BYOK framing** in
[the auth + persistence design](../superpowers/specs/2026-07-23-auth-persistence-design.md)
and in the direction-A half of
[the BYOK live-target design + spike](../superpowers/specs/2026-07-27-byok-live-target-design.md).
The retired model is described below only so the reversal is legible; it is not a
thing we are still weighing.

## Context

### The model we started with, and shipped docs for

"Bring your own MCP agent" was read as: **the user hands us their agent's
endpoint and key, and MCPwn calls it.** That is what CLAUDE.md, plan.md, the
README and the `/connect` screen all described, and it is what the Slice 3
adapter was built against.

### Why it cannot work

Attacks are staged through the tool surface. **You cannot poison what you do not
serve.** Most of the Core-7 IS a poisoned tool surface:

| Category                        | What staging it requires                              |
| ------------------------------- | ----------------------------------------------------- |
| ASI01 Agent Goal Hijack         | a malicious **tool result** the agent ingests as data |
| ASI02 Tool Misuse               | an **over-broad tool** we expose to the agent         |
| ASI04 Supply Chain              | a **poisoned tool description** in the listing        |
| ASI05 Unexpected Code Execution | an **exec-shaped tool** carrying an injected command  |
| ASI06 Memory Poisoning          | **memory content** we seed and the agent reads back   |

Calling the user's endpoint, we control none of those. We can send a task and
read a reply; we cannot decide what the agent reads on the way. So from the
outbound direction **ASI01/02/04/05/06 are unstageable** — that direction can
only fuzz the user's MCP _server_, never red-team their _agent_.

### The contract had already said so

`src/contract/attack.ts` describes `Environment` in server-side verbs, and has
since it was written:

- `tools` — "MCP tool names **exposed to** the agent". Exposing tools is what a
  server does; a client consumes them.
- `memory` — "**Seed** memory state". Seeding presupposes we hold the store. If
  memory lived inside the user's agent we could neither seed nor read it, and
  `memory_read` / `memory_write` would be unreachable step types by construction.

The data contract was right and the prose around it was wrong.

### What forced the issue

The Slice 3 spike ([PR #80](https://github.com/thinkTanck/mcpwn/pull/80)) set out
to build the outbound adapter and answer "can we observe a real black-box agent's
steps?". It concluded no — with the table above — and flagged that the honest
architecture is the inverse. This ADR accepts that conclusion.

## Decision

**MCPwn is the MCP server. The user points their agent at us.**

Per run, MCPwn hosts an MCP endpoint that serves the attack's `Environment`: the
Core-7 tools (some deliberately over-broad or mis-described), seeded memory
exposed as tools, and prompts. The user's agent connects **to that endpoint**
with a per-run token. Every `tools/call` the agent chooses to make arrives at our
server, with its arguments, and is recorded into the `Trace`.

**`Scenario.taskGoal` is delivered OUT OF BAND.** MCP has no server-to-agent
"here is your goal" message. Preferred mechanism: a **published MCP prompt** the
agent can fetch from our endpoint. Fallback: the user pastes the goal into their
agent. That choice is the one remaining implementation detail of the Connect
spec, not an open question about the model.

### What is observable, honestly

| Step type                      | As the server                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attacker`                     | Yes — we author the poisoned tool result / description / memory                                                                                                                                                         |
| `tool_call`                    | Yes, **and it is the agent's own decision**, with arguments. This is the signal red-teaming needs                                                                                                                       |
| `tool_result`                  | Yes — we author it; this is where the attack lives                                                                                                                                                                      |
| `memory_read` / `memory_write` | Yes, when memory is a tool we host over `Environment.memory`                                                                                                                                                            |
| `task_complete`                | **Inferred**, not observed. MCP has no "agent finished" message; it comes from session close or an explicit end-of-task tool, and is labelled inferred                                                                  |
| `agent_reasoning`              | **No.** Nothing in MCP carries an agent's chain of thought to a server. `sampling/createMessage` is the server driving the client's model, not the agent narrating itself; mapping it to reasoning would be fabrication |

`agent_reasoning` being unobservable is a real constraint on the detector's
evidence, not a temporary gap. The judge reasons from actions, not from
introspection.

## Consequences

**Security model inverts.** We no longer hold the user's agent credentials,
because we never call their agent. There is nothing of theirs to leak. What
replaces it: we **authenticate the incoming connection** with a per-run,
per-account token, over HTTPS, used server-side, never logged, never persisted in
plaintext. The operator-provided judge stays **LOCKED** and never user-swappable.

**Connect UX changes.** It stops collecting an endpoint and a key. It issues a
per-run MCP endpoint plus token, shows how to point an agent at it, states how
the task goal is delivered, and waits for the agent to connect. Specified in
[the Connect design](../superpowers/specs/2026-07-31-connect-inverted-design.md).

**Slice 3 is rescoped.** The outbound HTTP adapter built in PR #80 is not the
path to an agent trace and is not documented as one. It keeps a narrower, real
job: probing a target MCP _server_ (the ASI02 / ASI05 surfaces) and providing the
transport / JSON-RPC / Zod / retry layer the hosted server reuses.

**A dependency decision reopens.** PR #80 justified not adding
`@modelcontextprotocol/sdk` for four client methods. Hosting a _spec-compliant
server_ is materially more protocol surface, so that decision is explicitly
reopened rather than inherited.

**Negative / costs.** Work built against the retired direction is partly
superseded. The user has to point an agent at us, which is a heavier first step
than pasting an endpoint. And the whole model rests on a hypothesis **not yet
observed once**: that a real agent, connected to a poisoned MCPwn endpoint, takes
the bait and produces a trace rich enough for the judge to anchor a `stepId`.
That is the thing to test first, not last.

## Alternatives considered

- **Keep the outbound model.** Rejected on the table above: five of seven
  categories cannot be staged, so the product would test something other than
  what it claims.
- **Require an agent-side shim** that reports steps to us. Rejected as the
  primary model: it demands the user install our code inside their agent, which
  is a far higher bar than pointing at an endpoint, and it makes the trace
  self-reported rather than observed.
- **Wait for MCP to grow agent-observability.** Rejected: no such capability is
  specified, and the server direction already yields the signal that matters, the
  agent's own tool calls.
