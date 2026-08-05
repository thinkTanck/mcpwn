/**
 * INTEGRATION — the hosted MCP server over a REAL loopback Node socket.
 *
 * The unit tests drive the Streamable HTTP handler with in-memory `Request`
 * objects. This one binds a real Node `http` server on an ISOLATED, OS-chosen
 * port and speaks to it with `fetch`, proving the transport interoperates over
 * the wire: session header round-trips, the full MCP handshake completes, a
 * `tools/call` is dispatched, and the recorded observable `Trace` comes back.
 *
 * Loopback only, fabricated content, no real side effects (spec "Safety").
 */
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStreamableHttpHandler } from '@/harness/server/http';
import { startNodeServer } from '@/harness/server/node';
import { HostedMcpServer } from '@/harness/server/server';
import { SESSION_HEADER } from '@/harness/server/http';

let server: Server;
let base: string;
const handler = createStreamableHttpHandler(
  () => new HostedMcpServer({ category: 'ASI01', kind: 'malicious' }),
);

beforeAll(async () => {
  const started = await startNodeServer(handler, 0);
  server = started.server;
  base = `http://127.0.0.1:${started.port}/mcp`;
});

afterAll(() => {
  server.close();
});

async function rpc(payload: unknown, sessionId?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId !== undefined) headers[SESSION_HEADER] = sessionId;
  return fetch(base, { method: 'POST', headers, body: JSON.stringify(payload) });
}

describe('hosted server over a real loopback socket', () => {
  it('completes initialize -> tools/list -> tools/call and records an observable Trace', async () => {
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'integration-agent', version: '1.0' },
      },
    });
    expect(init.status).toBe(200);
    const sessionId = init.headers.get(SESSION_HEADER);
    expect(sessionId).toBeTruthy();

    const notified = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId!);
    expect(notified.status).toBe(202);

    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, sessionId!);
    const listed = await list.json();
    expect(listed.result.tools.map((t: { name: string }) => t.name)).toContain('read_email');

    const read = await rpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'read_email', arguments: { mailbox: 'inbox' } },
      },
      sessionId!,
    );
    const readResult = await read.json();
    expect(readResult.result.content[0].type).toBe('text');

    const trace = await handler.getSession(sessionId!)!.buildTrace();
    expect(trace.steps[0]!.type).toBe('principal_instruction');
    expect(trace.steps.some((s) => s.type === 'tool_call')).toBe(true);
    expect(trace.steps.at(-1)!.type).toBe('task_complete');
  });

  it('delivers the task goal out of band via prompts/get', async () => {
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });
    const sessionId = init.headers.get(SESSION_HEADER)!;
    const prompt = await rpc(
      { jsonrpc: '2.0', id: 2, method: 'prompts/get', params: { name: 'session_brief' } },
      sessionId,
    );
    const body = await prompt.json();
    expect(body.result.messages[0].content.text.length).toBeGreaterThan(0);
  });
});
