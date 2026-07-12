# MCPwn — PRODUCT.md

> Product context for the Impeccable design skill. Captured for the Phase-7 UI
> (the J.A.R.V.I.S.-style living HUD, internal name **Sentinel Fields**). This is
> the strategic "who / what / why"; the visual "how it looks" is the DTCG two-tier
> token system (primitives → semantic aliases), fed by Claude Design — the
> mandatory UI design surface. Impeccable **supplements** that pipeline; it never
> replaces it.

## Register

**Product.** Design serves the tool: MCPwn is app UI (a security control room / dashboard), not a marketing surface. Optimize for clarity, system status, and operator trust — not persuasion.

## Platform

**web.** Next.js 16 App Router, responsive; no native target.

## Users

Security engineers, red-teamers, and AI-safety practitioners evaluating how robust an MCP-tool-using agent is against the OWASP Top 10 for Agentic Applications (2026). They arrive to _run an evaluation and read the result under time pressure_: launch a run, watch the attack replay, find the exact step where the agent was compromised, and export an engineer-ready fix. They value precision, reproducibility, and being able to trust the verdict at a glance.

## Purpose

Red-team an MCP agent against the Core-5 OWASP Agentic categories and make the outcome legible. Four surfaces: **Run Setup** (targeting console), **Live Attack Replay** (the hero — a scrubby step timeline with the compromise step badged and the detector rationale pinned), **Robustness Leaderboard** (per-model × per-category heatmap), and **Findings / fix-reports** (case files). The UI renders **observable data only** — the held-out ground truth never reaches it (leakage separation).

## Brand personality

A serious instrument, not a game. **Sentinel Fields**: a dark control-room base (dark navy, never pure black), thin glowing line-work, arc/ring motifs, translucent panels, and monospace (Geist Mono) technical readouts. Calm but _alive_ — the interface breathes as a run replays. Confident, precise, understated. Think mission control, not an arcade.

## Anti-references

- Gamified/arcade dashboards, score-celebration confetti, badges-for-everything.
- Gratuitous scanlines, CRT glitch, neon-for-neon's-sake, or motion that distracts from the readout.
- **Color-only status** — a red glow with no label or icon.
- Light-gray body text on a tinted near-white (the classic low-contrast failure).

## Design principles

- **Tri-state status is the core signal:** cyan (normal) · amber (caution/elevated) · red (breach/compromise). Status is always **glow _plus_ a label and/or icon — never color alone.** The glow palette lives in the DTCG primitive token tier (a theme swap, not a rebuild).
- **Restrained-alive motion:** a playhead sweep, nodes lighting as it passes, a soft glow-pulse on the active/compromise node, the verdict easing in. GPU-cheap CSS transforms/opacity only (CWV-safe). Serious, not gamified.
- **Legibility first:** monospace readouts, generous negative space, one clear focal point per screen (the compromise step on Replay; the worst cell on the Leaderboard).
- **The HUD language carries across all four screens** so the tool reads as one system.

## Accessibility

**WCAG 2.2 AA is non-negotiable.** Body text ≥ 4.5:1, large text ≥ 3:1 against its background. Status conveyed by glow **and** label/icon, never color only. `prefers-reduced-motion` → a calm static fallback (no sweep/pulse). Full keyboard operation for play/pause/step/scrub; correct roles/names for the timeline nodes and the verdict panel. Automation (`@axe-core/playwright` + Lighthouse) catches ~30–50%; it is not a substitute for manual AT checks.
