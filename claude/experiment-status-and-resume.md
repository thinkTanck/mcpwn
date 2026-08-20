# Run-matrix spike: status and resume

This file records where the run-matrix red-team spike stands and what to do next. It is written to be read cold, after a break, with no other context.

## What the spike is

Run one MCP-tool-using agent against the Core-7 attack surface across a matrix of (category, framing, repetition) cells, record each run's trace, and classify each trace as BITE (the agent took the bait) or RESIST (it did not). The point is to see, at small scale, how a real agent behaves against the served attack surface.

## Current state

The matrix layer is done and merged. `scripts/spike/run-matrix.ts` is on `main`, delivered by PR #133, squashed at commit `6965c9a`. It exports:

- `generateMatrix(categories, framings, reps)` — every (category, framing, rep) cell once.
- `buildMcpConfig(endpoint, token)` — a one-server MCP config.
- `classifyTrace(trace, category)` — returns BITE or RESIST for a trace against a category.
- `runMatrix(input)` — gates the sweep through the existing `checkLiveRunAllowance`, then runs each cell through an executor that the caller injects, and classifies the trace that executor returns.

`runMatrix` does not run anything by itself. It calls an injected executor for each cell. The executor is the function that actually talks to the agent: mint a per-run token, write an MCP config, spawn the agent against it, fetch the resulting trace, and hand it back. `runMatrix` never spawns a process or opens a socket.

## What is not built yet

The executor itself is not written. There is no `scripts/spike/executor.ts`. Because `runMatrix` depends on an injected executor and none exists, the matrix cannot actually run against an agent. The merged code type-checks and its tests pass, but that is the plumbing only. Nothing has been run against a live agent.

## Config facts (verify before trusting)

- `LIVE_RUN_ALLOWANCE` is `80` in `.env.local`, read through `src/config/env.ts` (`getLiveRunAllowance`). It is a ceiling on how many free live runs an account may start, not a spend or a dollar amount. A matrix of N cells is N runs against that ceiling.
- The allowance in Vercel is set separately, in the Production environment. `.env.local` only affects a local dev run.
- `audit-ci.json` allowlists `GHSA-jmr9-qjv8-65gv`, an archive path-traversal advisory in `extract-zip`. It reaches the tree only through the dev-only Lighthouse CI chain (`@lhci/cli` to `lighthouse` to `puppeteer-core` to `@puppeteer/browsers` to `extract-zip`) and has no presence in the production tree. It is documented beside the two brace-expansion entries in CLAUDE.md.

## Resume checklist

1. Build the executor: `scripts/spike/executor.ts`. It must satisfy the executor type `runMatrix` already injects. Write it against its tests (see `tests/unit/spike/executor.test.ts`), which cover config writing, the spawn flags, the goal-only prompt, temp-file cleanup, trace fetching, per-cell tokens, the allowed-tools list, and the reserved server name.
2. Wire the executor into a small runner that reads config from the environment, builds the matrix, and calls `runMatrix` with the executor injected.
3. Run one cell end to end against a live agent and confirm a real trace comes back and classifies.
4. Run the full matrix, staying under `LIVE_RUN_ALLOWANCE`, and record the BITE and RESIST results.
