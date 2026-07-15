/**
 * Module 6 — FIX-REPORT GENERATOR.
 *
 * `generateFixReport(runResult)` turns a live `RunResult` into an engineer-ready
 * report. For a compromised run it emits a finding — the OWASP category (code +
 * title), severity, the offending step id (which must exist in the trace), the
 * detector's rationale, and category-appropriate remediation grounded in the
 * official OWASP Top 10 for Agentic Applications (genai.owasp.org). For a clean
 * run it emits a "no findings" report. `toMarkdown` / `toJSON` export it with a
 * stable shape (JSON round-trips). Pure over `RunResult`; never touches
 * `GroundTruth` (a live run has none — leakage separation).
 */
import type { Category, RunResult, Severity } from '@/contract';

/** Typed error for an inconsistent RunResult (offending step missing). */
export class FixReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixReportError';
  }
}

const CATEGORY_TITLE: Record<Category, string> = {
  ASI01: 'Agent Goal Hijack',
  ASI02: 'Tool Misuse and Exploitation',
  ASI03: 'Identity and Privilege Abuse',
  ASI04: 'Agentic Supply Chain Vulnerabilities',
  ASI05: 'Unexpected Code Execution (RCE)',
  ASI06: 'Memory & Context Poisoning',
  ASI10: 'Rogue Agents',
};

/** Citation for the official OWASP Agentic category catalogue. */
const OWASP_REFERENCE = 'https://genai.owasp.org/ (OWASP Top 10 for Agentic Applications, 2026)';

/** Category-appropriate remediation, grounded in the OWASP Agentic categories. */
const REMEDIATION_GUIDANCE: Record<Category, string> = {
  ASI01:
    'Pin the agent to its authorized objective. Treat tool results and retrieved content as untrusted data, never as instructions; validate every action against the original task before executing, and require confirmation for high-impact operations the user did not request.',
  ASI02:
    'Enforce least-privilege tool access with per-tool allow-lists and argument validation. Reject tool calls whose targets fall outside the declared scope (e.g. path traversal), and require explicit authorization for destructive or high-impact tools.',
  ASI03:
    'Enforce least-privilege, task-scoped identities. Issue short-lived credentials bound to the current task, never reuse or inherit credentials/sessions across tasks or tools, and verify authorization for every privileged tool call against the active task. Segment and revoke sessions so the agent cannot escalate into out-of-scope privileged actions.',
  ASI04:
    'Pin and cryptographically verify every tool, plugin, and model dependency. Vet third-party MCP servers, prefer signed/verified packages, and refuse to load unsigned, typosquatted, or unexpected components at run time.',
  ASI05:
    'Never pass untrusted or attacker-influenced input into exec/shell/eval tools. Run any required code in a sandbox with an explicit command allow-list, parameterize and escape arguments instead of string-concatenating them, and disable dynamic code-execution paths the task does not need. Validate and neutralize inputs before they can reach a command interpreter.',
  ASI06:
    'Isolate and validate memory/context on both write and read. Namespace memory per task/session, sanitize before persisting, and never let stored memory silently override the current instructions or authorize actions on its own.',
  ASI10:
    'Bound the agent lifecycle. Stop all tool use at task completion, deny post-task and out-of-scope actions, require truthful completion reporting, and monitor for self-directed or covert behavior so a rogue agent cannot act beyond its mandate.',
};

/** Category-appropriate remediation guidance + its OWASP citation. */
export interface Remediation {
  category: Category;
  categoryTitle: string;
  guidance: string;
  reference: string;
}

/** An engineer-ready finding for one compromised run. */
export interface Finding {
  category: Category;
  categoryTitle: string;
  severity: Severity;
  stepId: string;
  rationale: string;
  remediation: Remediation;
}

/** The fix report: a finding (compromised) or a clean "no findings" report. */
export interface FixReport {
  runId: string;
  target: string;
  model: string;
  compromised: boolean;
  finding: Finding | null;
  summary: string;
}

function remediationFor(category: Category): Remediation {
  return {
    category,
    categoryTitle: CATEGORY_TITLE[category],
    guidance: REMEDIATION_GUIDANCE[category],
    reference: OWASP_REFERENCE,
  };
}

/**
 * Build an engineer-ready fix report from a live `RunResult`. Pure over
 * `RunResult`; never references `GroundTruth`.
 *
 * @throws {FixReportError} if a compromised verdict has no offending step
 *   present in the trace.
 */
export function generateFixReport(run: RunResult): FixReport {
  const { runId, target, model, trace, verdict } = run;

  if (!verdict.compromised) {
    return {
      runId,
      target,
      model,
      compromised: false,
      finding: null,
      summary: 'No findings — the agent was not compromised in this run.',
    };
  }

  const { stepId } = verdict;
  if (stepId === undefined || !trace.steps.some((s) => s.id === stepId)) {
    throw new FixReportError(
      `Compromised verdict for run "${runId}" has no offending step present in the trace.`,
    );
  }

  const finding: Finding = {
    category: verdict.category,
    categoryTitle: CATEGORY_TITLE[verdict.category],
    severity: verdict.severity,
    stepId,
    rationale: verdict.rationale,
    remediation: remediationFor(verdict.category),
  };

  return {
    runId,
    target,
    model,
    compromised: true,
    finding,
    summary: `Compromised — ${verdict.category} (${finding.categoryTitle}), severity ${verdict.severity}. Offending step: ${stepId}.`,
  };
}

/** Render a `FixReport` as engineer-ready Markdown. */
export function toMarkdown(report: FixReport): string {
  if (report.finding === null) {
    return [
      `# Fix report — \`${report.runId}\``,
      '',
      `**Target:** ${report.target} · **Model:** ${report.model}`,
      '',
      '## No findings',
      '',
      report.summary,
      '',
    ].join('\n');
  }

  const f = report.finding;
  return [
    `# Fix report — ${f.category} · ${f.categoryTitle}`,
    '',
    `**Run:** \`${report.runId}\` · **Target:** ${report.target} · **Model:** ${report.model}`,
    `**Severity:** ${f.severity} · **Compromised:** yes`,
    `**Offending step:** \`${f.stepId}\``,
    '',
    '## Detector rationale',
    '',
    f.rationale,
    '',
    '## Remediation',
    '',
    f.remediation.guidance,
    '',
    `_Category:_ ${f.remediation.category} — ${f.remediation.categoryTitle}. _Reference:_ ${f.remediation.reference}`,
    '',
  ].join('\n');
}

/** Serialize a `FixReport` as JSON. `JSON.parse(toJSON(r))` round-trips to `r`. */
export function toJSON(report: FixReport): string {
  return JSON.stringify(report, null, 2);
}
