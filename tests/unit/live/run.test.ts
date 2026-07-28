import type { Scenario, Verdict } from '@/contract';
import { InMemoryRunRepository, type RunRepository, type StoredRun } from '@/data/run-repository';
import type { McpTargetPort, TargetStepEvent } from '@/harness';
import { createLogger, type LogRecord } from '@/lib/logger';
import { startLiveRun, type LiveRunDeps } from '@/live';

/**
 * The BYOK live-run pipeline. Every port is a fake here: a scripted MCP target,
 * an injected judge (the LOCKED validated judge is Slice 2 and is never built or
 * called from a test), and the in-memory repository, whose ownership rules
 * mirror the RLS the Supabase adapter relies on.
 *
 * The security assertions are the point of this file: signed-out is refused, the
 * cap is enforced, a non-HTTPS endpoint is refused, and the BYOK key reaches
 * neither the persisted row nor the logger.
 */

const KEY = 'byok-super-secret-key';

/** A target that emits a fixed, compromised-looking observable sequence. */
function scriptedTarget(): McpTargetPort {
  return {
    async *run(scenario: Scenario): AsyncIterable<TargetStepEvent> {
      yield { type: 'attacker', content: scenario.taskGoal };
      yield { type: 'tool_call', tool: 'send_email', args: { to: 'attacker@example.test' } };
      yield { type: 'tool_result', tool: 'send_email', result: { sent: true } };
      yield { type: 'task_complete', summary: 'done' };
    },
  };
}

/** A deterministic stand-in for the judge port. */
const cleanJudge = async (trace: { runId: string; category: string }): Promise<Verdict> =>
  ({
    runId: trace.runId,
    compromised: false,
    score: 0.1,
    severity: 'None',
    category: trace.category,
    rationale: 'No compromise observed.',
  }) as Verdict;

function deps(overrides: Partial<LiveRunDeps> = {}): LiveRunDeps {
  return {
    userId: 'user-1',
    repository: new InMemoryRunRepository(),
    detect: cleanJudge as LiveRunDeps['detect'],
    createTarget: () => scriptedTarget(),
    cap: { maxRuns: 20, windowHours: 24 },
    now: () => new Date('2026-07-27T12:00:00.000Z'),
    logger: createLogger({ sink: () => undefined }),
    ...overrides,
  };
}

const request = {
  endpoint: 'https://agent.example/mcp',
  apiKey: KEY,
  modelId: 'gpt-4.1',
  categories: ['ASI01', 'ASI02'],
};

describe('startLiveRun · authorization', () => {
  it('refuses a signed-out caller before the payload is even parsed', async () => {
    const repository = new InMemoryRunRepository();
    const counted = vi.spyOn(repository, 'countRunsSince');
    const outcome = await startLiveRun(request, deps({ userId: null, repository }));
    expect(outcome).toMatchObject({ ok: false, code: 'NOT_SIGNED_IN' });
    expect(counted).not.toHaveBeenCalled();
  });

  it('refuses when the LOCKED validated judge is not connected', async () => {
    const outcome = await startLiveRun(request, deps({ detect: null }));
    expect(outcome).toMatchObject({ ok: false, code: 'JUDGE_UNAVAILABLE' });
    expect(outcome.ok === false && outcome.message).toMatch(/not available yet/i);
  });
});

describe('startLiveRun · input validation', () => {
  it('refuses a non-HTTPS endpoint', async () => {
    const outcome = await startLiveRun(
      { ...request, endpoint: 'http://agent.example/mcp' },
      deps(),
    );
    expect(outcome).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(outcome.ok === false && outcome.message).toMatch(/https/i);
  });

  it('accepts http://localhost so a developer can point at a local agent', async () => {
    const outcome = await startLiveRun(
      { ...request, endpoint: 'http://localhost:8080/mcp', categories: ['ASI01'] },
      deps(),
    );
    expect(outcome.ok).toBe(true);
  });

  it('refuses an endpoint carrying embedded credentials', async () => {
    const outcome = await startLiveRun(
      { ...request, endpoint: 'https://u:p@agent.example/mcp' },
      deps(),
    );
    expect(outcome).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
  });

  it.each([
    ['no categories', { ...request, categories: [] }],
    ['an unknown category', { ...request, categories: ['ASI09'] }],
    ['a missing key', { ...request, apiKey: '' }],
    ['an unexpected extra field', { ...request, judge: 'my-own-model' }],
    ['a non-object payload', 'launch it'],
  ])('refuses %s', async (_label, payload) => {
    const outcome = await startLiveRun(payload, deps());
    expect(outcome).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
  });
});

describe('startLiveRun · per-account cap', () => {
  it('allows a launch that stays under the cap', async () => {
    const outcome = await startLiveRun(request, deps({ cap: { maxRuns: 2, windowHours: 24 } }));
    expect(outcome.ok).toBe(true);
  });

  it('refuses a launch that would cross the cap, with a readable reason', async () => {
    const repository = new InMemoryRunRepository();
    vi.spyOn(repository, 'countRunsSince').mockResolvedValue(2);
    const outcome = await startLiveRun(
      request,
      deps({ repository, cap: { maxRuns: 3, windowHours: 24 } }),
    );
    expect(outcome).toMatchObject({ ok: false, code: 'CAP_EXCEEDED' });
    expect(outcome.ok === false && outcome.message).toMatch(/3 runs per 24 hours/);
  });

  it('counts only runs inside the rolling window', async () => {
    const repository = new InMemoryRunRepository();
    const counted = vi.spyOn(repository, 'countRunsSince');
    await startLiveRun(
      request,
      deps({
        repository,
        cap: { maxRuns: 50, windowHours: 6 },
        now: () => new Date('2026-07-27T12:00:00.000Z'),
      }),
    );
    expect(counted).toHaveBeenCalledWith('user-1', new Date('2026-07-27T06:00:00.000Z'));
  });

  it('does not run the target at all once the cap is reached', async () => {
    const repository = new InMemoryRunRepository();
    vi.spyOn(repository, 'countRunsSince').mockResolvedValue(9);
    const createTarget = vi.fn(() => scriptedTarget());
    await startLiveRun(
      request,
      deps({ repository, createTarget, cap: { maxRuns: 9, windowHours: 24 } }),
    );
    expect(createTarget).not.toHaveBeenCalled();
  });
});

describe('startLiveRun · persistence', () => {
  it('persists one owner-scoped run per selected category and returns their ids', async () => {
    const repository = new InMemoryRunRepository();
    const outcome = await startLiveRun(request, deps({ repository }));
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.runs.map((r) => r.category)).toEqual(['ASI01', 'ASI02']);
    const stored = await repository.listRuns('user-1');
    expect(stored).toHaveLength(2);
    expect(await repository.listRuns('someone-else')).toHaveLength(0);
  });

  it('records the endpoint ORIGIN as the run target, never the path or query', async () => {
    const repository = new InMemoryRunRepository();
    await startLiveRun(
      { ...request, endpoint: `https://agent.example/mcp?token=${KEY}`, categories: ['ASI01'] },
      deps({ repository }),
    );
    const [stored] = await repository.listRuns('user-1');
    expect(stored?.run.target).toBe('https://agent.example');
  });

  it('records the user-supplied model id, falling back to a neutral label', async () => {
    const repository = new InMemoryRunRepository();
    await startLiveRun({ ...request, categories: ['ASI01'] }, deps({ repository }));
    await startLiveRun(
      { endpoint: request.endpoint, apiKey: KEY, categories: ['ASI02'] },
      deps({ repository }),
    );
    const models = (await repository.listRuns('user-1')).map((r) => r.run.model);
    expect(models).toContain('gpt-4.1');
    expect(models).toContain('byok-agent');
  });

  it('reports TARGET_FAILED when no cell completes', async () => {
    const failing: McpTargetPort = {
      async *run() {
        throw new Error('endpoint unreachable');
      },
    };
    const outcome = await startLiveRun(request, deps({ createTarget: () => failing }));
    expect(outcome).toMatchObject({ ok: false, code: 'TARGET_FAILED' });
  });

  it('reports PERSISTENCE_FAILED rather than throwing when the save fails', async () => {
    const repository: RunRepository = {
      ...new InMemoryRunRepository(),
      saveRun: async () => {
        throw new Error('db down');
      },
      countRunsSince: async () => 0,
      getRun: async () => null,
      listRuns: async () => [],
    };
    const outcome = await startLiveRun(request, deps({ repository }));
    expect(outcome).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' });
  });
});

describe('startLiveRun · BYOK secret handling', () => {
  it('never writes the key into a persisted row', async () => {
    const repository = new InMemoryRunRepository();
    await startLiveRun(
      { ...request, endpoint: `https://agent.example/mcp?token=${KEY}` },
      deps({ repository }),
    );
    const rows: StoredRun[] = await repository.listRuns('user-1');
    expect(rows).not.toHaveLength(0);
    expect(JSON.stringify(rows)).not.toContain(KEY);
  });

  it('never lets the key reach the logger', async () => {
    const lines: string[] = [];
    await startLiveRun(request, deps({ logger: createLogger({ sink: (l) => lines.push(l) }) }));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain(KEY);
    const first = JSON.parse(lines[0] ?? '{}') as LogRecord;
    expect(first.ctx).toMatchObject({ userId: 'user-1', target: 'https://agent.example' });
  });

  it('hands the key only to the target adapter, with the validated endpoint', async () => {
    const createTarget = vi.fn(() => scriptedTarget());
    await startLiveRun({ ...request, categories: ['ASI01'] }, deps({ createTarget }));
    expect(createTarget).toHaveBeenCalledExactlyOnceWith({
      endpoint: 'https://agent.example/mcp',
      apiKey: KEY,
    });
  });

  it('keeps the key out of a rejection message', async () => {
    const outcome = await startLiveRun({ ...request, categories: [] }, deps());
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).not.toContain(KEY);
  });
});
