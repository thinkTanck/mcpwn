-- MCPwn — user-owned live runs (Slice 1, increment 3)
--
-- One row per (agent × attack-category) live run. The full observable RunResult
-- is stored as JSONB — it holds only observable data (trace + verdict + labels),
-- NEVER the user's BYOK agent key. Ownership is enforced by Row-Level Security:
-- a user can only ever see/insert/delete their OWN runs (auth.uid()).
--
-- Apply once to your Supabase project (SQL editor, or `supabase db push`).

create extension if not exists pgcrypto;

create table if not exists public.runs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  run        jsonb       not null
);

-- Owner + recency: powers "your runs, newest first" and the per-account cap count.
create index if not exists runs_user_created_idx
  on public.runs (user_id, created_at desc);

alter table public.runs enable row level security;

-- Owner-only. Runs are immutable once written (no UPDATE policy by design).
create policy runs_select_own on public.runs
  for select using (user_id = auth.uid());

create policy runs_insert_own on public.runs
  for insert with check (user_id = auth.uid());

create policy runs_delete_own on public.runs
  for delete using (user_id = auth.uid());
