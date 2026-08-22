/**
 * Spec for the spike executor adapters (`scripts/spike/adapters.ts`).
 *
 * These are the real ExecutorDeps, tested against injected fakes so nothing is
 * launched or requested: the process launcher and the filesystem writes are
 * injected, and the mint and trace read take an injected host. (No `fetch` here:
 * the verified path is in-process against the durable store, so no adapter makes
 * an HTTP call.)
 */
import { EventEmitter } from 'node:events';
import * as adaptersModule from '../../../scripts/spike/adapters';

interface Cell {
  category: string;
  framing: string;
  rep: number;
}
interface TicketOut {
  runId: string;
  token: string;
  endpoint: string;
  taskGoal: string;
}
type Dec<T> = { ok: true; value: T } | { ok: false; error: { message: string } };
interface FakeHostStart {
  start: (input: {
    userId: string;
    category: string;
    kind: string;
    model?: string;
  }) => Promise<Dec<TicketOut>>;
}
interface FakeHostGetTrace {
  getTrace: (input: { runId: string; userId: string }) => Promise<Dec<unknown>>;
}
type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { stdio: 'inherit' },
) => { on(event: string, listener: (arg: never) => void): unknown };
type WriteFn = (path: string, data: string) => Promise<void>;
type RemoveFn = (path: string, options: { force: true }) => Promise<void>;

interface AdaptersModule {
  spawnAgent: (command: string, args: readonly string[], spawn?: SpawnFn) => Promise<void>;
  writeConfig: (path: string, contents: string, write?: WriteFn) => Promise<void>;
  removeConfig: (path: string, remove?: RemoveFn) => Promise<void>;
  createIssueRun: (
    host: FakeHostStart,
    opts: { userId: string; model?: string },
  ) => (cell: Cell) => Promise<TicketOut>;
  createFetchTrace: (
    makeHost: () => FakeHostGetTrace,
    userId: string,
  ) => (runId: string) => Promise<unknown>;
}

const adapters = adaptersModule as unknown as AdaptersModule;

describe('spawnAgent', () => {
  it('spawns the command with its args and resolves when it closes with code 0', async () => {
    const child = new EventEmitter();
    const spawn = vi.fn(() => child);

    const promise = adapters.spawnAgent('claude', ['-p', 'goal'], spawn as unknown as SpawnFn);
    child.emit('close', 0);

    await expect(promise).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith('claude', ['-p', 'goal'], { stdio: 'inherit' });
  });

  it('rejects when the process closes with a non-zero code', async () => {
    const child = new EventEmitter();
    const spawn = vi.fn(() => child);

    const promise = adapters.spawnAgent('claude', ['-p', 'goal'], spawn as unknown as SpawnFn);
    child.emit('close', 1);

    await expect(promise).rejects.toThrow();
  });
});

describe('fs adapters', () => {
  it('writes and removes the temp config through the injected filesystem', async () => {
    const write = vi.fn(async () => {});
    const remove = vi.fn(async () => {});

    await adapters.writeConfig('/tmp/run-1.json', '{"mcpServers":{}}', write);
    expect(write).toHaveBeenCalledWith('/tmp/run-1.json', '{"mcpServers":{}}');

    await adapters.removeConfig('/tmp/run-1.json', remove);
    expect(remove).toHaveBeenCalledWith('/tmp/run-1.json', { force: true });
  });
});

describe('createIssueRun', () => {
  it('mints via the host for the cell category and framing, and maps the ticket', async () => {
    const start = vi.fn(async () => ({
      ok: true as const,
      value: { runId: 'r1', token: 't1', endpoint: 'https://local/api/mcp/r1', taskGoal: 'do it' },
    }));

    const issue = adapters.createIssueRun({ start }, { userId: 'u1', model: 'claude-fable-5' });
    const ticket = await issue({ category: 'ASI02', framing: 'malicious', rep: 0 });

    expect(start).toHaveBeenCalledWith({
      userId: 'u1',
      category: 'ASI02',
      kind: 'malicious',
      model: 'claude-fable-5',
    });
    expect(ticket).toEqual({
      runId: 'r1',
      token: 't1',
      endpoint: 'https://local/api/mcp/r1',
      taskGoal: 'do it',
    });
  });

  it('throws when the mint is refused', async () => {
    const start = vi.fn(async () => ({ ok: false as const, error: { message: 'out of runs' } }));

    const issue = adapters.createIssueRun({ start }, { userId: 'u1' });

    await expect(issue({ category: 'ASI02', framing: 'malicious', rep: 0 })).rejects.toThrow(
      /out of runs/,
    );
  });
});

describe('createFetchTrace', () => {
  it('reads the trace through a fresh host and returns it', async () => {
    const getTrace = vi.fn(async () => ({ ok: true as const, value: { steps: [] } }));
    const makeHost = vi.fn(() => ({ getTrace }));

    const fetchTrace = adapters.createFetchTrace(makeHost, 'u1');
    const trace = await fetchTrace('r1');

    expect(trace).toEqual({ steps: [] });
    expect(makeHost).toHaveBeenCalledTimes(1);
    expect(getTrace).toHaveBeenCalledWith({ runId: 'r1', userId: 'u1' });
  });

  it('throws when the trace read is refused', async () => {
    const getTrace = vi.fn(async () => ({
      ok: false as const,
      error: { message: 'run not found' },
    }));

    const fetchTrace = adapters.createFetchTrace(() => ({ getTrace }), 'u1');

    await expect(fetchTrace('rX')).rejects.toThrow(/run not found/);
  });
});
