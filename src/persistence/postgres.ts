/**
 * Neon Postgres adapter for `RunRepositoryPort` — constructed LAZILY.
 *
 * `DATABASE_URL` is validated only at construction (via `getPersistenceConfig`).
 * The SQL client is INJECTED: units pass a mock; the real Neon driver is wired in
 * Phase 8 by supplying a `clientFactory` (the default factory is a loud stub, so
 * accidental offline use fails clearly rather than fabricating rows). On READ,
 * rows are Zod-parsed back into a contract-valid `RunResult`.
 */
import { getPersistenceConfig } from '@/config/env';
import { RunResultSchema, type RunResult } from '@/contract';
import { RunNotFoundError, type RunFilter, type RunRepositoryPort } from './port';

/** The minimal SQL client the adapter needs (satisfied by node-postgres / Neon). */
export interface SqlClient {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

/** Builds a `SqlClient` from a validated postgres URL. Wired to the real Neon
 *  driver in Phase 8; a mock is injected in units. */
export type SqlClientFactory = (databaseUrl: string) => SqlClient;

export interface PostgresRepoOptions {
  clientFactory?: SqlClientFactory;
  env?: Record<string, string | undefined>;
}

const defaultSqlClientFactory: SqlClientFactory = () => {
  throw new Error(
    'No SQL client is wired for the postgres repository — inject a clientFactory. ' +
      'The real Neon driver is wired in Phase 8.',
  );
};

/** Parse a stored row's `data` column back into a contract-valid `RunResult`. */
function rowToRunResult(row: unknown): RunResult {
  return RunResultSchema.parse((row as { data?: unknown }).data);
}

/**
 * Construct the postgres-backed repository. Validates `DATABASE_URL` at
 * construction (lazy — nothing happens until this is invoked).
 */
export function createPostgresRunRepository(options: PostgresRepoOptions = {}): RunRepositoryPort {
  const persistence = getPersistenceConfig(options.env);
  if (persistence.driver !== 'postgres') {
    throw new Error('createPostgresRunRepository requires PERSISTENCE_DRIVER=postgres.');
  }
  const client = (options.clientFactory ?? defaultSqlClientFactory)(persistence.databaseUrl);

  return {
    async save(result: RunResult): Promise<void> {
      const parsed = RunResultSchema.parse(result);
      await client.query(
        'INSERT INTO runs (run_id, model, category, data) VALUES ($1, $2, $3, $4) ' +
          'ON CONFLICT (run_id) DO UPDATE SET model = EXCLUDED.model, ' +
          'category = EXCLUDED.category, data = EXCLUDED.data',
        [parsed.runId, parsed.model, parsed.category, parsed],
      );
    },

    async get(runId: string): Promise<RunResult> {
      const { rows } = await client.query('SELECT data FROM runs WHERE run_id = $1', [runId]);
      if (rows.length === 0) throw new RunNotFoundError(runId);
      return rowToRunResult(rows[0]);
    },

    async list(filter?: RunFilter): Promise<RunResult[]> {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filter?.model !== undefined) {
        params.push(filter.model);
        clauses.push(`model = $${params.length}`);
      }
      if (filter?.category !== undefined) {
        params.push(filter.category);
        clauses.push(`category = $${params.length}`);
      }
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await client.query(`SELECT data FROM runs${where}`, params);
      return rows.map(rowToRunResult);
    },
  };
}
