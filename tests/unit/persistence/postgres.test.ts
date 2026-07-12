import { RunResultSchema, type Category, type RunResult } from '@/contract';
import { TraceBuilder } from '@/attacks/engine';
import { ConfigError } from '@/config/env';
import { createPostgresRunRepository, RunNotFoundError, type SqlClient } from '@/persistence';

const validPostgresEnv = {
  NODE_ENV: 'test',
  PERSISTENCE_DRIVER: 'postgres',
  DATABASE_URL: 'postgres://u:p@h:5432/db',
};

function makeRunResult(
  runId: string,
  model: string,
  category: Category,
  compromised: boolean,
): RunResult {
  const b = new TraceBuilder({ runId, target: 'mock-target', model, category });
  const stepId = b.toolCall('do_thing', { x: 1 });
  b.taskComplete('done');
  const trace = b.build();
  const verdict = compromised
    ? { runId, compromised: true, score: 0.9, severity: 'High', category, rationale: 'r', stepId }
    : { runId, compromised: false, score: 0.1, severity: 'None', category, rationale: 'r' };
  return RunResultSchema.parse({ runId, target: 'mock-target', model, category, trace, verdict });
}

function mockClient(
  impl?: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }>,
) {
  const query = vi.fn<(sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }>>(
    impl ?? (async () => ({ rows: [] })),
  );
  const client: SqlClient = { query };
  return { client, query };
}

describe('postgres run repository (mocked pg client)', () => {
  it('validates DATABASE_URL lazily at construction (missing → ConfigError)', () => {
    expect(() =>
      createPostgresRunRepository({ env: { NODE_ENV: 'test', PERSISTENCE_DRIVER: 'postgres' } }),
    ).toThrow(ConfigError);
  });

  it('requires PERSISTENCE_DRIVER=postgres', () => {
    expect(() =>
      createPostgresRunRepository({
        env: { PERSISTENCE_DRIVER: 'memory' },
        clientFactory: () => mockClient().client,
      }),
    ).toThrow();
  });

  it('the default client factory is a deferred stub (real Neon driver arrives in Phase 8)', () => {
    expect(() => createPostgresRunRepository({ env: validPostgresEnv })).toThrow();
  });

  it('with no options, reads process.env (offline is not postgres → throws)', () => {
    expect(() => createPostgresRunRepository()).toThrow();
  });

  it('save issues an upsert insert carrying the run fields', async () => {
    const { client, query } = mockClient();
    const repo = createPostgresRunRepository({
      env: validPostgresEnv,
      clientFactory: () => client,
    });
    const rr = makeRunResult('r1', 'model-a', 'ASI01', true);
    await repo.save(rr);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql.toUpperCase()).toContain('INSERT INTO');
    expect(sql.toUpperCase()).toContain('ON CONFLICT');
    expect(params).toEqual(['r1', 'model-a', 'ASI01', rr]);
  });

  it('get maps a row to a RunResult (Zod-parsed on read)', async () => {
    const rr = makeRunResult('r1', 'a', 'ASI01', false);
    const { client, query } = mockClient(async () => ({ rows: [{ data: rr }] }));
    const repo = createPostgresRunRepository({
      env: validPostgresEnv,
      clientFactory: () => client,
    });
    expect(await repo.get('r1')).toEqual(rr);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql.toUpperCase()).toContain('SELECT');
    expect(params).toEqual(['r1']);
  });

  it('get(missing) → RunNotFoundError', async () => {
    const { client } = mockClient(async () => ({ rows: [] }));
    const repo = createPostgresRunRepository({
      env: validPostgresEnv,
      clientFactory: () => client,
    });
    await expect(repo.get('nope')).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('get rejects a row whose data is not a valid RunResult (Zod-parse on read)', async () => {
    const { client } = mockClient(async () => ({ rows: [{ data: { bogus: true } }] }));
    const repo = createPostgresRunRepository({
      env: validPostgresEnv,
      clientFactory: () => client,
    });
    await expect(repo.get('r1')).rejects.toBeTruthy();
  });

  it('list maps rows to RunResults and applies filters in SQL', async () => {
    const rows = [
      { data: makeRunResult('r1', 'a', 'ASI01', false) },
      { data: makeRunResult('r2', 'a', 'ASI02', true) },
    ];
    const { client, query } = mockClient(async () => ({ rows }));
    const repo = createPostgresRunRepository({
      env: validPostgresEnv,
      clientFactory: () => client,
    });

    expect((await repo.list()).map((r) => r.runId)).toEqual(['r1', 'r2']);
    const [listAllSql] = query.mock.calls[0]!;
    expect(listAllSql.toUpperCase()).not.toContain('WHERE');

    await repo.list({ model: 'a', category: 'ASI01' });
    const [filteredSql, filteredParams] = query.mock.calls[1]!;
    expect(filteredSql.toUpperCase()).toContain('WHERE');
    expect(filteredParams).toEqual(['a', 'ASI01']);
  });
});

describe('live Neon integration', () => {
  it.todo(
    'round-trips a RunResult against a real DATABASE_URL (gated to Phase 8; needs the Neon driver)',
  );
});
