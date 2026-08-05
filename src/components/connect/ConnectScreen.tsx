'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CORE7 } from './categories';
import { LiveRunConsole } from './LiveRunConsole';
import type { ConnectLiveRunPort } from './live-run-port';
import type { Category } from '@/contract';

/**
 * CONNECT / RUN SETUP — the targeting console (register: PRODUCT).
 *
 * ── THE INVERSION THIS SCREEN EXISTS TO EXPRESS ──
 *
 * The retired console asked for the user's agent endpoint and API key so that we
 * could call their agent. [ADR-0006](docs/adr/0006-mcpwn-is-the-mcp-server.md)
 * reversed that: MCPwn IS the MCP server, and the user's agent connects to US.
 * So the screen no longer TAKES a target, it ISSUES one — a per-run endpoint and
 * a per-run token — and then waits on the real connection.
 *
 * The clearest signal of the inversion is what is missing: there is no field on
 * this screen at all. Nothing to type, nothing to paste, no credential of the
 * user's for us to promise to look after.
 *
 * ── ONE CATEGORY PER RUN ──
 *
 * The old console offered a seven-box checklist, which made sense when a run was
 * a batch of calls we made. It does not now: a run is ONE hosted endpoint serving
 * ONE attack `Environment`, because the environment IS the attack. So the
 * checklist is a radio group, and the same choice drives both modes — in sample
 * it picks which recorded run plays, in live it picks which surface we serve.
 *
 * ── TYPE ROLES ──
 *
 * Every sentence is a READING role (sans). Labels, chips and machine values are
 * INSTRUMENT (mono, 12-13px). The one DISPLAY value on the screen is the recorded
 * step count in the live console, which is evidence and is therefore printed as
 * read, never animated.
 */

type Mode = 'sample' | 'live';

/** Which recorded run each category plays. Resolved on the server; see the route. */
export type SampleRunIds = Partial<Record<Category, string>>;

/** The sample the screens ship with, when no per-category id was resolved. */
const CANONICAL_SAMPLE = 'sample';

/** The recorded run the sample library leads with (ADR-0003's hero demonstration). */
const DEFAULT_CATEGORY: Category = 'ASI06';

const MODES: [Mode, string][] = [
  ['sample', 'SAMPLE · no sign-in'],
  ['live', 'LIVE · your agent connects to us'],
];

/**
 * A section heading. The ordinal is OPTIONAL and that is the point.
 *
 * Numbered section markers are a known scaffolding tell, and they earn their
 * place only when the sections really are an ordered sequence. Setting a run up
 * IS one: pick how you are running, pick what you are running against, then get
 * your run. The DETECTOR band carries no number because it is not a step — it is
 * a fact stated at the point it matters, and numbering it would have told the
 * reader there was a fourth thing to do.
 */
function SectionHead({ n, label, id }: { n?: string; label: string; id: string }) {
  return (
    <h2 id={id} className="mb-4 flex items-baseline gap-3.5">
      {n && (
        <span className="font-sans text-[20px] font-semibold tracking-tight text-ink-hi">{n}</span>
      )}
      <span className="micro-label">{label}</span>
    </h2>
  );
}

function Section({ children, labelledBy }: { children: ReactNode; labelledBy: string }) {
  return (
    <section aria-labelledby={labelledBy} className="border-t border-line py-5 pb-6">
      {children}
    </section>
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

export function ConnectScreen({
  signedIn = false,
  sampleRunIds,
  sampleProvenance,
  livePort,
}: {
  signedIn?: boolean;
  /** Category to recorded-run id. Absent entries fall back to the canonical sample. */
  sampleRunIds?: SampleRunIds;
  /** What the sample IS, in the sample library's own words. */
  sampleProvenance?: string;
  /**
   * The live-run port. Injected so the screen is coded against the port and not
   * against a server module; see `./live-run-port.ts`. Absent means this build
   * has no live-run action bound, and the console says exactly that.
   */
  livePort?: ConnectLiveRunPort;
}) {
  const [mode, setMode] = useState<Mode>('sample');
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);

  const live = mode === 'live';
  const sampleHref = `/runs/${sampleRunIds?.[category] ?? CANONICAL_SAMPLE}`;

  return (
    <div className="type-flow mx-auto max-w-[1440px] px-6 py-10">
      <p className="micro-label mb-2.5 tracking-[0.18em] text-nominal">CONNECT / RUN</p>
      <h1 className="reading-h2 mb-2.5">Set up a red-team run.</h1>
      <p className="reading-lead mb-7 max-w-[68ch]">
        Watch a recorded sample, or run live: you point your own MCP agent at an endpoint we host,
        and we record every tool call it chooses to make. The same fixed, blind detector judges
        either trace.
      </p>

      {/* 01 · Mode */}
      <Section labelledBy="connect-mode-head">
        <SectionHead id="connect-mode-head" n="01" label="MODE" />
        <div className="flex max-w-[560px] flex-wrap gap-2.5" role="group" aria-label="Run mode">
          {MODES.map(([m, label]) => {
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
        <p className="reading mt-3 text-ink-muted">
          Sample playback needs no sign-in and no key. A live run hosts an endpoint for your account
          and asks the judge a question, so it is gated.
        </p>
      </Section>

      {/* 02 · Category */}
      <Section labelledBy="connect-category-head">
        <SectionHead
          id="connect-category-head"
          n="02"
          label="ATTACK CATEGORY · OWASP AGENTIC TOP-10"
        />
        <p className="reading mb-4 max-w-[68ch]">
          One run serves one attack surface, because the surface is the attack. Pick the one you
          want to test.
        </p>
        <div
          className="grid gap-2.5 md:grid-cols-2"
          role="radiogroup"
          aria-label="Attack category (OWASP Agentic Top 10)"
        >
          {CORE7.map((c) => {
            const checked = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                  checked ? 'border-line-em bg-nominal/5' : 'border-line hover:border-line-em',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    checked ? 'border-nominal text-nominal' : 'border-line text-transparent',
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                </span>
                <span className="shrink-0 font-mono text-[13px] text-ink-hi">{c.id}</span>
                <span className="font-sans text-[15px] text-ink">{c.title}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Detector — a stated fact, never a control, and never a numbered step */}
      <Section labelledBy="connect-detector-head">
        <SectionHead id="connect-detector-head" label="DETECTOR" />
        <div className="grid gap-5 md:grid-cols-2">
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
          <p className="reading">
            One fixed, validated judge, never user-swappable. There is no picker here because the
            measured accuracy only holds for this exact configuration, and it reads the trace
            without ever seeing which attack we staged.
          </p>
        </div>
      </Section>

      {/* 03 · The run itself */}
      <section aria-labelledby="connect-run-head" className="border-t border-line pt-5">
        <SectionHead
          id="connect-run-head"
          n="03"
          label={live ? 'YOUR RUN ENDPOINT' : 'RECORDED PLAYBACK'}
        />
        {live ? (
          <LiveRunConsole
            {...(livePort ? { port: livePort } : {})}
            category={category}
            signedIn={signedIn}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="reading max-w-[68ch]">
              The sample is a constructed run judged by the real frozen detector. It shows what a
              finding looks like; it is not a capture of a live agent, and it never claims to be.
            </p>
            {sampleProvenance && <p className="instrument-faint">{sampleProvenance}</p>}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href={sampleHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-nominal bg-nominal/10 px-5 py-3 font-mono text-[14px] leading-6 tracking-[0.08em] text-readout shadow-glow-nominal transition-colors hover:bg-nominal/20"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <polygon points="2,1 11,6 2,11" fill="currentColor" />
                </svg>
                PLAY SAMPLE RUN
              </Link>
              <span className="instrument">streams into Live Attack Replay</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
