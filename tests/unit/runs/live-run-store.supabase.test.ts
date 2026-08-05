import type { TargetStepEvent } from '@/harness';
import type { NewLiveRunSession } from '@/runs/live-run-store';
import { SupabaseLiveRunSessionStore } from '@/runs/live-run-store.supabase';
import { FakeDatabase } from '../../helpers/fake-supabase';

const START = '2026-08-05T10:00:00.000Z';
const EXPIRY = '2026-08-06T11:00:00.000Z';

function newSession(overrides: Partial<NewLiveRunSession> = {}): NewLiveRunSession {
  return {
    runId: 'run-1',
    userId: 'user-1',
    category: 'ASI01',
    kind: 'malicious',
    model: null,
    client: null,
    target: '/api/mcp',
    startedAt: START,
    expiresAt: EXPIRY,
    events: [{ type: 'principal_instruction', content: 'the brief' }],
    ...overrides,
  };
}

const toolCall = (tool: string): TargetStepEvent => ({ type: 'tool_call', tool, args: {} });

describe('SupabaseLiveRunSessionStore', () => {
  it('writes the run and its first observed event', async () => {
    const db = new FakeDatabase();
    await new SupabaseLiveRunSessionStore(db.client()).create(newSession());

    expect(db.rows('live_runs')).toEqual([
      {
        run_id: 'run-1',
        user_id: 'user-1',
        category: 'ASI01',
        kind: 'malicious',
        model: null,
        client: null,
        target: '/api/mcp',
        started_at: START,
        expires_at: EXPIRY,
        finished_at: null,
      },
    ]);
    expect(db.rows('live_run_events')).toEqual([
      { run_id: 'run-1', idx: 0, event: { type: 'principal_instruction', content: 'the brief' } },
    ]);
  });

  it('rebuilds the record, events in index order, for a fresh adapter', async () => {
    const db = new FakeDatabase();
    await new SupabaseLiveRunSessionStore(db.client()).create(newSession());
    await new SupabaseLiveRunSessionStore(db.client()).appendEvents({
      runId: 'run-1',
      from: 1,
      events: [toolCall('read_page'), toolCall('send_email')],
      client: 'some-agent',
    });

    // A THIRD adapter, holding no state of its own, reads the whole run back.
    const found = await new SupabaseLiveRunSessionStore(db.client()).find('run-1');

    expect(found?.client).toBe('some-agent');
    expect(found?.events.map((e) => (e.type === 'tool_call' ? e.tool : e.type))).toEqual([
      'principal_instruction',
      'read_page',
      'send_email',
    ]);
  });

  it('answers null for a run it does not hold', async () => {
    const db = new FakeDatabase();
    expect(await new SupabaseLiveRunSessionStore(db.client()).find('nope')).toBeNull();
  });

  it('is idempotent on a replayed append, because (run, index) is the identity', async () => {
    const db = new FakeDatabase();
    const store = new SupabaseLiveRunSessionStore(db.client());
    await store.create(newSession());

    await store.appendEvents({ runId: 'run-1', from: 1, events: [toolCall('read_page')] });
    await store.appendEvents({ runId: 'run-1', from: 1, events: [toolCall('read_page')] });

    expect(db.rows('live_run_events')).toHaveLength(2);
  });

  it('writes nothing at all when there is nothing new to write', async () => {
    const db = new FakeDatabase();
    const store = new SupabaseLiveRunSessionStore(db.client());
    await store.create(newSession());

    await store.appendEvents({ runId: 'run-1', from: 1, events: [] });

    expect(db.rows('live_run_events')).toHaveLength(1);
  });

  it('claims the finish exactly once, however many instances ask', async () => {
    const db = new FakeDatabase();
    await new SupabaseLiveRunSessionStore(db.client()).create(newSession());

    const first = await new SupabaseLiveRunSessionStore(db.client()).finish(
      'run-1',
      new Date('2026-08-05T10:30:00.000Z'),
    );
    const second = await new SupabaseLiveRunSessionStore(db.client()).finish(
      'run-1',
      new Date('2026-08-05T10:31:00.000Z'),
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(db.rows('live_runs')[0]!.finished_at).toBe('2026-08-05T10:30:00.000Z');
  });

  it('refuses to claim a run that was never started', async () => {
    const db = new FakeDatabase();
    expect(await new SupabaseLiveRunSessionStore(db.client()).finish('nope', new Date())).toBe(
      false,
    );
  });

  it('sweeps rows past their wall clock and leaves the rest', async () => {
    const db = new FakeDatabase();
    const store = new SupabaseLiveRunSessionStore(db.client());
    await store.create(newSession());
    await store.create(newSession({ runId: 'run-2', expiresAt: '2026-09-01T00:00:00.000Z' }));

    const swept = await store.sweepExpired(new Date('2026-08-07T00:00:00.000Z'));

    expect(swept).toBe(1);
    expect(db.rows('live_runs')).toHaveLength(1);
    expect(db.rows('live_run_events').every((r) => r.run_id === 'run-2')).toBe(true);
  });

  it('refuses a stored row that is not a session record, instead of trusting it', async () => {
    const db = new FakeDatabase();
    await new SupabaseLiveRunSessionStore(db.client()).create(newSession());
    db.rows('live_runs')[0]!.category = 'ASI99';

    await expect(new SupabaseLiveRunSessionStore(db.client()).find('run-1')).rejects.toThrow();
  });

  it('surfaces a store failure rather than reporting an empty run', async () => {
    const db = new FakeDatabase();
    db.failWith = 'permission denied';
    const store = new SupabaseLiveRunSessionStore(db.client());

    await expect(store.create(newSession())).rejects.toThrow(/permission denied/);
    await expect(store.find('run-1')).rejects.toThrow(/permission denied/);
    await expect(
      store.appendEvents({ runId: 'run-1', from: 1, events: [toolCall('x')] }),
    ).rejects.toThrow(/permission denied/);
  });
});
