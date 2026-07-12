/**
 * Persistence PORT — the boundary between the app and whatever stores runs.
 * Adapters (in-memory, Neon Postgres) implement `RunRepositoryPort`; callers
 * depend only on this port, so the backend is swappable without touching call
 * sites. The unit persisted is exactly the contract `RunResult` (a live,
 * unlabeled run), keyed by `runId`.
 */
import type { Category, RunResult } from '@/contract';

/** Optional filter for `list`. */
export interface RunFilter {
  model?: string;
  category?: Category;
}

/** Typed not-found error so callers can branch instead of guessing on `null`. */
export class RunNotFoundError extends Error {
  readonly runId: string;

  constructor(runId: string) {
    super(`No run found for runId "${runId}".`);
    this.name = 'RunNotFoundError';
    this.runId = runId;
  }
}

/**
 * The repository port. All methods are async so a network-backed adapter (Neon)
 * satisfies the same interface as the in-memory one. `get` throws
 * `RunNotFoundError` when the run is absent.
 */
export interface RunRepositoryPort {
  /** Persist a `RunResult` under `result.runId` (last-write-wins). */
  save(result: RunResult): Promise<void>;
  /** Load the `RunResult` for `runId`, or throw `RunNotFoundError`. */
  get(runId: string): Promise<RunResult>;
  /** List stored runs, optionally filtered by model and/or category. */
  list(filter?: RunFilter): Promise<RunResult[]>;
}
