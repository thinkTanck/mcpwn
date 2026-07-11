# MCPwn — plan.md

## Current status

**Rebuild in progress — CI-first, honest reconstruction.** The first build (54 local commits, all tests green locally) was never pushed to a remote, so GitHub Actions never ran and the app was never deployed — a violation of the "TDD with frequent pushes triggering GitHub Actions" instruction, confirmed by the compliance audit. That code is preserved (tag `archive/local-build`) and is the **source material** for the rebuild.

**Handling the existing code:** not discarded and not rewritten in place. It is replayed into a fresh, CI-first git history module by module, each a pushed increment with green CI, with the audit's MISSED items closed in their proper place. The old build is kept **local-only as source/reference and is never pushed**; the public `main` is a clean, honest, first-build-quality history (nothing faked or back-dated). Each increment = **review the existing module → revise/improve to current SE standards (researched + cited) → tests first → commit → push → green**.

## Approach

Walking-skeleton / continuous delivery: establish CI/CD + all quality gates + a live deploy at commit 1, then re-introduce features in disciplined, pushed TDD increments — a real green-CI check earned on every push. Grounded in DORA / continuous-delivery and walking-skeleton practice. Each replayed module is **reviewed against current TDD/SE standards (researched + cited), revised and improved — never copy-pasted — then pushed** with green CI. Because the rebuild is highly parallel (independent modules), **work is parallelized with multi-agent Claude Code subagents on disjoint modules wherever possible** (serialized commits + full gates at the boundary).

## Build order (phases) — each phase = pushed increments, green CI, gates enforced

- **Phase 0 — CI-first gated skeleton (deployable):** **FIRST create the GitHub repo (`mcpwn`, public, `main`) + push commit 1 so CI runs from the start** — the first cycle never created/pushed a remote (the root failure); then minimal app + `/api/health` + error boundaries + structured logger; Vitest + coverage gate; Playwright + `@axe-core/playwright` smoke; Lighthouse CI (CWV budgets); husky + lint-staged + commitlint; `audit-ci`; README + Mermaid diagram; `docs/adr/` seed ADRs; GitHub repo (`mcpwn`, public, `main`) + branch protection; Vercel deploy + PR previews.
- **Phase 1 — contract:** Trace / GroundTruth / Step (incl. `task_complete`) / Verdict (`stepId?`) / RunResult; `z.infer` types; property-based invariants (`fast-check`).
- **Phase 2 — config/env:** offline-safe core (NODE_ENV, PERSISTENCE_DRIVER, DATABASE_URL iff postgres); detector + MCP creds lazily validated at adapter construction.
- **Phase 3 — attack engine:** ASI01/02/04/06/10, realistic marker-free observable traces + held-out GroundTruth + `scenario()`; benign variants score not-compromised.
- **Phase 4 — detector + eval:** blind LLM-auditor (mocked model) with structured output + injection hardening + typed errors; precision/recall harness over labeled fixtures.
- **Phase 5 — harness + runner + leaderboard:** `McpTargetPort` recorder; run-matrix orchestration (mocked ports; detector never sees GroundTruth); per-model × category robustness aggregation.
- **Phase 6 — persistence:** repository port + in-memory adapter; Neon adapter (deferred creds).
- **Phase 7 — UI:** DTCG tokens + shell + DataSource port + Run Setup / Leaderboard / Findings / Live Attack Replay (hero); **J.A.R.V.I.S.-style living-HUD** aesthetic per the CLAUDE.md UI section (tri-state cyan/amber/red glow via DTCG tokens, mono readouts, arc motifs, restrained-alive motion with reduced-motion fallback); e2e critical path; axe + Lighthouse CWV against a real browser (Chrome DevTools MCP + Lighthouse CI).
- **Phase 8 — live wave (needs creds):** HTTP adapters behind `JudgeModelPort` + `McpTargetPort` + Neon; gated live tests; wire real data (server-side).
- **Phase 9 — polish + final verification:** full audit re-run; ADRs complete; architecture diagram; performance + a11y pass.

## Locked decisions

Core-5 codes (official OWASP titles) · ASI10 three bounded oracles · severity = CVSS v4.0 bands · shadcn/ui on Base UI · Claude Design = MANDATORY UI design surface (where the UI is designed) · DTCG two-tier tokens (primitive tier fed by Claude Design) · Neon Postgres behind the repo port · hold TS 6 + ESLint 9 (tracked bumps) · detector = blind LLM alignment-auditor · leakage separation (observable Trace vs held-out GroundTruth) · CI-first honest rebuild.

## MISSED items being closed (from the audit)

Coverage gate (was paper-only) · error boundaries · structured logging · `/api/health` · real CWV measurement · dependency audit in CI · CI-on-push / green history · deployment · branch = `main` + protection.

## Needs your input / creds

- **Phase 0 deploy:** GitHub (gh authed) + a Vercel account/connection.
- **Phase 8 live:** MCP target endpoint + model-provider creds (base URL, API key, model) + Neon `DATABASE_URL`.
- **Required (Phase 7):** Claude Design — the mandatory surface where the UI is designed; it feeds the DTCG primitive token tier.

## Quality gates & standards

See CLAUDE.md (Definition of Done). plan.md and CLAUDE.md are kept in sync and verified true every wave.
