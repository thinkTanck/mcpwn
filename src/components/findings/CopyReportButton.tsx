'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/hud';
import type { FixReport } from '@/data/source';

/**
 * Serialise a fix report to a plain-text block an engineer can paste into a
 * ticket. Prose stays intact; telemetry (ids, severity, step) is labelled.
 */
export function formatReport(report: FixReport): string {
  const lines = [
    `MCPwn fix report`,
    `Title: ${report.title}`,
    `Category: ${report.category}`,
    `Severity: ${report.severity}`,
    `Run: ${report.runId}`,
    `Compromised: ${report.compromised ? 'yes' : 'no'}`,
    report.compromised ? `Offending step: ${report.stepId}` : null,
    ``,
    `Offending step`,
    report.offendingStep.label,
    ...report.offendingStep.lines.map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `Impact`,
    report.impact,
    ``,
    `Root cause`,
    report.rootCause,
    ``,
    `Remediation`,
    ...report.remediation.map((step, i) => `${i + 1}. ${step}`),
    ``,
    `Detector rationale`,
    report.rationale,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

/**
 * Client copy control: writes the report to the clipboard and swaps its label to
 * a confirmation so the copy is visible in the system status (Nielsen H1). The
 * accessible name stays stable while the visible label toggles.
 */
type CopyStatus = 'idle' | 'copied' | 'failed';

export function CopyReportButton({ report }: { report: FixReport }) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatReport(report));
      setStatus('copied');
      window.setTimeout(() => setStatus('idle'), 2000);
    } catch {
      // Clipboard unavailable (no permission / insecure context): announce the
      // FAILURE rather than assert a copy that did not happen (or fail silently).
      setStatus('failed');
      window.setTimeout(() => setStatus('idle'), 3000);
    }
  }, [report]);

  const label =
    status === 'copied' ? 'COPIED ✓' : status === 'failed' ? 'COPY FAILED' : 'COPY REPORT';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onCopy}
      aria-label="Copy report"
      className={`min-h-11 shrink-0 uppercase tracking-[0.08em] ${status === 'failed' ? 'text-breach-text' : ''}`}
    >
      <span aria-live="polite">{label}</span>
    </Button>
  );
}
