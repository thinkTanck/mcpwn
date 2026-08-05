-- MCPwn — per-run, per-account connection tokens (ADR-0006)
--
-- The credential that authenticates the INCOMING agent connection to the MCP
-- endpoint we host. See src/runs/run-token.ts for the format, the hash choice and
-- the two expiry axes; this file is only the shape that module lands on.
--
-- WHAT IS AND IS NOT STORED. `verifier_hash` is a SHA-256 digest of the token's
-- secret half, so a dump of this table yields nothing that can be presented at
-- the endpoint. `selector` is in the clear ON PURPOSE: it is the lookup key, it
-- is unique-but-not-secret, and on its own it authenticates nothing. The
-- plaintext token exists exactly once, in the response to the issuing request.
--
-- DENY BY DEFAULT. RLS is enabled with ZERO policies, which is not an oversight:
-- no browser session should ever read this table, not even its owner's, because
-- verification happens server-side and a token that can be re-read from storage
-- is a token that can leak twice. Only code holding the service-role key (which
-- bypasses RLS) reaches these rows. The `revoke` below removes the grant as well,
-- so the table is closed at both layers rather than only at the policy layer.
--
-- Apply with `npm run db:push` (or the SQL editor). Idempotent, like 0001.

create table if not exists public.run_tokens (
  -- 16 random bytes as hex. Lookup key, not a secret.
  selector      text        primary key,
  -- sha256(verifier), hex. The verifier itself is never written anywhere.
  verifier_hash text        not null,
  -- Which digest produced verifier_hash, so a future rotation is a migration
  -- rather than a guess about what old rows contain.
  algorithm     text        not null default 'sha256',
  -- The ONE run this token opens.
  --
  -- Deliberately NOT a foreign key to public.runs: that table holds finished
  -- RunResults, and a token is issued at CONNECT time, before any run row can
  -- exist. It is `text` for the same reason the TypeScript treats it as an opaque
  -- string — the run identifier's final shape belongs to the unbuilt run
  -- lifecycle (plan.md B2), and committing this table to a type that slice does
  -- not yet own would be inventing its design. When that lifecycle lands with its
  -- own table, this becomes a uuid FK with `on delete cascade`, which is also the
  -- cheapest possible "the token expires with the run".
  run_id        text        not null,
  -- The ONE account it belongs to. This FK is real today.
  user_id       uuid        not null references auth.users (id) on delete cascade,
  issued_at     timestamptz not null default now(),
  -- Expiry axis 2: the wall clock, so an abandoned run leaves no live token.
  expires_at    timestamptz not null,
  -- Expiry axis 1: the run ended. Null while the run is open; once stamped the
  -- token is dead regardless of the clock.
  ended_at      timestamptz,
  constraint run_tokens_expires_after_issue check (expires_at > issued_at)
);

-- Powers "expire every token of this run" (axis 1) and the per-run sweep.
create index if not exists run_tokens_run_idx
  on public.run_tokens (run_id);

-- Powers the wall-clock sweep that deletes rows no verification can ever accept.
create index if not exists run_tokens_expires_idx
  on public.run_tokens (expires_at);

alter table public.run_tokens enable row level security;

-- No policies, on purpose (see the header). With RLS on and no policy, anon and
-- authenticated roles can read, write and delete exactly nothing.
revoke all on public.run_tokens from anon, authenticated;
