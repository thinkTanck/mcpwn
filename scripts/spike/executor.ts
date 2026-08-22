/**
 * The run-matrix cell executor.
 *
 * This is the function `runMatrix` injects for each cell. For each cell it MINTS
 * ITS OWN RUN and takes that run's endpoint and goal from the mint ticket, writes
 * a one-server MCP config, spawns the agent against that config, fetches the
 * resulting trace, hands it to `classifyTrace`, and deletes the temp config.
 *
 * The per-cell endpoint and goal come from the ticket, never a static env var, so
 * each cell points the agent at its own run. Its side effects (filesystem, process
 * spawn, mint, trace fetch) are all injected, so a test runs it without launching
 * or requesting anything real, and a caller wires in the real ones.
 *
 * Minimal on purpose: no retries, no logging, no progress, no results table, no
 * concurrency. Config comes from the environment; nothing is hardcoded except the
 * mandated server-name default. The judge is not imported.
 */
import { join } from 'node:path';
import { classifyTrace, type Cell } from './run-matrix';
import { buildMcpConfig, MCP_SERVER_NAME, RESERVED_SERVER_NAMES } from '@/lib/mcp/config';

/** What one cell's mint hands back: the per-run endpoint, goal and credential. */
export interface RunTicket {
  runId: string;
  token: string;
  /** The per-run MCP endpoint the agent connects to. */
  endpoint: string;
  /** The out-of-band goal delivered for this run. */
  taskGoal: string;
}

/** Everything the executor touches that is not pure, injected for testability. */
export interface ExecutorDeps {
  writeConfig: (path: string, contents: string) => Promise<void>;
  removeConfig: (path: string) => Promise<void>;
  spawnAgent: (command: string, args: readonly string[]) => Promise<void>;
  fetchTrace: (runId: string) => Promise<unknown>;
  /** Mint a run for THIS cell: the mint serves the cell's category and framing. */
  issueRun: (cell: Cell) => Promise<RunTicket>;
}

/** Runs one cell and returns the trace it produced. */
export type CellExecutor = (cell: Cell) => Promise<unknown>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function readList(name: string): string[] {
  return requireEnv(name)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Fall back to the shared neutral name when nothing is configured, or when the
// configured name is one Claude Code reserves and would refuse to register.
function resolveServerName(raw: string | undefined): string {
  if (!raw || (RESERVED_SERVER_NAMES as readonly string[]).includes(raw)) return MCP_SERVER_NAME;
  return raw;
}

/**
 * Build a cell executor over the given side-effect dependencies. Static run config
 * is read from the environment once, here; the per-run endpoint, goal and token
 * are minted per cell inside the returned function.
 */
export function createExecutor(deps: ExecutorDeps): CellExecutor {
  const allowedTools = readList('SPIKE_ALLOWED_TOOLS');
  const tempDir = requireEnv('SPIKE_TEMP_DIR');
  const model = requireEnv('SPIKE_SUBJECT_MODEL');
  const serverName = resolveServerName(process.env.SPIKE_MCP_SERVER_NAME);

  return async (cell: Cell): Promise<unknown> => {
    const { runId, token, endpoint, taskGoal } = await deps.issueRun(cell);

    const config = buildMcpConfig(endpoint, token, serverName);
    const configPath = join(tempDir, `${runId}.json`);
    await deps.writeConfig(configPath, JSON.stringify(config));

    try {
      await deps.spawnAgent('claude', [
        '-p',
        taskGoal,
        '--strict-mcp-config',
        '--mcp-config',
        configPath,
        '--allowedTools',
        allowedTools.join(','),
        '--model',
        model,
      ]);
    } finally {
      await deps.removeConfig(configPath);
    }

    const trace = await deps.fetchTrace(runId);
    classifyTrace(trace, cell.category);
    return trace;
  };
}
