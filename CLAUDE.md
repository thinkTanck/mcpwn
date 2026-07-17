# MCPwn — CLAUDE.md (repo build instructions)

> Self-contained project: no other project or repo is a dependency, source, or reference. Correctness = tests against each attack's known outcome; quality = the Definition of Done below, enforced in CI. Measured metrics (P/R, robustness) are reported results, not invented thresholds. This file is kept in sync with the code every wave; its claims must be **true in practice**, not just present on paper.

## What MCPwn is

Standalone, deployed web app that red-teams an MCP-tool-using agent against the OWASP Top 10 for Agentic Applications (2026). **The competitive product: bring your own MCP agent → live red-team it against the Core-7 → get a trustworthy report from a detector whose accuracy is *measured* (leakage-separated P/R).** Two access modes: a no-key **sample playback** (a curated real run — the trailer) and **live BYOK red-teaming** (the tool). In live mode the **target is bring-your-own** (the user's MCP agent endpoint + key — *they* pay target inference) while the **judge is the fixed, validated, operator-provided detector — LOCKED** and never user-swappable (the measured accuracy only holds for the validated judge config). Live runs are **gated** (sign-in + per-account caps) with a cheap validated judge, so operator judge cost stays a few cents per run. Hero: live attack replay. Supporting: per-model robustness leaderboard + engineer-ready fix reports.

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel.
- UI: Tailwind + shadcn/ui on the **Base UI** engine (not Radix — unmaintained). DTCG two-tier design tokens (primitives → semantic aliases) → CSS variables → Tailwind.
- Persistence: **Supabase Postgres** behind a repository port; the postgres adapter is **provider-agnostic** (any Postgres via `DATABASE_URL` — Supabase replaces the earlier Neon plan, no code change); in-memory adapter for tests.
- Auth: **Supabase Auth** — **email magic-link** sign-in (optional GitHub/Google OAuth) — gates live runs. Config is env-only: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_ROLE_KEY` (secret, **server-only**), `DATABASE_URL` (Supabase); secrets never logged, never persisted in plaintext.
- External access behind domain-named ports: `JudgeModelPort`, `McpTargetPort` — HTTP adapters validate their own creds lazily, so the offline app boots with none.

## UI & design

- **The design is FROZEN.** [`design-review/MCPwn Sentinel v2.dc.html`](design-review/) is the **Wave C reference** — screens, layout, copy, states, mobile. It was designed in Claude Design (the mandatory design surface, directive 7a); **that role is now complete.** We do not iterate the design further; we implement it. Craft is fixed **in code, where it can be measured**. See [ADR-0004](docs/adr/0004-design-frozen-and-impeccable-as-craft-gate.md).
- **THE PRINCIPLE — the design is the REFERENCE; token roles DESCRIBE it, never redesign it.** If a role and the design disagree, **the design wins and the role is wrong**. Flag it; do **not** "fix" the design. (Two spec errors proved this: a 65–75ch role-level measure cap produced dead side-margins by fighting the design's own columns, and pinning DISPLAY to mono rewrote the design's sans numerals. Both were "good typography" overruling the actual design — see ADR-0004.)
- **The THREE-ROLE type model** (built + measured; DTCG roles in `src/app/globals.css`, locked by `tests/unit/app/tokens.test.tsx`):
  - **READING** — sans · 17 body / 18 lead / 20 · 28 · `clamp(32px, 5cqi, 44px)` · **every sentence a human reads**.
  - **INSTRUMENT** — mono · 12–13px · **telemetry only**: labels, chips, metadata, cues, column/row headers.
  - **DISPLAY** — **family per the frozen design** · 15 / 20 / 28 / 40 · values that **are** the focus (leaderboard cell values + OVERALL, hero stats, the replay step numeral).
  - Hard rules: **prose NEVER wears an INSTRUMENT role** (a blocking review failure); roles stay **measurably** distinct (`--display-sm` and `--reading-body` both above the INSTRUMENT ceiling); headline sizing is **`cqi`, never `vw`** (the column tracks the command deck, not the viewport); a tri-state **band colour overrides DISPLAY at zero specificity** via `:where()`; READING pins **no measure** (the design owns layout width).
- **Impeccable is the CRAFT LAYER, and it runs on source** (it cannot read a `.dc.html`): `init` + per-screen **registers** (**BRAND** = Home, Sign-in · **PRODUCT** = Connect, Replay, Leaderboard, Findings, Threats), `/typeset`, `/polish` per screen, and **`npx impeccable detect src/` as a BLOCKING CI gate**. It inherits our DTCG tokens; it never introduces its own.
- **Measurement — we cannot measure a mockup.** Chrome DevTools MCP measures the **built app**. Every screen reports **measured type (computed size/colour/contrast per role) + CWV + axe**. **A screen does not get a PR without its numbers.**
- **Copy:** count **magnitudes**, never **evidence** — never animate step numbers, run IDs, severities, or amounts quoted from a trace. **No em dashes in UI copy.**
- **Aesthetic:** **J.A.R.V.I.S.-style living HUD** on a dark control-room base — dark navy (not pure black), thin glowing line-work, arc/ring motifs, translucent panels, monospace (Geist Mono) technical readouts. **Tri-state status color: cyan (normal) · amber (caution/elevated) · red (breach/compromise).** WCAG 2.2 AA contrast on all text; status is glow **plus** label/icon, never color-only. The glow palette lives in the DTCG primitive token tier (theme swap, not a rebuild).
- **Fourth state — `--status-inert` (neutral/muted, "not measurable"):** a separate, desaturated state for things that are **out of scope / not measured** (e.g. the ASI07/08/09 rows on the Threat Model / Coverage board). It is **explicitly NOT a tri-state member** and is **NEVER red** — red is reserved for an actual breach, and spending it on an uncovered category would corrupt the signal language (a not-tested category is not a failing one). Like every other state it carries an **icon + label**, never color alone. See [ADR-0003](docs/adr/0003-core-7-scope-and-measurability-bar.md).
- **Screens:** (A) Run Setup · **(B) Live Attack Replay** (hero) — a step timeline with play/pause/step/scrub/speed, typed color-coded nodes (+ icon/label), the compromise step badged from `verdict.stepId`, a step-detail panel (payloads + memory before/after diff), and the detector rationale pinned to the compromise step, with fix-report export · (C) Robustness Leaderboard heatmap · (D) Findings / fix-reports · **(E) Threat Model / Coverage** (`/threats`) — the OWASP Agentic Top 10 as a coverage board: the **Core-7** covered (tri-state) and **ASI07/08/09 marked not-measurable** via `--status-inert` (never red), each linked to the [measurability bar](docs/adr/0003-core-7-scope-and-measurability-bar.md) — **plus any additional views that strengthen the tool (directive 7).**
- **Access & routes (competitive vision):** a **Home / landing** (`/`) — the pitch (bring-your-own-agent red-teaming + the *measured-detector* claim) + the sample-run trailer + CTAs (*Try the sample* · *Connect your agent*); **Connect / Run Setup** — sample mode, or **BYOK live** (connect an MCP agent: endpoint + key; pick Core-7; detector shown **BLIND · locked**); **sign-in** gates live runs (per-account caps) — **email magic-link** (optional GitHub/Google OAuth) via **Supabase Auth**. Home is the front door; the app screens sit behind it. BYOK keys are used server-side only, never logged, never persisted in plaintext. **Routes:** `/` (home/landing) · `/sign-in` (Supabase Auth · email magic-link · gates live runs) · `/connect` (run setup — sample or BYOK live) · `/runs/[id]` (live attack replay) · `/leaderboard` (robustness heatmap) · `/findings/[id]` (fix report) · `/threats` (threat model / coverage — Core-7 covered + ASI07/08/09 not-measurable).
- **Motion & interaction (locked — restrained, alive):** playhead sweep; nodes light as it passes; a soft glow-pulse on the active/compromise node; the detector verdict eases in. Serious instrument, not gamified — no gratuitous scanlines. GPU-cheap CSS transforms/opacity **plus tasteful, CWV-safe 3D where it earns it** — a WebGL particle-sphere core + dimensional state transitions (panels push/zoom/open), perf-budgeted and lazily loaded so it never blocks LCP/INP; implemented with Motion (transitions), GSAP (replay-timeline choreography), and react-three-fiber + drei (3D core); `prefers-reduced-motion` (also low-power / no-WebGL) → calm static fallback. The HUD language carries across every screen (leaderboard = glowing model×category grid; Run Setup = targeting console; Findings = case files; Threat Model / Coverage = a coverage board where the Core-7 glow tri-state and ASI07/08/09 sit inert). Transitions and motion follow current best UI patterns, kept research-driven (directive 7c).

## Verification tooling (used by Claude Code during the build)

- **Chrome DevTools MCP** — real Chrome: performance traces (actual LCP/INP/CLS), Lighthouse audits, accessibility inspection, console/network debugging.
- **Automated CI gates:** Lighthouse CI (CWV budgets) + `@axe-core/playwright` (WCAG regression).

## Skills

**Use any Claude Code skill that helps produce a professional, clean UI (directive 7b).** None build the app directly, but `canvas-design` can generate hero/visual assets, and any skill that aids a professional, clean UI is fair game.
- **Impeccable** (pbakaus/impeccable, Apache-2.0) — the adopted front-end **polish/critique** layer for Phase 7: 23 commands (polish · audit · critique · distill · …) + deterministic detector rules, run on the *implemented* HUD screens. It **supplements, never replaces, Claude Design** + the DTCG token pipeline.
- **archify** (tt-a1i/archify, MIT) — **documentation diagrams only**: renders the architecture map and the leakage-barrier data-flow as themeable (dark/light) SVGs. Not part of the app UI.

## Definition of Done (derived from current SE standards; every increment meets it)

- **Tests** — TDD Red→Green→Refactor (Kent Beck / [Fowler](https://martinfowler.com/bliki/TestDrivenDevelopment.html)); test pyramid unit>integration>e2e ([Fowler](https://martinfowler.com/articles/practical-test-pyramid.html)); **coverage threshold enforced in CI**; property-based tests (`fast-check`) for invariants (e.g. detector never emits a `stepId` absent from the trace). Deterministic LLM mocking for units; the live judge is statistical/gated.
- **CI/CD (GitHub Actions, push all branches + PR to main)** — install → lint → typecheck → unit(`--coverage`, threshold) → integration → build → e2e + `@axe-core/playwright` → Lighthouse CI (CWV budgets) → `audit-ci`. `main` protected; deploy-on-green to Vercel; PR previews. (Continuous delivery / [DORA](https://dora.dev/capabilities/continuous-delivery/).)
- **Pre-commit** — husky + lint-staged + commitlint; pre-push runs unit + build. Hooks catch early; CI is the safety net.
- **Security** — dependency audit; Zod input validation on all external inputs; no secret leakage; env-only config ([12-factor III](https://12factor.net/config)); **authz on live-run / run-control endpoints** (sign-in + per-account caps gate every BYOK live run). **BYOK key handling:** the user's MCP-agent endpoint + key are used **server-side only**, transported over **HTTPS**, **never logged**, and **never persisted in plaintext** — the operator-provided validated judge stays **LOCKED** and is never user-swappable. **Supabase config** (env-only): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public/client-safe), `SUPABASE_SERVICE_ROLE_KEY` (**secret · server-only** — never client-exposed, never logged, never persisted in plaintext), `DATABASE_URL` (Supabase Postgres).
- **Reliability** — error boundaries (`error.tsx`/`global-error.tsx`); typed errors; timeouts + bounded retries on external calls.
- **Observability** — structured logging; `/api/health`; runs + traces persisted/retrievable.
- **Accessibility** — WCAG 2.2 AA / POUR ([W3C](https://www.w3.org/WAI/standards-guidelines/wcag/)): `@axe-core/playwright` in CI + role/name unit assertions + Chrome-DevTools spot checks (automation catches ~30–50%; not a substitute for manual AT).
- **Usability** — Nielsen's 10 heuristics ([NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)): visibility of system status (run progress), user control (stop/step a run), consistency, error prevention, recognition over recall, aesthetic/minimalist design.
- **Performance** — Core Web Vitals good @ p75 (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1; [web.dev](https://web.dev/articles/vitals)) via Lighthouse CI + Chrome DevTools MCP; virtualize long lists.
- **Docs** — README + architecture diagram (Mermaid source kept as the reproducible/diffable canonical **plus a polished `archify` SVG render**) + a **leakage-barrier data-flow SVG** (`archify`); ADR log (`docs/adr/`); `.env.example`; CLAUDE.md + plan.md kept in sync and verified true.
- **Reproducibility** — clean clone → build/test/deploy; pinned deps + lockfile.

## Scope — Core-7 (OWASP Agentic Top 10 2026; genai.owasp.org)

ASI01 Agent Goal Hijack · ASI02 Tool Misuse and Exploitation · ASI03 Identity and Privilege Abuse · ASI04 Agentic Supply Chain Vulnerabilities · ASI05 Unexpected Code Execution (RCE) · ASI06 Memory & Context Poisoning · ASI10 Rogue Agents (v1 bounded to three single-run signatures).

**Why seven, not ten — the measurability bar (locked; [ADR-0003](docs/adr/0003-core-7-scope-and-measurability-bar.md)):** a category ships only if the compromise is (1) **observable** in the agent's own `Trace` steps, (2) inside **one bounded run**, (3) **anchorable** to a single offending step (`Verdict.stepId` — "compromised at step N, or not"), AND (4) has a **benign variant that scores not-compromised** (without it we can measure recall but never precision). ASI07 (Insecure Inter-Agent Communication — needs an agent-to-agent step type the Trace lacks), ASI08 (Cascading Agent Failures — OWASP defines it as the *propagation* of a fault, not the initial vulnerability, so there is no single step to anchor), and ASI09 (Human-Agent Trust Exploitation — completes inside a human's decision the trace can't observe) do not clear the bar under the current contract. Seven measured beats ten unmeasurable.

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

Blind LLM alignment-auditor (LlamaFirewall/AlignmentCheck style; arXiv 2505.03574): reads the whole Trace vs the task goal, classifies the Core-7 category, anchors the offending step. Trace/goal go in as untrusted, delimited data (never instructions; guards against judge-injection — JudgeDeceiver, arXiv 2505.13348). Structured output → Zod value-validation → typed `DetectorError`, never a raw crash. Low temperature (env), pinned model, empty-trace pre-check.

## Severity

CVSS v4.0 qualitative bands (None/Low/Medium/High/Critical) as a string; numeric AIVSS score left open (AIVSS extends CVSS v4.0).

## Dependencies (as of 2026-07)

Hold TypeScript 6 (TS 7 GA'd 2026-07-08; behavior-preserving port → migrate once typescript-eslint + vitest support it). Hold ESLint 9 (config-next's bundled eslint-plugin-react calls `getFilename()`, removed in ESLint 10); tracked bump before ESLint 9 EOL 2026-08-06.
