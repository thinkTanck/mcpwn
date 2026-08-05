/**
 * THE LIVE-RUN PIPELINE — the seam that turns the pieces into one run.
 *
 * Every stage below already existed and was tested on its own, each with its
 * integration point written down in the module rather than invented. This is
 * that integration, honoured as documented and in this order:
 *
 *   start()   gate (preflight)  ->  issue the per-run token (`run-token.ts`)
 *             ->  host the per-run MCP server (`src/harness/server/**`)
 *   handle()  authenticate the INBOUND agent connection  ->  serve MCP
 *             ->  the recorder writes the observable Trace
 *   finish()  revoke the token  ->  gate again (preflight)  ->  the frozen
 *             validated judge over the OBSERVABLE trace only  ->  Verdict
 *             ->  RunResult  ->  RunRepository  ->  generateFixReport
 *
 * ── THE INVERSION, AND WHERE THE GATES SIT ──
 *
 * Under [ADR-0006](../../docs/adr/0006-mcpwn-is-the-mcp-server.md) we never call
 * the user's agent: we host an endpoint and the agent connects to US. So there is
 * no "before the agent call" moment to gate. The two moments that SPEND anything
 * are inviting an agent in (a hosted run) and asking the judge (operator money),
 * and both are gated:
 *
 *   1. `start()` calls `preflight` BEFORE `issueRunToken`. A refused run mints no
 *      token, hosts no server and costs nothing.
 *   2. `finish()` calls `preflight` again BEFORE the judge. A cap that trips
 *      mid-run pauses the run down the same typed refusal instead of spending.
 *
 * `handle()` does NOT re-gate. The allowance is a per-run decision, not a
 * per-message one, and a database read on every inbound JSON-RPC message would
 * both cost more than it saves and refuse an agent halfway through a session it
 * was already granted.
 *
 * ── THE LEAKAGE BARRIER ──
 *
 * A live run is UNLABELED. There is no `GroundTruth` here, none is synthesized,
 * and `RunResultSchema` is strict so one could not be attached even by accident.
 * The judge is reached only through {@link LiveDetector}, whose signature is
 * `(trace, taskGoal) => Verdict` and therefore has nowhere to put a label; what
 * it actually sees is narrowed once more inside `detect()` by the
 * `judgeableTrace()` allow-list (no `category`, no `runId`). This module adds
 * nothing to that payload.
 *
 * ── THE CLEAN PATH IS A FIRST-CLASS OUTCOME ──
 *
 * An agent that reads the poisoned content and refuses to act on it is the
 * product working. `finish()` has no branch on `verdict.compromised`: both
 * outcomes persist a `RunResult` and produce a fix report, and "no findings" is a
 * report, not an empty state.
 *
 * ── WHAT IS DELIBERATELY IN MEMORY ──
 *
 * The registry of open runs (`runId -> the hosted server recording it`) is
 * process-local. A hosted server is a live object holding a live recorder, so it
 * cannot be serialized into Postgres and read back mid-run; what CAN outlive the
 * process already does (the token record, and the finished `RunResult`). The
 * consequence is stated rather than hidden: a run in progress belongs to the
 * instance that started it, and a restart loses the unfinished trace. Fixing that
 * needs a sticky routing or a durable recorder decision that no evidence has been
 * gathered for yet, so it is not invented here.
 */
import { z } from 'zod';
import {
  CategorySchema,
  RunResultSchema,
  VariantKindSchema,
  type Category,
  type RunResult,
  type Trace,
  type VariantKind,
  type Verdict,
} from '@/contract';
import { getSiteOrigin } from '@/config/env';
import type { RunRepository, StoredRun } from '@/data/run-repository';
import { DetectorError } from '@/detector';
import type { LiveDetector } from '@/detector/resolve';
import { generateFixReport, type FixReport } from '@/fix-report';
import { createStreamableHttpHandler, type StreamableHttpHandler } from '@/harness/server/http';
import { HostedMcpServer, TASK_PROMPT_NAME } from '@/harness/server/server';
import type { Logger } from '@/lib/logger';
import {
  issueRunToken,
  verifyRunToken,
  RUN_TOKEN_REJECTION_MESSAGE,
  type RunTokenStore,
} from '@/runs/run-token';

/** Where a run's MCP endpoint lives, under the site origin. */
export const LIVE_RUN_ENDPOINT_PREFIX = '/api/mcp';

/** How long the pipeline waits for one judge answer before giving up. */
export const DEFAULT_JUDGE_TIMEOUT_MS = 60_000;
/** Total judge attempts per run, including the first. */
export const DEFAULT_JUDGE_MAX_ATTEMPTS = 2;
/** First backoff step; doubled per retry and capped. */
const RETRY_BASE_MS = 250;
const RETRY_CAP_MS = 2_000;

// ── Refusals ──

/**
 * Why a run could not proceed. Each one is a bounded state the UI can state
 * plainly, never an exception surfacing as a 500 on a public route.
 *
 * The first two are the preflight gates and are RELAYED, not decided here: this
 * module never counts an allowance or reads a spend cap, so it cannot drift from
 * whatever `src/runs/preflight.ts` decides.
 */
export type LiveRunErrorCode =
  | 'ALLOWANCE_EXHAUSTED'
  | 'SPEND_CAP_REACHED'
  | 'INVALID_REQUEST'
  | 'DETECTION_UNAVAILABLE'
  | 'DETECTION_FAILED'
  | 'RESULT_INVALID'
  | 'RUN_NOT_FOUND'
  | 'RUN_ALREADY_FINISHED';

/** A refusal, typed. Its `message` is already the sentence a screen can print. */
export class LiveRunError extends Error {
  readonly code: LiveRunErrorCode;

  constructor(code: LiveRunErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LiveRunError';
    this.code = code;
  }
}

/** Live detection is off, and sample playback is the path that still works. */
export const DETECTION_UNAVAILABLE_MESSAGE =
  'Live detection is not available right now, so this run cannot be judged. ' +
  'Sample playback stays open to everyone.';

/** An outcome, never a throw for a state a caller can provoke. */
export type LiveRunDecision<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LiveRunError };

// ── The preflight seam ──

/**
 * The gate, as a function type.
 *
 * This MIRRORS `checkLiveRunPreflight` in `src/runs/preflight.ts`, which owns the
 * allowance and the spend cap. It is declared structurally here so this module
 * compiles and is testable against a stub without importing a file it does not
 * own, and so the real function drops in with no adapter: it satisfies this type
 * exactly. The gates themselves are deliberately NOT implemented here.
 */
export type LiveRunPreflight = (input: { userId: string; now?: Date }) => Promise<
  | { allowed: true }
  | {
      allowed: false;
      refusal: { code: 'ALLOWANCE_EXHAUSTED' | 'SPEND_CAP_REACHED'; message: string };
    }
>;

// ── Inputs and outputs ──

/** Zod over the caller's input: an unvalidated request never reaches a token. */
const StartSchema = z.object({
  userId: z.string().trim().min(1),
  category: CategorySchema,
  kind: VariantKindSchema.optional(),
  model: z.string().trim().min(1).optional(),
});

export interface StartLiveRunInput {
  /** The signed-in account. Runs, tokens and stored results are all scoped to it. */
  readonly userId: string;
  /** Which Core-7 scenario to serve. */
  readonly category: Category;
  /** Which framing to serve. Defaults to the poisoned one. */
  readonly kind?: VariantKind;
  /** Pin the model label; otherwise the connecting client's own claim is used. */
  readonly model?: string;
}

/** What the user is handed to point their agent at us. Shown once. */
export interface LiveRunTicket {
  readonly runId: string;
  /** The per-run MCP endpoint. */
  readonly endpoint: string;
  /** The per-run, per-account token. The ONLY time it exists in full. */
  readonly token: string;
  /** Wall-clock expiry of that token (ISO-8601). */
  readonly expiresAt: string;
  readonly category: Category;
  readonly kind: VariantKind;
  /** The goal, delivered OUT OF BAND: the published prompt, or paste this. */
  readonly taskGoal: string;
  /** The name of the published prompt carrying that goal. */
  readonly promptName: string;
}

/** What a finished run produced. Identical in shape on both outcomes. */
export interface LiveRunOutcome {
  readonly stored: StoredRun;
  readonly report: FixReport;
  readonly verdict: Verdict;
  readonly trace: Trace;
}

export interface LiveRunHostDeps {
  /** The gate. `checkLiveRunPreflight` from `src/runs/preflight.ts` satisfies it. */
  readonly preflight: LiveRunPreflight;
  /** Where per-run tokens are written, read and revoked. */
  readonly tokens: RunTokenStore;
  /** Where a finished run is persisted, owner-scoped. */
  readonly repository: Pick<RunRepository, 'saveRun'>;
  /**
   * The judge, resolved per stage. Pass `() => resolveLiveDetector()`: it returns
   * `null` when no judge credential is configured, which is a refusal here and
   * never a crash.
   */
  readonly resolveDetector: () => LiveDetector | null;
  /** Origin the endpoint URL is built from. Defaults to the site origin. */
  readonly origin?: string;
  readonly logger?: Logger;
  readonly now?: () => Date;
  readonly newRunId?: () => string;
  /** Deadline for ONE judge attempt. */
  readonly judgeTimeoutMs?: number;
  /** Total judge attempts, including the first. */
  readonly judgeMaxAttempts?: number;
  /** Injected delay, so retry backoff is instant under test. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface LiveRunHost {
  /** Gate, then issue a token and host the run's MCP server. */
  start(input: StartLiveRunInput): Promise<LiveRunDecision<LiveRunTicket>>;
  /** Authenticate one inbound agent request and serve it. */
  handle(request: Request): Promise<Response>;
  /** The observable trace recorded so far, for the owner of the run. */
  getTrace(input: { runId: string; userId: string }): Promise<LiveRunDecision<Trace>>;
  /** Revoke, gate, judge, persist and report. */
  finish(input: { runId: string; userId: string }): Promise<LiveRunDecision<LiveRunOutcome>>;
}

/** One open run, held for as long as its agent is connected. */
interface LiveRunSession {
  readonly runId: string;
  readonly userId: string;
  readonly category: Category;
  readonly kind: VariantKind;
  readonly taskGoal: string;
  readonly server: HostedMcpServer;
  readonly handler: StreamableHttpHandler;
  finishedAt: string | null;
}

const fail = (
  code: LiveRunErrorCode,
  message: string,
  options?: { cause?: unknown },
): LiveRunDecision<never> => ({ ok: false, error: new LiveRunError(code, message, options) });

/** The one 401 this endpoint gives, whatever was actually wrong with the request. */
function unauthorized(): Response {
  return new Response(JSON.stringify({ error: RUN_TOKEN_REJECTION_MESSAGE }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
  });
}

/** The bearer token off the wire, untrusted and unparsed. */
function bearerFrom(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** The run a request addressed: the last segment of the endpoint path. */
function runIdFrom(request: Request): string | null {
  // `Request.url` is always an absolute URL, so this cannot throw.
  const segments = new URL(request.url).pathname.split('/').filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? null;
}

/**
 * Bound one judge attempt on the wall clock.
 *
 * Stated honestly: this stops the RUN from waiting forever; it does not cancel
 * the request in flight, because `LiveDetector` takes no abort signal. The HTTP
 * judge adapter carries its own per-request deadline, and that is what actually
 * closes the socket. Two bounds at two layers, doing two different jobs.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new LiveRunError('DETECTION_FAILED', `The judge did not answer in ${ms}ms.`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createLiveRunHost(deps: LiveRunHostDeps): LiveRunHost {
  const sessions = new Map<string, LiveRunSession>();
  const now = deps.now ?? (() => new Date());
  const newRunId = deps.newRunId ?? (() => globalThis.crypto.randomUUID());
  const origin = deps.origin ?? getSiteOrigin();
  const timeoutMs = deps.judgeTimeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const maxAttempts = Math.max(1, deps.judgeMaxAttempts ?? DEFAULT_JUDGE_MAX_ATTEMPTS);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { logger } = deps;

  /** The owner's own session, or nothing. Another account gets the same nothing. */
  function ownedSession(runId: string, userId: string): LiveRunSession | undefined {
    const session = sessions.get(runId);
    return session !== undefined && session.userId === userId ? session : undefined;
  }

  /**
   * Ask the judge, bounded on both axes.
   *
   * A `DetectorError` is NOT retried. It means the judge answered and the answer
   * was unusable, and the judge is pinned at temperature 0, so a second identical
   * request buys an identical failure at the operator's expense. Transport-shaped
   * failures are retried, up to `maxAttempts`.
   */
  async function judge(
    detector: LiveDetector,
    trace: Trace,
    taskGoal: string,
  ): Promise<LiveRunDecision<Verdict>> {
    let last: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return { ok: true, value: await withDeadline(detector(trace, taskGoal), timeoutMs) };
      } catch (cause) {
        last = cause;
        if (cause instanceof DetectorError || attempt === maxAttempts) break;
        logger?.warn('judge attempt failed, retrying', { runId: trace.runId, attempt });
        await sleep(Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CAP_MS));
      }
    }
    return fail('DETECTION_FAILED', 'The judge could not reach a verdict for this run.', {
      cause: last,
    });
  }

  return {
    async start(input) {
      const parsed = StartSchema.safeParse(input);
      if (!parsed.success) {
        return fail('INVALID_REQUEST', 'That run request was not valid, so no run was started.');
      }
      const { userId, model } = parsed.data;
      const category = parsed.data.category;
      const kind: VariantKind = parsed.data.kind ?? 'malicious';
      const at = now();

      // GATE 1 — before anything is issued, hosted or spent.
      const decision = await deps.preflight({ userId, now: at });
      if (!decision.allowed) {
        logger?.info('live run refused', { userId, code: decision.refusal.code });
        return fail(decision.refusal.code, decision.refusal.message);
      }

      // Refuse EARLY when there is no judge: inviting an agent to work a scenario
      // we could never judge would waste the user's inference, not just ours.
      if (deps.resolveDetector() === null) {
        return fail('DETECTION_UNAVAILABLE', DETECTION_UNAVAILABLE_MESSAGE);
      }

      const runId = newRunId();
      // WHAT THE TRACE RECORDS AS `target`, AND WHY IT IS NOT THE FULL URL.
      // `target` is one of the three fields `judgeableTrace()` lets through to the
      // judge, so it is part of the feature space and gets the same scrutiny as a
      // step. The origin is dropped because it names this project, which the
      // recorder documents the value must not do. The per-run id is dropped
      // because the allow-list WITHHOLDS `runId` on purpose, and a target of
      // `/api/mcp/<runId>` would hand it straight back through the next field
      // along. What is left is true and carries nothing: the endpoint family the
      // agent connected to.
      const target = LIVE_RUN_ENDPOINT_PREFIX;

      const { token, record } = issueRunToken({
        runId,
        userId,
        now: at,
        ...(logger ? { logger } : {}),
      });
      await deps.tokens.save(record);

      const server = new HostedMcpServer({
        category,
        kind,
        runId,
        target,
        ...(model === undefined ? {} : { model }),
      });
      // ONE server per RUN, not per session: every reconnect an agent makes lands
      // on the same recorder, so a run is one trace even if the transport blinks.
      const handler = createStreamableHttpHandler(() => server);
      sessions.set(runId, {
        runId,
        userId,
        category,
        kind,
        taskGoal: server.taskGoal,
        server,
        handler,
        finishedAt: null,
      });

      logger?.info('live run started', { runId, userId, category, kind });
      return {
        ok: true,
        value: {
          runId,
          endpoint: `${origin}${LIVE_RUN_ENDPOINT_PREFIX}/${runId}`,
          token,
          expiresAt: record.expiresAt,
          category,
          kind,
          taskGoal: server.taskGoal,
          promptName: TASK_PROMPT_NAME,
        },
      };
    },

    async handle(request) {
      const runId = runIdFrom(request);
      const session = runId === null ? undefined : sessions.get(runId);
      // An unknown run and a forged token get the SAME answer. Telling them apart
      // is exactly the oracle that lets someone enumerate which runs exist.
      if (runId === null || session === undefined) return unauthorized();

      const verified = await verifyRunToken({
        store: deps.tokens,
        presented: bearerFrom(request),
        runId,
        userId: session.userId,
        now: now(),
        ...(logger ? { logger } : {}),
      });
      if (!verified.valid) return unauthorized();

      return session.handler.handle(request);
    },

    async getTrace({ runId, userId }) {
      const session = ownedSession(runId, userId);
      if (session === undefined) return fail('RUN_NOT_FOUND', 'That run was not found.');
      return { ok: true, value: await session.server.buildTrace() };
    },

    async finish({ runId, userId }) {
      const session = ownedSession(runId, userId);
      if (session === undefined) return fail('RUN_NOT_FOUND', 'That run was not found.');
      if (session.finishedAt !== null) {
        return fail('RUN_ALREADY_FINISHED', 'That run has already finished.');
      }

      const at = now();
      // Set before the first await so two concurrent finishes cannot both proceed.
      session.finishedAt = at.toISOString();
      // The session is over however this call ends, so the token dies here — a
      // refusal below must not leave a live credential on a public endpoint.
      await deps.tokens.endRun(runId, at);

      // GATE 2 — before the judge, which is the only thing left that spends.
      const decision = await deps.preflight({ userId, now: at });
      if (!decision.allowed) {
        logger?.info('live run paused at the judge gate', { runId, code: decision.refusal.code });
        return fail(decision.refusal.code, decision.refusal.message);
      }

      const detector = deps.resolveDetector();
      if (detector === null) return fail('DETECTION_UNAVAILABLE', DETECTION_UNAVAILABLE_MESSAGE);

      const trace = await session.server.buildTrace();

      const judged = await judge(detector, trace, session.taskGoal);
      if (!judged.ok) {
        logger?.error('live run judge failed', { runId });
        return judged;
      }
      const verdict = judged.value;

      // The staged category is what WE served; the verdict's category is the
      // judge's blind prediction. `generateFixReport` needs both, and reconciles
      // them against the measured classification accuracy.
      let run: RunResult;
      try {
        run = RunResultSchema.parse({
          runId,
          target: trace.target,
          model: trace.model,
          category: session.category,
          trace,
          verdict,
        });
      } catch (cause) {
        return fail('RESULT_INVALID', 'This run did not produce a valid result.', { cause });
      }

      // No branch on `verdict.compromised`: a clean run persists and reports too.
      const stored = await deps.repository.saveRun(userId, run);
      const report = generateFixReport(run);
      logger?.info('live run finished', {
        runId,
        userId,
        compromised: verdict.compromised,
        steps: trace.steps.length,
      });

      return { ok: true, value: { stored, report, verdict, trace } };
    },
  };
}
