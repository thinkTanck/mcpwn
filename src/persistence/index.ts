/**
 * Persistence module — the repository port + adapter selection.
 *
 * `createRunRepository` selects an adapter by `PERSISTENCE_DRIVER` (memory by
 * default → offline boot with no creds). The Neon Postgres adapter (constructed
 * lazily from `DATABASE_URL`) arrives in increment 2.
 */
import { getPersistenceConfig } from '@/config/env';
import type { RunRepositoryPort } from './port';
import { createInMemoryRunRepository } from './in-memory';

export * from './port';
export { createInMemoryRunRepository } from './in-memory';

type Env = Record<string, string | undefined>;

/**
 * Select the repository adapter by `PERSISTENCE_DRIVER`. Memory is the default
 * (offline-safe); postgres validates `DATABASE_URL` lazily via getPersistenceConfig.
 */
export function createRunRepository(env: Env = process.env): RunRepositoryPort {
  const persistence = getPersistenceConfig(env);
  if (persistence.driver === 'memory') {
    return createInMemoryRunRepository();
  }
  // persistence.driver === 'postgres' — Neon adapter arrives in increment 2.
  throw new Error(
    'Postgres run repository is not available yet (the Neon adapter arrives in Phase 6 increment 2).',
  );
}
