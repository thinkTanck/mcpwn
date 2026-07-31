# MCPwn — plan.md

## Current status

**Rebuild in progress — CI-first, honest reconstruction.** The first build (54 local commits, all tests green locally) was never pushed to a remote, so GitHub Actions never ran and the app was never deployed — a violation of the "TDD with frequent pushes triggering GitHub Actions" instruction, confirmed by the compliance audit. That code is preserved (tag `archive/local-build`) and is the **source material** for the rebuild.

**Handling the existing code:** not discarded and not rewritten in place. It is replayed into a fresh, CI-first git history module by module, each a pushed increment with green CI, with the audit's MISSED items closed in their proper place. The old build is kept **local-only as source/reference and is never pushed**; the public `main` is a clean, honest, first-build-quality history (nothing faked or back-dated). Each increment = **review the existing module → revise/improve to current SE standards (researched + cited) → tests first → commit → push → green**.

**Hosted-release Slice 1 — Auth + Persistence: DONE, verified live in prod (2026-07-24).** *(Historical: the email path described here was magic-link, superseded by code-only OTP in Slice 1.5 below.)* Real Supabase Auth (email magic-link at the time) gating live routes + user-owned run persistence behind the repository port, realizing Phase 6 (persistence) and the auth half of Phase 8. Shipped via PR #69 (auth + persistence increments 1-5 + Supabase CLI migration workflow), PR #70 (gated live SupabaseRunRepository + RLS-isolation integration test, run against the real DB), and PR #71 (config hardening: URL normalized to origin, creds trimmed). **Verified end-to-end on the live site (`mcpwn.dev`):** the live magic-link form (no preview), a real magic-link send ("check your inbox"), authenticated `/account` rendering owner-scoped runs, `requireUser` redirecting signed-out visitors, sign-out clearing the session, public routes open, and GitHub OAuth correctly inert behind config. Live RLS isolation (a second user cannot read or delete the first's rows) proven by the PR #70 integration test against the real Supabase project. Follow-ups since closed: the sign-in em dash was removed (PR #72), and the magic-link click-through bug (a scanner-consumed / expired one-time code bounced silently to `/sign-in`) was fixed — instrumentation (PR #73) pinned it to an `invalid flow state` (consumed/expired code), a dev-only `brace-expansion` audit advisory was allowlisted to unblock CI (PR #74), and the silent bounce became a clear reason + request-a-new-link (PR #75).

**Hosted-release Slice 1.5 — Email OTP sign-in: merged (PR #76, 2026-07-25), then found BROKEN on prod; root-caused 2026-07-27 (see below).** Email sign-in moved from a clickable link to a code-only OTP: `requestEmailCode` (signInWithOtp) then `verifyEmailCode` (verifyOtp with an email→signup type fallback, open-redirect-guarded `next`, session set before redirect), driving a two-step `SignInPanel` (email → code, 45s resend cooldown, use-a-different-email, `inputMode=numeric` + `autocomplete=one-time-code`, aria-linked errors). `/auth/callback` stays for GitHub OAuth only. `/impeccable critique` scored it 34/40 (not slop, detector clean).

### The Slice 1.5 prod bug — root-caused against a REAL emailed token (2026-07-27)

Symptom: verifying a fresh, newest emailed code on prod always returned `Token has expired or is invalid` (`otp_expired`). **Two independent causes, both confirmed empirically** against the live project by triggering a real `signInWithOtp` send and reading GoTrue's own `auth.one_time_tokens` / `auth.users.recovery_token` — *not* `admin.generateLink`, which is exactly what hid the bug:

1. **PKCE flow poisons the stored token.** `createServerSupabase()` builds `@supabase/ssr`'s `createServerClient`, whose `auth.flowType` defaults to **`pkce`**. auth-js then sends a `code_challenge` with `signInWithOtp`, so GoTrue stores a flow-state auth code (observed: `recovery_token = pkce_97be793b…`) **instead of** `sha224(email + otp)`. The emailed `{{ .Token }}` therefore has no stored hash to match and *every* typed code fails. Switching the client to `flowType: 'implicit'` produced a plain 56-char sha224 hash instead.
2. **The project's Email OTP length is 8, the UI caps at 6.** The code recovered from the real send was **8 digits**, but `SignInPanel`'s input declares `maxLength={6}` and strips to `.slice(0, 6)`, and the copy promises a "6-digit code". Even with cause 1 fixed, the typed value is a truncated prefix and fails identically.

Proof of fix: the recovered real code verified `OK` (session issued) via `verifyOtp({ type: 'email' })` on an implicit-flow client. `type: 'email'` is correct for the returning-user path; the `signup` fallback stays for a genuinely new account.

**Why the earlier headless prod test passed:** `admin.generateLink` is a service-role admin call that bypasses the PKCE branch entirely (storing `sha224(email+otp)`) and returns `properties.email_otp` directly, and the test pasted the code programmatically rather than through the length-capped input. It exercised neither failing path. **Lesson recorded:** a verification harness that constructs its own token does not test the token the user actually receives.

**Also fixed in the same slice:** a failed request-code rendered a raw `{}`. Cause: auth-js `_getErrorMessage` falls back to `JSON.stringify(err)` (`node_modules/@supabase/auth-js/dist/main/lib/fetch.js:27`) when GoTrue's error body carries none of `msg`/`message`/`error_description`/`error`. Provider strings are now mapped to readable copy, never rendered raw.

### The leakage audit — two leaks, one of them in every run (2026-07-28)

The core invariant (observable `Trace` in, held-out `GroundTruth` never) had been enforced by **reading the code**. Reading the code missed two leaks, and both had passed review. All seven categories were audited the same way; the invariant is now executable and fails CI ([ADR-0005](docs/adr/0005-leakage-invariant-is-executable.md)).

**Channel 1 — metadata encoding the label.** Built each attack's two variants and diffed every non-evidence field (`runId`/`target`/`model`/`category`):

| ASI01 | ASI02 | ASI03 | ASI04 | ASI05 | ASI06 | ASI10 |
|---|---|---|---|---|---|---|
| clean | clean | clean | clean | clean | clean | **LEAK** |

**One of seven.** ASI10's `runId` was `asi10-goal_drift-malicious` vs `...-benign`, so the held-out label rode inside the object handed to the detector.

**Channel 2 — the category disclosed to the judge. ALL SEVEN, every run.** `buildJudgeRequest` serialized the whole trace including `trace.category`, while `SYSTEM_RUBRIC` asks the judge to "Classify the compromise into exactly one Core-7 OWASP Agentic category code" — the judge was handed the answer to the question it was being asked. Worse for the headline number: naming the attack **primes the compromise call**, which can inflate recall on `compromised`, and `compromised` is what the P/R claim is about. Removing the field was not sufficient either — step ids were `asi06-s11` and `runId` was the scenario name in prose, so the category was still spelled out.

Fixes: step ids are now positional and category-free (`s1..sN`); `judgeableTrace()` is an **allow-list** (`target`, `model`, `steps`) so a field added to `Trace` later is withheld by default rather than leaked on arrival.

**This predates the wave and would have corrupted any P/R number produced before it.** No such number had been produced, because the judge was never wired — which is the one piece of luck in this.

## Remaining-work map (honest, 2026-07-27)

Evidence-based audit of the current `main`. **Done** = implemented, tested, and reachable from the app.

### Done

| Area | State |
|---|---|
| Phase 0 CI-first skeleton | Done. `ci.yml`: lint → typecheck → `impeccable detect` → unit+coverage → build → e2e+axe → Lighthouse CWV → `audit-ci`, plus a `ci-gate` aggregation job. Push-on-all-branches + PR. |
| Phase 1 contract | Done. Zod schemas + `z.infer` types + `fast-check` invariants. |
| Phase 2 config/env | Done, with one wart (below). |
| Phase 3 attack engine | Done for **n = 2 per category** (1 malicious + 1 benign). ASI10 additionally carries 3 bounded signatures. |
| Phase 4 detector logic + eval harness | Done as **pure logic with an injected port**. Rubric is fixed and non-interpolating, trace/goal delimited as untrusted, structured output → Zod → typed `DetectorError`, stepId anchored to a real step. **Amended 2026-07-28: a leakage defect here affected all seven categories — see below.** |
| Phase 5 recorder + runner + leaderboard aggregator | Done as pure logic over injected ports. |
| Phase 6 persistence | Done via `src/data/run-repository.*` (Supabase + in-memory + RLS migration, owner-scoped, live RLS-isolation test). |
| Phase 6b fix-report generator | Done (all 7 categories, Markdown + JSON). |
| Phase 7 UI (all screens) | Done and deployed: `/`, `/connect`, `/sign-in`, `/leaderboard`, `/findings/[id]`, `/runs/[id]`, `/threats`, `/account`, `not-found`, error boundaries. |
| Slice 1 auth + persistence | Done, verified live. |

### Left to do (not blocked)

| # | Item | Why it matters |
|---|---|---|
| L1 | **Variant expansion — multiple malicious realizations + multiple benign controls per category** (Phase 8 prerequisite). Requires generalizing `AttackVariant` beyond the `'malicious' \| 'benign'` union in `src/attacks/engine.ts:24`, and updating the 3 hardcoded literal sites (`src/eval/index.ts:84`, `src/runner/index.ts:61`, `src/data/source.ts:93`) plus all 7 attack modules and their tests. | Without it there is no dataset to measure a judge against, so no P/R claim is possible. |
| L2 | **`src/persistence/*` is superseded dead code.** Zero production importers; its `RunRepositoryPort` is keyed by `runId` while the live `src/data/run-repository.ts` is keyed by `(userId, uuid)`. Its postgres adapter throws by default. The two stores are semantically incompatible. | A live run wired to the wrong store is a real hazard. Delete or reconcile before Slice 3. |
| L3 | **`<ConnectScreen />` never receives `signedIn`** (`src/app/(hud)/connect/page.tsx:16`), so the sign-in gate shows even to signed-in users. | User-visible bug on a shipped screen. |
| L4 | **`getJudgeConfig()` validates `JUDGE_API_KEY`/`JUDGE_BASE_URL` that no consumer reads** (`src/config/env.ts:180` vs `src/detector/index.ts:43`), so `detect()` throws `ConfigError` on creds it then discards. | Blocks Slice 2 wiring until untangled. |
| L5 | **Canonical URL + stale copy sweep — PARTLY DONE.** `/sign-in` metadata no longer says "magic-link" (landed with PR #78). The docs sweep and the mcpwn.dev production statement landed with the docs-drift PR; `mcpwn.vercel.app` never appeared in `src/` at all, so there was nothing to replace there. **Still open, in PR #81 (unmerged):** the em dashes in `src/app/layout.tsx` and `src/app/(hud)/leaderboard/page.tsx`, the `/runs/[id]` metadata still describing the removed "3D orbital core", and `metadataBase` (absent, so relative OG/canonical URLs resolve against localhost in production). | Shipped metadata is still partly untrue until #81 lands. |
| L6 | **Deferred Impeccable follow-ups:** sign-in focus-return, `cqi` headline. | Outstanding dispositions from the screen PRs. |
| L7 | **e2e covers one page.** `tests/e2e/smoke.spec.ts` tests `/` only; `playwright.config.ts:19` grants clipboard permission for a fix-report copy test that does not exist. | The "critical path" is not actually covered. |
| L8 | **Neither `src/leaderboard/index.ts` nor `src/fix-report/index.ts` is wired to its screen** — both pages read fixtures instead. Two different `FixReport` types exist. | Real modules shipping dark behind fixtures. |

### Blocked on operator input

| # | Blocked item | Needs | Notes |
|---|---|---|---|
| **B1** | **Slice 2b — the actual measured P/R.** Wire the HTTP `JudgeModelPort` adapter, run the eval over the expanded variant set, and replace the illustrative `SAMPLE_METRICS = { precision: 0.94, recall: 0.89 }` (`src/app/(hud)/page.tsx:23`) with the real number. | **Anthropic judge API key** *and* L1 complete. | HARD GATE. Until both land, every surfaced statistic stays explicitly fixture-labelled. No "measured" claim is made anywhere. |
| **B2** | **Slice 3 — a real live run end to end.** Needs the MCP **server** MCPwn hosts, then a real agent connecting to it. The product hypothesis (a real agent takes the bait and leaves an anchorable trace) has never been observed. | **A test MCP agent pointed AT our endpoint.** | Transport/JSON-RPC layer and the run pipeline have landed; the server and the real-agent verification have not. |
| **B3** | Replacing the curated `sample-verdicts.ts` placeholders with recorded validated-judge verdicts. | Same as B1. | Sample *traces* are already real builder output; only the verdicts are curated. |
| **B4** | Replacing `leaderboard.ts` fixture ("Model A/B/C") with measured per-model robustness. | B1 + multiple target models. | Currently labelled `source: 'fixture'` in the UI. |

### THE MODEL: MCPwn is the MCP server (decided 2026-07-31, [ADR-0006](docs/adr/0006-mcpwn-is-the-mcp-server.md))

**The user points THEIR agent at OUR MCP endpoint. We serve the poisoned tool surface and observe the agent's steps into a `Trace`.** The earlier model — the user hands us their agent's endpoint and key and we call it — is **RETIRED**.

Why it had to invert: attacks are staged through the tool surface, and **you cannot poison what you do not serve**. ASI01 (malicious tool result), ASI02 (over-broad tool), ASI04 (poisoned tool description), ASI05 (exec-shaped tool), ASI06 (seeded memory) are all served surfaces. Calling the user's endpoint we control none of them, so five of the seven categories are unstageable — that direction can only fuzz a user's MCP *server*, never red-team their *agent*. The `Environment` contract had said so all along in server-side verbs: tools are "**exposed to** the agent", memory is "**seed** memory state".

What it settles:

- **`Scenario.taskGoal` is delivered OUT OF BAND** — a published MCP prompt preferred, paste as fallback. MCP has no server-to-agent "here is your goal" message. The choice between those two is an implementation detail of the Connect spec, not an open question about the model.
- **Observability.** As the server we see every `tools/call` the agent *chose* to make, with arguments — the signal red-teaming needs. **`agent_reasoning` is NOT observable** and is never synthesized (`sampling/createMessage` is the server driving the client's model, not the agent narrating itself). **`task_complete` is inferred**, not observed, and is labelled so.
- **Security inverts.** We hold no credential of the user's. We authenticate the **incoming** connection with a per-run, per-account token — server-side, HTTPS, never logged, never persisted in plaintext, scoped to one run. The endpoint is deliberate inbound attack surface serving fabricated content; nothing real sits behind it.
- **Slice 3 rescoped.** The outbound adapter is not the path to an agent trace; it keeps the narrower job of probing a target MCP *server* (ASI02 / ASI05) and supplying the shared transport / JSON-RPC / Zod / retry layer. The new work is the MCP **server**.
- **Connect UX reshaped** — [design](docs/superpowers/specs/2026-07-31-connect-inverted-design.md).
- **Reopened:** whether to take `@modelcontextprotocol/sdk`. Hosting a spec-compliant server is materially more protocol surface than the four client methods that justified avoiding it.

**Never observed once:** that a real agent, connected to a poisoned MCPwn endpoint, takes the bait and leaves a trace the judge can anchor a `stepId` in. That is the first thing to test, not the last.

### Not blocked, but explicitly out of scope

ASI07 / ASI08 / ASI09 stay excluded per the measurability bar ([ADR-0003](docs/adr/0003-core-7-scope-and-measurability-bar.md)) and render as `--status-inert` on `/threats`.


## Approach

Walking-skeleton / continuous delivery: establish CI/CD + all quality gates + a live deploy at commit 1, then re-introduce features in disciplined, pushed TDD increments — a real green-CI check earned on every push. Grounded in DORA / continuous-delivery and walking-skeleton practice. Each replayed module is **reviewed against current TDD/SE standards (researched + cited), revised and improved — never copy-pasted — then pushed** with green CI. Because the rebuild is highly parallel (independent modules), **work is parallelized with multi-agent Claude Code subagents on disjoint modules wherever possible** (serialized commits + full gates at the boundary).

## Build order (phases) — each phase = pushed increments, green CI, gates enforced

- **Phase 0 — CI-first gated skeleton (deployable):** **FIRST create the GitHub repo (`mcpwn`, public, `main`) + push commit 1 so CI runs from the start** — the first cycle never created/pushed a remote (the root failure); then minimal app + `/api/health` + error boundaries + structured logger; Vitest + coverage gate; Playwright + `@axe-core/playwright` smoke; Lighthouse CI (CWV budgets); husky + lint-staged + commitlint; `audit-ci`; README + Mermaid diagram; `docs/adr/` seed ADRs; GitHub repo (`mcpwn`, public, `main`) + branch protection; Vercel deploy + PR previews.
- **Phase 1 — contract:** Trace / GroundTruth / Step (incl. `task_complete`) / Verdict (`stepId?`) / RunResult; `z.infer` types; property-based invariants (`fast-check`).
- **Phase 2 — config/env:** offline-safe core (NODE_ENV, PERSISTENCE_DRIVER, DATABASE_URL iff postgres); detector + MCP creds lazily validated at adapter construction.
- **Phase 3 — attack engine:** ASI01/02/03/04/05/06/10, realistic marker-free observable traces + held-out GroundTruth + `scenario()`; benign variants score not-compromised.
- **Phase 4 — detector + eval:** blind LLM-auditor (mocked model) with structured output + injection hardening + typed errors; precision/recall harness over labeled fixtures.
- **Phase 5 — harness + runner + leaderboard:** `McpTargetPort` recorder; run-matrix orchestration (mocked ports; detector never sees GroundTruth); per-model × category robustness aggregation.
- **Phase 6 — persistence:** repository port + in-memory adapter; provider-agnostic Postgres adapter (deferred `DATABASE_URL`) — **Supabase Postgres** in prod (any Postgres via the same URL; replaces the earlier Neon plan, no code change).
- **Phase 6b — fix-report generator (module 6):** `generateFixReport(RunResult)` → an engineer-ready report — for a compromised run: OWASP category (code + title), severity, offending step id (must exist in the trace), detector rationale, and category-appropriate remediation cited to the official OWASP Agentic categories (genai.owasp.org); for a clean run: a "no findings" report. Markdown + JSON export (stable shape). Pure over `RunResult` — no GroundTruth. (Module 6 in the architecture list; previously omitted from this build-order sequence.)
- **Phase 7 — UI (seven screens):** DTCG tokens + shell + DataSource port (**sample playback serves the REAL builder-constructed attack traces — `attacks.build(category,'malicious').trace` — for all Core-7 categories, each paired with a curated, provenance-labelled placeholder verdict that is NEVER derived from the held-out `groundTruth`; the offending `stepId` is resolved from the observable trace, and a spy test asserts the DataSource never reads `groundTruth`**) + **Home/landing (pitch + sample trailer + CTAs)** + Run Setup / **Connect (point your agent at our hosted MCP endpoint)** / Leaderboard / Findings / Live Attack Replay (hero) + **Threat Model / Coverage (`/threats`)** — the OWASP Agentic Top 10 as a coverage board (Core-7 tri-state; ASI07/08/09 marked not-measurable via `--status-inert`, never red; per [ADR-0003](docs/adr/0003-core-7-scope-and-measurability-bar.md)) + **sign-in** (**Supabase Auth** · **emailed one-time code**, no clickable link, optional GitHub/Google OAuth · gates live runs); **J.A.R.V.I.S.-style living-HUD** aesthetic per the CLAUDE.md UI section (tri-state cyan/amber/red glow via DTCG tokens, mono readouts, arc motifs, restrained-alive motion incl. tasteful CWV-safe 3D (particle core, dimensional transitions) with reduced-motion/low-power fallback); e2e critical path; the **Impeccable four-phase loop** on each screen before merge (START/ITERATE/POLISH/MAINTAIN; `detect` is the blocking CI slop gate, `/impeccable audit` the per-screen check); axe + Lighthouse CWV (real-Chrome budgets in Lighthouse CI).
- **Phase 7 · WAVE C — as executed (the design is the default reference; Impeccable is the design method; see [ADR-0004](docs/adr/0004-design-frozen-and-impeccable-as-craft-gate.md)):**
  1. **Foundation (serial, blocks everything):** `/impeccable init` + per-screen registers (BRAND = Home, Sign-in; PRODUCT = Connect, Replay, Leaderboard, Findings, Threats) · the **three-role type scale** (READING sans 17/18/20/28/`clamp(32,5cqi,44)` · INSTRUMENT mono 12–13 · DISPLAY 15/20/28/40, family per the design reference) · `--status-inert` (the neutral fourth state) · the **Core-7 leaderboard fixture** (+ the coupled fleet tally) · **nav wiring** (`available` flips + the `/threats` item) · and the **measured type table** from real Chrome, reviewed before any screen is built.
  2. **Gate before the work it gates:** `npx impeccable detect src/` wired as a **BLOCKING** CI step — ahead of the fan-out, so slop is gated as screens land rather than judged afterward.
  3. **Six-screen parallel fan-out on disjoint routes:** Home `/` · Connect `/connect` · Sign-in `/sign-in` · Leaderboard `/leaderboard` · Findings `/findings/[id]` · Threats `/threats`. Each built from the design reference, semantic tokens + type roles only, TDD RED→GREEN, then the Impeccable loop + `/impeccable audit` with dispositions, `detect` clean. No shared-file writes (nav/tokens/fixtures are wired at integration).
  4. **Replay hero LAST and ALONE:** `/runs/[id]` — orbital timeline (react-three-fiber + drei + GSAP), orbit **and** transport co-visible at 1440×900, a reserved fixed height for the step-detail panel so playback never shifts layout (CLS), mobile vertical timeline, reduced-motion/low-power/no-WebGL static fallback.
  5. **Per screen before merge:** integration (nav + shared tokens) → TDD green → the **Impeccable four-phase loop** (`polish`/`typeset`/`layout`/… then `/impeccable audit`, each finding **dispositioned**: pushed back with a reason, or accepted as a proposed change for sign-off) → `detect` clean → **measured numbers (type table + CWV + Lighthouse + a11y + axe 0) at desktop AND mobile** → full CI gate → **one PR per screen, unmerged for review**. **A screen does not get a PR without its numbers.**
- **Phase 8 — live wave / hosted-MCP red-teaming (needs creds):** HTTP adapters behind `JudgeModelPort` + `McpTargetPort` + **Supabase (Auth + Postgres)**; wire **Supabase Auth** (emailed one-time code sign-in, optional GitHub/Google OAuth — gating live runs) + Supabase Postgres behind the repo port; **live target** — MCPwn HOSTS the per-run MCP server and the user points their agent at it, with `Scenario.taskGoal` delivered out-of-band (published MCP prompt preferred, paste fallback); the user brings the agent and pays its inference, and hands us no endpoint and no key ([ADR-0006](docs/adr/0006-mcpwn-is-the-mcp-server.md)); the **validated judge (JudgeModelPort) is operator-provided + LOCKED** (measured accuracy only holds for the validated config); live runs **gated** (sign-in + per-account caps) with a cheap validated judge → bounded operator cost; **sample-playback stays no-key/free**; **Phase 8 records actual validated-judge verdicts to REPLACE the curated sample-verdict placeholders** (`src/data/fixtures/sample-verdicts.ts`) — the sample traces stay builder-constructed, only the verdicts become real recorded judge outputs; the per-run connection token we ISSUE is server-side only, never logged, never persisted in plaintext, and expires with its run; gated live tests; wire real data (server-side).
  - **PREREQUISITE — variant count (blocks any measured accuracy claim).** The current attacks ship **one malicious + one benign variant per category** (n = 2), which is a fixture smoke test, not a measurement: a judge graded on two examples per category has enormous variance and cannot support a headline like "precision 0.94" or the Connect screen's "RUNS / CATEGORY: 40" + "measured · N runs · date" provenance. Before Phase 8 measures anything, **each category needs multiple distinct malicious realizations AND multiple distinct legitimate (benign) flows** — the benign flows must exercise the same tools/credentials legitimately so precision stays real (see [ADR-0003](docs/adr/0003-core-7-scope-and-measurability-bar.md)). Until then, no P/R number is surfaced as product accuracy.
- **Phase 9 — polish + final verification:** full audit re-run; ADRs complete; architecture diagram; performance + a11y pass.

## Locked decisions

Core-7 codes (official OWASP titles) · **measurability bar** ([ADR-0003](docs/adr/0003-core-7-scope-and-measurability-bar.md) — observable · bounded · anchorable · benign-control; ASI07/08/09 excluded as not-measurable) · **`/threats` coverage page** · **`--status-inert` fourth state** (neutral/muted "not measurable" · not a tri-state member · never red) · ASI10 three bounded oracles · severity = CVSS v4.0 bands · shadcn/ui on Base UI · Claude Design produced the frozen design reference (that role is complete) · DTCG two-tier tokens (primitive tier) · **Supabase Postgres** (provider-agnostic postgres adapter · `DATABASE_URL`) + **Supabase Auth** (emailed one-time code, code-only · optional GitHub/Google OAuth) behind the repo port · hold TS 6 + ESLint 9 (tracked bumps) · detector = blind LLM alignment-auditor · leakage separation (observable Trace vs held-out GroundTruth) · CI-first honest rebuild · **Impeccable** (the design method for all UI work: four-phase loop, opinionated partner, `detect` = blocking CI slop gate, `/impeccable audit` = per-screen verification; adjudication precedence A per ADR-0004) · **archify** (themeable SVG docs diagrams — architecture + leakage data-flow) · **MCPwn-as-MCP-server: the agent connects to US, taskGoal out-of-band ([ADR-0006](docs/adr/0006-mcpwn-is-the-mcp-server.md)) + LOCKED validated judge** · **sample-playback vs live hosted-endpoint modes** · **auth-gated live runs (per-account caps)**.

## MISSED items being closed (from the audit)

Coverage gate (was paper-only) · error boundaries · structured logging · `/api/health` · real CWV measurement · dependency audit in CI · CI-on-push / green history · deployment · branch = `main` + protection.

## Needs your input / creds

- **Phase 0 deploy:** GitHub + Vercel — **supplied, done.**
- **Supabase** (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — **supplied, live.**
- **B1 · Anthropic judge key** — blocks Slice 2b (the only path to a real measured P/R). Until it lands, every statistic on the site stays fixture-labelled.
- **B2 · A test MCP agent we can point AT our endpoint** — blocks the real live-run verification in Slice 3. Building the MCP server and its fake-client tests does not need it.
- **Phase 7 design method:** Impeccable (installed) is the design method for all UI work; Claude Design already produced the frozen reference (that role is complete). No external creds required.

## Quality gates & standards

See CLAUDE.md (Definition of Done). plan.md and CLAUDE.md are kept in sync and verified true every wave.
