# 12. Abandoned runs are completed, not discarded

Date: 2026-08-05

## Status

Accepted. Built as `src/runs/reaper.ts` and `/api/cron/reap-runs`. **The schedule
is declared and deploys with the app; the route stays unarmed until an operator
sets `CRON_SECRET`** — see "What is running, and what still needs an operator",
which is the part to read before assuming anything is being reaped.

## Context

`END RUN AND JUDGE` on `/connect` was the only path that finished a run
([L23](../../plan.md)). A user who closed the tab left the run open, and three
things followed.

**1. The endpoint stayed answerable, but not for long.** The per-run token
expires on two axes (`src/runs/run-token.ts`): the run ending, and a wall clock
defaulting to 60 minutes. An abandoned run never reaches the first, so the second
is the one that bites, and after it `verifyRunToken` refuses every further
connection. So this consequence was already bounded, and bounded tightly. What is
behind the endpoint is fabricated attack content in a sandboxed run, the agent
calling it is the user's own, and the inference it spends is the user's own.

**2. The registry row stayed forever.** `LiveRunSessionStore.sweepExpired` exists
for exactly this and **had no caller anywhere in the app**. Nothing was scheduled,
so `live_runs` and `live_run_events` grew without bound. This is the consequence
that was genuinely unbounded, and it is worth naming plainly: the fix for it
needs a scheduler whether or not anything else changes.

**3. No verdict was produced, for work already paid for.** This is the one that
costs somebody something. The user brought their agent and paid its inference;
MCPwn's entire deliverable is the verdict, the anchored offending step and the
fix report, and abandoning the tab threw all of it away. There is also a quieter
effect: the per-account lifetime allowance counts rows in `runs`
([ADR-0007](0007-access-and-cost-model.md)), and a run that is never judged is
never stored, so it never counts. An account that starts runs and walks away
consumes hosted endpoints and registry rows without ever spending its allowance.

The decision was therefore not "should abandoned runs be bounded" — the token
already bounds them — but **what the job that has to run anyway should do when it
gets there**. Because the answer to consequence 2 is a scheduled sweep, and the
sweep as written **deletes the run and its recorded steps**. It destroys exactly
the evidence consequence 3 is about, and produces nothing.

## Decision

**A scheduled pass finishes abandoned runs before it drains them.** Same job,
same schedule, same cost as the sweep that was needed anyway; it judges first and
deletes second.

### 1. Stale means the window has passed, not that the run looks idle

A run is stale when it is **still open** and **`expiresAt` has passed**. That
value is already on the row: the token's wall-clock death plus
`LIVE_RUN_SESSION_GRACE_MS` of grace. The reaper introduces no TTL of its own and
has no knob.

Idle time since the last authenticated request is the more usual signal, and we
**rejected** it. Two reasons, the second being the real one:

- `lastSeenAt` lives in a `Map` inside whichever instance served that request
  (`src/app/api/mcp/host.ts`). A job running on another instance cannot read it,
  so idle detection would need a new durable column and a write on every inbound
  message.
- Idleness would only ever be a **guess** at abandonment, and past the token
  expiry there is nothing left to guess. The credential is dead, every further
  connection is refused, and the run is **provably incapable of recording another
  step**. A long, productive, briefly idle run is never at risk, because a run
  whose token is still alive is never stale. Adding the grace on top means the
  owner has had a full day past that point to finish it themselves.

### 2. It judges a run the agent worked, and closes one it did not

Judging costs a real judge call and spends one of the account's lifetime free
runs, on a run nobody asked to have judged. Closing without judging throws away
work the user paid for. Neither is right for both cases, so the evidence decides:

- **At least one `tool_call` in the recorded trace** — the agent turned up and
  did something. Judge it, and the user gets the verdict and fix report they paid
  inference for.
- **None** — nothing happened. There is no compromise to find and no category to
  be right about, so asking the judge would spend operator money and one of the
  user's free runs to buy an empty answer. Close it: claim it, revoke the token,
  store nothing, count nothing.

The principal instruction and the inferred completion are **ours**, not the
agent's, which is why the test is `tool_call` and not "the trace is non-empty".

### 3. It goes through the same gates, because it calls the same function

The judging path calls `LiveRunHost.finish()`, not a copy of it. So
`checkLiveRunPreflight` runs before the judge exactly as it does for a user
clicking the button: an allowance or spend-cap refusal stops the run, a gate that
throws is `GATE_UNAVAILABLE`, an unconfigured judge is `DETECTION_UNAVAILABLE`,
and all of them **fail closed** — the run ends unjudged and nothing is spent. A
background job that reached the judge around the cost controls would be a spend
control with a hole in it.

The gate is read with the **service-role** client, not a session, because a
scheduled request carries no cookie: the RLS-scoped client would count zero runs
for every account and pass silently.

### 4. Two instances cannot both finish one run

`finish()` and `abandon()` both claim the run through
`LiveRunSessionStore.finish` (`update ... where finished_at is null`), which
grants it exactly once. The loser meets `RUN_ALREADY_FINISHED` and counts it as
**contended**, which is an expected outcome and not an error.

### 5. The sweep runs last, and only over runs whose fate is known

Deleting the row deletes the steps with it, so the sweep happens after the
judging. If any run in the pass **threw**, the sweep is skipped for the whole pass
(`swept` is `null`): a throw leaves that run's state unknown, a run that failed
before its claim is still open and is retried next pass, and deleting it would
destroy an unjudged trace to save a table row. A returned **refusal** is
different — the run was claimed and is settled, permanently unjudged — so it does
not block the sweep.

### 6. The trigger is declared where the platform reads it

There is no scheduler in this app. `vercel.json` declares one cron entry calling
`/api/cron/reap-runs` daily, and the route is guarded by `CRON_SECRET`, presented
as a bearer credential and compared in constant time. **With nothing configured
the route refuses everyone, including the platform's own scheduler**, because a
maintenance job that asks the judge and writes into other people's accounts must
not be a public button.

## What is running, and what still needs an operator

**Built and tested:** the reaper, the `findStale` query on both store adapters,
`LiveRunHost.abandon()`, the cron route and its refusal, and the racing-reaper
case.

**Declared and deploying:** the daily cron entry in `vercel.json`.

**Needs an operator, and is NOT claimed to be working without it:**

1. **`CRON_SECRET` must be set** in the deployment environment. Until then every
   invocation is refused, by design. **STILL OUTSTANDING.**
2. ~~**Migration `0003_durable_stores.sql` must be applied**~~ — **DONE
   2026-08-06.** It had NOT been applied, and neither had `0002`: the project's
   `supabase_migrations.schema_migrations` held no rows at all, and only
   `public.runs` (applied by hand in the SQL editor) existed. `npm run db:push`
   applied `0001`, `0002` and `0003`, all of which are idempotent.
3. ~~**The interactive path must write to the durable registry.**~~ — **DONE
   2026-08-06.** `src/app/api/mcp/host.ts` now binds `tokens` and `sessions` to
   `getRunTokenStore()` / `getLiveRunSessionStore()`, so the reaper reads the
   registry the live path writes. The condition this item set for making the
   change — that the durable adapters had never run against the real project —
   was met first: `npm run verify:durable-stores` drives them against it and
   proves the token lifecycle, the two-instance case and a real abandoned row
   being found, closed and swept.

## Consequences

**Positive**

- The user gets the deliverable they paid inference for, even if they never came
  back for it. That is the product, and it was being discarded.
- The unbounded table is bounded, by the same pass, and the sweep no longer
  destroys evidence on its way through.
- Every run the account started eventually counts against its lifetime allowance
  instead of only the ones it politely finished, so ADR-0007's primary cost
  control measures runs rather than clicks.
- The reaper adds no gate, no clock and no refusal vocabulary of its own. It
  reuses `finish()`, so it cannot drift from the interactive path.

**Negative / costs**

- **An auto-judged run spends one of the account's lifetime free runs, and a
  lifetime allowance never refills.** A user who starts a run by mistake, closes
  the tab, and never connects an agent is safe (no tool call, so no judge call
  and no stored run). A user whose agent connected and did one thing before they
  gave up is not: they lose the free run and gain a real verdict for it. We take
  that side of the trade because the verdict is the thing they were owed, but it
  is a real cost and it is irreversible.
- **A refusal or a throw after the claim leaves the run permanently unjudged.**
  `finish()` claims before it gates, so a spend cap that trips at reap time closes
  the run with nothing to show. This is inherited from the interactive path rather
  than introduced — the same thing happens to a user whose gate refuses on END RUN
  — and it fails in the safe direction, but it means an outage during a pass
  costs those runs their verdicts.
- **Daily granularity.** A run is settled somewhere between 0 and 24 hours after
  its window closes, which is 24 to 48 hours after the agent's token died. Nobody
  is waiting on it, so the latency costs nothing; a finer schedule is a paid-plan
  decision, not a code change.
- **One more secret to manage.** `CRON_SECRET` is a shared value that authorizes a
  privileged job.

## Alternatives considered

- **Accept token expiry as the bound and document it.** The tempting answer,
  because the token bound is genuinely tight and already tested. Rejected on the
  registry: `sweepExpired` had no caller, so accepting the bound still leaves a
  table growing forever, and fixing that needs the same scheduler this decision
  needs. Once the job exists, "delete the trace" and "judge the trace, then delete
  it" cost the same to schedule and only one of them produces anything.
- **Idle time since `lastSeenAt`.** Rejected: not durable, and unnecessary past
  the token expiry (see Decision 1).
- **Close every stale run without judging.** Cheapest, and it fixes the table.
  Rejected because it makes the sweep an evidence shredder: the user still gets
  nothing for their inference, and abandoning a run stays a way to consume the
  service without consuming the allowance.
- **Judge every stale run.** Rejected: a run whose agent never called a tool has
  nothing for the judge to be right about, so this would spend operator money and
  a user's free run to record an empty answer.
- **Finish the run from the browser when the tab closes** (`beforeunload` /
  `sendBeacon`). Rejected: it is best-effort by construction, it does nothing for
  a crashed browser or a closed laptop, and it puts the trigger for a judge call
  on the client. It could still be added later as a courtesy; it is not a bound.
