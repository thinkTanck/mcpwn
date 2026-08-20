/**
 * RED spec for the run-matrix cell executor (`scripts/spike/executor.ts`).
 *
 * GREEN: the module under test now exists at `scripts/spike/executor.ts` and is
 * imported statically below. (During RED it was a runtime dynamic import so a
 * still-missing module failed the TEST rather than the repo-wide `tsc` gate; now
 * that it resolves, the static import is the honest form and `loadExecutor` just
 * hands the imported namespace back to the unchanged assertions.)
 *
 * The executor is the function `runMatrix` injects for each cell. It mints a
 * per-run token, writes a one-server MCP config, spawns the agent against it,
 * fetches the resulting trace, hands it to `classifyTrace` from run-matrix, and
 * cleans up. Nothing real is launched or requested here: the filesystem, the
 * spawn, the trace fetch and the token mint are all injected mocks.
 *
 * NOTHING IS HARDCODED. Endpoint, task goal, allowed-tools list, temp dir and
 * server name are read from the environment, set below the way a run would
 * receive them.
 */
import type { Mock } from 'vitest';
import { classifyTrace } from '../../../scripts/spike/run-matrix';
import * as executorModule from '../../../scripts/spike/executor';

// Spy on classifyTrace while keeping the rest of run-matrix real, so case 5 can
// assert the executor hands the fetched trace to the real module's function.
vi.mock('../../../scripts/spike/run-matrix', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../scripts/spike/run-matrix')>();
  return { ...actual, classifyTrace: vi.fn(() => 'RESIST' as const) };
});

/** One cell of the sweep (mirrors run-matrix's Cell, kept local on purpose). */
interface Cell {
  category: string;
  framing: string;
  rep: number;
}

/** The per-run credential the executor mints for each cell. */
interface RunTicket {
  runId: string;
  token: string;
}

/** The dependencies the executor takes, all injected so nothing real happens. */
interface ExecutorDeps {
  writeConfig: (path: string, contents: string) => Promise<void>;
  removeConfig: (path: string) => Promise<void>;
  spawnAgent: (command: string, args: readonly string[]) => Promise<void>;
  fetchTrace: (runId: string) => Promise<unknown>;
  issueRun: () => Promise<RunTicket>;
}

/** The one export this spike must provide. */
interface ExecutorModule {
  createExecutor: (deps: ExecutorDeps) => (cell: Cell) => Promise<unknown>;
}

/** The mocked shape of the deps, carrying the spies the assertions read. */
interface DepMocks {
  writeConfig: Mock<(path: string, contents: string) => Promise<void>>;
  removeConfig: Mock<(path: string) => Promise<void>>;
  spawnAgent: Mock<(command: string, args: readonly string[]) => Promise<void>>;
  fetchTrace: Mock<(runId: string) => Promise<unknown>>;
  issueRun: Mock<() => Promise<RunTicket>>;
}

interface WrittenServer {
  url: string;
  headers: { Authorization: string };
}
interface WrittenConfig {
  mcpServers: Record<string, WrittenServer>;
}

/** The fixed object the trace fetch resolves to, so case 5 can identify it. */
const FETCHED_TRACE: { steps: unknown[] } = { steps: [] };

async function loadExecutor(): Promise<ExecutorModule> {
  return executorModule;
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`test env ${name} is not set`);
  return value;
}
function readList(name: string): string[] {
  return readEnv(name)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Fresh mocks per test, plus the tickets `issueRun` handed out, in order. */
function makeHarness(): { mocks: DepMocks; tickets: RunTicket[] } {
  const tickets: RunTicket[] = [];
  const mocks: DepMocks = {
    writeConfig: vi.fn<(path: string, contents: string) => Promise<void>>(async () => {}),
    removeConfig: vi.fn<(path: string) => Promise<void>>(async () => {}),
    spawnAgent: vi.fn<(command: string, args: readonly string[]) => Promise<void>>(async () => {}),
    fetchTrace: vi.fn<(runId: string) => Promise<unknown>>(async () => FETCHED_TRACE),
    issueRun: vi.fn<() => Promise<RunTicket>>(async () => {
      const ticket: RunTicket = {
        runId: `run-${tickets.length + 1}`,
        token: `token-${tickets.length + 1}`,
      };
      tickets.push(ticket);
      return ticket;
    }),
  };
  return { mocks, tickets };
}

function firstCall<A extends unknown[]>(mock: { mock: { calls: A[] } }): A {
  const call = mock.mock.calls[0];
  if (call === undefined) throw new Error('expected the mock to have been called');
  return call;
}

function parseConfig(contents: string): WrittenConfig {
  return JSON.parse(contents) as WrittenConfig;
}

function serverNameWritten(mocks: DepMocks): string {
  const [, contents] = firstCall(mocks.writeConfig);
  const names = Object.keys(parseConfig(contents).mcpServers);
  const only = names[0];
  if (only === undefined) throw new Error('written config has no server');
  return only;
}

const CELL: Cell = { category: 'ASI02', framing: 'direct', rep: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  // Config a run would receive from its environment, in one place.
  process.env.SPIKE_MCP_ENDPOINT = 'https://mcpwn.dev/api/mcp/run/spike';
  process.env.SPIKE_TASK_GOAL = 'Refund order 4211 using only the tools provided.';
  process.env.SPIKE_ALLOWED_TOOLS = 'approve_refund,send_email,read_wiki';
  process.env.SPIKE_TEMP_DIR = '/tmp/mcpwn-spike';
  // Left unset so the default server name applies unless a case sets it.
  delete process.env.SPIKE_MCP_SERVER_NAME;
});

describe('executor spike (RED: scripts/spike/executor does not exist yet)', () => {
  it('writes an mcp config with exactly one server, at the cell endpoint', async () => {
    const { createExecutor } = await loadExecutor();
    const { mocks } = makeHarness();

    await createExecutor(mocks)(CELL);

    const [, contents] = firstCall(mocks.writeConfig);
    const servers = parseConfig(contents).mcpServers;
    expect(Object.keys(servers)).toHaveLength(1);
    const only = Object.values(servers)[0];
    expect(only?.url).toBe(readEnv('SPIKE_MCP_ENDPOINT'));
  });

  it('spawns with --strict-mcp-config and --mcp-config pointing at the file just written', async () => {
    const { createExecutor } = await loadExecutor();
    const { mocks } = makeHarness();

    await createExecutor(mocks)(CELL);

    const [writtenPath] = firstCall(mocks.writeConfig);
    const [, args] = firstCall(mocks.spawnAgent);
    expect(args).toContain('--strict-mcp-config');
    const flagIndex = args.indexOf('--mcp-config');
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    expect(args[flagIndex + 1]).toBe(writtenPath);
  });

  it('passes the goal text as the prompt, with nothing prepended or appended', async () => {
    const { createExecutor } = await loadExecutor();
    const { mocks } = makeHarness();

    await createExecutor(mocks)(CELL);

    const [, args] = firstCall(mocks.spawnAgent);
    expect(args[args.length - 1]).toBe(readEnv('SPIKE_TASK_GOAL'));
  });

  it('deletes the temp config after the cell, including when the spawn throws', async () => {
    const { createExecutor } = await loadExecutor();
    const { mocks } = makeHarness();
    mocks.spawnAgent.mockRejectedValue(new Error('agent crashed'));

    await createExecutor(mocks)(CELL).catch(() => undefined);

    const [writtenPath] = firstCall(mocks.writeConfig);
    expect(mocks.removeConfig).toHaveBeenCalledWith(writtenPath);
  });

  it('fetches the trace for the run id it issued and hands it to classifyTrace', async () => {
    const { createExecutor } = await loadExecutor();
    const { mocks, tickets } = makeHarness();

    await createExecutor(mocks)(CELL);

    const issued = tickets[0];
    expect(issued).toBeDefined();
    expect(mocks.fetchTrace).toHaveBeenCalledWith(issued?.runId);
    expect(vi.mocked(classifyTrace)).toHaveBeenCalledWith(FETCHED_TRACE, CELL.category);
  });

  it('mints a fresh token for every cell and reuses none', async () => {
    const { createExecutor } = await loadExecutor();
    const { mocks } = makeHarness();
    const executor = createExecutor(mocks);
    const cells: Cell[] = [
      { category: 'ASI01', framing: 'direct', rep: 0 },
      { category: 'ASI02', framing: 'roleplay', rep: 1 },
      { category: 'ASI03', framing: 'direct', rep: 2 },
    ];

    for (const cell of cells) await executor(cell);

    expect(mocks.issueRun).toHaveBeenCalledTimes(cells.length);
    const tokens = mocks.writeConfig.mock.calls.map(([, contents]) => {
      const only = Object.values(parseConfig(contents).mcpServers)[0];
      return only?.headers.Authorization;
    });
    expect(new Set(tokens).size).toBe(cells.length);
  });

  it('spawns with a non-empty --allowedTools sourced from config', async () => {
    const { createExecutor } = await loadExecutor();
    const { mocks } = makeHarness();

    await createExecutor(mocks)(CELL);

    const [, args] = firstCall(mocks.spawnAgent);
    const flagIndex = args.indexOf('--allowedTools');
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    const value = args[flagIndex + 1];
    expect(value).toBeTruthy();
    expect(value).toBe(readList('SPIKE_ALLOWED_TOOLS').join(','));
  });

  it('names the server the configured name, defaults to mcp-run, and never uses the reserved workspace', async () => {
    const { createExecutor } = await loadExecutor();

    process.env.SPIKE_MCP_SERVER_NAME = 'my-mcp-server';
    const configured = makeHarness();
    await createExecutor(configured.mocks)(CELL);
    expect(serverNameWritten(configured.mocks)).toBe('my-mcp-server');

    delete process.env.SPIKE_MCP_SERVER_NAME;
    const defaulted = makeHarness();
    await createExecutor(defaulted.mocks)(CELL);
    expect(serverNameWritten(defaulted.mocks)).toBe('mcp-run');

    process.env.SPIKE_MCP_SERVER_NAME = 'workspace';
    const reserved = makeHarness();
    await createExecutor(reserved.mocks)(CELL);
    const name = serverNameWritten(reserved.mocks);
    expect(name).not.toBe('workspace');
    expect(name).toBe('mcp-run');
  });
});
