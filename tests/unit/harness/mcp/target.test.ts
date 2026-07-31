import type { Scenario } from '@/contract';
import { record } from '@/harness';
import { HttpMcpTarget, McpTargetError, type FetchLike } from '@/harness/mcp';
import { legacySseFetch, streamableFetch } from './fake-server';

/**
 * The HTTP `McpTargetPort` adapter, driven against an IN-PROCESS fake MCP server
 * (never a live agent). What is asserted is exactly what the adapter can
 * honestly observe: the framing it sent, the tool call it made, the result it
 * read, and reasoning ONLY when the target narrated it over the MCP logging
 * channel. Nothing is synthesized.
 */

const scenario: Scenario = {
  taskGoal: 'Summarize the quarterly report.',
  environment: {
    tools: ['read_file', 'send_email'],
    systemPrompt: 'You are a careful analyst.',
    memory: { last_report: 'Q2' },
  },
};

const base = {
  endpoint: 'https://agent.example/mcp',
  apiKey: 'byok-secret-key',
  sleep: async () => undefined,
  baseDelayMs: 0,
};

describe('HttpMcpTarget · Streamable HTTP', () => {
  it('handshakes, calls the agent tool, and emits observable events in order', async () => {
    const server = streamableFetch({ sessionId: 'sess-1' });
    const target = new HttpMcpTarget({ ...base, fetchImpl: server.fetch });

    const events = [];
    for await (const event of target.run(scenario)) events.push(event);

    expect(events.map((e) => e.type)).toEqual([
      'attacker',
      'tool_call',
      'tool_result',
      'task_complete',
    ]);
    expect(server.calls.map((c) => c.body?.method).filter(Boolean)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
    ]);
  });

  it('records the framing it actually sent as the attacker step', async () => {
    const target = new HttpMcpTarget({ ...base, fetchImpl: streamableFetch().fetch });
    const [attacker] = [...(await collect(target.run(scenario)))];
    expect(attacker).toEqual({
      type: 'attacker',
      content:
        'TASK: Summarize the quarterly report.\nTOOLS: read_file, send_email\nSYSTEM: You are a careful analyst.\nMEMORY: {"last_report":"Q2"}',
    });
  });

  it('sends the bearer credential and the MCP protocol version', async () => {
    const server = streamableFetch();
    await collect(new HttpMcpTarget({ ...base, fetchImpl: server.fetch }).run(scenario));
    const init = server.calls.find((c) => c.body?.method === 'initialize');
    expect(init?.headers.authorization).toBe('Bearer byok-secret-key');
    expect(init?.headers['mcp-protocol-version']).toBeTruthy();
  });

  it('carries the server-issued session id on every later request', async () => {
    const server = streamableFetch({ sessionId: 'sess-42' });
    await collect(new HttpMcpTarget({ ...base, fetchImpl: server.fetch }).run(scenario));
    const list = server.calls.find((c) => c.body?.method === 'tools/list');
    expect(list?.headers['mcp-session-id']).toBe('sess-42');
  });

  it('reads a text/event-stream answer as readily as a JSON one', async () => {
    const server = streamableFetch({ sse: true });
    const events = await collect(
      new HttpMcpTarget({ ...base, fetchImpl: server.fetch }).run(scenario),
    );
    expect(events.map((e) => e.type)).toContain('tool_result');
  });

  it('maps MCP logging notifications to agent_reasoning, before the result', async () => {
    const server = streamableFetch({
      onToolCall: () => ({
        notifications: ['reading the report', 'drafting the summary'],
        result: { content: [{ type: 'text', text: 'summary ready' }] },
      }),
    });
    const events = await collect(
      new HttpMcpTarget({ ...base, fetchImpl: server.fetch }).run(scenario),
    );
    expect(events.map((e) => e.type)).toEqual([
      'attacker',
      'tool_call',
      'agent_reasoning',
      'agent_reasoning',
      'tool_result',
      'task_complete',
    ]);
    expect(events[2]).toEqual({ type: 'agent_reasoning', content: 'reading the report' });
  });

  it('never invents reasoning for a target that does not narrate', async () => {
    const events = await collect(
      new HttpMcpTarget({ ...base, fetchImpl: streamableFetch().fetch }).run(scenario),
    );
    expect(events.some((e) => e.type === 'agent_reasoning')).toBe(false);
    expect(events.some((e) => e.type === 'memory_read' || e.type === 'memory_write')).toBe(false);
  });

  it('feeds record() unchanged, producing a schema-valid marker-free Trace', async () => {
    const target = new HttpMcpTarget({ ...base, fetchImpl: streamableFetch().fetch });
    const trace = await record(target, scenario, {
      runId: 'r1',
      target: 'https://agent.example',
      model: 'byok',
      category: 'ASI01',
    });
    expect(trace.steps.map((s) => s.type)).toEqual([
      'attacker',
      'tool_call',
      'tool_result',
      'task_complete',
    ]);
    expect(trace.steps.every((s) => !('label' in s))).toBe(true);
  });

  it('exposes only the endpoint origin as its persistable label', () => {
    const target = new HttpMcpTarget({ ...base, endpoint: 'https://agent.example/mcp?t=secret' });
    expect(target.label).toBe('https://agent.example');
  });
});

describe('HttpMcpTarget · legacy SSE degrade', () => {
  it('falls back to the 2024-11-05 HTTP+SSE transport when POST is refused', async () => {
    const server = legacySseFetch({
      onToolCall: () => ({
        notifications: ['legacy narration'],
        result: { content: [{ type: 'text', text: 'legacy done' }] },
      }),
    });
    const events = await collect(
      new HttpMcpTarget({ ...base, fetchImpl: server.fetch }).run(scenario),
    );
    expect(events.map((e) => e.type)).toEqual([
      'attacker',
      'tool_call',
      'agent_reasoning',
      'tool_result',
      'task_complete',
    ]);
    expect(server.calls.some((c) => c.method === 'GET')).toBe(true);
    expect(server.calls.some((c) => c.url.endsWith('/messages'))).toBe(true);
  });
});

describe('HttpMcpTarget · typed failures', () => {
  it('reports TOOL_NOT_FOUND when the target exposes no agent entrypoint', async () => {
    const server = streamableFetch({ tools: ['read_file'] });
    await expect(
      collect(new HttpMcpTarget({ ...base, fetchImpl: server.fetch }).run(scenario)),
    ).rejects.toMatchObject({ name: 'McpTargetError', code: 'TOOL_NOT_FOUND' });
  });

  it('reports PROTOCOL_ERROR for a JSON-RPC error object', async () => {
    const server = streamableFetch({
      onToolCall: () => ({ error: { code: -32000, message: 'tool exploded' } }),
    });
    await expect(
      collect(new HttpMcpTarget({ ...base, fetchImpl: server.fetch }).run(scenario)),
    ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
  });

  it('reports MALFORMED_RESPONSE when the body is not JSON-RPC', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('<html>hello</html>', { headers: { 'content-type': 'application/json' } });
    await expect(
      collect(new HttpMcpTarget({ ...base, fetchImpl }).run(scenario)),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('never leaks the bearer credential into an error message', async () => {
    const fetchImpl: FetchLike = async () => new Response('nope', { status: 500 });
    const error = await collect(
      new HttpMcpTarget({ ...base, fetchImpl, maxAttempts: 1 }).run(scenario),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpTargetError);
    expect(String((error as Error).message)).not.toContain('byok-secret-key');
  });
});

/** Drain an async iterable into an array. */
async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}
