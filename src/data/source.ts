import type { RunResult } from '@/contract';
import { bandFor } from '@/lib/hud/bands';
import { asi06Run } from './fixtures/asi06-trace';
import { leaderboardFixture } from './fixtures/leaderboard';
import { findingsFixture } from './fixtures/findings';

/**
 * DataSource port — the boundary the screens read through. The in-memory adapter
 * serves curated fixtures now; an HTTP adapter can implement the same interface
 * later. Screens/components depend on this interface, never on the fixtures
 * directly. Everything returned is OBSERVABLE (no `groundTruth`).
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

/** Canonical id for the curated sample run; `'sample'` is accepted as an alias. */
export const SAMPLE_RUN_ID = 'RG-0472';

const runs: RunResult[] = [asi06Run];
const resolveId = (id: string) => (id === 'sample' ? SAMPLE_RUN_ID : id);

class InMemoryDataSource implements DataSource {
  getRun(id: string): Promise<RunResult | null> {
    const wanted = resolveId(id);
    return Promise.resolve(runs.find((r) => r.runId === wanted) ?? null);
  }
  listRuns(): Promise<RunResult[]> {
    return Promise.resolve(runs);
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
