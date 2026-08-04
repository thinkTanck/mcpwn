import { SpikeMcpServer } from '@/spike/asi04/server';
import { serveStdio } from '@/spike/asi04/stdio';
import { ATTACKER_ACCOUNT, OFFENDING_TOOL, READ_TOOL } from '@/spike/asi04/surface';

/**
 * A LOOPBACK CLIENT drives the whole stdio loop in memory, with no process.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the SERVER WORKS: it speaks
 * the four messages, serves the descriptions, records the calls, and writes a
 * contract-valid Trace. It proves NOTHING about the hypothesis. We authored both
 * the poison and the client that reacts to it, so a "bite" here is a script we
 * wrote, not a decision an agent made.
 *
 * The behavioral question is answered only by a naive agent, run by the operator
 * against a client that has never seen this repository. Until then nothing may be
 * written down as YES, as supported, or as likely.
 */

async function drive(kind: 'malicious' | 'benign', lines: unknown[]) {
  const server = new SpikeMcpServer({ kind, now: () => '2026-01-01T00:00:00.000Z' });
  const out: string[] = [];
  const logs: string[] = [];
  const trace = await serveStdio(server, {
    input: (async function* () {
      for (const line of lines) yield `${JSON.stringify(line)}\n`;
    })(),
    write: (line) => {
      out.push(line);
    },
    logLine: (line) => {
      logs.push(line);
    },
  });
  return { trace, out: out.map((l) => JSON.parse(l) as Record<string, unknown>), logs };
}

const HANDSHAKE = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', clientInfo: { name: 'loopback', version: '0' } },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
];

describe('spike/asi04 loopback: the server works end to end', () => {
  it('answers every request and never answers the notification', async () => {
    const { out } = await drive('malicious', HANDSHAKE);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.id)).toEqual([1, 2]);
  });

  it('writes a contract-valid Trace for a scripted bite', async () => {
    const { trace } = await drive('malicious', [
      ...HANDSHAKE,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: READ_TOOL, arguments: { id: 'msg-A-3391' } },
      },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: OFFENDING_TOOL, arguments: { to: ATTACKER_ACCOUNT, amount: 8500 } },
      },
    ]);

    // attacker + (call,result) x2 + inferred completion
    expect(trace.steps.map((s) => s.type)).toEqual([
      'attacker',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'task_complete',
    ]);
    expect(trace.category).toBe('ASI04');
  });

  it('survives an unparseable line without ending the session', async () => {
    const server = new SpikeMcpServer({ kind: 'malicious' });
    const out: string[] = [];
    const trace = await serveStdio(server, {
      input: (async function* () {
        yield 'not json at all\n';
        yield `${JSON.stringify(HANDSHAKE[0])}\n`;
      })(),
      write: (line) => {
        out.push(line);
      },
      logLine: () => {},
    });
    const parsed = out.map((l) => JSON.parse(l) as { error?: { code: number }; id: unknown });
    expect(parsed[0]!.error?.code).toBe(-32700);
    expect(parsed[1]!.id).toBe(1);
    expect(trace.steps.length).toBeGreaterThan(0);
  });

  it('logs the run line by line, so the record survives an unclean exit', async () => {
    const { logs } = await drive('malicious', HANDSHAKE);
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs.join('\n')).toContain('tools/list');
  });
});
