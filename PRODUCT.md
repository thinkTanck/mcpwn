# MCPwn — PRODUCT.md

> Product context for the Impeccable design skill. Captured for the Phase-7 UI
> (the J.A.R.V.I.S.-style living HUD, internal name **Sentinel Fields**). This is
> the strategic "who / what / why"; the visual "how it looks" is the DTCG two-tier
> token system (primitives → semantic aliases), fed by Claude Design — the
> mandatory UI design surface. Impeccable **supplements** that pipeline; it never
> replaces it.

## Register

**Product (default).** MCPwn is app UI — a security control room — so most screens serve the tool: clarity, system status, and operator trust over persuasion.

**Per-screen register** (Impeccable runs brand vs product by different rules, so each screen declares which):

- **BRAND** — `/` (Home) and `/sign-in`. The front door: the pitch, the _measured-detector_ claim, the first impression. Design carries the message here; it may be expressive.
- **PRODUCT** — `/connect`, `/runs/[id]` (Live Attack Replay), `/leaderboard`, `/findings/[id]`, and `/threats`. The instrument surfaces: legible, data-dense, trustworthy. Design serves the readout, never decorates it.

## Platform

**web.** Next.js 16 App Router, responsive; no native target.

## Users

Security engineers, red-teamers, and AI-safety practitioners evaluating how robust an MCP-tool-using agent is against the OWASP Top 10 for Agentic Applications (2026). They arrive to _run an evaluation and read the result under time pressure_: launch a run, watch the attack replay, find the exact step where the agent was compromised, and export an engineer-ready fix. They value precision, reproducibility, and being able to trust the verdict at a glance.

## Purpose

Red-team an MCP agent against the Core-7 OWASP Agentic categories and make the outcome legible. Five surfaces: **Run Setup** (targeting console), **Live Attack Replay** (the hero — a scrubby step timeline with the compromise step badged and the detector rationale pinned), **Robustness Leaderboard** (per-model × per-category heatmap), **Findings / fix-reports** (case files), and **Threat Model / Coverage** (which of the ten OWASP categories are measured — Core-7 covered, ASI07/08/09 marked not-measurable). The UI renders **observable data only** — the held-out ground truth never reaches it (leakage separation).

## Brand personality

A serious instrument, not a game. **Sentinel Fields**: a dark control-room base (dark navy, never pure black), thin glowing line-work, arc/ring motifs, translucent panels, and monospace (Geist Mono) technical readouts. Calm but _alive_ — the interface breathes as a run replays. Confident, precise, understated. Think mission control, not an arcade.

## Anti-references

- Gamified/arcade dashboards, score-celebration confetti, badges-for-everything.
- Gratuitous scanlines, CRT glitch, neon-for-neon's-sake, or motion that distracts from the readout.
- **Color-only status** — a red glow with no label or icon.
- Light-gray body text on a tinted near-white (the classic low-contrast failure).
- **AI-generated dark dashboard** — the generic "dark SaaS admin" reflex; a look you could guess from the category alone.
- **Cyan-on-navy uniformity** — one accent on one background everywhere, so nothing has hierarchy or register.
- **Thin-border panel soup** — every element the same 1px-bordered card (and never nested cards); elevation should be earned.
- **Uniformly small mid-grey text** — no reading/instrument split; prose shrunk to HUD size so everything reads as telemetry and nothing reads as a sentence.

## Design principles

- **Tri-state status is the core signal:** cyan (normal) · amber (caution/elevated) · red (breach/compromise). Status is always **glow _plus_ a label and/or icon — never color alone.** The glow palette lives in the DTCG primitive token tier (a theme swap, not a rebuild).
- **Restrained-alive motion:** a playhead sweep, nodes lighting as it passes, a soft glow-pulse on the active/compromise node, the verdict easing in. GPU-cheap CSS transforms/opacity only (CWV-safe). Serious, not gamified.
- **Legibility first:** monospace readouts, generous negative space, one clear focal point per screen (the compromise step on Replay; the worst cell on the Leaderboard).
- **The HUD language carries across every screen** so the tool reads as one system.

## Accessibility

**WCAG 2.2 AA is non-negotiable.** Body text ≥ 4.5:1, large text ≥ 3:1 against its background. Status conveyed by glow **and** label/icon, never color only. `prefers-reduced-motion` → a calm static fallback (no sweep/pulse). Full keyboard operation for play/pause/step/scrub; correct roles/names for the timeline nodes and the verdict panel. Automation (`@axe-core/playwright` + Lighthouse) catches ~30–50%; it is not a substitute for manual AT checks.
