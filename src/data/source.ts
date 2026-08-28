import { getAttack } from '@/attacks';
import { CategorySchema, VerdictSchema, type Category, type RunResult } from '@/contract';
import { generateFixReport, type FixReport } from '@/fix-report';
import { bandFor } from '@/lib/hud/bands';
import type { Leaderboard } from '@/leaderboard/view';
import { leaderboardFixture } from './fixtures/leaderboard';
import { SAMPLE_VERDICTS, SAMPLE_VERDICT_PROVENANCE } from './fixtures/sample-verdicts';

/**
 * DataSource port — the boundary the screens read through. The in-memory adapter
 * serves the sample library now; an HTTP adapter can implement the same interface
 * later. Screens/components depend on this interface, never on the fixtures
 * directly. Everything returned is OBSERVABLE (no `groundTruth`).
 *
 * SAMPLE RUNS come from the REAL attack builders (module 2): the trace served for
 * each category IS `attacks.build(category, 'malicious').trace` — a single source
 * of truth with the attacks we build and measure. The paired verdict is RECORDED
 * from the frozen validated judge (see `sample-verdicts.ts`), never derived from
 * the held-out `GroundTruth` — the judge that produced it is blind to the label,
 * which is what keeps the leakage barrier real rather than cosmetic.
 *
 * FIX REPORTS come from the REAL module-6 generator (`@/fix-report`) over those
 * runs, so `/findings` renders the artifact the product actually produces instead
 * of a hand-authored stand-in for it.
 */

/**
 * The leaderboard view model is module 5's own type (`@/leaderboard/view`),
 * re-exported so screens keep importing it from the port they read through.
 * There is ONE declaration of it, on the presenter that produces it: a second
 * copy here is how a cell's provenance would quietly get dropped on the way to
 * a screen.
 */
export type {
  BoardProvenance,
  CellState,
  Leaderboard,
  LeaderboardCell,
  LeaderboardRow,
} from '@/leaderboard/view';

/**
 * The fix report is module 6's type, re-exported so screens keep importing it
 * from the port they read through. There was a SECOND, UI-shaped `FixReport`
 * declared here that the findings screen rendered from a fixture, while the real
 * generator shipped dark behind it — two types with one name, and only one of
 * them was ever exercised by the product. One canonical type now: this is an
 * alias, not a parallel definition.
 */
export type { FixReport } from '@/fix-report';

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
  /**
   * Where this run's verdict came from, or `null` if the adapter cannot say. A
   * verdict and its provenance travel together or not at all, so a screen can
   * state plainly that a demonstration is a demonstration.
   */
  getVerdictProvenance(id: string): Promise<string | null>;
  getFleetStatus(): Promise<FleetStatus>;
}

/**
 * Assemble the SAMPLE `RunResult` for a category: the REAL builder-constructed
 * malicious trace + the RECORDED validated-judge verdict. The held-out
 * `groundTruth` returned by `build()` is deliberately dropped here, and the
 * recorded `stepId` is the judge's own answer over the observable trace, so no
 * part of this assembly can copy a label.
 *
 * The verdict is schema-validated on the way through and the anchored step must
 * exist in the trace, so a recording that no longer matches its builder (a step
 * renumbered, a scenario rewritten) fails LOUDLY here instead of shipping a
 * phantom step id to the replay.
 */
export function sampleRun(category: Category): RunResult {
  const { trace } = getAttack(category).build('malicious');
  const recorded = SAMPLE_VERDICTS[category];
  const verdict = VerdictSchema.parse({
    runId: trace.runId,
    compromised: recorded.compromised,
    score: recorded.score,
    severity: recorded.severity,
    category: recorded.category,
    rationale: recorded.rationale,
    ...(recorded.stepId !== undefined ? { stepId: recorded.stepId } : {}),
  });
  if (verdict.stepId !== undefined && !trace.steps.some((s) => s.id === verdict.stepId)) {
    throw new Error(
      `recorded sample verdict for ${category} anchors step "${verdict.stepId}", which is not in the trace`,
    );
  }
  return { runId: trace.runId, target: trace.target, model: trace.model, category, trace, verdict };
}

/** The whole sample library — one run per Core-7 category, built on demand. */
function sampleRuns(): RunResult[] {
  return CategorySchema.options.map(sampleRun);
}

/** The canonical sample run: ASI02 Tool Misuse and Exploitation (the hero demo). */
export const SAMPLE_CATEGORY: Category = 'ASI02';
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
    const run = sampleRuns().find((r) => r.runId === wanted);
    // The REAL module-6 generator, over the run the replay screen shows. Every
    // Core-7 sample now has a fix report, not just the hero one.
    return Promise.resolve(run ? generateFixReport(run) : null);
  }

  getVerdictProvenance(id: string): Promise<string | null> {
    const wanted = resolveId(id);
    const known = sampleRuns().some((r) => r.runId === wanted);
    return Promise.resolve(known ? SAMPLE_VERDICT_PROVENANCE : null);
  }

  async getFleetStatus(): Promise<FleetStatus> {
    // Sample fleet: tally the curated leaderboard cells by tri-state band
    // (nominal ≥.80 · caution ≥.50 · breach <.50). A measured adapter would
    // instead tally the account's real run verdicts and report source:'measured'.
    const lb = await this.getLeaderboard();
    const tally = { nominal: 0, caution: 0, breach: 0 };
    let total = 0;
    for (const cell of lb.rows.flatMap((row) => row.cells)) {
      // A cell with no runs behind it bands as nothing at all: an absence is not
      // a nominal, a caution or a breach, and it is not part of the total.
      if (cell.robustness === null) continue;
      tally[bandFor(cell.robustness)] += 1;
      total += 1;
    }
    return { source: 'sample', ...tally, total, empty: total === 0 };
  }
}

export function getDataSource(): DataSource {
  return new InMemoryDataSource();
}
