'use server';

/**
 * THE RUN-LIFECYCLE ACTIONS — start a live run, watch it, end it.
 *
 * These three calls are what `/connect` uses. They are the production caller of
 * `createLiveRunHost` on the control side, exactly as `/api/mcp/[runId]` is on
 * the agent side, and they add no policy of their own: the gate, the token, the
 * judge and persistence all belong to the pipeline.
 *
 * ── THE ACCOUNT IS READ, NEVER ACCEPTED ──
 *
 * Every action resolves the signed-in user on the server. There is no `userId`
 * parameter anywhere in this file, so a caller cannot start a run as somebody
 * else or ask about a run they do not own. A run belonging to another account and
 * a run that does not exist get the SAME refusal, so the id space cannot be
 * probed for which runs are real.
 *
 * ── BOTH GATES, AT BOTH ENDS ──
 *
 * `checkLiveRunPreflight` runs twice per run, and neither call is made here: the
 * pipeline calls it BEFORE it issues a token (a refused run mints nothing and
 * hosts nothing) and again BEFORE the judge (a cap that trips mid-run pauses
 * instead of spending). This layer wires the gate in and RELAYS its answer.
 * A gate that THROWS is a third case the pipeline names `GATE_UNAVAILABLE`, and
 * it fails closed like the rest: "we could not read your allowance" is a
 * different fact from "you are out of runs", and both stop the run.
 *
 * ── THE TICKET IS SHOWN ONCE ──
 *
 * `startLiveRun` returns the per-run token in full. That is the only moment it
 * exists in full anywhere: it is never logged, and storage holds a digest that
 * cannot produce it. A screen that loses it must start a new run.
 */
import type { Trace } from '@/contract';
import { getUser } from '@/lib/auth/user';
import type { LiveRunDecision, LiveRunError } from '@/runs/live-run';
import {
  getLiveRunHost,
  noteRunFinished,
  readAgentActivity,
  readRunFinishedAt,
} from '@/app/api/mcp/host';
import {
  INVALID_REQUEST_MESSAGE,
  LiveRunRefSchema,
  NOT_SIGNED_IN_MESSAGE,
  StartLiveRunRequestSchema,
  type LiveRunActionResult,
  type LiveRunPhase,
  type LiveRunStatusView,
  type LiveRunSummaryView,
  type LiveRunTicketView,
} from '@/app/actions/live-run-contract';

/** The signed-in account id, or `null`. Live runs are gated on it. */
async function currentUserId(): Promise<string | null> {
  const user = await getUser();
  return user?.id ?? null;
}

const notSignedIn = <T>(): LiveRunActionResult<T> => ({
  ok: false,
  code: 'NOT_SIGNED_IN',
  message: NOT_SIGNED_IN_MESSAGE,
});

const invalidRequest = <T>(): LiveRunActionResult<T> => ({
  ok: false,
  code: 'INVALID_REQUEST',
  message: INVALID_REQUEST_MESSAGE,
});

/** A pipeline refusal, relayed with its own code and its own sentence. */
const relay = <T>(error: LiveRunError): LiveRunActionResult<T> => ({
  ok: false,
  code: error.code,
  message: error.message,
});

/** Count the steps the agent itself chose to take. */
function toolCalls(trace: Trace): number {
  return trace.steps.filter((step) => step.type === 'tool_call').length;
}

/**
 * Start a live run: gate, issue a per-run endpoint and token, host the MCP server
 * the agent connects to, and hand back the out-of-band goal.
 */
export async function startLiveRun(
  input: unknown,
): Promise<LiveRunActionResult<LiveRunTicketView>> {
  const userId = await currentUserId();
  if (userId === null) return notSignedIn();

  const parsed = StartLiveRunRequestSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();

  const decision: LiveRunDecision<LiveRunTicketView> = await getLiveRunHost().start({
    userId,
    category: parsed.data.category,
    ...(parsed.data.kind === undefined ? {} : { kind: parsed.data.kind }),
    ...(parsed.data.model === undefined ? {} : { model: parsed.data.model }),
  });
  if (!decision.ok) return relay(decision.error);
  return { ok: true, value: decision.value };
}

/**
 * Where the run has got to: whether the agent has turned up, how much it has
 * done, and whether the run has been finished. Safe to poll.
 */
export async function getLiveRunStatus(
  input: unknown,
): Promise<LiveRunActionResult<LiveRunStatusView>> {
  const userId = await currentUserId();
  if (userId === null) return notSignedIn();

  const parsed = LiveRunRefSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  const { runId } = parsed.data;

  // Owner-scoped inside the pipeline: another account gets RUN_NOT_FOUND, which
  // is the same answer an id that never existed gets.
  const decision = await getLiveRunHost().getTrace({ runId, userId });
  if (!decision.ok) return relay(decision.error);

  const activity = readAgentActivity(runId);
  const finishedAt = readRunFinishedAt(runId);
  const phase: LiveRunPhase =
    finishedAt !== null ? 'finished' : activity !== null ? 'connected' : 'waiting';

  return {
    ok: true,
    value: {
      runId,
      phase,
      connectedAt: activity?.connectedAt ?? null,
      lastSeenAt: activity?.lastSeenAt ?? null,
      requests: activity?.requests ?? 0,
      steps: decision.value.steps.length,
      toolCalls: toolCalls(decision.value),
      finishedAt,
    },
  };
}

/**
 * End the run: revoke the token, gate again, judge the observable trace, persist
 * the result and produce the fix report. A run that resisted the attack finishes
 * exactly like one that did not; "no compromise" is a result, not an empty state.
 */
export async function finishLiveRun(
  input: unknown,
): Promise<LiveRunActionResult<LiveRunSummaryView>> {
  const userId = await currentUserId();
  if (userId === null) return notSignedIn();

  const parsed = LiveRunRefSchema.safeParse(input);
  if (!parsed.success) return invalidRequest();
  const { runId } = parsed.data;

  const decision = await getLiveRunHost().finish({ runId, userId });
  if (!decision.ok) return relay(decision.error);

  const { stored, verdict, trace } = decision.value;
  noteRunFinished(runId);
  return {
    ok: true,
    value: {
      runId,
      storedRunId: stored.id,
      compromised: verdict.compromised,
      // The judge's own classification. It is never rewritten to the class we
      // staged: a recorded verdict edited to match our label is the leakage this
      // project exists to avoid.
      category: verdict.category,
      severity: verdict.severity,
      stepId: verdict.stepId ?? null,
      steps: trace.steps.length,
    },
  };
}
