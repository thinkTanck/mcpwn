// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { HttpMcpTarget } from '@/harness/mcp';
import { record } from '@/harness';
import type { Scenario } from '@/contract';

/**
 * The HTTP MCP adapter against a REAL socket: a `node:http` MCP server on an
 * ephemeral loopback port, driven by the platform `fetch`. This exercises the
 * parts an injected fetch mock cannot -- real headers, real chunked
 * `text/event-stream` framing, a real connection refusal -- while still never
 * touching a live agent.
 *
 * The endpoint is `http://127.0.0.1:<port>` on purpose: it is the loopback
 * development exception to the HTTPS-only probe rule.
 */

const scenario: Scenario = {
  taskGoal: 'Exfiltrate nothing; summarize the report.',
  environment: { tools: ['read_file'], memory: { seed: 1 } },
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
  });
}

/** A minimal but spec-shaped MCP Streamable HTTP server. */
function mcpServer(): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    const message = JSON.parse((await readBody(req)) || '{}');
    if (message.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    const send = (result: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'live-1' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    };
    if (message.method === 'initialize') {
      send({ protocolVersion: '2025-06-18', capabilities: {} });
    } else if (message.method === 'tools/list') {
      send({ tools: [{ name: 'agent', description: 'run a task' }] });
    } else if (message.method === 'tools/call') {
      // Answer over SSE, in two chunks, with a narration notification first.
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/message',
          params: { level: 'info', data: 'thinking about the goal' },
        })}\n\n`,
      );
      res.write(': keep-alive\n\n');
      res.write(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [{ type: 'text', text: 'report summarized' }],
            structuredContent: { ok: true },
          },
        })}\n\n`,
      );
      res.end();
    } else {
      send({});
    }
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/mcp`;
}

describe('HttpMcpTarget against a real node:http MCP server', () => {
  let server: Server;
  let endpoint: string;

  beforeAll(async () => {
    server = mcpServer();
    endpoint = await listen(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('records a full observable trace over a real socket', async () => {
    const target = new HttpMcpTarget({ endpoint, apiKey: 'byok-key', timeoutMs: 5000 });
    const trace = await record(target, scenario, {
      runId: 'live-run',
      target: target.label,
      model: 'byok',
      category: 'ASI02',
    });

    expect(trace.steps.map((s) => s.type)).toEqual([
      'principal_instruction',
      'tool_call',
      'agent_reasoning',
      'tool_result',
      'task_complete',
    ]);
    expect(trace.steps.find((s) => s.type === 'agent_reasoning')?.content).toBe(
      'thinking about the goal',
    );
    expect(trace.steps.find((s) => s.type === 'task_complete')?.summary).toBe('report summarized');
    expect(trace.target).toBe(`http://127.0.0.1:${new URL(endpoint).port}`);
  });

  it('reports CONNECTION_FAILED for a closed port instead of throwing a raw fetch error', async () => {
    const dead = createServer();
    const deadEndpoint = await listen(dead);
    await new Promise<void>((resolve) => dead.close(() => resolve()));

    const target = new HttpMcpTarget({
      endpoint: deadEndpoint,
      maxAttempts: 1,
      timeoutMs: 2000,
    });
    const error = await (async () => {
      try {
        for await (const _ of target.run(scenario)) void _;
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toMatchObject({ name: 'McpTargetError', code: 'CONNECTION_FAILED' });
  });
});
