import { RunResultSchema, type Category, type RunResult } from '@/contract';
import { TraceBuilder } from '@/attacks/engine';
import { createInMemoryRunRepository, createRunRepository, RunNotFoundError } from '@/persistence';

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

describe('in-memory run repository', () => {
  it('save/get round-trips a schema-valid RunResult (value-equal, not reference-shared)', async () => {
    const repo = createInMemoryRunRepository();
    const rr = makeRunResult('r1', 'model-a', 'ASI01', true);
    await repo.save(rr);
    const got = await repo.get('r1');
    expect(got).toEqual(rr);
    expect(got).not.toBe(rr);
  });

  it('get(missing) throws a typed RunNotFoundError carrying the runId', async () => {
    const repo = createInMemoryRunRepository();
    const err = await repo.get('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunNotFoundError);
    expect((err as RunNotFoundError).runId).toBe('nope');
  });

  it('list() returns all; filters by model and by category', async () => {
    const repo = createInMemoryRunRepository();
    await repo.save(makeRunResult('r1', 'a', 'ASI01', true));
    await repo.save(makeRunResult('r2', 'a', 'ASI02', false));
    await repo.save(makeRunResult('r3', 'b', 'ASI01', false));
    expect(await repo.list()).toHaveLength(3);
    expect((await repo.list({ model: 'a' })).map((r) => r.runId).sort()).toEqual(['r1', 'r2']);
    expect((await repo.list({ category: 'ASI01' })).map((r) => r.runId).sort()).toEqual([
      'r1',
      'r3',
    ]);
    expect((await repo.list({ model: 'a', category: 'ASI01' })).map((r) => r.runId)).toEqual([
      'r1',
    ]);
  });

  it('duplicate runId: save is last-write-wins (upsert)', async () => {
    const repo = createInMemoryRunRepository();
    await repo.save(makeRunResult('r1', 'a', 'ASI01', true));
    await repo.save(makeRunResult('r1', 'a', 'ASI01', false));
    expect(await repo.list()).toHaveLength(1);
    expect((await repo.get('r1')).verdict.compromised).toBe(false);
  });

  it('isolation: mutating a returned result never corrupts storage', async () => {
    const repo = createInMemoryRunRepository();
    await repo.save(makeRunResult('r1', 'a', 'ASI01', false));
    const got = await repo.get('r1');
    (got as { model: string }).model = 'HACKED';
    expect((await repo.get('r1')).model).toBe('a');
  });

  it('isolation: mutating the saved source after save never corrupts storage', async () => {
    const repo = createInMemoryRunRepository();
    const rr = makeRunResult('r1', 'a', 'ASI01', false);
    await repo.save(rr);
    (rr as { model: string }).model = 'HACKED';
    expect((await repo.get('r1')).model).toBe('a');
  });

  it('save validates on write (rejects a non-contract RunResult)', async () => {
    const repo = createInMemoryRunRepository();
    const rr = makeRunResult('r1', 'a', 'ASI01', false);
    await expect(
      repo.save({
        ...rr,
        groundTruth: { compromised: false, category: 'ASI01' },
      } as unknown as RunResult),
    ).rejects.toBeTruthy();
  });
});

describe('createRunRepository factory (selects adapter by PERSISTENCE_DRIVER)', () => {
  it('memory driver → a working in-memory repo', async () => {
    const repo = createRunRepository({ PERSISTENCE_DRIVER: 'memory' });
    await repo.save(makeRunResult('r1', 'a', 'ASI01', false));
    expect((await repo.get('r1')).runId).toBe('r1');
  });

  it('defaults to memory when unset (offline boot)', async () => {
    expect(await createRunRepository({}).list()).toEqual([]);
  });

  it('uses process.env by default (offline → memory)', async () => {
    expect(await createRunRepository().list()).toEqual([]);
  });

  it('postgres driver is not available yet (Neon adapter arrives in increment 2)', () => {
    expect(() =>
      createRunRepository({ PERSISTENCE_DRIVER: 'postgres', DATABASE_URL: 'postgres://u:p@h/db' }),
    ).toThrow();
  });
});
