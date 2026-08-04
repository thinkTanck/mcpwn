# 7. Public access, with a per-account lifetime free allowance

Date: 2026-07-31

## Status

Accepted (the model). **Not yet implemented** — see "Implementation status"
below, which is the part to read before quoting any number back at a user.

## Context

MCPwn is public: anyone can sign up, with **no invite and no waitlist**. That is
a deliberate product choice — a red-teaming tool nobody can try is a claim, not a
tool — and it puts the operator's model spend on the open internet.

The spend is asymmetric. **Sample playback costs nothing**: it replays
builder-constructed traces with curated verdicts, needs no sign-in, and touches
no model. **A live run costs money**, because the operator-provided judge is
operator-paid. The user brings their own agent and pays its inference; they do
not pay for the judge, and they never supply a judge key
(see the LOCKED judge, below).

So the question is not "how do we stop abuse" but "how does a public tool bound
operator spend **fairly**, without a gate that defeats the point of being
public".

### Why a global spend cap alone is not enough

A single global budget is necessary but insufficient: it says nothing about
_whose_ runs consume it. One enthusiastic user — or one script — can exhaust the
shared pool in an afternoon, and every later visitor meets a dead tool through no
fault of their own. A global cap bounds the bill; it does not distribute the
resource.

### Why a daily/rolling per-account cap is the wrong shape here

A rolling window (say N runs per 24h) bounds the _rate_ but not the _total_: a
determined account simply returns tomorrow, and the operator's lifetime exposure
per user is unbounded. For a free tier whose purpose is "let people evaluate the
tool", the honest bound is a **total**, not a rate. Evaluating MCPwn does not
require a run every day; it requires a handful of runs, once.

## Decision

**Public sign-up, sample open to all, and a per-account LIFETIME free allowance
as the primary cost control.**

1. **Public.** No invite, no waitlist. Anyone can sign up.
2. **Sample / demo mode:** open, **no sign-in**, zero API cost. The tool proves
   itself before anyone authenticates.
3. **Live runs** require **email-OTP sign-in** _and_ consume the account's
   **lifetime free allowance**. The default is **~3 runs per account, total —
   not per day.** No single user can drain the shared pool, because each
   account's total draw is bounded at creation.
4. **The allowance number is a TUNABLE DEFAULT**, not a product promise. It is
   env-configured and expected to move with observed judge cost. Docs and UI
   should describe it as "a small free allowance" and read the configured value
   rather than hardcoding a numeral.
5. **The judge stays operator-provided and LOCKED.** Users do not bring their own
   judge key. This is not a cost decision — it is the measurement decision from
   the product's core claim: measured accuracy only holds for the validated judge
   config, so a user-swapped judge would invalidate the number the product sells.
   It does mean the operator eats the judge cost, which is why the allowance
   exists.

### Abuse backstops (defence in depth, not the primary control)

- **Email-OTP sign-in** — an account requires a deliverable, verified address, so
  the allowance cannot be reset by minting throwaway accounts at zero effort.
- **Sign-up rate limiting** — bounds automated account creation.
- **A global Anthropic spend cap** — when hit, live runs **pause gracefully**
  rather than failing raggedly or overspending. The existing fail-safe already
  has the right shape: `resolveLiveDetector()` returning `null` makes
  `startLiveRun` refuse with a typed `JUDGE_UNAVAILABLE` outcome, and the UI says
  live runs are unavailable instead of pretending. A budget stop reuses that
  path.

### Future, explicitly not built

An optional **paid tier** for runs beyond the free allowance. Recorded so the
allowance is understood as the free-tier boundary rather than a permanent
ceiling. Nothing about it is designed, priced, or built.

## Implementation status — read this before quoting a number

**Today, on `main`, NO per-account cap is enforced.** `countRunsSince(userId,
since)` exists on the repository port and its Supabase adapter, and **has no
caller**.

**PR #80, unmerged, implements a DIFFERENT model**: `LIVE_RUN_CAP` (default 20)
per `LIVE_RUN_WINDOW_HOURS` (default 24) — a rolling window, which this ADR
supersedes. Reconciling it means:

- treating the allowance as a **total**, i.e. counting from account creation
  rather than from a rolling window boundary (the existing `countRunsSince`
  primitive supports this by counting from the epoch; the semantics and the
  config change, not the query shape);
- replacing the windowed env pair with a single lifetime allowance value;
- defaulting it to ~3 rather than 20.

Until that lands, **no UI copy or document may state a specific number of free
runs**, because the app would not honour it. `SignInPanel` currently says "a
small free-run cap", which is vague but not false, and should stay vague until
the enforcement matches.

### Update — the reconciliation landed as logic, not yet as enforcement

`checkLiveRunAllowance()` (`src/runs/allowance.ts`) is the caller
`countRunsSince` never had. It does all three reconciliations above: it counts
from **account creation** (an absent or unparseable instant falls back to the
epoch, which can only over-count), it reads a single lifetime value
`LIVE_RUN_ALLOWANCE` (env-only, **default 3**, `0` turns free live runs off), and
the windowed `LIVE_RUN_CAP` / `LIVE_RUN_WINDOW_HOURS` pair is gone.
`describeLiveRunAllowance()` is the one place that number becomes words, so the
copy and the enforcement cannot drift. Over-cap returns a decision carrying a
typed `LiveRunAllowanceError` (`ALLOWANCE_EXHAUSTED`) whose message is already
printable, rather than throwing.

**It has no production caller.** The live-run entry point it guards does not
exist yet — under [ADR-0006](0006-mcpwn-is-the-mcp-server.md) a live run means an
agent connecting to an MCP server we host, and that server is unbuilt. The
integration point is documented at the top of the module. **So the paragraph
above still binds: no UI copy may state a free-run count**, because nothing is
gated yet. Once the entry point calls this, copy may state the number only by
deriving it from `describeLiveRunAllowance()`.

## Consequences

**Positive**

- The tool stays genuinely public — the thing that makes it evaluable — while
  per-user spend is bounded at account level, so one heavy user cannot starve
  everyone else.
- Sample mode carries the demo load at zero marginal cost, so the free allowance
  is spent only on runs that actually exercise the product.
- The failure mode when the global cap is reached is already designed and honest:
  refuse and say so.

**Negative / costs**

- A lifetime allowance is **unfriendly to legitimate repeat evaluation** — a
  returning user who wants to re-test after fixing their agent has no free path
  once exhausted. That is precisely the gap the future paid tier would fill, and
  until it exists the answer to such a user is "ask the operator".
- Lifetime counting makes account creation the attack surface, which is why the
  email-verification and sign-up rate-limit backstops are load-bearing rather
  than decorative.
- Bearing the judge cost is a real operator liability that scales with adoption.

## Alternatives considered

- **Global spend cap only.** Rejected: bounds the bill, not the distribution. The
  first heavy user closes the tool for everyone.
- **Rolling per-account cap (N/day).** Rejected as the primary control: bounds
  rate, not total, so lifetime per-user exposure is unbounded. It remains a
  reasonable _addition_ if burst behaviour becomes a problem.
- **Invite list / waitlist.** Rejected: it would bound cost neatly and defeat the
  purpose. A security tool that reviewers cannot try is not evaluable, and
  evaluability is the product's whole argument.
- **Users bring their own judge key.** Rejected on measurement grounds, not cost:
  the accuracy claim only holds for the validated judge config, so a swapped
  judge would silently invalidate the number the product is built to sell.
