import { getAttack } from '@/attacks';
import { CategorySchema, type Category, type RunResult, type Step, type Verdict } from '@/contract';
import { bandFor } from '@/lib/hud/bands';
import { leaderboardFixture } from './fixtures/leaderboard';
import { findingsFixture } from './fixtures/findings';
import { SAMPLE_VERDICTS, type OffendingAnchor } from './fixtures/sample-verdicts';

/**
 * DataSource port — the boundary the screens read through. The in-memory adapter
 * serves curated fixtures now; an HTTP adapter can implement the same interface
 * later. Screens/components depend on this interface, never on the fixtures
 * directly. Everything returned is OBSERVABLE (no `groundTruth`).
 *
 * SAMPLE RUNS come from the REAL attack builders (module 2): the trace served for
 * each category IS `attacks.build(category, 'malicious').trace` — a single source
 * of truth with the attacks we build and measure. The paired verdict is a
 * curated, provenance-labelled PLACEHOLDER (see `sample-verdicts.ts`), never
 * derived from the held-out `GroundTruth` (that is what keeps the leakage barrier
 * real, not cosmetic). Phase 8 records actual validated-judge verdicts to replace
 * the placeholders.
 */

export type LeaderboardCell = { model: string; category: string; robustness: number };
export type LeaderboardRow = { model: string; cells: LeaderboardCell[]; overall: number };
export type Leaderboard = {
  categories: { id: string; full: string }[];
  rows: LeaderboardRow[];
  /** Honest provenance: this is placeholder fixture data, not a claimed benchmark. */
  source: 'fixture';
};

export type FixReport = {
  runId: string;
  category: string;
  severity: string;
  compromised: boolean;
  stepId: string;
  title: string;
  offendingStep: { label: string; lines: [string, string][] };
  impact: string;
  rootCause: string;
  remediation: string[];
  rationale: string;
};

/**
 * Fleet health for the command-deck FLEET STATUS — each run's verdict tallied
 * into the tri-state (nominal = not compromised · caution = compromised Low/Med
 * · breach = compromised High/Critical). `source` carries provenance so the UI
 * never conflates the curated sample with an account's measured runs.
 */
export type FleetStatus = {
  source: 'sample' | 'measured';
  nominal: number;
  caution: number;
  breach: number;
  total: number;
  empty: boolean;
};

export interface DataSource {
  getRun(id: string): Promise<RunResult | null>;
  listRuns(): Promise<RunResult[]>;
  getLeaderboard(): Promise<Leaderboard>;
  getFixReport(id: string): Promise<FixReport | null>;
  getFleetStatus(): Promise<FleetStatus>;
}

/**
 * Resolve the offending step id from the OBSERVABLE trace via the curator's
 * anchor (tool + occurrence). This reads only `trace.steps`, never
 * `groundTruth` — so a sample verdict can never copy the held-out label. Throws
 * if the anchor does not resolve, so a mis-curated sample fails loudly instead of
 * shipping a phantom step id.
 */
function anchorStepId(steps: readonly Step[], anchor: OffendingAnchor): string {
  const matches = steps.filter((s) => s.type === 'tool_call' && s.tool === anchor.tool);
  const step = anchor.occurrence === 'first' ? matches[0] : matches[matches.length - 1];
  if (!step) {
    throw new Error(
      `sample verdict anchor "${anchor.tool}" (${anchor.occurrence}) not found in the trace`,
    );
  }
  return step.id;
}

/**
 * Assemble the SAMPLE `RunResult` for a category: the REAL builder-constructed
 * malicious trace + a curated verdict. The held-out `groundTruth` returned by
 * `build()` is deliberately dropped here (leakage barrier).
 */
export function sampleRun(category: Category): RunResult {
  const { trace } = getAttack(category).build('malicious');
  const curated = SAMPLE_VERDICTS[category];
  const verdict: Verdict = {
    runId: trace.runId,
    compromised: true,
    score: curated.score,
    severity: curated.severity,
    category,
    rationale: curated.rationale,
    stepId: anchorStepId(trace.steps, curated.anchor),
  };
  return { runId: trace.runId, target: trace.target, model: trace.model, category, trace, verdict };
}

/** The whole sample library — one run per Core-7 category, built on demand. */
function sampleRuns(): RunResult[] {
  return CategorySchema.options.map(sampleRun);
}

/** The canonical sample run: ASI06 Memory & Context Poisoning (the hero demo). */
export const SAMPLE_CATEGORY: Category = 'ASI06';
export const SAMPLE_RUN_ID = sampleRun(SAMPLE_CATEGORY).runId;

const resolveId = (id: string) => (id === 'sample' ? SAMPLE_RUN_ID : id);

class InMemoryDataSource implements DataSource {
  getRun(id: string): Promise<RunResult | null> {
    const wanted = resolveId(id);
    return Promise.resolve(sampleRuns().find((r) => r.runId === wanted) ?? null);
  }
  listRuns(): Promise<RunResult[]> {
    return Promise.resolve(sampleRuns());
  }
  getLeaderboard(): Promise<Leaderboard> {
    return Promise.resolve(leaderboardFixture);
  }
  getFixReport(id: string): Promise<FixReport | null> {
    const wanted = resolveId(id);
    return Promise.resolve(findingsFixture.runId === wanted ? findingsFixture : null);
  }

  async getFleetStatus(): Promise<FleetStatus> {
    // Sample fleet: tally the curated leaderboard cells by tri-state band
    // (nominal ≥.80 · caution ≥.50 · breach <.50). A measured adapter would
    // instead tally the account's real run verdicts and report source:'measured'.
    const lb = await this.getLeaderboard();
    const cells = lb.rows.flatMap((row) => row.cells);
    const tally = { nominal: 0, caution: 0, breach: 0 };
    for (const cell of cells) tally[bandFor(cell.robustness)] += 1;
    return { source: 'sample', ...tally, total: cells.length, empty: cells.length === 0 };
  }
}

export function getDataSource(): DataSource {
  return new InMemoryDataSource();
}
