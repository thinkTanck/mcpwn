'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';
import type { RunResult } from '@/contract';
import { StepTimeline } from './StepTimeline';
import { Transport } from './Transport';
import { StepDetail } from './StepDetail';
import { VerdictRail } from './VerdictRail';

// The WebGL core is code-split and never server-rendered, so its bundle never
// blocks LCP; it mounts only when Replay decides motion + WebGL are available.
const OrbitalCore = dynamic(() => import('./OrbitalCore'), { ssr: false });

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const DESKTOP = '(min-width: 1024px)';
function subscribeDesktop(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function desktopSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP).matches
    : false;
}

/**
 * Live Attack Replay (the hero). The transport drives one playhead; the 3D
 * orbital core is a desktop, motion-on, WebGL enhancement over the always-present
 * StepTimeline, so play and watch coexist and the fallback is a real timeline,
 * never a broken canvas. The step-detail panel has a fixed height, so advancing
 * the playhead never reflows the page (no CLS during playback).
 */
const SPEEDS = [0.5, 1, 2];

/**
 * The attack narrative per Core-7 category. The h1 must describe the run it is
 * showing, never a single hardcoded storyline — a non-ASI06 run titled "memory
 * poisoning to exfiltration" would misdescribe its own trace. Falls back to a
 * neutral phrase if a future category arrives before its headline is written.
 */
const CATEGORY_HEADLINE: Record<string, string> = {
  ASI01: 'agent goal hijack via indirect injection',
  ASI02: 'tool misuse and path traversal',
  ASI03: 'identity and privilege abuse',
  ASI04: 'agentic supply-chain compromise',
  ASI05: 'unexpected code execution',
  ASI06: 'memory poisoning to exfiltration',
  ASI10: 'rogue agent drift',
};

export function Replay({ run }: { run: RunResult }) {
  const steps = run.trace.steps;
  const total = steps.length;
  const compromiseIndex = steps.findIndex((s) => s.id === run.verdict.stepId);
  const compromiseStepNumber = compromiseIndex >= 0 ? compromiseIndex + 1 : null;

  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const speed = SPEEDS[speedIdx]!;

  const reduced = usePrefersReducedMotion();
  // Desktop as a subscription (server snapshot false → SSR renders the fallback).
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, () => false);
  // WebGL capability, computed once on the client (false on the server).
  const [webgl] = useState(() => typeof document !== 'undefined' && hasWebGL());

  const atEnd = current >= total - 1;
  const useOrbital = desktop && !reduced && webgl;

  // Autoplay: schedule the next step while playing; stop scheduling at the end.
  // Reduced-motion still advances (a discrete step change, not an animation).
  useEffect(() => {
    if (!playing || atEnd) return;
    const t = setTimeout(() => setCurrent((c) => Math.min(c + 1, total - 1)), 1100 / speed);
    return () => clearTimeout(t);
  }, [playing, current, atEnd, total, speed]);

  const step = steps[current]!;
  const revealed = compromiseIndex < 0 || current >= compromiseIndex;

  const playToggle = () => {
    if (atEnd) {
      setCurrent(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };
  const stepBy = (d: number) => {
    setPlaying(false);
    setCurrent((c) => Math.max(0, Math.min(total - 1, c + d)));
  };
  const scrubTo = (i: number) => {
    setPlaying(false);
    setCurrent(Math.max(0, Math.min(total - 1, i)));
  };

  const timeline = (
    <StepTimeline
      steps={steps}
      current={current}
      compromiseIndex={compromiseIndex}
      onSelect={scrubTo}
    />
  );

  return (
    <div className="flex min-h-[calc(100dvh-62px)] flex-col gap-4 px-6 py-6">
      {/* Header — static identifiers, bound to the real run (never literals) */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="micro-label text-nominal">Live Attack Replay</span>
          <h1 className="reading-h3 font-semibold text-ink-hi">
            {run.category} {CATEGORY_HEADLINE[run.category] ?? 'attack replay'}
          </h1>
        </div>
        <p className="instrument">
          run <span className="text-readout">{run.runId}</span>
          <span aria-hidden="true"> · </span>
          <span className="text-readout">{total}</span> steps
          <span aria-hidden="true"> · </span>
          {run.model}
        </p>
      </header>

      {/* Orbit / timeline + verdict — co-visible */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-stretch">
        <div className="relative min-w-0 rounded-lg border border-line bg-[radial-gradient(120%_120%_at_50%_45%,color-mix(in_srgb,var(--cyan-700)_10%,transparent),var(--surface-base)_72%)] p-3 lg:h-[336px]">
          {useOrbital ? (
            <>
              <OrbitalCore
                steps={steps}
                current={current}
                compromiseIndex={compromiseIndex}
                onSelect={scrubTo}
              />
              {/* The accessible, operable timeline stays in the DOM under the canvas. */}
              <div className="pointer-events-none absolute inset-x-3 bottom-3 opacity-90">
                <div className="pointer-events-auto">{timeline}</div>
              </div>
            </>
          ) : (
            <div className="h-full lg:flex lg:items-center">{timeline}</div>
          )}
        </div>
        <VerdictRail
          verdict={run.verdict}
          compromiseStepNumber={compromiseStepNumber}
          revealed={revealed}
        />
      </div>

      <Transport
        current={current}
        total={total}
        playing={playing && !atEnd}
        speed={speed}
        onPlayToggle={playToggle}
        onStep={stepBy}
        onScrub={scrubTo}
        onSpeed={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
      />

      <StepDetail step={step} index={current} compromised={current === compromiseIndex} />
    </div>
  );
}
