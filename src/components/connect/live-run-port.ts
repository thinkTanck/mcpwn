import type { Category } from '@/contract';

/**
 * THE CONNECT SCREEN'S LOCAL PORT — the narrow thing the screen needs from the
 * server, and the ONE adapter at that boundary.
 *
 * Under [ADR-0006](../../../docs/adr/0006-mcpwn-is-the-mcp-server.md) a live run
 * is: we issue an endpoint and a token, the user's agent connects to US, and the
 * server records what it does. The screen therefore needs exactly two answers:
 *
 *   1. START — issue this run, or refuse it.
 *   2. READ STATE — what has the server actually observed since?
 *
 * That is the whole port. Anything the screen draws, it draws from those two
 * answers, which is what makes "show real connection state" enforceable rather
 * than aspirational: there is no third channel a fake state could come in on.
 *
 * ── WHY A PORT AND NOT A DIRECT CALL ──
 *
 * The server action and the lifecycle endpoints are built separately, so the
 * screen is coded against this type and the real functions are adapted in ONE
 * place: {@link createConnectLiveRunPort}. When the action lands, the whole
 * reconciliation is {@link StartLiveRunAction} and {@link ReadLiveRunStateAction}
 * below. This mirrors how `src/runs/live-run.ts` declares `LiveRunPreflight`
 * structurally rather than importing a module it does not own.
 *
 * ── THE ADAPTER'S JOB IS DISTRUST ──
 *
 * It normalizes before the screen sees anything. A phase it does not recognise,
 * a step count that is not a whole number, a thrown call: each becomes a stated
 * refusal, never a rendered guess. A screen that draws an unrecognised phase as
 * if it understood it is exactly the fake progress this redesign removes.
 *
 * The one thing the adapter NEVER does is rewrite a refusal sentence. The
 * allowance message is derived from configuration on the server
 * (`describeLiveRunAllowance`) and the spend-cap message deliberately quotes no
 * numeral at all; both arrive as finished copy and are printed as sent.
 */

/**
 * Why a live run did not proceed. The first three are the gates from
 * [ADR-0007](../../../docs/adr/0007-access-and-cost-model.md); `REFUSED` is the
 * honest bucket for a code this build does not know, so a newer server can add
 * one without this screen inventing a meaning for it.
 */
export type LiveRunRefusalCode =
  | 'NOT_SIGNED_IN'
  | 'ALLOWANCE_EXHAUSTED'
  | 'SPEND_CAP_REACHED'
  | 'GATE_UNAVAILABLE'
  | 'DETECTION_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'RUN_NOT_FOUND'
  | 'RUN_ALREADY_FINISHED'
  | 'NOT_WIRED'
  | 'REFUSED';

/** Every code the screen has copy of its own for. Anything else prints plainly. */
const KNOWN_CODES: readonly LiveRunRefusalCode[] = [
  'NOT_SIGNED_IN',
  'ALLOWANCE_EXHAUSTED',
  'SPEND_CAP_REACHED',
  'GATE_UNAVAILABLE',
  'DETECTION_UNAVAILABLE',
  'INVALID_REQUEST',
  'RUN_NOT_FOUND',
  'RUN_ALREADY_FINISHED',
  'NOT_WIRED',
  'REFUSED',
];

/** A refusal. `message` is already the sentence a screen prints, unedited. */
export interface LiveRunRefusal {
  readonly code: LiveRunRefusalCode;
  readonly message: string;
}

/** What the user is handed to point their agent at us. Issued once per run. */
export interface LiveRunTicketView {
  readonly runId: string;
  /** The per-run MCP endpoint the agent connects to. */
  readonly endpoint: string;
  /** The per-run, per-account token. A SECRET, and the only copy of it. */
  readonly token: string;
  /** ISO-8601 wall-clock expiry of that token. */
  readonly expiresAt: string;
  /** Which Core-7 surface this endpoint serves. */
  readonly category: Category;
  /** The published MCP prompt carrying the goal (the preferred delivery). */
  readonly promptName: string;
  /** The goal itself, for the paste fallback. */
  readonly taskGoal: string;
}

/**
 * What the server can honestly say about a run in flight.
 *
 * There is deliberately no "the agent is thinking" and no percentage: neither is
 * observable from the server side, and there is no total to be a percentage of.
 * `task_complete` is INFERRED (ADR-0006), which is why `finished` is a phase the
 * server reports rather than something this screen concludes from silence.
 */
export type LiveRunPhase = 'awaiting_agent' | 'agent_connected' | 'recording' | 'finished';

const PHASES: readonly LiveRunPhase[] = [
  'awaiting_agent',
  'agent_connected',
  'recording',
  'finished',
];

export interface LiveRunStateView {
  readonly runId: string;
  readonly phase: LiveRunPhase;
  /** Observable steps recorded so far. Evidence: reported, never animated. */
  readonly steps: number;
  /** ISO-8601 instant this reading was taken, so the screen can date it. */
  readonly observedAt: string;
  /** The run to replay, once the run has finished. `null` while it is open. */
  readonly resultRunId: string | null;
}

/** An answer, never a throw for a state a visitor can provoke. */
export type LiveRunAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: LiveRunRefusal };

export interface ConnectLiveRunPort {
  /** Issue this run's endpoint and token, or refuse. */
  start(input: { category: Category }): Promise<LiveRunAnswer<LiveRunTicketView>>;
  /** What the server has actually observed on this run. */
  readState(input: { runId: string }): Promise<LiveRunAnswer<LiveRunStateView>>;
}

// ── The boundary: the two server-facing shapes, declared structurally ──

/**
 * The server action that starts a live run. Declared here so the screen compiles
 * and is testable without importing a module it does not own; the real action
 * drops in when it satisfies this shape.
 */
export type StartLiveRunAction = (input: {
  category: Category;
}) => Promise<
  { ok: true; ticket: LiveRunTicketView } | { ok: false; code: string; message: string }
>;

/** The lifecycle read. Same contract, same reconciliation point. */
export type ReadLiveRunStateAction = (input: {
  runId: string;
}) => Promise<{ ok: true; state: LiveRunStateView } | { ok: false; code: string; message: string }>;

/** Nothing was issued because this build has no server action behind the screen. */
export const LIVE_RUN_NOT_WIRED_MESSAGE =
  'Starting a live run is not connected in this build, so nothing was issued and ' +
  'no token exists. Sample playback stays open to everyone.';

/** The server answered in a shape this build cannot read, so nothing is claimed. */
export const LIVE_RUN_UNREADABLE_STATE_MESSAGE =
  'We could not read this run just now, so nothing is being reported as observed. ' +
  'The run itself is unaffected.';

/** A call failed outright. The underlying detail is ours; it never becomes copy. */
export const LIVE_RUN_CALL_FAILED_MESSAGE =
  'We could not reach the run service just now, so nothing was started. Please try again.';

const refuse = (code: LiveRunRefusalCode, message: string): LiveRunAnswer<never> => ({
  ok: false,
  refusal: { code, message },
});

/** A code we have copy for, or the honest bucket. Never a silent reinterpretation. */
function readCode(code: string): LiveRunRefusalCode {
  return KNOWN_CODES.find((known) => known === code) ?? 'REFUSED';
}

/**
 * A reading is trusted only if every field is one we can render truthfully. A
 * step count that is not a whole non-negative number is not evidence, and a phase
 * outside the four is a state we cannot observe.
 */
function readState(value: LiveRunStateView): LiveRunStateView | null {
  if (!PHASES.includes(value.phase)) return null;
  if (!Number.isInteger(value.steps) || value.steps < 0) return null;
  if (typeof value.runId !== 'string' || value.runId.length === 0) return null;
  return {
    runId: value.runId,
    phase: value.phase,
    steps: value.steps,
    observedAt: value.observedAt,
    resultRunId: value.resultRunId ?? null,
  };
}

/**
 * THE ONE ADAPTER. Everything the screen knows about the server passes through
 * these two calls, so reconciling with the real action is a change to this file
 * and nowhere else.
 */
export function createConnectLiveRunPort(actions: {
  start: StartLiveRunAction;
  readState: ReadLiveRunStateAction;
}): ConnectLiveRunPort {
  return {
    async start(input) {
      let answer: Awaited<ReturnType<StartLiveRunAction>>;
      try {
        answer = await actions.start({ category: input.category });
      } catch {
        // The thrown detail belongs in our own telemetry, not on a visitor's
        // screen: it is the one thing here that could carry an internal name.
        return refuse('REFUSED', LIVE_RUN_CALL_FAILED_MESSAGE);
      }
      if (!answer.ok) return refuse(readCode(answer.code), answer.message);
      return { ok: true, value: answer.ticket };
    },

    async readState(input) {
      let answer: Awaited<ReturnType<ReadLiveRunStateAction>>;
      try {
        answer = await actions.readState({ runId: input.runId });
      } catch {
        return refuse('REFUSED', LIVE_RUN_UNREADABLE_STATE_MESSAGE);
      }
      if (!answer.ok) return refuse(readCode(answer.code), answer.message);
      const state = readState(answer.state);
      if (state === null) return refuse('REFUSED', LIVE_RUN_UNREADABLE_STATE_MESSAGE);
      return { ok: true, value: state };
    },
  };
}

/**
 * The default the screen falls back to while no server action is bound.
 *
 * It refuses, plainly, rather than pretending: an unwired live path is a fact
 * about this build, and stating it is the same discipline as
 * `resolveLiveDetector()` returning `null` instead of judging with something
 * unvalidated. No token is minted, no state is claimed, and sample playback is
 * named as the path that still works.
 */
export const notWiredLiveRunPort: ConnectLiveRunPort = {
  async start() {
    return refuse('NOT_WIRED', LIVE_RUN_NOT_WIRED_MESSAGE);
  },
  async readState() {
    return refuse('NOT_WIRED', LIVE_RUN_NOT_WIRED_MESSAGE);
  },
};
