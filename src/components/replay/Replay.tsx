'use client';

import { useEffect, useState } from 'react';
import type { RunResult } from '@/contract';
import { StepFocus } from './StepFocus';
import { StepTimeline } from './StepTimeline';
import { Transport } from './Transport';
import { StepDetail } from './StepDetail';
import { VerdictRail } from './VerdictRail';

/**
 * Live Attack Replay (the hero). One playhead drives a single legible timeline:
 * a horizontal rail whose fill sweeps to the active step, a "now playing" focal
 * card that carries the current step's identity, and the detector verdict that
 * stays SEALED until the playhead reaches the compromise step. The rail shows
 * glyphs + numbers only (never 13 stacked captions), so playback reads clearly.
 * The step-detail panel has a fixed height, so advancing the playhead never
 * reflows the page (no CLS during playback). No WebGL, no 3D core.
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

  const atEnd = current >= total - 1;

  // Autoplay: schedule the next step while playing; stop scheduling at the end.
  useEffect(() => {
    if (!playing || atEnd) return;
    const t = setTimeout(() => setCurrent((c) => Math.min(c + 1, total - 1)), 1100 / speed);
    return () => clearTimeout(t);
  }, [playing, current, atEnd, total, speed]);

  const step = steps[current]!;
  const compromised = current === compromiseIndex;
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

      {/* Stage (focal card + timeline rail) + verdict — co-visible */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-stretch">
        <div className="relative flex min-w-0 flex-col justify-between gap-6 rounded-lg border border-line bg-[radial-gradient(120%_120%_at_50%_20%,color-mix(in_srgb,var(--cyan-700)_10%,transparent),var(--surface-base)_72%)] p-5 lg:h-[336px]">
          <StepFocus step={step} index={current} total={total} compromised={compromised} />
          <StepTimeline
            steps={steps}
            current={current}
            compromiseIndex={compromiseIndex}
            onSelect={scrubTo}
          />
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

      <StepDetail step={step} index={current} compromised={compromised} />
    </div>
  );
}
