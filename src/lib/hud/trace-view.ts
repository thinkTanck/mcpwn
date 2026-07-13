import type { RunResult, StepType } from '@/contract';

/**
 * Presentation helpers over an observable trace. The breach is NOT a step
 * property — it is derived solely from `verdict.stepId` (leakage barrier), so
 * `isBreachStep` takes the run, not the step.
 */
export function stepColorToken(type: StepType): string {
  switch (type) {
    case 'attacker':
      return 'var(--text)';
    case 'agent_reasoning':
      return 'var(--text-muted)';
    case 'tool_call':
    case 'tool_result':
      return 'var(--status-nominal)';
    case 'memory_read':
    case 'memory_write':
      return 'var(--line-emphasis)';
    case 'task_complete':
      return 'var(--status-caution)';
  }
}

export function isBreachStep(run: RunResult, stepId: string): boolean {
  return run.verdict.compromised && run.verdict.stepId === stepId;
}

/** Zero-based index of the offending step in the trace, or -1 if none. */
export function breachIndex(run: RunResult): number {
  const id = run.verdict.stepId;
  return id ? run.trace.steps.findIndex((s) => s.id === id) : -1;
}
