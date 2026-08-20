/**
 * The run-matrix cell executor.
 *
 * This is the function `runMatrix` injects for each cell. It mints a per-run
 * token, writes a one-server MCP config, spawns the agent against that config,
 * fetches the resulting trace, hands it to `classifyTrace`, and deletes the temp
 * config. Its side effects (filesystem, process spawn, token mint, trace fetch)
 * are all injected, so a test can run it without launching or requesting anything
 * real, and a caller wires in the real ones.
 *
 * Minimal on purpose: no retries, no logging, no progress, no results table, no
 * CLI, no concurrency. Config comes from the environment; nothing is hardcoded
 * except the mandated server-name default. The judge is not imported.
 */
import { join } from 'node:path';
import { classifyTrace, type Cell } from './run-matrix';
import { buildMcpConfig, MCP_SERVER_NAME, RESERVED_SERVER_NAMES } from '@/lib/mcp/config';

/** The per-run credential minted for each cell. */
export interface RunTicket {
  runId: string;
  token: string;
}

/** Everything the executor touches that is not pure, injected for testability. */
export interface ExecutorDeps {
  writeConfig: (path: string, contents: string) => Promise<void>;
  removeConfig: (path: string) => Promise<void>;
  spawnAgent: (command: string, args: readonly string[]) => Promise<void>;
  fetchTrace: (runId: string) => Promise<unknown>;
  issueRun: () => Promise<RunTicket>;
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
 * Build a cell executor over the given side-effect dependencies. All static run
 * config is read from the environment once, here; the per-run token is minted per
 * cell inside the returned function.
 */
export function createExecutor(deps: ExecutorDeps): CellExecutor {
  const endpoint = requireEnv('SPIKE_MCP_ENDPOINT');
  const goal = requireEnv('SPIKE_TASK_GOAL');
  const allowedTools = readList('SPIKE_ALLOWED_TOOLS');
  const tempDir = requireEnv('SPIKE_TEMP_DIR');
  const serverName = resolveServerName(process.env.SPIKE_MCP_SERVER_NAME);

  return async (cell: Cell): Promise<unknown> => {
    const { runId, token } = await deps.issueRun();

    const config = buildMcpConfig(endpoint, token, serverName);
    const configPath = join(tempDir, `${runId}.json`);
    await deps.writeConfig(configPath, JSON.stringify(config));

    try {
      await deps.spawnAgent('claude', [
        '--strict-mcp-config',
        '--mcp-config',
        configPath,
        '--allowedTools',
        allowedTools.join(','),
        goal,
      ]);
    } finally {
      await deps.removeConfig(configPath);
    }

    const trace = await deps.fetchTrace(runId);
    classifyTrace(trace, cell.category);
    return trace;
  };
}
