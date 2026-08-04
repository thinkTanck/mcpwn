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
import type { Category, RunResult, Severity, Step } from '@/contract';

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

/**
 * Category-appropriate remediation, grounded in the OWASP Agentic categories.
 *
 * An ORDERED SEQUENCE, not a paragraph: an engineer works a fix report top to
 * bottom, and numbering the actions is what makes the report actionable rather
 * than merely correct. `Remediation.guidance` still exposes the prose form
 * (`steps.join(' ')`) so a single source of truth serves both the screen's
 * ordered list and the Markdown export.
 */
const REMEDIATION_STEPS: Record<Category, readonly string[]> = {
  ASI01: [
    'Pin the agent to its authorized objective.',
    'Treat tool results and retrieved content as untrusted data, never as instructions.',
    'Validate every action against the original task before executing it.',
    'Require confirmation for high-impact operations the user did not request.',
  ],
  ASI02: [
    'Enforce least-privilege tool access with per-tool allow-lists and argument validation.',
    'Reject tool calls whose targets fall outside the declared scope (e.g. path traversal).',
    'Require explicit authorization for destructive or high-impact tools.',
  ],
  ASI03: [
    'Enforce least-privilege, task-scoped identities.',
    'Issue short-lived credentials bound to the current task.',
    'Never reuse or inherit credentials or sessions across tasks and tools.',
    'Verify authorization for every privileged tool call against the active task.',
    'Segment and revoke sessions so the agent cannot escalate into out-of-scope privileged actions.',
  ],
  ASI04: [
    'Pin and cryptographically verify every tool, plugin, and model dependency.',
    'Vet third-party MCP servers before granting them to an agent.',
    'Prefer signed and verified packages over convenience sources.',
    'Refuse to load unsigned, typosquatted, or unexpected components at run time.',
  ],
  ASI05: [
    'Never pass untrusted or attacker-influenced input into exec, shell, or eval tools.',
    'Run any required code in a sandbox with an explicit command allow-list.',
    'Parameterize and escape arguments instead of string-concatenating them.',
    'Disable dynamic code-execution paths the task does not need.',
    'Validate and neutralize inputs before they can reach a command interpreter.',
  ],
  ASI06: [
    'Isolate and validate memory and context on both write and read.',
    'Namespace memory per task or session, and sanitize it before persisting.',
    'Never let stored memory silently override the current instructions.',
    'Never let stored memory authorize an action on its own.',
  ],
  ASI10: [
    'Bound the agent lifecycle: stop all tool use at task completion.',
    'Deny post-task and out-of-scope actions.',
    'Require truthful completion reporting.',
    'Monitor for self-directed or covert behavior so a rogue agent cannot act beyond its mandate.',
  ],
};

/** Category-appropriate remediation guidance + its OWASP citation. */
export interface Remediation {
  category: Category;
  categoryTitle: string;
  /** The remediation as an ordered sequence of actions. */
  steps: readonly string[];
  /** The same steps as one prose paragraph (the Markdown/summary form). */
  guidance: string;
  reference: string;
}

/** An engineer-ready finding for one compromised run. */
export interface Finding {
  category: Category;
  categoryTitle: string;
  severity: Severity;
  stepId: string;
  /**
   * 1-based position of the offending step in the trace — the number the replay
   * timeline shows, so a reader can find it without counting.
   */
  stepIndex: number;
  /**
   * The offending step itself, quoted verbatim from the OBSERVABLE trace. The
   * report is evidence, and an engineer cannot act on a step id alone; this is
   * what the agent actually did. Never synthesized, never a label.
   */
  step: Step;
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
  const steps = REMEDIATION_STEPS[category];
  return {
    category,
    categoryTitle: CATEGORY_TITLE[category],
    steps,
    guidance: steps.join(' '),
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
      // No em dashes: this is authored product copy and it reaches both the
      // findings screen and the exported ticket (locked UI copy rule).
      summary: 'No findings: the agent was not compromised in this run.',
    };
  }

  const { stepId } = verdict;
  const stepIndex = stepId === undefined ? -1 : trace.steps.findIndex((s) => s.id === stepId);
  if (stepId === undefined || stepIndex < 0) {
    throw new FixReportError(
      `Compromised verdict for run "${runId}" has no offending step present in the trace.`,
    );
  }

  const finding: Finding = {
    category: verdict.category,
    categoryTitle: CATEGORY_TITLE[verdict.category],
    severity: verdict.severity,
    stepId,
    stepIndex: stepIndex + 1,
    step: trace.steps[stepIndex]!,
    rationale: verdict.rationale,
    remediation: remediationFor(verdict.category),
  };

  return {
    runId,
    target,
    model,
    compromised: true,
    finding,
    summary: `Compromised: ${verdict.category} (${finding.categoryTitle}), severity ${verdict.severity}. Offending step: ${stepId}.`,
  };
}

/** Render a `FixReport` as engineer-ready Markdown. */
export function toMarkdown(report: FixReport): string {
  if (report.finding === null) {
    return [
      `# Fix report · \`${report.runId}\``,
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
    `# Fix report · ${f.category} · ${f.categoryTitle}`,
    '',
    `**Run:** \`${report.runId}\` · **Target:** ${report.target} · **Model:** ${report.model}`,
    `**Severity:** ${f.severity} · **Compromised:** yes`,
    `**Offending step:** #${f.stepIndex} \`${f.stepId}\` (${f.step.type})`,
    '',
    '## Detector rationale',
    '',
    f.rationale,
    '',
    '## Remediation',
    '',
    ...f.remediation.steps.map((step, i) => `${i + 1}. ${step}`),
    '',
    `_Category:_ ${f.remediation.category} · ${f.remediation.categoryTitle}. _Reference:_ ${f.remediation.reference}`,
    '',
  ].join('\n');
}

/** Serialize a `FixReport` as JSON. `JSON.parse(toJSON(r))` round-trips to `r`. */
export function toJSON(report: FixReport): string {
  return JSON.stringify(report, null, 2);
}
