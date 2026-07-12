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
import { createPostgresRunRepository } from './postgres';

export * from './port';
export { createInMemoryRunRepository } from './in-memory';
export {
  createPostgresRunRepository,
  type SqlClient,
  type SqlClientFactory,
  type PostgresRepoOptions,
} from './postgres';

type Env = Record<string, string | undefined>;

/**
 * Select the repository adapter by `PERSISTENCE_DRIVER`. Memory is the default
 * (offline-safe); postgres validates `DATABASE_URL` lazily at construction. In
 * Phase 8 the postgres adapter's default client factory wires the real Neon
 * driver; until then constructing a postgres repository throws (no creds/driver).
 */
export function createRunRepository(env: Env = process.env): RunRepositoryPort {
  const persistence = getPersistenceConfig(env);
  if (persistence.driver === 'memory') {
    return createInMemoryRunRepository();
  }
  return createPostgresRunRepository({ env });
}
