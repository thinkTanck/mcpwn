/**
 * In-memory adapter for `RunRepositoryPort`.
 *
 * Backed by a `Map` keyed by `runId`. Used by tests and offline local dev.
 * State is isolated with DEEP COPIES on both write and read: the stored value is
 * a clone of the caller's object (later mutation of the source cannot corrupt
 * storage) and each read returns a fresh clone (a caller mutating a returned
 * object cannot corrupt storage either). `save` validates via `RunResultSchema`.
 */
import { RunResultSchema, type RunResult } from '@/contract';
import { RunNotFoundError, type RunFilter, type RunRepositoryPort } from './port';

/** Deep copy so stored state shares no references with the caller's object. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Construct a fresh in-memory repository. Each call has independent storage. */
export function createInMemoryRunRepository(): RunRepositoryPort {
  const store = new Map<string, RunResult>();

  return {
    async save(result: RunResult): Promise<void> {
      const parsed = RunResultSchema.parse(result);
      store.set(parsed.runId, clone(parsed));
    },

    async get(runId: string): Promise<RunResult> {
      const stored = store.get(runId);
      if (stored === undefined) throw new RunNotFoundError(runId);
      return clone(stored);
    },

    async list(filter?: RunFilter): Promise<RunResult[]> {
      let results = [...store.values()].map(clone);
      if (filter?.model !== undefined) results = results.filter((r) => r.model === filter.model);
      if (filter?.category !== undefined) {
        results = results.filter((r) => r.category === filter.category);
      }
      return results;
    },
  };
}
