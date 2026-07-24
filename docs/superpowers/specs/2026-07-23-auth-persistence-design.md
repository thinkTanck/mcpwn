# Auth + Persistence — design (Slice 1 of the hosted-release build)

Status: approved (shape + Slice 1). Date: 2026-07-23.

## Why

In production a visitor cannot yet **test their own MCP agent** — sign-in is a
preview and nothing persists. This is the first of the "hosted release" slices
that turn MCPwn from sample-playback into a real BYOK red-teaming tool.

"Wire the entire thing up" is five subsystems; each gets its own spec → plan →
TDD build:

1. **Auth** — Supabase magic-link (+ GitHub), sessions, middleware gating.
2. **Persistence** — Supabase Postgres behind the repo port (accounts, runs, caps).
3. **Live judge** — real `JudgeModelPort` HTTP adapter (operator LLM, LOCKED).
4. **Live target (BYOK)** — real `McpTargetPort` adapter that drives the user's agent.
5. **Live runner + `/connect` + caps** — the payoff.

**This document specs Slice 1 (Auth + Persistence).** The others are captured at
architecture level only.

## Holistic architecture (all 5)

**Security spine.** Supabase Auth owns identity (magic-link + GitHub); sessions
ride httpOnly cookies via `@supabase/ssr`; middleware gates the app.

- **Open (no auth):** Home, `/runs/sample`, leaderboard, threats, findings,
  sign-in, viewing `/connect`.
- **Gated (signed-in):** launching a **live** run + run-control endpoints. Sample
  stays free. (Gate live-runs only.)
- **Secrets server-side only:** the user's BYOK agent key and the operator judge
  key are used only in server code, over HTTPS, never logged, never persisted in
  plaintext. Service-role key is server-only.

**Live-run data flow (Slice 5):**

```
signed-in user → /connect (agent endpoint + key, pick Core-7, judge BLIND·LOCKED)
  → [authz + per-account cap check]
  → runner: McpTargetPort drives THEIR agent through each scenario
            (MCPwn serves poisoned tools, observes steps → Trace)
  → detector: JudgeModelPort (operator LLM, LOCKED) reads Trace+goal → Verdict
  → persist RunResult (owned by the user) → /runs/[id] replay + /findings/[id]
```

**Judge (Slice 3):** Anthropic **Claude Haiku** default, pending real
leakage-separated measurement, with a **Sonnet upgrade path** (model is
config-driven). **Variant expansion** (benign/malicious per category) folds into
the judge slice, not here.

**Definition of "run":** one `(target-agent × attack-category)` execution that
yields exactly one `RunResult` (matches `runId = model::category` and the
leaderboard's model×category cells). A single `/connect` launch across N
categories fans out to **N runs**, and the **per-account cap counts runs** (each
run = one real target execution + one judge call). Default cap: **5 live
runs/day/account**, server-enforced (Slice 5).

## Slice 1 — Auth + Persistence (this slice)

### Env (offline-safe)

Zod in `src/config/env.ts`, lazy accessor `getSupabaseConfig()`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public/browser),
  `SUPABASE_SERVICE_ROLE_KEY` (server-only secret), `DATABASE_URL` (server-only).
- **Absent creds → auth INERT** (config returns null): sign-in keeps its honest
  preview state, app runs credential-free on in-memory. Present → real auth.
- Guarantee: **CI and local unit tests need zero secrets**; the build boots
  offline. Matches the existing lazy-adapter pattern.

### Auth mechanics (Supabase Auth)

- Deps: `@supabase/supabase-js`, `@supabase/ssr`.
- Clients: **browser** client; cookie-bound **server** client; server-only
  **admin** client (service-role). All guarded — return null / throw typed when
  config absent.
- **Magic-link:** sign-in form → server action → `auth.signInWithOtp({ email })`;
  `/auth/callback` route exchanges the code → cookies → redirect.
- **GitHub:** `signInWithOAuth({ provider: 'github' })` → `/auth/callback`.
- **Session:** `middleware.ts` refreshes the session each request (it already sets
  `x-pathname`; extend it) and exposes the user server-side. **Sign-out** action.
- Wire the existing `SignInPanel` to the real action (keep the "check your email"
  confirmation + the preview fallback when creds absent). Enable **GitHub**; Google
  stays out.

### Persistence (Postgres behind a port) + "run"

- New **`RunRepository` port** (separate from the public `DataSource`, which keeps
  serving sample/fixture data): `saveRun(userId, RunResult)`, `getRun(userId, id)`,
  `listRuns(userId)`, `countRunsSince(userId, since)`.
- Adapters: `InMemoryRunRepository` (tests/offline) + `SupabaseRunRepository`
  (prod, via supabase-js so **Row-Level Security** enforces ownership at the DB).
- **Schema (SQL migration, RLS on):** `runs` — `id uuid, user_id → auth.users,
created_at, category, model, target_label` (endpoint label only, **never the
  key**), `compromised, severity, verdict jsonb, trace jsonb, status`. RLS:
  `user_id = auth.uid()`. Cap derived by counting rows in a window (no counter
  table — YAGNI).

### Gating + visible payoff

- Gating helper `requireUser()` in middleware + server actions. Only live-run
  actions are gated; in this slice the gate protects a new signed-in **`/account`**
  ("your runs") page so the auth↔RLS path is exercised end-to-end (empty until
  Slice 5). Sign-out control in the shell when authed.

### Testing (TDD) + pushed increments

Each increment committed/pushed, CI green:

1. **Env + Supabase clients** (offline-safe toggle) — unit: env Zod validation,
   creds-absent → inert.
2. **`RunRepository` port + InMemory adapter** — unit TDD (save/get/list/
   countSince, ownership isolation).
3. **Schema + RLS migration + `SupabaseRunRepository`** — integration test gated
   on creds (skipped in CI when absent).
4. **Auth flows** (magic-link + GitHub actions, `/auth/callback`, session
   middleware, sign-out) + wire `SignInPanel` — unit with a mocked Supabase client.
5. **Gating + `/account`** — unit for `requireUser`; e2e for sign-in→redirect
   (mocked session); `@axe-core` on the new page.

### Prerequisites (provided; validated 2026-07-23)

Supabase project URL + anon + service-role keys + `DATABASE_URL` in `.env.local`
(local) and to be set in Vercel (prod). GitHub OAuth app creds for the GitHub
button. The slice **builds and unit-tests without any of them**.

## Non-goals (this slice)

No live judge, no BYOK target, no runner wiring, no `/connect` live launch, no
per-account cap enforcement (only the data to support it). Those are Slices 2–5.
