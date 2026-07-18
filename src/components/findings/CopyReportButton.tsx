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
export function CopyReportButton({ report }: { report: FixReport }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatReport(report));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (no permission / insecure context): leave the
      // label unchanged rather than assert a copy that did not happen.
      setCopied(false);
    }
  }, [report]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onCopy}
      aria-label="Copy report"
      className="shrink-0 uppercase tracking-[0.08em]"
    >
      <span aria-live="polite">{copied ? 'COPIED ✓' : 'COPY REPORT'}</span>
    </Button>
  );
}
