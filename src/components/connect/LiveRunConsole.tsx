'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CopyOut } from './CopyOut';
import {
  notWiredLiveRunPort,
  type ConnectLiveRunPort,
  type LiveRunPhase,
  type LiveRunRefusal,
  type LiveRunRefusalCode,
  type LiveRunStateView,
  type LiveRunTicketView,
} from './live-run-port';
import type { Category } from '@/contract';

/**
 * THE LIVE CONSOLE — the Connect screen under the inverted model
 * ([ADR-0006](docs/adr/0006-mcpwn-is-the-mcp-server.md)).
 *
 * The old panel asked for the user's agent endpoint and API key so we could call
 * them. We never call their agent. This panel does the inverse and says so on the
 * face of it: it ISSUES a per-run endpoint and token, explains how the task goal
 * reaches the agent when the protocol has no way to push it, and then WAITS on
 * state the server really observed.
 *
 * ── THE THREE RULES THIS PANEL IS BUILT AROUND ──
 *
 * 1. THE TOKEN IS A SECRET SHOWN ONCE. It lives in React state for the life of
 *    this component and nowhere else: no input element, no storage, no URL, no
 *    log. It is masked until revealed and copies while masked.
 *
 * 2. A STATE WE CANNOT OBSERVE IS NOT DRAWN. There is no progress bar, because
 *    there is no total; no "the agent is thinking", because reasoning is not
 *    observable from the server side and is never synthesized; and no inferred
 *    completion, because the server is the one that infers it. Every phase on
 *    screen came from a real reading, dated with when it was taken.
 *
 * 3. A REFUSAL FAILS CLOSED AND SAYS SO CALMLY. The allowance sentence is derived
 *    from configuration on the server and the spend-cap sentence quotes no
 *    numeral at all; this component prints what it was handed and authors
 *    neither. Refusals wear CAUTION, never the breach red: being out of free runs
 *    is not a compromise.
 */

/** How often the panel asks the server what it has seen. */
export const DEFAULT_POLL_INTERVAL_MS = 4000;

/** Heading per refusal. A label, not a sentence: the sentence comes from the server. */
const REFUSAL_HEADINGS: Record<LiveRunRefusalCode, string> = {
  NOT_SIGNED_IN: 'SIGN IN TO RUN LIVE',
  ALLOWANCE_EXHAUSTED: 'FREE LIVE RUNS USED',
  SPEND_CAP_REACHED: 'LIVE RUNS PAUSED',
  GATE_UNAVAILABLE: 'ALLOWANCE CHECK UNAVAILABLE',
  DETECTION_UNAVAILABLE: 'DETECTOR UNAVAILABLE',
  INVALID_REQUEST: 'RUN REQUEST REFUSED',
  RUN_NOT_FOUND: 'RUN NOT FOUND',
  RUN_ALREADY_FINISHED: 'RUN ALREADY FINISHED',
  NOT_WIRED: 'LIVE RUN NOT CONNECTED',
  REFUSED: 'RUN NOT STARTED',
};

/**
 * Refusals worth offering a retry for. An unreadable gate can be readable a
 * moment later; a spent allowance cannot, and a button that only ever fails is a
 * worse answer than no button.
 */
const RETRYABLE: readonly LiveRunRefusalCode[] = [
  'GATE_UNAVAILABLE',
  'INVALID_REQUEST',
  'RUN_NOT_FOUND',
  'REFUSED',
];

/** What each observed phase means, in the words a person would use. */
const PHASE_COPY: Record<LiveRunPhase, { label: string; line: string }> = {
  awaiting_agent: {
    label: 'AWAITING AGENT',
    line: 'No agent has connected yet. Nothing is recorded until one does.',
  },
  agent_connected: {
    label: 'AGENT CONNECTED',
    line: 'Your agent opened a session. No tool call has been recorded yet.',
  },
  recording: {
    label: 'RECORDING',
    line: 'Your agent is calling tools and every call is being recorded.',
  },
  finished: {
    label: 'RUN FINISHED',
    line: 'The session closed, so the run is complete and the trace is judged.',
  },
};

export function LiveRunConsole({
  port = notWiredLiveRunPort,
  category,
  signedIn,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
  port?: ConnectLiveRunPort;
  category: Category;
  signedIn: boolean;
  pollIntervalMs?: number;
}) {
  const [ticket, setTicket] = useState<LiveRunTicketView | null>(null);
  const [refusal, setRefusal] = useState<LiveRunRefusal | null>(null);
  const [state, setState] = useState<LiveRunStateView | null>(null);
  const [stateRefusal, setStateRefusal] = useState<LiveRunRefusal | null>(null);
  const [issuing, setIssuing] = useState(false);

  const issue = useCallback(async () => {
    setIssuing(true);
    setRefusal(null);
    const answer = await port.start({ category });
    setIssuing(false);
    if (answer.ok) {
      setTicket(answer.value);
      return;
    }
    setRefusal(answer.refusal);
  }, [port, category]);

  const runId = ticket?.runId ?? null;
  const finished = state?.phase === 'finished';

  // REAL STATE, ON A REAL READ. The first read happens the moment a run exists,
  // and the polling stops the moment the server says the run finished — there is
  // nothing further to observe and a timer that never stops is a leak.
  useEffect(() => {
    if (runId === null || finished) return;
    let live = true;
    const read = async () => {
      const answer = await port.readState({ runId });
      if (!live) return;
      if (answer.ok) {
        setState(answer.value);
        setStateRefusal(null);
      } else {
        setStateRefusal(answer.refusal);
      }
    };
    void read();
    const timer = setInterval(() => void read(), pollIntervalMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [port, runId, finished, pollIntervalMs]);

  if (!signedIn) return <SignInGate />;
  if (refusal !== null) return <Refusal refusal={refusal} onRetry={issue} />;
  if (ticket === null) return <BeforeIssue onIssue={issue} issuing={issuing} />;

  // The one piece of motion on this screen: the issued run eases in, once,
  // because the user just asked for it. Transform and opacity only, and
  // `prefers-reduced-motion` resolves it to the resting state (globals.css).
  return (
    <div className="panel-in flex flex-col gap-6">
      <Endpoint ticket={ticket} />
      <TaskGoal ticket={ticket} />
      <Connection state={state} refusal={stateRefusal} />
    </div>
  );
}

// ── Signed out ──

function SignInGate() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-caution/40 bg-caution/5 px-5 py-4">
      <div className="min-w-[220px] flex-1">
        <p className="micro-label text-caution">SIGN IN TO RUN LIVE</p>
        <p className="reading mt-1.5">
          A live run hosts an endpoint for your account and spends operator budget on the judge, so
          it needs an account. Sample playback needs no sign-in and no key.
        </p>
      </div>
      <Link
        href="/sign-in"
        className="min-h-11 shrink-0 rounded-md border border-line-em bg-nominal/5 px-5 py-2.5 font-mono text-[13px] leading-6 tracking-[0.08em] text-nominal transition-colors hover:bg-nominal/10"
      >
        SIGN IN
      </Link>
    </div>
  );
}

// ── Before anything is issued ──

function BeforeIssue({ onIssue, issuing }: { onIssue: () => void; issuing: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="reading">
        You point your agent at an endpoint we host. We serve the attack surface for the category
        you picked, and we record every tool call your agent chooses to make.
      </p>
      <p className="reading text-ink-muted">
        We never ask you for an endpoint or a key, because we never call out to anything. Everything
        our endpoint serves is fabricated attack content in a sandbox, and nothing real sits behind
        it.
      </p>
      <div>
        <button
          type="button"
          onClick={onIssue}
          className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-nominal bg-nominal/10 px-5 py-3 font-mono text-[14px] tracking-[0.08em] text-readout shadow-glow-nominal transition-colors hover:bg-nominal/20"
        >
          {issuing ? 'ISSUING' : 'ISSUE RUN ENDPOINT'}
        </button>
      </div>
    </div>
  );
}

// ── The issued run ──

function Endpoint({ ticket }: { ticket: LiveRunTicketView }) {
  return (
    <section aria-labelledby="connect-endpoint" className="flex flex-col gap-3">
      <h3 id="connect-endpoint" className="reading-h3">
        Point your agent here.
      </h3>
      <CopyOut label="RUN ENDPOINT" name="run endpoint" value={ticket.endpoint} />
      <CopyOut label="RUN TOKEN" name="run token" value={ticket.token} secret />
      <p className="reading text-ink-muted">
        The token is shown once and we cannot show it again, because we store only a hash of it.
        Send it as a bearer token on the connection. It opens this one run, on this one account, and
        it dies when the run ends or when it expires.
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="instrument-faint">
          EXPIRES <span className="readout">{ticket.expiresAt}</span>
        </span>
        <span className="instrument-faint">
          SERVING <span className="readout">{ticket.category}</span>
        </span>
      </div>
      <p className="reading text-ink-muted">
        The tools on this endpoint are hostile by design. A leaked token is worth one sandboxed run
        of invented content, never an account.
      </p>
    </section>
  );
}

function TaskGoal({ ticket }: { ticket: LiveRunTicketView }) {
  return (
    <section
      aria-labelledby="connect-goal"
      className="flex flex-col gap-3 border-t border-line pt-6"
    >
      <h3 id="connect-goal" className="reading-h3">
        Give your agent its task.
      </h3>
      <p className="reading">
        MCP has no message that lets a server tell an agent what its job is, so the goal has to
        reach your agent another way. There are two, and the first is better because the goal never
        leaves the protocol.
      </p>
      <div className="rounded-lg border border-line-em bg-nominal/5 px-4 py-3.5">
        <p className="micro-label mb-2">PREFERRED · PUBLISHED MCP PROMPT</p>
        <p className="reading">
          Our endpoint publishes the goal as a prompt. If your client supports prompts, list them on
          the connection you just made and fetch this one.
        </p>
        <p className="readout mt-2.5">{ticket.promptName}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <p className="reading">
          If your client does not support prompts, paste this into your agent instead. It is the
          same text the prompt serves.
        </p>
        <CopyOut label="TASK GOAL" name="task goal" value={ticket.taskGoal} tone="prose" />
      </div>
    </section>
  );
}

// ── Real connection state ──

function Connection({
  state,
  refusal,
}: {
  state: LiveRunStateView | null;
  refusal: LiveRunRefusal | null;
}) {
  const phase = state?.phase ?? null;
  const copy = phase === null ? null : PHASE_COPY[phase];
  // AWAITING is the neutral fourth state, not a warning and never a breach: we
  // have observed something real, and what we observed is "nothing has happened".
  const live = phase === 'agent_connected' || phase === 'recording' || phase === 'finished';

  return (
    <section
      aria-labelledby="connect-state"
      className="flex flex-col gap-3 border-t border-line pt-6"
    >
      <h3 id="connect-state" className="reading-h3">
        What we have actually seen.
      </h3>
      <div className="rounded-lg border border-line bg-panel/60 px-5 py-4" role="status">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span
            aria-hidden="true"
            className={cn('h-2.5 w-2.5 rounded-full', live && 'bg-nominal shadow-glow-nominal')}
            style={live ? undefined : { background: 'var(--status-inert)' }}
          />
          <span
            className="font-mono text-[13px] tracking-[0.08em]"
            style={live ? undefined : { color: 'var(--status-inert)' }}
          >
            {copy?.label ?? 'READING RUN STATE'}
          </span>
          {state !== null && (
            <span className="ml-auto flex items-baseline gap-2">
              {/* Evidence. Reported as read, never counted up or animated. */}
              <span className="display-md">{state.steps}</span>
              <span className="instrument-faint">steps recorded</span>
            </span>
          )}
        </div>
        <p className="reading mt-3">
          {copy?.line ?? 'We are reading the state of this run from the server.'}
        </p>
        {refusal !== null && <p className="reading mt-2 text-ink-muted">{refusal.message}</p>}
        {state !== null && (
          <p className="instrument-faint mt-3">
            LAST READING <span className="readout">{state.observedAt}</span>
          </p>
        )}
      </div>
      <p className="reading text-ink-muted">
        We record what your agent does, not what it thinks. Reasoning is not observable from this
        side of the connection and is never invented, so a live trace carries fewer steps than the
        constructed sample does.
      </p>
      {state?.phase === 'finished' && state.resultRunId !== null && (
        <div>
          <Link
            href={`/runs/${state.resultRunId}`}
            className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-nominal bg-nominal/10 px-5 py-3 font-mono text-[14px] leading-6 tracking-[0.08em] text-readout shadow-glow-nominal transition-colors hover:bg-nominal/20"
          >
            OPEN THE REPLAY
          </Link>
        </div>
      )}
    </section>
  );
}

// ── Refusal ──

function Refusal({ refusal, onRetry }: { refusal: LiveRunRefusal; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className="flex flex-col gap-2 rounded-lg border border-caution/40 bg-caution/5 px-5 py-4"
      >
        <p className="micro-label text-caution">{REFUSAL_HEADINGS[refusal.code]}</p>
        <p className="reading">{refusal.message}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/runs/sample"
          className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-line-em px-5 py-3 font-mono text-[14px] leading-6 tracking-[0.08em] text-ink transition-colors hover:border-nominal hover:text-readout"
        >
          WATCH THE SAMPLE RUN
        </Link>
        {RETRYABLE.includes(refusal.code) && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-line px-5 py-3 font-mono text-[14px] tracking-[0.08em] text-ink-muted transition-colors hover:border-line-em hover:text-ink"
          >
            TRY AGAIN
          </button>
        )}
      </div>
    </div>
  );
}
