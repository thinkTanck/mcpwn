# 1. Record architecture decisions

Date: 2026-07-11

## Status

Accepted

## Context

We need to record the architectural decisions made on this project — the choices
that shape the system and the reasoning behind them — so that current and future
contributors can understand not just _what_ was decided but _why_. Rationale that
lives only in chat logs, pull-request threads, or people's memory is lost over
time, which leads to decisions being silently re-litigated or reversed without
knowing the original context.

The established, lightweight practice for this is the Architecture Decision Record
(ADR), as described by Michael Nygard in
["Documenting Architecture Decisions"](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
An ADR is a short text file, kept in version control alongside the code, that
captures a single significant decision and its consequences.

## Decision

We will use Architecture Decision Records to capture significant architectural
decisions.

- ADRs are stored in `docs/adr/`, one Markdown file per decision.
- Files are numbered sequentially and never renumbered:
  `NNNN-title-with-dashes.md` (this is `0001`).
- Each ADR follows Nygard's format: **Title**, **Date**, **Status**, **Context**,
  **Decision**, **Consequences**.
- **Status** is one of `Proposed`, `Accepted`, `Deprecated`, or `Superseded`. A
  decision that replaces an earlier one references the ADR it supersedes, and the
  superseded ADR is kept in place for the historical record rather than deleted.
- ADRs are written for decisions that are architecturally significant — those that
  affect structure, dependencies, interfaces, or hard-to-reverse trade-offs.

## Consequences

**Positive**

- Architectural rationale is preserved in version control, next to the code it
  governs, and evolves with it.
- New contributors can read the decision log to understand how the system reached
  its current shape, reducing onboarding time and accidental reversals.
- Writing a decision down forces the trade-offs to be made explicit at the time.

**Negative / costs**

- It takes discipline to record decisions as they are made; an ADR log only stays
  useful if it is kept current.
- Deciding what counts as "architecturally significant" requires judgement, so the
  log may drift toward too many or too few records.

**Alternatives considered**

- [MADR](https://adr.github.io/madr/) (Markdown Architecture Decision Records) — a
  richer template with sections for considered options and decision drivers. We
  chose Nygard's leaner format for lower overhead and can adopt MADR-style option
  sections within individual ADRs when a decision warrants deeper comparison.
- Tooling such as [`adr-tools`](https://github.com/npryce/adr-tools) may be adopted
  later to scaffold and index records, but is not required — the records are plain
  Markdown.
