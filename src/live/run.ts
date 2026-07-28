import { getAttack } from '@/attacks';
import { getLiveRunCap, type LiveRunCap } from '@/config/env';
import type { RunRepository } from '@/data/run-repository';
import type { DetectorFn } from '@/eval';
import type { McpTargetPort } from '@/harness';
import { endpointLabel } from '@/harness/mcp';
import { runMatrix } from '@/runner';
import { logger as defaultLogger, type Logger } from '@/lib/logger';
import { LiveRunRequestSchema, UNSPECIFIED_MODEL, type LiveRunRequest } from './request';

/**
 * The BYOK LIVE-RUN pipeline — the single server-side entry point for
 * "red-team MY agent".
 *
 * Order of business, and the reason for each step:
 *   1. **Authz first.** A signed-out caller is refused before their input is
 *      even parsed. Live runs cost the operator a judge call; sample playback is
 *      the free path.
 *   2. **Zod on the input.** Endpoint (https, no embedded credentials), key,
 *      categories. The client form's checks are convenience, this is the gate.
 *   3. **The LOCKED judge must be available.** Absent it, the run is refused
 *      rather than judged by something unvalidated (see `./judge`).
 *   4. **Per-account cap.** `countRunsSince` over a rolling window, so operator
 *      judge cost stays bounded.
 *   5. **Run, then persist owner-scoped** through the RunRepository (RLS at the
 *      database).
 *
 * SECRET HANDLING (CLAUDE.md, security-critical). The BYOK endpoint and key are
 * used server-side only. The key is handed to the target adapter and nowhere
 * else: it is never written to a log line, never included in an error message,
 * and never persisted — the stored `RunResult.target` is the endpoint ORIGIN, so
 * even a token pasted into a query string cannot reach the database.
 */

/** Why a live run was refused. Each maps to one user-readable sentence. */
export type LiveRunRejectionCode =
  | 'NOT_SIGNED_IN'
  | 'INVALID_REQUEST'
  | 'JUDGE_UNAVAILABLE'
  | 'CAP_EXCEEDED'
  | 'TARGET_FAILED'
  | 'PERSISTENCE_FAILED';

/** One persisted run of the launch: the row id plus its observable summary. */
export interface LiveRunSummary {
  /** Row id: the address `/runs/[id]` and `/findings/[id]` resolve. */
  id: string;
  category: string;
  compromised: boolean;
}

export type LiveRunOutcome =
  | { ok: true; runs: LiveRunSummary[]; failed: string[] }
  | { ok: false; code: LiveRunRejectionCode; message: string };

/** Ports for a live run. Every one is injected, so units drive real fakes. */
export interface LiveRunDeps {
  /** Supabase auth user id, or null when signed out. */
  userId: string | null;
  repository: RunRepository;
  /** The LOCKED validated judge, or null when it is not configured. */
  detect: DetectorFn | null;
  /** Builds the `McpTargetPort` for the user's endpoint. */
  createTarget: (config: { endpoint: string; apiKey: string }) => McpTargetPort;
  cap?: LiveRunCap;
  now?: () => Date;
  logger?: Logger;
}

function reject(code: LiveRunRejectionCode, message: string): LiveRunOutcome {
  return { ok: false, code, message };
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Authorize, run, and persist a BYOK live red-team. Never throws for an expected
 * failure: every refusal comes back as a typed, user-readable outcome.
 */
export async function startLiveRun(input: unknown, deps: LiveRunDeps): Promise<LiveRunOutcome> {
  const log = deps.logger ?? defaultLogger;

  // 1 · AUTHZ. Refused before the payload is parsed.
  const userId = deps.userId;
  if (!userId) {
    return reject('NOT_SIGNED_IN', 'Sign in to run a live red-team against your own agent.');
  }

  // 2 · VALIDATE the external input.
  const parsed = LiveRunRequestSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return reject(
      'INVALID_REQUEST',
      first?.message ?? 'That run setup is not valid. Check the endpoint, key, and categories.',
    );
  }
  const request: LiveRunRequest = parsed.data;
  const target = endpointLabel(request.endpoint);

  // 3 · The LOCKED judge must be available, or nothing is judged.
  const detect = deps.detect;
  if (!detect) {
    return reject(
      'JUDGE_UNAVAILABLE',
      'Live runs are not available yet. The validated detector is not connected, so no run can be judged.',
    );
  }

  // 4 · PER-ACCOUNT CAP over a rolling window.
  const cap = deps.cap ?? getLiveRunCap();
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - cap.windowHours * HOUR_MS);
  const used = await deps.repository.countRunsSince(userId, since);
  if (used + request.categories.length > cap.maxRuns) {
    return reject(
      'CAP_EXCEEDED',
      `Run limit reached: ${cap.maxRuns} runs per ${cap.windowHours} hours. You have used ${used}. Try again later or select fewer categories.`,
    );
  }

  // The endpoint ORIGIN and the category list are the only run details logged.
  // The key is never passed to the logger in any shape.
  log.info('live run starting', {
    userId,
    target,
    categories: request.categories,
    model: request.modelId ?? UNSPECIFIED_MODEL,
  });

  // 5 · RUN. `runMatrix` turns a failed cell into a typed RunnerCellError rather
  // than crashing the launch, so a partial result is still reported honestly.
  const model = request.modelId && request.modelId !== '' ? request.modelId : UNSPECIFIED_MODEL;
  const { results, errors } = await runMatrix(
    [model],
    request.categories.map((category) => getAttack(category)),
    {
      target: deps.createTarget({ endpoint: request.endpoint, apiKey: request.apiKey }),
      detect,
      targetLabel: target,
    },
  );

  if (results.length === 0) {
    log.warn('live run produced no results', { userId, target, failed: errors.length });
    return reject(
      'TARGET_FAILED',
      'No run completed against that endpoint. Check that it is reachable and exposes an MCP agent tool.',
    );
  }

  // 6 · PERSIST owner-scoped. Only the observable RunResult is written.
  const runs: LiveRunSummary[] = [];
  try {
    for (const result of results) {
      const stored = await deps.repository.saveRun(userId, result);
      runs.push({
        id: stored.id,
        category: result.category,
        compromised: result.verdict.compromised,
      });
    }
  } catch (cause) {
    log.error('live run could not be saved', { userId, target });
    void cause;
    return reject('PERSISTENCE_FAILED', 'The run finished but could not be saved. Try again.');
  }

  log.info('live run finished', { userId, target, saved: runs.length, failed: errors.length });
  return { ok: true, runs, failed: errors.map((e) => e.category) };
}
