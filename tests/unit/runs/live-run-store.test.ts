/**
 * The open-run registry, as a PORT with an in-memory adapter.
 *
 * The registry answers one question: which run is this, and what has it recorded
 * so far. On serverless that question has to survive the instance that started
 * the run going away, so the port is written for a shared store and the
 * in-memory adapter is the offline/test stand-in.
 */
import type { TargetStepEvent } from '@/harness';
import {
  InMemoryLiveRunSessionStore,
  LiveRunSessionRecordSchema,
  type NewLiveRunSession,
} from '@/runs/live-run-store';

const START = new Date('2026-08-05T10:00:00.000Z');
const EXPIRY = new Date('2026-08-05T11:00:00.000Z');

function newSession(overrides: Partial<NewLiveRunSession> = {}): NewLiveRunSession {
  return {
    runId: 'run-1',
    userId: 'user-1',
    category: 'ASI01',
    kind: 'malicious',
    model: null,
    client: null,
    target: '/api/mcp',
    startedAt: START.toISOString(),
    expiresAt: EXPIRY.toISOString(),
    events: [{ type: 'principal_instruction', content: 'the brief' }],
    ...overrides,
  };
}

const toolCall = (tool: string): TargetStepEvent => ({ type: 'tool_call', tool, args: {} });

describe('InMemoryLiveRunSessionStore — the offline/test adapter', () => {
  it('round-trips a created session', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());

    const found = await store.find('run-1');
    expect(found?.userId).toBe('user-1');
    expect(found?.category).toBe('ASI01');
    expect(found?.kind).toBe('malicious');
    expect(found?.finishedAt).toBeNull();
    expect(found?.events).toEqual([{ type: 'principal_instruction', content: 'the brief' }]);
  });

  it('returns null for a run it does not hold', async () => {
    const store = new InMemoryLiveRunSessionStore();
    expect(await store.find('nope')).toBeNull();
  });

  it('appends events positionally, in order', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());

    await store.appendEvents({ runId: 'run-1', from: 1, events: [toolCall('read_page')] });
    await store.appendEvents({ runId: 'run-1', from: 2, events: [toolCall('send_email')] });

    const found = await store.find('run-1');
    expect(found?.events.map((e) => e.type)).toEqual([
      'principal_instruction',
      'tool_call',
      'tool_call',
    ]);
    expect(found?.events[2]).toEqual({ type: 'tool_call', tool: 'send_email', args: {} });
  });

  it('is idempotent on a replayed append, because the index is the identity', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());

    await store.appendEvents({ runId: 'run-1', from: 1, events: [toolCall('read_page')] });
    // The same write, retried after a response the caller never saw.
    await store.appendEvents({ runId: 'run-1', from: 1, events: [toolCall('read_page')] });

    const found = await store.find('run-1');
    expect(found?.events).toHaveLength(2);
  });

  it('records the client the agent claimed, so a rehydrated run keeps its label', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());

    await store.appendEvents({ runId: 'run-1', from: 1, events: [], client: 'some-agent' });

    expect((await store.find('run-1'))?.client).toBe('some-agent');
  });

  it('claims the finish exactly once, so two instances cannot both judge one run', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());

    expect(await store.finish('run-1', new Date('2026-08-05T10:30:00.000Z'))).toBe(true);
    expect(await store.finish('run-1', new Date('2026-08-05T10:31:00.000Z'))).toBe(false);

    const found = await store.find('run-1');
    expect(found?.finishedAt).toBe('2026-08-05T10:30:00.000Z');
  });

  it('refuses to claim a run it does not hold', async () => {
    const store = new InMemoryLiveRunSessionStore();
    expect(await store.finish('nope', START)).toBe(false);
  });

  it('sweeps rows that are past their wall clock, and keeps the ones that are not', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());
    await store.create(newSession({ runId: 'run-2', expiresAt: '2026-08-05T20:00:00.000Z' }));

    const swept = await store.sweepExpired(new Date('2026-08-05T12:00:00.000Z'));

    expect(swept).toBe(1);
    expect(await store.find('run-1')).toBeNull();
    expect(await store.find('run-2')).not.toBeNull();
  });
});

/**
 * `findStale` is what lets a scheduled job finish a run its owner walked away
 * from. It answers with the runs that are OPEN and whose whole window has passed
 * — the token TTL plus the grace after it, both already baked into `expiresAt`
 * when the run was created, so the query invents no clock of its own.
 */
describe('InMemoryLiveRunSessionStore — finding the runs nobody closed', () => {
  it('answers with an open run whose window has passed', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());

    const stale = await store.findStale(new Date('2026-08-05T12:00:00.000Z'));

    expect(stale).toEqual([{ runId: 'run-1', userId: 'user-1', expiresAt: EXPIRY.toISOString() }]);
  });

  it('leaves a run whose window has not passed, so a working user is never cut off', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());

    expect(await store.findStale(new Date('2026-08-05T10:30:00.000Z'))).toEqual([]);
  });

  it('leaves a run that has already been claimed for finishing', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());
    await store.finish('run-1', new Date('2026-08-05T10:30:00.000Z'));

    expect(await store.findStale(new Date('2026-08-05T12:00:00.000Z'))).toEqual([]);
  });

  it('bounds one answer, so a backlog is drained over passes rather than in one', async () => {
    const store = new InMemoryLiveRunSessionStore();
    await store.create(newSession());
    await store.create(newSession({ runId: 'run-2' }));
    await store.create(newSession({ runId: 'run-3' }));

    expect(await store.findStale(new Date('2026-08-05T12:00:00.000Z'), 2)).toHaveLength(2);
  });
});

describe('LiveRunSessionRecordSchema — rows come back from a database as unknowns', () => {
  it('accepts a well-formed record', () => {
    const parsed = LiveRunSessionRecordSchema.parse({
      ...newSession(),
      finishedAt: null,
    });
    expect(parsed.runId).toBe('run-1');
  });

  it('rejects a category outside the Core-7', () => {
    expect(() =>
      LiveRunSessionRecordSchema.parse({ ...newSession(), finishedAt: null, category: 'ASI99' }),
    ).toThrow();
  });

  it('rejects an event whose type is not an observable step kind', () => {
    expect(() =>
      LiveRunSessionRecordSchema.parse({
        ...newSession(),
        finishedAt: null,
        events: [{ type: 'compromise_flag', content: 'here' }],
      }),
    ).toThrow();
  });
});
