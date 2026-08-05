# Supabase — database + migrations

The database schema lives in [`migrations/`](migrations/) and is the **single
source of truth**. On a clean clone, the whole schema is reproducible from these
files via the Supabase CLI — never hand-edited in the dashboard.

## One-time setup

1. **Install the Supabase CLI** (it is intentionally not an npm dependency, so CI
   stays lean): `scoop install supabase` / `brew install supabase/tap/supabase`
   / `npm i -g supabase` — see https://supabase.com/docs/guides/cli.
2. **Log in** (opens a browser): `supabase login`
3. **Link this repo to the project**: `npm run db:link`
   (runs `supabase link --project-ref ovsznqyynlxhrdnfywjx`; it prompts for the
   database password — the one in your `.env.local` `DATABASE_URL`).

## Everyday commands

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `npm run db:push`       | Apply every unapplied migration in `migrations/` to the linked project. |
| `npm run db:new <name>` | Scaffold a new timestamped migration file.                              |
| `npm run db:diff`       | Diff the linked DB against the local migrations.                        |

## Applying the current schema

```bash
npm run db:link      # once
npm run db:push      # applies 0001_runs.sql, 0002_run_tokens.sql (+ any later ones)
```

| Migration             | What it adds                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_runs.sql`       | `public.runs` — a user's finished live runs, owner-scoped by RLS.                                                                                                         |
| `0002_run_tokens.sql` | `public.run_tokens` — the per-run, per-account connection credential (ADR-0006). Stores a SHA-256 digest, never a token. RLS on with **zero policies**: server-side only. |

Both are idempotent (they use `if not exists` / `drop policy if exists`), so they
are safe whether first applied by hand in the SQL Editor or by `db push` — the CLI
records applied versions in `supabase_migrations.schema_migrations` and skips ones
already run.

`0002_run_tokens.sql` has **no application caller yet**: it is the store
`src/runs/run-token.ts` lands on, and the MCP server that will issue and verify
against it is unbuilt (plan.md B2). Applying it early is harmless (an empty,
closed table); leaving it unapplied until the server lands is equally fine.

## Conventions

- **Never edit schema in the dashboard.** Add a migration (`npm run db:new`),
  commit it, and `db push`.
- Migrations are **forward-only** and should be **idempotent** where practical.
- Secrets (`.env.local`, `.env.keys`) are gitignored; `config.toml` is committed.
