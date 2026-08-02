import { RPC_PARSE_ERROR } from '@/spike/asi01/protocol';
import { SpikeMcpServer } from '@/spike/asi01/server';
import { serveStdio, type SpikeStdio } from '@/spike/asi01/stdio';
import { READ_TOOL } from '@/spike/asi01/surface';

/** An in-memory stand-in for the process's stdin/stdout/stderr. */
function fakeIo(chunks: readonly (string | Uint8Array)[]): SpikeStdio & {
  written: string[];
  logged: string[];
} {
  const written: string[] = [];
  const logged: string[] = [];
  return {
    written,
    logged,
    input: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    write: (line) => {
      written.push(line);
    },
    logLine: (line) => {
      logged.push(line);
    },
  };
}

const line = (message: unknown) => `${JSON.stringify(message)}\n`;

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', clientInfo: { name: 'fake-loopback-client' } },
};

/**
 * stdio framing: newline-delimited JSON over the process's own streams. The
 * spike is LOCAL ONLY — no HTTP, no TLS, no per-run token — because none of
 * those bear on the behavioral question being tested.
 */
describe('spike/asi01 stdio: newline-delimited JSON framing', () => {
  it('answers each request on its own line, in order', async () => {
    const io = fakeIo([line(INIT), line({ jsonrpc: '2.0', id: 2, method: 'tools/list' })]);
    await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);

    expect(io.written).toHaveLength(2);
    for (const written of io.written) {
      expect(written.endsWith('\n')).toBe(true);
      expect(JSON.parse(written)).toMatchObject({ jsonrpc: '2.0' });
    }
    expect(JSON.parse(io.written[1]!).id).toBe(2);
  });

  it('reassembles a message split across chunks', async () => {
    const framed = line(INIT);
    const io = fakeIo([framed.slice(0, 20), framed.slice(20)]);
    await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);
    expect(io.written).toHaveLength(1);
    expect(JSON.parse(io.written[0]!).id).toBe(1);
  });

  it('decodes raw bytes as UTF-8', async () => {
    const io = fakeIo([new TextEncoder().encode(line(INIT))]);
    await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);
    expect(io.written).toHaveLength(1);
  });

  it('writes nothing for a notification, which owes no response', async () => {
    const io = fakeIo([line({ jsonrpc: '2.0', method: 'notifications/initialized' })]);
    await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);
    expect(io.written).toEqual([]);
  });

  it('skips blank lines rather than treating them as messages', async () => {
    const io = fakeIo(['\n', '   \n', line(INIT)]);
    await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);
    expect(io.written).toHaveLength(1);
  });

  it('answers unparseable input with a parse error and KEEPS SERVING', async () => {
    // A crash here would be indistinguishable from an agent that declined to
    // act, which is the one confusion this experiment cannot afford.
    const io = fakeIo(['{ not json at all\n', line(INIT)]);
    await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);
    expect(JSON.parse(io.written[0]!).error.code).toBe(RPC_PARSE_ERROR);
    expect(JSON.parse(io.written[1]!).result).toBeDefined();
  });

  it('keeps the run log off the MCP channel entirely', async () => {
    const io = fakeIo([line(INIT), line({ jsonrpc: '2.0', id: 2, method: 'tools/list' })]);
    await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);
    // stdout carries protocol only; anything else corrupts the stream a real
    // client is parsing.
    for (const written of io.written) expect(() => JSON.parse(written)).not.toThrow();
    expect(io.logged.length).toBeGreaterThan(0);
    expect(io.logged.join('\n')).toContain('initialize');
  });

  it('returns the recorded Trace when the input stream ends', async () => {
    const io = fakeIo([
      line(INIT),
      line({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: READ_TOOL, arguments: {} },
      }),
    ]);
    const trace = await serveStdio(new SpikeMcpServer({ kind: 'malicious' }), io);
    expect(trace.steps.map((s) => s.type)).toEqual([
      'attacker',
      'tool_call',
      'tool_result',
      'task_complete',
    ]);
  });
});
