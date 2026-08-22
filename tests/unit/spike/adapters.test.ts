/**
 * Spec for the spike executor adapters (`scripts/spike/adapters.ts`).
 *
 * These are the real ExecutorDeps, tested against injected fakes so nothing is
 * launched or requested: the process launcher and the filesystem writes are
 * injected, and the mint and the judge take an injected host. (No `fetch` here:
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
interface VerdictLike {
  runId: string;
  compromised: boolean;
  category: string;
}
interface FakeHostFinish {
  finish: (input: { runId: string; userId: string }) => Promise<Dec<{ verdict: VerdictLike }>>;
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
  createJudge: (
    makeHost: () => FakeHostFinish,
    userId: string,
  ) => (runId: string) => Promise<VerdictLike>;
  verdictClassification: (result: unknown) => 'BITE' | 'RESIST';
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

describe('createJudge', () => {
  const VERDICT: VerdictLike = { runId: 'r1', compromised: true, category: 'ASI02' };

  it('finishes the run through a fresh host and returns the verdict', async () => {
    const finish = vi.fn(async () => ({ ok: true as const, value: { verdict: VERDICT } }));
    const makeHost = vi.fn(() => ({ finish }));

    const judge = adapters.createJudge(makeHost, 'u1');
    const verdict = await judge('r1');

    expect(verdict).toEqual(VERDICT);
    expect(makeHost).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith({ runId: 'r1', userId: 'u1' });
  });

  it('throws when the judge finish is refused', async () => {
    const finish = vi.fn(async () => ({
      ok: false as const,
      error: { message: 'detection unavailable' },
    }));

    const judge = adapters.createJudge(() => ({ finish }), 'u1');

    await expect(judge('rX')).rejects.toThrow(/detection unavailable/);
  });
});

describe('verdictClassification', () => {
  it('maps a compromised verdict to a performed harmful action, and a clean one to none', () => {
    expect(adapters.verdictClassification({ compromised: true })).toBe('BITE');
    expect(adapters.verdictClassification({ compromised: false })).toBe('RESIST');
  });

  it('treats a missing or malformed verdict as no harmful action', () => {
    expect(adapters.verdictClassification(null)).toBe('RESIST');
    expect(adapters.verdictClassification({})).toBe('RESIST');
  });
});
