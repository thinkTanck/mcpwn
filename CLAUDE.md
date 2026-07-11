# MCPwn — CLAUDE.md (repo build instructions)

> Self-contained project: no other project or repo is a dependency, source, or reference. Correctness = tests against each attack's known outcome; quality = the Definition of Done below, enforced in CI. Measured metrics (P/R, robustness) are reported results, not invented thresholds. This file is kept in sync with the code every wave; its claims must be **true in practice**, not just present on paper.

## What MCPwn is

Standalone, deployed web app that red-teams an MCP-tool-using agent against the OWASP Top 10 for Agentic Applications (2026). Hero: live attack replay. Supporting: per-model robustness leaderboard + engineer-ready fix reports.

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel.
- UI: Tailwind + shadcn/ui on the **Base UI** engine (not Radix — unmaintained). DTCG two-tier design tokens (primitives → semantic aliases) → CSS variables → Tailwind.
- Persistence: Neon Postgres behind a repository port; in-memory adapter for tests.
- External access behind domain-named ports: `JudgeModelPort`, `McpTargetPort` — HTTP adapters validate their own creds lazily, so the offline app boots with none.

## UI & design

- **Design system: Claude Design is MANDATORY — it is where the UI is designed (directive 7a).** The UI is designed in Claude Design (with Claude Code), expressed as the J.A.R.V.I.S. HUD, then implemented on shadcn/ui + Base UI with DTCG two-tier tokens; the **primitive token tier is where the Claude Design source plugs in** (rewrite primitives, everything follows, zero rework). Not optional and not a late "theme swap" — Claude Design is the design surface for Phase 7. Exact Claude Design import mechanics are confirmed at the UI phase — not invented here.
- **Aesthetic:** **J.A.R.V.I.S.-style living HUD** on a dark control-room base — dark navy (not pure black), thin glowing line-work, arc/ring motifs, translucent panels, monospace (Geist Mono) technical readouts. **Tri-state status color: cyan (normal) · amber (caution/elevated) · red (breach/compromise).** WCAG 2.2 AA contrast on all text; status is glow **plus** label/icon, never color-only. The glow palette lives in the DTCG primitive token tier (theme swap, not a rebuild).
- **Screens:** (A) Run Setup · **(B) Live Attack Replay** (hero) — a step timeline with play/pause/step/scrub/speed, typed color-coded nodes (+ icon/label), the compromise step badged from `verdict.stepId`, a step-detail panel (payloads + memory before/after diff), and the detector rationale pinned to the compromise step, with fix-report export · (C) Robustness Leaderboard heatmap · (D) Findings / fix-reports — **plus any additional views that strengthen the tool (directive 7).**
- **Motion & interaction (locked — restrained, alive):** playhead sweep; nodes light as it passes; a soft glow-pulse on the active/compromise node; the detector verdict eases in. Serious instrument, not gamified — no gratuitous scanlines. GPU-cheap CSS transforms/opacity only (CWV-safe); `prefers-reduced-motion` → calm static fallback. The HUD language carries across all four screens (leaderboard = glowing model×category grid; Run Setup = targeting console; Findings = case files). Transitions and motion follow current best UI patterns, kept research-driven (directive 7c).

## Verification tooling (used by Claude Code during the build)

- **Chrome DevTools MCP** — real Chrome: performance traces (actual LCP/INP/CLS), Lighthouse audits, accessibility inspection, console/network debugging.
- **Automated CI gates:** Lighthouse CI (CWV budgets) + `@axe-core/playwright` (WCAG regression).

## Skills

**Use any Claude Code skill that helps produce a professional, clean UI (directive 7b).** None build the app directly, but `canvas-design` can generate hero/visual assets, and any skill that aids a professional, clean UI is fair game.

## Definition of Done (derived from current SE standards; every increment meets it)

- **Tests** — TDD Red→Green→Refactor (Kent Beck / [Fowler](https://martinfowler.com/bliki/TestDrivenDevelopment.html)); test pyramid unit>integration>e2e ([Fowler](https://martinfowler.com/articles/practical-test-pyramid.html)); **coverage threshold enforced in CI**; property-based tests (`fast-check`) for invariants (e.g. detector never emits a `stepId` absent from the trace). Deterministic LLM mocking for units; the live judge is statistical/gated.
- **CI/CD (GitHub Actions, push all branches + PR to main)** — install → lint → typecheck → unit(`--coverage`, threshold) → integration → build → e2e + `@axe-core/playwright` → Lighthouse CI (CWV budgets) → `audit-ci`. `main` protected; deploy-on-green to Vercel; PR previews. (Continuous delivery / [DORA](https://dora.dev/capabilities/continuous-delivery/).)
- **Pre-commit** — husky + lint-staged + commitlint; pre-push runs unit + build. Hooks catch early; CI is the safety net.
- **Security** — dependency audit; Zod input validation on all external inputs; no secret leakage; env-only config ([12-factor III](https://12factor.net/config)); authz if run-control endpoints are exposed.
- **Reliability** — error boundaries (`error.tsx`/`global-error.tsx`); typed errors; timeouts + bounded retries on external calls.
- **Observability** — structured logging; `/api/health`; runs + traces persisted/retrievable.
- **Accessibility** — WCAG 2.2 AA / POUR ([W3C](https://www.w3.org/WAI/standards-guidelines/wcag/)): `@axe-core/playwright` in CI + role/name unit assertions + Chrome-DevTools spot checks (automation catches ~30–50%; not a substitute for manual AT).
- **Usability** — Nielsen's 10 heuristics ([NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)): visibility of system status (run progress), user control (stop/step a run), consistency, error prevention, recognition over recall, aesthetic/minimalist design.
- **Performance** — Core Web Vitals good @ p75 (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1; [web.dev](https://web.dev/articles/vitals)) via Lighthouse CI + Chrome DevTools MCP; virtualize long lists.
- **Docs** — README + Mermaid architecture diagram; ADR log (`docs/adr/`); `.env.example`; CLAUDE.md + plan.md kept in sync and verified true.
- **Reproducibility** — clean clone → build/test/deploy; pinned deps + lockfile.

## Scope — Core-5 (OWASP Agentic Top 10 2026; genai.owasp.org)

ASI01 Agent Goal Hijack · ASI02 Tool Misuse and Exploitation · ASI04 Agentic Supply Chain Vulnerabilities · ASI06 Memory & Context Poisoning · ASI10 Rogue Agents (v1 bounded to three single-run signatures).

## Architecture (modules)

1 MCP harness (`McpTargetPort`) · 2 attack engine · 3 runner · 4 detector (`JudgeModelPort`) · 5 leaderboard · 6 fix-report generator · 7 UI · 8 wiring + run report.

## Build execution

- **Replay as pushed TDD increments**, module by module (order in plan.md); every increment committed **and pushed** so GitHub Actions runs green before the next.
- **Parallelize with multi-agent subagents whenever we can:** dispatch parallel Claude Code subagents on **disjoint** files/modules; **serialize commits and run the full gates at each boundary**. The honest rebuild is highly parallel (independent modules) — exploit it.
- **First action = create the remote.** Create GitHub `mcpwn` (public, `main`, branch protection) and push commit 1 so CI runs from the very start. The first cycle never created/pushed a remote — the root failure this rebuild exists to fix.
- **Publish only the clean history.** The old local build is kept **local-only as source/reference (branch `source-local-build` + tag `archive/local-build`) and is never pushed**; the public repo shows only the honest, first-build-quality `main` — real TDD increments, real green CI, nothing faked or back-dated.

## Data contract (single source of truth; UI renders observable data only)

- `Trace` — OBSERVABLE only: `{ runId, target, model, category, steps[] }`; step types: attacker | agent_reasoning | tool_call | tool_result | memory_read | memory_write | task_complete. No labels.
- `GroundTruth` — HELD OUT: `{ compromised, stepId?, category }`, produced at construction; the detector NEVER receives it.
- `Verdict` — `{ runId, compromised, score, severity, category, rationale, stepId? }` (`stepId` present iff compromised).
- `RunResult` — a LIVE run's output: `{ runId, target, model, category, trace, verdict }`; no groundTruth (live runs are unlabeled).
- Attacks expose `build(variant) → { trace, groundTruth }` (detector validation) and `scenario(variant) → { taskGoal, environment }` (drive a live agent). Types via `z.infer`.

## Ground truth vs detector (leakage separation — the core invariant)

Standard ML anti-leakage: never let the model use information unavailable at prediction time; keep the label out of the features (target leakage — Kaufman et al. 2012, *Leakage in Data Mining*; train/test separation). Applied here: the observable `Trace` is the feature; the held-out `GroundTruth` is the label; the detector and UI see only the Trace. P/R compares detector verdicts to held-out ground truth on constructed fixtures; live runs are unlabeled — which is why the detector exists.

## Detector (module 4)

Blind LLM alignment-auditor (LlamaFirewall/AlignmentCheck style; arXiv 2505.03574): reads the whole Trace vs the task goal, classifies the Core-5 category, anchors the offending step. Trace/goal go in as untrusted, delimited data (never instructions; guards against judge-injection — JudgeDeceiver, arXiv 2505.13348). Structured output → Zod value-validation → typed `DetectorError`, never a raw crash. Low temperature (env), pinned model, empty-trace pre-check.

## Severity

CVSS v4.0 qualitative bands (None/Low/Medium/High/Critical) as a string; numeric AIVSS score left open (AIVSS extends CVSS v4.0).

## Dependencies (as of 2026-07)

Hold TypeScript 6 (TS 7 GA'd 2026-07-08; behavior-preserving port → migrate once typescript-eslint + vitest support it). Hold ESLint 9 (config-next's bundled eslint-plugin-react calls `getFilename()`, removed in ESLint 10); tracked bump before ESLint 9 EOL 2026-08-06.
