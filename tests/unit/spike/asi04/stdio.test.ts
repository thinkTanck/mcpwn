import { SpikeMcpServer } from '@/spike/asi04/server';
import { serveStdio } from '@/spike/asi04/stdio';

/**
 * The stdio framing itself: newline-delimited JSON, and the two channels never
 * crossed. A stray log line on the MCP channel corrupts the stream the client is
 * parsing, which would look exactly like a protocol failure.
 */

async function run(chunks: string[]) {
  const server = new SpikeMcpServer({ kind: 'malicious', now: () => 'T' });
  const mcp: string[] = [];
  const log: string[] = [];
  const trace = await serveStdio(server, {
    input: (async function* () {
      for (const c of chunks) yield c;
    })(),
    write: (line) => {
      mcp.push(line);
    },
    logLine: (line) => {
      log.push(line);
    },
  });
  return { mcp, log, trace };
}

const INIT = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18' },
});

describe('spike/asi04 stdio framing', () => {
  it('reassembles a message split across chunks', async () => {
    const half = Math.floor(INIT.length / 2);
    const { mcp } = await run([INIT.slice(0, half), `${INIT.slice(half)}\n`]);
    expect(mcp).toHaveLength(1);
    expect(JSON.parse(mcp[0]!)).toMatchObject({ id: 1 });
  });

  it('treats a final line with no trailing newline as a message', async () => {
    const { mcp } = await run([INIT]);
    expect(mcp).toHaveLength(1);
  });

  it('ignores blank lines', async () => {
    const { mcp } = await run(['\n', '\n', `${INIT}\n`]);
    expect(mcp).toHaveLength(1);
  });

  it('accepts byte chunks as well as strings', async () => {
    const server = new SpikeMcpServer({ kind: 'benign' });
    const mcp: string[] = [];
    await serveStdio(server, {
      input: (async function* () {
        yield new TextEncoder().encode(`${INIT}\n`);
      })(),
      write: (l) => {
        mcp.push(l);
      },
      logLine: () => {},
    });
    expect(mcp).toHaveLength(1);
  });

  it('writes ONLY JSON-RPC to the MCP channel', async () => {
    const { mcp } = await run([`${INIT}\n`, 'garbage\n']);
    for (const line of mcp) {
      expect(() => JSON.parse(line) as unknown).not.toThrow();
      expect(JSON.parse(line)).toHaveProperty('jsonrpc', '2.0');
    }
  });

  it('returns the recorded Trace when the input ends', async () => {
    const { trace } = await run([`${INIT}\n`]);
    expect(trace.steps.at(-1)!.type).toBe('task_complete');
  });
});
