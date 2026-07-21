'use client';

import { useEffect, useState } from 'react';
import type { RunResult } from '@/contract';
import { OrbitalStage } from './OrbitalStage';
import { Transport } from './Transport';
import { StepLegend } from './StepLegend';
import { StepDetail } from './StepDetail';
import { VerdictRail } from './VerdictRail';

/**
 * Live Attack Replay (the hero) — Sentinel v2 orbital. One playhead drives a
 * clock-face of typed nodes: the sweep rotates to the active step, the centre
 * carries the STEP numeral, and the detector verdict rail sits alongside with its
 * rationale sealed until the playhead reaches the compromise step. The step-detail
 * panel is fixed-height, so advancing never reflows the page (no CLS). SVG + CSS
 * only — no WebGL.
 */
const SPEEDS = [0.5, 1, 2, 4];

/** The attack narrative per Core-7 category (titles match the design reference). */
const CATEGORY_TITLE: Record<string, string> = {
  ASI01: 'Agent Goal Hijack',
  ASI02: 'Tool Misuse & Exploitation',
  ASI03: 'Identity & Privilege Abuse',
  ASI04: 'Agentic Supply Chain',
  ASI05: 'Unexpected Code Execution',
  ASI06: 'Memory & Context Poisoning',
  ASI10: 'Rogue Agents',
};

export function Replay({ run }: { run: RunResult }) {
  const steps = run.trace.steps;
  const total = steps.length;
  const compromiseIndex = steps.findIndex((s) => s.id === run.verdict.stepId);
  const compromiseStepNumber = compromiseIndex >= 0 ? compromiseIndex + 1 : null;
  const offStep = compromiseIndex >= 0 ? steps[compromiseIndex] : null;
  const offendingLabel = offStep && 'tool' in offStep ? offStep.tool : undefined;

  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const atEnd = current >= total - 1;

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
  const restart = () => {
    setPlaying(false);
    setCurrent(0);
  };

  const title = CATEGORY_TITLE[run.category] ?? 'Attack replay';

  return (
    <div className="flex min-h-[calc(100dvh-62px)] flex-col">
      {/* Header — kicker, title, and the run subline (enlarged). */}
      <header className="border-b border-line px-6 py-5 lg:px-8">
        <p className="micro-label text-nominal">Live Attack Replay</p>
        <h1 className="reading-h2 mt-2 font-semibold text-ink-hi">
          {run.category} · {title}
        </h1>
        <p className="mt-2 font-mono text-[14px] text-ink-muted">
          run <span className="text-readout">{run.runId}</span>
          <span aria-hidden="true"> · </span>
          <span className="text-readout">{total}</span> observable steps
          <span aria-hidden="true"> · </span>
          offending step <span className="text-breach-text">#{compromiseStepNumber ?? '—'}</span>
          <span aria-hidden="true"> · </span>
          leakage barrier <span className="text-nominal">on</span>
        </p>
      </header>

      {/* Stage grid — orbital + transport + detail (left column) · verdict (right). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <div className="flex items-center justify-center px-6 py-6 lg:col-start-1 lg:row-start-1 lg:px-8">
          <OrbitalStage
            steps={steps}
            current={current}
            compromiseIndex={compromiseIndex}
            onSelect={scrubTo}
          />
        </div>

        <div className="flex flex-col gap-3 border-y border-line px-6 py-4 lg:col-start-1 lg:row-start-2 lg:px-8">
          <Transport
            current={current}
            total={total}
            playing={playing && !atEnd}
            speed={speed}
            speeds={SPEEDS}
            onPlayToggle={playToggle}
            onStep={stepBy}
            onScrub={scrubTo}
            onRestart={restart}
            onSpeedSet={setSpeed}
          />
          <StepLegend />
        </div>

        <div className="min-h-0 px-6 py-5 lg:col-start-1 lg:row-start-3 lg:overflow-y-auto lg:px-8">
          <StepDetail step={step} index={current} compromised={compromised} />
        </div>

        <div className="border-t border-line px-6 py-5 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <VerdictRail
            verdict={run.verdict}
            compromiseStepNumber={compromiseStepNumber}
            offendingLabel={offendingLabel}
            revealed={revealed}
          />
        </div>
      </div>
    </div>
  );
}
