'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Step } from '@/contract';
import { stepMeta, stepSummary, type NodeBand } from './step-meta';

/**
 * The step timeline rail: a single horizontal track of typed nodes with a
 * playhead that sweeps as playback advances. This is the whole hero visual (no
 * 3D core) and the operable control a blind reader always has — every node is a
 * labelled button, the active one carries aria-current, and the compromise node
 * is the only one badged.
 *
 * Legibility: the rail shows glyphs + step numbers only, never 13 stacked
 * captions (which collided into an unreadable smear). The active step's full
 * label lives in the StepFocus card above; a node's summary is on hover/focus via
 * a body PORTAL (position: fixed, so it escapes the shell's overflow clip).
 *
 * Colour is one of three channels, never alone: each node has a glyph, the
 * reached track is filled, the active node is ringed + glow-pulsed, and the
 * compromise node is badged BREACH.
 */
function bandDot(band: NodeBand, breach: boolean): string {
  if (breach) return 'bg-breach shadow-glow-breach';
  if (band === 'nominal') return 'bg-nominal shadow-glow-nominal';
  if (band === 'caution') return 'bg-caution shadow-glow-caution';
  return 'bg-ink-muted';
}

function glyphText(band: NodeBand, breach: boolean): string {
  if (breach) return 'text-breach-text';
  if (band === 'nominal') return 'text-nominal';
  if (band === 'caution') return 'text-caution';
  return 'text-ink';
}

type Tip = { x: number; y: number; text: string; breach: boolean };

export function StepTimeline({
  steps,
  current,
  compromiseIndex,
  onSelect,
}: {
  steps: Step[];
  current: number;
  compromiseIndex: number;
  onSelect: (index: number) => void;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const total = steps.length;
  const progress = total > 1 ? (current / (total - 1)) * 100 : 0;

  const showTip = (el: HTMLElement, i: number, breach: boolean) => {
    const r = el.getBoundingClientRect();
    setTip({
      x: r.left + r.width / 2,
      y: r.top,
      text: `${String(i + 1).padStart(2, '0')} · ${stepSummary(steps[i]!)}`,
      breach,
    });
  };

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="relative min-w-[520px] px-1 pt-1 lg:min-w-0">
        {/* Progress track behind the nodes — base hairline + a cyan fill that
            sweeps to the playhead. Inset by half a node so the fill runs centre
            to centre. Position, not evidence, so it may animate. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[19px] top-[19px] h-0.5"
        >
          <div className="absolute inset-0 rounded-full bg-line" />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-nominal shadow-glow-nominal transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol
          aria-label="Attack replay step timeline"
          className="relative flex items-start justify-between gap-1"
        >
          {steps.map((step, i) => {
            const meta = stepMeta(step.type);
            const breach = i === compromiseIndex;
            const active = i === current;
            const reached = i <= current;
            return (
              <li key={step.id} className="relative z-10 flex min-w-0 flex-col items-center">
                <button
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${meta.label}${breach ? ', compromise step' : ''}`}
                  onClick={() => onSelect(i)}
                  onMouseEnter={(e) => showTip(e.currentTarget, i, breach)}
                  onFocus={(e) => showTip(e.currentTarget, i, breach)}
                  onMouseLeave={() => setTip(null)}
                  onBlur={() => setTip(null)}
                  className="group flex flex-col items-center gap-1.5 rounded-md px-1 pt-1"
                >
                  <span
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full border bg-base transition-transform',
                      breach
                        ? 'border-breach/60'
                        : active
                          ? 'border-nominal/60'
                          : reached
                            ? 'border-line-em'
                            : 'border-line',
                      active && 'scale-110',
                      !reached && 'opacity-45',
                    )}
                  >
                    {/* Glow-pulse ring on the active/compromise node only. */}
                    {active && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-[-3px] animate-[pulse_2.4s_ease-in-out_infinite] rounded-full motion-reduce:animate-none',
                          breach ? 'shadow-glow-breach' : 'shadow-glow-nominal',
                        )}
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-1.5 rounded-full opacity-20',
                        bandDot(meta.band, breach),
                      )}
                    />
                    <svg width="16" height="16" viewBox="0 0 16 16" className="relative">
                      <path
                        d={meta.glyph}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={glyphText(meta.band, breach)}
                      />
                    </svg>
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[12px] tabular-nums tracking-[0.02em]',
                      active ? 'text-ink-hi' : reached ? 'text-ink-muted' : 'text-ink-faint',
                    )}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {breach && (
                    <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-breach-text">
                      Breach
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {tip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: tip.x,
              top: tip.y - 10,
              transform: 'translate(-50%, -100%)',
            }}
            className={cn(
              'pointer-events-none z-50 max-w-[15rem] rounded-md border bg-solid px-2.5 py-1.5 font-mono text-[12px] leading-snug shadow-glow-nominal',
              tip.breach ? 'border-breach/50 text-breach-text' : 'border-line-em text-readout',
            )}
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}
