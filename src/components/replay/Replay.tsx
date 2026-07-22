'use client';

import { useEffect, useState } from 'react';
import type { RunResult } from '@/contract';
import { ReplayTerminal } from './ReplayTerminal';
import { Transport } from './Transport';
import { StepDetail } from './StepDetail';
import { VerdictRail } from './VerdictRail';

/**
 * Live Attack Replay (the hero) — two terminals over a full-width transport. The
 * transcript terminal streams the run's real input/output as a bash session; the
 * verdict terminal prints the detector's summary + an export prompt. The transport
 * (full width) and the step-detail box sit beneath both. The step-detail panel is
 * fixed-height, so advancing never reflows the page (no CLS).
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
    <div className="flex min-h-[calc(100dvh-72px)] flex-col">
      {/* Header — kicker + title. */}
      <header className="border-b border-line px-6 py-5 lg:px-8">
        <p className="micro-label text-nominal">Live Attack Replay</p>
        <h1 className="reading-h2 mt-2 font-semibold text-ink-hi">
          {run.category} · {title}
        </h1>
      </header>

      {/* Stage — two terminals in a row, then a full-width transport and the
          step-detail box directly beneath both (no dead gap). */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <ReplayTerminal
            steps={steps}
            current={current}
            compromiseIndex={compromiseIndex}
            model={run.model}
            onSelect={scrubTo}
          />
          <VerdictRail
            verdict={run.verdict}
            compromiseStepNumber={compromiseStepNumber}
            offendingLabel={offendingLabel}
          />
        </div>

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

        <StepDetail step={step} index={current} compromised={compromised} />
      </div>
    </div>
  );
}
