-- MCPwn — the three stores that had to stop living in one process
--
-- WHY THIS MIGRATION EXISTS. Three pieces of state were process-local, which is
-- fine on one long-lived server and a correctness bug on serverless:
--
--   * the OPEN-RUN REGISTRY — a run started on one instance was invisible to the
--     next, so the hosted MCP endpoint refused valid connections at random,
--     depending only on where the platform routed the agent's next request;
--   * the OTP RATE-LIMIT COUNTERS — the effective limit was the constant in the
--     code TIMES however many instances were warm, so the limit in the source was
--     not the limit the internet met;
--   * the RUN TOKENS, whose table (0002) already existed and is REUSED here, not
--     redefined. Nothing in this file touches public.run_tokens.
--
-- SECURITY POSTURE — IDENTICAL TO 0002, ON PURPOSE. Every table below has RLS
-- enabled with ZERO policies AND an explicit revoke from anon and authenticated,
-- so it is closed at both the grant layer and the policy layer. Only server-side
-- code holding the service-role key (which bypasses RLS) reaches these rows.
-- That is not caution for its own sake:
--
--   * a browser session must never read the open-run registry, because a run's
--     framing (malicious vs benign) is exactly the held-out label the detector is
--     never shown, and the trace it holds belongs to the run pipeline, not a page;
--   * the rate-limit counters are an abuse control, and a control any client can
--     read is a control any client can time.
--
-- NO PLAINTEXT SECRET IS STORED ANYWHERE HERE. The rate-limit bucket is a SALTED
-- DIGEST of the address or source computed in the application, so this table
-- never holds an email address; the salt is derived from the service-role key and
-- is deliberately NOT kept in the database, so a dump of these rows reverses
-- nothing. The run-token table (0002) stores a digest of the token's secret half
-- and never the token.
--
-- EXPIRY. Each store enforces it where the failure mode is least bad, and the
-- reasoning is written at each table below. Nothing here depends on a scheduled
-- job being alive.
--
-- Apply with `npm run db:push` (or the SQL editor). Idempotent, like 0001/0002.

-- ── The open-run registry ───────────────────────────────────────────────────
--
-- One row per hosted run. It holds identity and framing, NOT a credential:
-- reaching the run still requires the per-run token in public.run_tokens, which
-- expires with the run and on its own wall clock. Holding this row lets nobody
-- connect to anything.
--
-- EXPIRY IS SWEPT, NOT FILTERED. Because the row is not a credential, filtering
-- expired rows out of the lookup would add no security and would take something
-- away: a user who worked the whole token TTL and then asked to finish would find
-- the run unresolvable and lose the verdict for work already done. So expires_at
-- (the token's expiry plus a day of grace) exists to bound the table, and the
-- delete cascades the event rows with it.

create table if not exists public.live_runs (
  -- The run. Text rather than uuid for the same reason run_tokens.run_id is:
  -- the run identifier's final shape belongs to the run lifecycle, not here.
  run_id      text        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- Which Core-7 scenario we served, and which framing. The framing is the
  -- held-out label, which is precisely why no browser role can read this table.
  category    text        not null,
  kind        text        not null,
  -- Pinned model label, or null to use whatever the connecting client claimed.
  model       text,
  -- The client's own claim from initialize. Unverified by us, and null until seen.
  client      text,
  -- What the recorder stamps as Trace.target. Category-free and project-free.
  target      text        not null,
  started_at  timestamptz not null default now(),
  -- Hygiene bound, not access control. See the note above.
  expires_at  timestamptz not null,
  -- Stamped by the one caller that wins the finish claim. Null while open.
  finished_at timestamptz,
  constraint live_runs_expires_after_start check (expires_at > started_at)
);

-- Powers the hygiene sweep.
create index if not exists live_runs_expires_idx
  on public.live_runs (expires_at);

-- Powers "this account's runs".
create index if not exists live_runs_user_idx
  on public.live_runs (user_id);

alter table public.live_runs enable row level security;

-- No policies, on purpose (see the header). With RLS on and no policy, anon and
-- authenticated can read, write and delete exactly nothing.
revoke all on public.live_runs from anon, authenticated;

-- ── The observable steps of an open run ─────────────────────────────────────
--
-- One row per observable step, so appending is an insert rather than a
-- read-modify-write of a jsonb array. That matters for correctness, not tidiness:
-- two instances appending to one array would lose each other's writes, and a
-- resolvable run whose trace is silently missing steps is worse than a refused
-- one. The (run_id, idx) primary key is what makes a RETRIED append idempotent —
-- it lands on its own row instead of inventing a step the agent never took.
--
-- The rows are observable-only by construction: they are the same TargetStepEvent
-- values the recorder assembles a Trace from, carrying no label and no ground
-- truth. The leakage barrier is unaffected, because nothing here is ever shown to
-- the judge except through the same judgeableTrace() allow-list as before.

create table if not exists public.live_run_events (
  run_id text   not null references public.live_runs (run_id) on delete cascade,
  -- Position in the run. The identity of the step, and the reason a replay is safe.
  idx    int    not null,
  event  jsonb  not null,
  primary key (run_id, idx),
  constraint live_run_events_idx_non_negative check (idx >= 0)
);

alter table public.live_run_events enable row level security;

revoke all on public.live_run_events from anon, authenticated;

-- ── The OTP rate-limit counters ─────────────────────────────────────────────
--
-- One row per send attempt. `bucket` is a SALTED DIGEST computed in the
-- application (src/lib/auth/otp-rate-limit.ts): this table never sees an email
-- address or a source address, so a dump of it can say how many attempts a bucket
-- made and never whose. The salt is derived from the service-role key rather than
-- stored beside these rows, precisely so one dump cannot carry both halves.
--
-- EXPIRY IS ENFORCED BY THE QUERY PREDICATE. The count is
-- `where bucket = $1 and hit_at >= $2`, so the window drains on EVERY READ,
-- whether or not anything ever deleted a row. That is the property this control
-- needs: a sweep that stalls would otherwise turn a rate limit into a permanent
-- lockout for a real user, and a sweep that ran early would let a spent window
-- count again.
--
-- expires_at is hit_at plus the LONGEST window any bucket uses, so a swept row is
-- one no bucket could have counted. The sweep bounds the table and nothing else.

create table if not exists public.otp_rate_limit_hits (
  id         bigserial   primary key,
  -- A salted sha-256 digest, scope-prefixed. Never an address.
  bucket     text        not null,
  hit_at     timestamptz not null,
  -- hit_at + the longest window. Only the sweep reads this.
  expires_at timestamptz not null
);

-- Powers the counting predicate: one bucket, newest hits first.
create index if not exists otp_rate_limit_hits_bucket_idx
  on public.otp_rate_limit_hits (bucket, hit_at desc);

-- Powers the hygiene sweep.
create index if not exists otp_rate_limit_hits_expires_idx
  on public.otp_rate_limit_hits (expires_at);

alter table public.otp_rate_limit_hits enable row level security;

revoke all on public.otp_rate_limit_hits from anon, authenticated;

-- ── Scheduling the sweeps (optional, and only ever hygiene) ─────────────────
--
-- Nothing above depends on these running. If they never run, the tables get large
-- and NOTHING becomes reachable that was not reachable already: an expired token
-- is refused by verifyRunToken, an old rate-limit row falls outside the counting
-- predicate, and a stale session row still needs a live token to reach. Schedule
-- them when table size starts to matter, with pg_cron enabled:
--
--   select cron.schedule('mcpwn-sweep-run-tokens', '17 * * * *',
--     $$delete from public.run_tokens where expires_at <= now()$$);
--   select cron.schedule('mcpwn-sweep-live-runs', '23 * * * *',
--     $$delete from public.live_runs where expires_at <= now()$$);
--   select cron.schedule('mcpwn-sweep-otp-hits', '31 * * * *',
--     $$delete from public.otp_rate_limit_hits where expires_at <= now()$$);
--
-- They are written here rather than executed because pg_cron is a project-level
-- extension an operator enables deliberately, and a migration that turns one on
-- would be making that call for them. The same deletes are also available from
-- the application as sweepExpired() on each durable adapter.
