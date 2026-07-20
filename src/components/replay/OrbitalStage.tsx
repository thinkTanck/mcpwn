'use client';

import { cn } from '@/lib/utils';
import type { Step } from '@/contract';
import { stepMeta, type NodeBand } from './step-meta';

/**
 * The orbital replay stage: 13 typed nodes placed AROUND a ring (by trig, so they
 * never collide into a caption smear the way a flat row did), a sweep line that
 * rotates to the active step, tilted depth rings that imply a 3D core, and a
 * centred STEP numeral. This is the Sentinel v2 hero: a clock-face, enlarged.
 *
 * Accessibility: the nodes are a real <ol> of labelled <button>s with aria-current
 * on the active one and the compromise node badged — a blind reader operates the
 * same control the sweep visualises. No WebGL; SVG + CSS transforms only.
 */

const R = 44; // node-ring radius as a % of the plate (matches the design)

function bandColor(band: NodeBand, breach: boolean): string {
  if (breach) return 'var(--status-breach)';
  if (band === 'nominal') return 'var(--status-nominal)';
  if (band === 'caution') return 'var(--status-caution)';
  return 'var(--ink-muted)';
}
function bandGlow(band: NodeBand, breach: boolean): string {
  if (breach) return '0 0 16px rgba(237,87,110,.85)';
  if (band === 'nominal') return '0 0 11px rgba(84,212,230,.55)';
  if (band === 'caution') return '0 0 12px rgba(235,181,97,.5)';
  return 'none';
}

export function OrbitalStage({
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
  const total = steps.length;
  const active = steps[current]!;
  const activeMeta = stepMeta(active.type);
  const activeBreach = current === compromiseIndex;
  const numColor = activeBreach
    ? 'var(--text-breach)'
    : active.type === 'task_complete'
      ? 'var(--status-caution)'
      : 'var(--text-readout)';
  const numGlow = activeBreach
    ? 'rgba(237,87,110,.5)'
    : active.type === 'task_complete'
      ? 'rgba(235,181,97,.4)'
      : 'rgba(84,212,230,.4)';
  const sweepDeg = (current / total) * 360 - 180;

  return (
    <div className="relative mx-auto aspect-square" style={{ width: 'min(100%, 460px, 54vh)' }}>
      {/* Outer ring — hairline + dashed cyan graticule ticks. */}
      <svg viewBox="0 0 560 560" className="pointer-events-none absolute inset-0 h-full w-full">
        <circle cx="280" cy="280" r="248" fill="none" stroke="var(--line)" strokeWidth="1" />
        <circle
          cx="280"
          cy="280"
          r="248"
          fill="none"
          stroke="var(--line-emphasis)"
          strokeWidth="1"
          strokeDasharray="1 9"
          opacity="0.7"
        />
        {/* Tilted depth rings imply a 3D core. */}
        <ellipse
          cx="280"
          cy="280"
          rx="150"
          ry="204"
          transform="rotate(-14 280 280)"
          fill="none"
          stroke="var(--line-emphasis)"
          strokeWidth="1"
          opacity="0.28"
        />
        <ellipse
          cx="280"
          cy="280"
          rx="118"
          ry="196"
          transform="rotate(62 280 280)"
          fill="none"
          stroke="var(--line-emphasis)"
          strokeWidth="1"
          opacity="0.2"
        />
        <ellipse
          cx="280"
          cy="280"
          rx="204"
          ry="80"
          transform="rotate(18 280 280)"
          fill="none"
          stroke="var(--line-emphasis)"
          strokeWidth="1"
          opacity="0.22"
        />
      </svg>

      {/* Soft core glow behind the numeral. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[26%] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--cyan-700) 22%, transparent), transparent 72%)',
        }}
      />

      {/* Sweep line — rotates to the active step (position, not evidence). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 origin-top transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: '2px',
          height: `${R}%`,
          transform: `rotate(${sweepDeg}deg)`,
          background: 'linear-gradient(180deg, rgba(84,212,230,0) 30%, rgba(84,212,230,.7))',
        }}
      />

      {/* Nodes around the ring. */}
      <ol aria-label="Attack replay step timeline" className="absolute inset-0">
        {steps.map((step, i) => {
          const meta = stepMeta(step.type);
          const breach = i === compromiseIndex;
          const activeNode = i === current;
          const reached = i <= current;
          const a = (i / total) * 2 * Math.PI - Math.PI / 2;
          const left = 50 + R * Math.cos(a);
          const top = 50 + R * Math.sin(a);
          const size = breach ? 16 : 11;
          const dotBg = reached ? bandColor(meta.band, breach) : 'rgba(71,96,108,.3)';
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={activeNode ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${meta.label}${breach ? ', compromise step' : ''}`}
                onClick={() => onSelect(i)}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-md p-1"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <span
                  className={cn(
                    'rounded-full transition-all',
                    breach && reached && 'animate-pulse',
                  )}
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    background: dotBg,
                    boxShadow: reached ? bandGlow(meta.band, breach) : 'none',
                    border: activeNode ? '2px solid var(--text-readout)' : '2px solid transparent',
                  }}
                />
                <span
                  className="font-mono text-[14px] tabular-nums tracking-[0.04em]"
                  style={{
                    color: activeNode
                      ? 'var(--text-readout)'
                      : reached
                        ? 'var(--text-muted)'
                        : 'var(--text-pending)',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Centre — STEP / numeral / head, in a dark radial pill. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-9 py-6 text-center"
        style={{
          background: 'radial-gradient(closest-side, rgba(5,8,11,.85) 40%, rgba(5,8,11,0))',
        }}
      >
        <div className="font-mono text-[12px] tracking-[0.18em] text-ink-muted">STEP</div>
        <div
          className="font-sans font-bold leading-none tabular-nums"
          style={{
            fontSize: 'clamp(56px, 12vw, 76px)',
            letterSpacing: '-0.03em',
            color: numColor,
            textShadow: `0 0 22px ${numGlow}`,
          }}
        >
          {String(current + 1).padStart(2, '0')}
        </div>
        <div
          className="mt-1 font-mono text-[13px] tracking-[0.06em]"
          style={{ color: activeBreach ? 'var(--text-breach)' : 'var(--text-muted)' }}
        >
          {activeBreach ? `${activeMeta.tag} · BREACH` : activeMeta.label}
        </div>
      </div>
    </div>
  );
}
