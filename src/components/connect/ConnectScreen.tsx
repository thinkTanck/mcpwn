'use client';

import { useId, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/hud';
import { cn } from '@/lib/utils';
import { CORE7 } from './categories';
import type { Category } from '@/contract';
import type { LiveRunOutcome, LiveRunRequest } from '@/live';

/**
 * Connect / Run Setup — the targeting console (register: PRODUCT, the instrument
 * surface). Two modes share one console: SAMPLE playback (no key) and LIVE BYOK
 * red-teaming. The detector is fixed and BLIND · LOCKED in both — never
 * user-swappable — and live runs are gated behind sign-in.
 *
 * Type roles (globals.css): every sentence a human reads is a READING role
 * (sans, ≥16px); every readout / label / chip is an INSTRUMENT role (mono,
 * 12–13px). Prose never renders in an instrument role.
 */

type Mode = 'sample' | 'live';

const DEMO_MODELS = [
  { id: 'claude-sonnet', note: 'curated run' },
  { id: 'gpt-4.1', note: 'curated run' },
  { id: 'llama-3.1-70b', note: 'curated run' },
] as const;

/** Big sans step ordinal + mono section label — the numbered console sections. */
function StepHeader({ n, label }: { n: string; label: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3.5">
      <span className="font-sans text-[20px] font-semibold tracking-tight text-ink-hi">{n}</span>
      <span className="micro-label">{label}</span>
    </div>
  );
}

/** A bordered console section separated by a hairline top rule. */
function Section({ children }: { children: ReactNode }) {
  return <div className="border-t border-line py-5 pb-6">{children}</div>;
}

/** Labelled INSTRUMENT input: mono readout value, label associated by id. */
function Field({
  label,
  optional,
  type = 'text',
  placeholder,
  value,
  onChange,
  describedBy,
  helper,
  autoComplete,
  inputMode,
}: {
  label: string;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
  helper?: ReactNode;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'url';
}) {
  const id = useId();
  const helperId = describedBy ?? (helper ? `${id}-help` : undefined);
  return (
    <div>
      <label htmlFor={id} className="micro-label mb-2 block">
        {label}
        {optional && <span className="ml-1.5 text-ink-faint"> · optional</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-describedby={helperId}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-base px-3 py-2.5 font-mono text-[14px] text-readout placeholder:text-ink-faint focus-visible:border-nominal"
      />
      {helper && (
        <div id={helperId} className="mt-2 flex items-center gap-2 font-sans text-[15px] text-ink">
          {helper}
        </div>
      )}
    </div>
  );
}

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
    <rect
      x="2.5"
      y="5"
      width="7"
      height="5"
      rx="1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    />
    <path d="M4 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
);

/** The server action that runs a live red-team. Every gate is enforced inside it. */
export type LaunchLiveRun = (input: LiveRunRequest) => Promise<LiveRunOutcome>;

export interface ConnectScreenProps {
  /** Real session state from the server. Live runs are gated on it. */
  signedIn?: boolean;
  /**
   * Whether the LOCKED validated judge is connected. When false the console says
   * so plainly rather than presenting a live run as working.
   */
  liveRunEnabled?: boolean;
  launchLiveRun?: LaunchLiveRun;
}

export function ConnectScreen({
  signedIn = false,
  liveRunEnabled = false,
  launchLiveRun,
}: ConnectScreenProps) {
  const [mode, setMode] = useState<Mode>('sample');
  const [demoModel, setDemoModel] = useState<string>(DEMO_MODELS[0].id);
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [runs, setRuns] = useState('5');
  const [seed, setSeed] = useState('1337');
  const [selected, setSelected] = useState<Set<Category>>(() => new Set(CORE7.map((c) => c.id)));
  const [outcome, setOutcome] = useState<LiveRunOutcome | null>(null);
  const [pending, startLaunch] = useTransition();

  const live = mode === 'live';
  const showGate = live && !signedIn;
  const selectedCount = selected.size;
  // A live run needs an endpoint, a key, and at least one category. Sample is a
  // fixed playback, so it launches unconditionally (navigates to the replay).
  const liveReady = endpoint.trim() !== '' && apiKey.trim() !== '' && selectedCount > 0;

  /**
   * Hand the run to the server action. The client-side `liveReady` check is
   * convenience only: the action re-validates the endpoint, the key, the
   * categories, the session and the per-account cap on the server.
   */
  const onLaunch = () => {
    if (!launchLiveRun || pending) return;
    setOutcome(null);
    startLaunch(async () => {
      const modelValue = modelId.trim();
      const result = await launchLiveRun({
        endpoint: endpoint.trim(),
        apiKey,
        ...(modelValue === '' ? {} : { modelId: modelValue }),
        categories: [...selected],
      });
      // The secret has served its purpose in this browser tab; drop it.
      if (result.ok) setApiKey('');
      setOutcome(result);
    });
  };

  const toggleCategory = (id: Category) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="type-flow mx-auto max-w-[1440px] px-6 py-10">
      {/* Header */}
      <p className="micro-label !text-nominal mb-2.5 tracking-[0.18em]">CONNECT / RUN</p>
      <h1 className="reading-h2 mb-2.5">Set up a red-team run.</h1>
      <p className="reading-lead mb-7">
        Play a no-key sample, or connect your own MCP agent for a live run. Either way the same
        fixed, blind detector judges every trace.
      </p>

      {/* 01 · Mode */}
      <Section>
        <StepHeader n="01" label="MODE" />
        <div className="flex max-w-[460px] flex-wrap gap-2.5" role="group" aria-label="Run mode">
          {(
            [
              ['sample', 'SAMPLE · no key'],
              ['live', 'LIVE · bring your agent'],
            ] as [Mode, string][]
          ).map(([m, label]) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(m)}
                className={cn(
                  'min-h-11 flex-1 rounded-md border px-4 py-2.5 font-mono text-[13px] tracking-[0.08em] transition-colors',
                  active
                    ? 'border-nominal bg-nominal/10 text-readout shadow-glow-nominal'
                    : 'border-line bg-transparent text-ink-muted hover:border-line-em hover:text-ink',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {/* Surface the live gate at the point of choice, before any secret is typed. */}
        {showGate && (
          <p className="reading mt-2.5 text-ink-muted">
            Live runs require sign-in. Sample playback stays open with no key.
          </p>
        )}
      </Section>

      {/* 02 · Agent & detector */}
      <Section>
        <StepHeader n="02" label="AGENT & DETECTOR" />
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left: agent (sample picker or BYOK form) */}
          <div>
            {live ? (
              <>
                <p className="micro-label mb-3">CONNECT YOUR MCP AGENT</p>
                <div className="flex flex-col gap-3.5">
                  <Field
                    label="MCP ENDPOINT"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://your-agent.example/mcp"
                    value={endpoint}
                    onChange={setEndpoint}
                  />
                  <Field
                    label="API KEY / TOKEN"
                    type="password"
                    autoComplete="off"
                    placeholder="••••••••••••••••"
                    value={apiKey}
                    onChange={setApiKey}
                    helper={
                      <>
                        <span className="text-ink-faint">
                          <LockIcon />
                        </span>
                        Used server-side only, never stored.
                      </>
                    }
                  />
                  <Field
                    label="MODEL ID"
                    optional
                    placeholder="e.g. gpt-4.1 / claude-sonnet"
                    value={modelId}
                    onChange={setModelId}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="micro-label mb-3">DEMO AGENT</p>
                <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Demo agent">
                  {DEMO_MODELS.map((m) => {
                    const active = demoModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setDemoModel(m.id)}
                        className={cn(
                          'flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'border-line-em bg-nominal/5'
                            : 'border-line hover:border-line-em',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'h-2 w-2 rounded-full',
                            active ? 'bg-nominal shadow-glow-nominal' : 'bg-ink-faint',
                          )}
                        />
                        <span className="font-mono text-[14px] text-ink-hi">{m.id}</span>
                        <span className="ml-auto font-mono text-[13px] text-ink-muted">
                          {m.note}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Right: locked detector + run params */}
          <div>
            <p className="micro-label mb-3">DETECTOR</p>
            <div className="flex items-center gap-2.5 rounded-md border border-line-em bg-nominal/5 px-3.5 py-3">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="shrink-0 text-nominal"
              >
                <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="8" cy="8" r="2" fill="currentColor" />
              </svg>
              <span className="font-mono text-[13px] tracking-[0.08em] text-nominal">BLIND</span>
              <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[13px] tracking-[0.06em] text-ink-faint">
                <LockIcon />
                LOCKED
              </span>
            </div>
            <p className="reading mt-2">
              Fixed, validated judge; never user-swappable. The measured accuracy only holds for
              this exact config.
            </p>
            {/* RUNS/SEED parameterise a LIVE run; a curated sample is a fixed playback,
                so they only render in live mode (they would be inert in sample). */}
            {live && (
              <div className="mt-4 flex gap-3.5">
                <div className="flex-1">
                  <Field
                    label="RUNS / CATEGORY"
                    inputMode="numeric"
                    value={runs}
                    onChange={setRuns}
                  />
                </div>
                <div className="flex-1">
                  <Field label="SEED" inputMode="numeric" value={seed} onChange={setSeed} />
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* 03 · Categories */}
      <Section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3.5">
            <span className="font-sans text-[20px] font-semibold tracking-tight text-ink-hi">
              03
            </span>
            <span className="micro-label">ATTACK CATEGORIES · OWASP AGENTIC TOP-10</span>
          </div>
          <span className="instrument" aria-live="polite">
            {selectedCount} selected
          </span>
        </div>
        <div
          className="grid gap-2.5 md:grid-cols-2"
          role="group"
          aria-label="Attack categories (OWASP Agentic Top 10)"
        >
          {CORE7.map((c) => {
            const checked = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggleCategory(c.id)}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                  checked ? 'border-line-em bg-nominal/5' : 'border-line hover:border-line-em',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                    checked
                      ? 'border-nominal bg-nominal/20 text-nominal'
                      : 'border-line text-transparent',
                  )}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M2.5 6.5L5 9l4.5-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="shrink-0 font-mono text-[13px] text-ink-hi">{c.id}</span>
                <span className="font-sans text-[15px] text-ink">{c.title}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 04 · Launch */}
      <div className="border-t border-line pt-5">
        <StepHeader n="04" label="LAUNCH" />
        {showGate && (
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-caution/40 bg-caution/5 px-5 py-4">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="shrink-0 text-caution"
            >
              <rect
                x="3"
                y="7"
                width="10"
                height="7"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M5 7V4.8a3 3 0 0 1 6 0V7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
            <div className="min-w-[200px] flex-1">
              <p className="font-mono text-[13px] tracking-[0.06em] text-caution">
                SIGN IN TO RUN LIVE
              </p>
              <p className="reading mt-1">
                Live runs against your own agent require an account. Sample playback stays open with
                no key.
              </p>
            </div>
            <Link
              href="/sign-in"
              className="shrink-0 rounded-md border border-line-em bg-nominal/5 px-5 py-2.5 font-mono text-[13px] tracking-[0.08em] text-nominal transition-colors hover:bg-nominal/10 hover:shadow-glow-nominal"
            >
              SIGN IN →
            </Link>
          </div>
        )}
        {/* Honest status: the judge is operator-provided and LOCKED, and until it
            is connected a live run cannot be judged. Say so before the click. */}
        {live && !showGate && !liveRunEnabled && (
          <div className="mb-4 rounded-lg border border-line-em bg-panel px-5 py-4">
            <p className="font-mono text-[13px] tracking-[0.06em] text-ink-muted">
              LIVE RUNS NOT ENABLED YET
            </p>
            <p className="reading mt-1">
              The fixed, validated detector is not connected in this deployment, so no live run can
              be judged. Sample playback stays open with no key.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          {live ? (
            <Button
              onClick={onLaunch}
              disabled={showGate || !liveReady || pending}
              aria-disabled={showGate || !liveReady || pending}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <polygon points="2,1 11,6 2,11" fill="currentColor" />
              </svg>
              {pending ? 'LAUNCHING…' : 'LAUNCH LIVE RUN'}
            </Button>
          ) : (
            <Link
              href="/runs/sample"
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-nominal bg-nominal/10 px-5 py-3 font-mono text-[14px] tracking-[0.08em] text-readout shadow-glow-nominal transition-colors hover:bg-nominal/20"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <polygon points="2,1 11,6 2,11" fill="currentColor" />
              </svg>
              PLAY SAMPLE RUN
            </Link>
          )}
          <span className="instrument">→ streams into Live Attack Replay</span>
        </div>
        {live && !showGate && selectedCount === 0 && (
          <p className="reading mt-2.5 text-ink-muted">
            Select at least one attack category to launch.
          </p>
        )}
        {/* Result of the launch. Reserved as a live region so the outcome is
            announced without moving the transport above it. */}
        <div aria-live="polite" className="mt-4 empty:mt-0">
          {live && pending && (
            <p className="reading text-ink-muted">
              Running against your agent. This can take a while.
            </p>
          )}
          {live && !pending && outcome && !outcome.ok && (
            <div className="rounded-lg border border-caution/40 bg-caution/5 px-5 py-4">
              <p className="font-mono text-[13px] tracking-[0.06em] text-caution">RUN REFUSED</p>
              <p className="reading mt-1">{outcome.message}</p>
            </div>
          )}
          {live && !pending && outcome?.ok && (
            <div className="rounded-lg border border-line-em bg-nominal/5 px-5 py-4">
              <p className="font-mono text-[13px] tracking-[0.06em] text-nominal">
                {outcome.runs.length} RUN{outcome.runs.length === 1 ? '' : 'S'} RECORDED
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {outcome.runs.map((r) => (
                  <li key={r.id} className="font-mono text-[13px] text-ink">
                    <Link
                      href={`/runs/${r.id}`}
                      className="text-readout underline-offset-4 hover:underline"
                    >
                      {r.category}
                    </Link>
                    <span
                      className={cn('ml-3', r.compromised ? 'text-breach-text' : 'text-nominal')}
                    >
                      {r.compromised ? 'COMPROMISED' : 'CLEAR'}
                    </span>
                  </li>
                ))}
              </ul>
              {outcome.failed.length > 0 && (
                <p className="reading mt-2 text-ink-muted">
                  Not completed: {outcome.failed.join(', ')}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
