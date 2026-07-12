/**
 * Module 3 — RUN-MATRIX RUNNER.
 *
 * For each (model × attack) cell: drive the (mocked) MCP target through the
 * attack's live SCENARIO (harness → observable Trace), run the detector on the
 * TRACE + goal ONLY, and assemble a live `RunResult` { runId, target, model,
 * category, trace, verdict } — with NO groundTruth (a live run is unlabeled;
 * leakage separation). A failed cell becomes a typed `RunnerCellError` and never
 * crashes the matrix. Deterministic; ports are injected/mocked (real MCP + judge
 * arrive in Phase 8).
 */
import type { AttackModule } from '@/attacks';
import { RunResultSchema, type Category, type RunResult } from '@/contract';
import { record, type McpTargetPort } from '@/harness';
import type { DetectorFn } from '@/eval';

/** Ports + detector for the run matrix (mocked in units). */
export interface RunnerDeps {
  target: McpTargetPort;
  detect: DetectorFn;
  /** Label recorded as RunResult.target (the MCP endpoint under test). */
  targetLabel?: string;
}

/** A failed cell — typed so the matrix can report it without crashing. */
export class RunnerCellError extends Error {
  readonly model: string;
  readonly category: Category;

  constructor(model: string, category: Category, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RunnerCellError';
    this.model = model;
    this.category = category;
  }
}

/** The matrix outcome: successful RunResults + typed per-cell errors. */
export interface MatrixResult {
  results: RunResult[];
  errors: RunnerCellError[];
}

/**
 * Run every (model × attack) cell. The detector is handed only (trace, taskGoal);
 * the assembled RunResult carries no groundTruth.
 */
export async function runMatrix(
  models: string[],
  attacks: AttackModule[],
  deps: RunnerDeps,
): Promise<MatrixResult> {
  const targetLabel = deps.targetLabel ?? 'mock-target';
  const results: RunResult[] = [];
  const errors: RunnerCellError[] = [];

  for (const model of models) {
    for (const attack of attacks) {
      const category = attack.category;
      try {
        const scenario = attack.scenario('malicious');
        const runId = `${model}::${category}`;
        const trace = await record(deps.target, scenario, {
          runId,
          target: targetLabel,
          model,
          category,
        });
        const verdict = await deps.detect(trace, scenario.taskGoal);
        results.push(
          RunResultSchema.parse({ runId, target: targetLabel, model, category, trace, verdict }),
        );
      } catch (cause) {
        errors.push(
          new RunnerCellError(model, category, `Run failed for "${model}" on ${category}.`, {
            cause,
          }),
        );
      }
    }
  }

  return { results, errors };
}
