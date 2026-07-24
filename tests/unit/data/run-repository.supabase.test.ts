import { SupabaseRunRepository } from '@/data/run-repository.supabase';
import { getDataSource } from '@/data/source';
import type { RunResult } from '@/contract';
import type { SupabaseClient } from '@supabase/supabase-js';

async function sampleRun(): Promise<RunResult> {
  const run = await getDataSource().getRun('sample');
  if (!run) throw new Error('sample run missing');
  return run;
}

type Result = {
  single?: unknown;
  maybeSingle?: unknown;
  list?: unknown;
  count?: number;
  error?: string;
};

/**
 * A minimal chainable fake of the supabase-js query builder: it records the
 * table / insert payload / filters / order, and resolves the terminal
 * (single / maybeSingle / awaited-builder) to the configured result. Enough to
 * assert the adapter builds the right query and maps rows, without a network.
 */
function fake(result: Result) {
  const calls = {
    table: '',
    insert: undefined as unknown,
    select: '',
    filters: [] as [string, unknown][],
    order: undefined as unknown,
  };
  const err = result.error ? { message: result.error } : null;
  const builder = {
    insert(v: unknown) {
      calls.insert = v;
      return builder;
    },
    select(cols: string) {
      calls.select = cols;
      return builder;
    },
    eq(k: string, v: unknown) {
      calls.filters.push([k, v]);
      return builder;
    },
    gte(k: string, v: unknown) {
      calls.filters.push([`gte:${k}`, v]);
      return builder;
    },
    order(k: string, o: unknown) {
      calls.order = [k, o];
      return builder;
    },
    single: async () => ({ data: result.single, error: err }),
    maybeSingle: async () => ({ data: result.maybeSingle ?? null, error: err }),
    then: (res: (v: unknown) => void) =>
      res({ data: result.list, count: result.count, error: err }),
  };
  const client = { from: (t: string) => ((calls.table = t), builder) } as unknown as SupabaseClient;
  return { client, calls };
}

describe('SupabaseRunRepository (query building + mapping)', () => {
  it('saveRun inserts { user_id, run } into runs and maps the returned row', async () => {
    const run = await sampleRun();
    const row = { id: 'row-1', user_id: 'u', created_at: '2026-01-01T00:00:00Z', run };
    const { client, calls } = fake({ single: row });
    const stored = await new SupabaseRunRepository(client).saveRun('u', run);

    expect(calls.table).toBe('runs');
    expect(calls.insert).toEqual({ user_id: 'u', run });
    expect(stored).toEqual({ id: 'row-1', userId: 'u', createdAt: '2026-01-01T00:00:00Z', run });
  });

  it('getRun narrows by id AND user_id (ownership) and returns null when absent', async () => {
    const run = await sampleRun();
    const row = { id: 'row-1', user_id: 'u', created_at: '2026-01-01T00:00:00Z', run };
    const hit = fake({ maybeSingle: row });
    const got = await new SupabaseRunRepository(hit.client).getRun('u', 'row-1');
    expect(hit.calls.filters).toContainEqual(['id', 'row-1']);
    expect(hit.calls.filters).toContainEqual(['user_id', 'u']);
    expect(got?.id).toBe('row-1');

    const miss = fake({ maybeSingle: null });
    expect(await new SupabaseRunRepository(miss.client).getRun('u', 'nope')).toBeNull();
  });

  it('listRuns filters by user and orders newest-first', async () => {
    const run = await sampleRun();
    const row = { id: 'row-1', user_id: 'u', created_at: '2026-01-01T00:00:00Z', run };
    const { client, calls } = fake({ list: [row] });
    const list = await new SupabaseRunRepository(client).listRuns('u');
    expect(calls.filters).toContainEqual(['user_id', 'u']);
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(list).toHaveLength(1);
  });

  it('countRunsSince counts by user + created_at window', async () => {
    const { client, calls } = fake({ count: 3 });
    const n = await new SupabaseRunRepository(client).countRunsSince(
      'u',
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(n).toBe(3);
    expect(calls.filters).toContainEqual(['user_id', 'u']);
    expect(calls.filters).toContainEqual(['gte:created_at', '2026-01-01T00:00:00.000Z']);
  });

  it('throws a typed error when Supabase returns an error', async () => {
    const run = await sampleRun();
    const { client } = fake({ error: 'permission denied' });
    await expect(new SupabaseRunRepository(client).saveRun('u', run)).rejects.toThrow(
      /permission denied/,
    );
  });
});
