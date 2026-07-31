import {
  classifyMessage,
  loggingText,
  parseSseFrame,
  parseSseStream,
  toJsonValue,
  CallToolResultSchema,
  ToolsListResultSchema,
  InitializeResultSchema,
} from '@/harness/mcp/protocol';

/** Build a ReadableStream of UTF-8 chunks (mirrors what `fetch` hands back). */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe('classifyMessage', () => {
  it('recognizes a JSON-RPC response', () => {
    const m = classifyMessage({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    expect(m.kind).toBe('response');
    expect(m.kind === 'response' && m.message.id).toBe(1);
  });

  it('recognizes a JSON-RPC notification (no id)', () => {
    const m = classifyMessage({ jsonrpc: '2.0', method: 'notifications/message', params: {} });
    expect(m.kind).toBe('notification');
  });

  it('rejects anything that is not JSON-RPC 2.0 rather than trusting it', () => {
    expect(classifyMessage({ id: 1, result: {} }).kind).toBe('unknown');
    expect(classifyMessage({ jsonrpc: '1.0', id: 1, result: {} }).kind).toBe('unknown');
    expect(classifyMessage('nope').kind).toBe('unknown');
  });

  it('keeps unknown extra fields instead of failing (servers add fields)', () => {
    const m = classifyMessage({ jsonrpc: '2.0', id: 'a', result: 1, _meta: { x: 1 } });
    expect(m.kind).toBe('response');
  });
});

describe('MCP result schemas', () => {
  it('validates initialize / tools list / call results', () => {
    expect(InitializeResultSchema.safeParse({ protocolVersion: '2025-06-18' }).success).toBe(true);
    expect(InitializeResultSchema.safeParse({}).success).toBe(false);
    expect(ToolsListResultSchema.safeParse({ tools: [{ name: 'agent' }] }).success).toBe(true);
    expect(ToolsListResultSchema.safeParse({ tools: [{}] }).success).toBe(false);
    expect(
      CallToolResultSchema.safeParse({ content: [{ type: 'text', text: 'hi' }] }).success,
    ).toBe(true);
  });
});

describe('loggingText', () => {
  it('reads a string payload and a { message } payload', () => {
    expect(loggingText({ level: 'info', data: 'planning the next call' })).toBe(
      'planning the next call',
    );
    expect(loggingText({ level: 'info', data: { message: 'reasoning' } })).toBe('reasoning');
  });

  it('returns null for empty or unreadable payloads', () => {
    expect(loggingText({ data: '   ' })).toBeNull();
    expect(loggingText({ data: 42 })).toBeNull();
    expect(loggingText({ nope: true })).toBeNull();
  });
});

describe('toJsonValue', () => {
  it('passes JSON scalars, arrays and objects through', () => {
    expect(toJsonValue({ a: [1, 'x', true, null] })).toEqual({ a: [1, 'x', true, null] });
  });

  it('drops undefined holes and neutralizes non-finite numbers', () => {
    expect(toJsonValue({ a: undefined, b: 1 })).toEqual({ b: 1 });
    expect(toJsonValue(Number.NaN)).toBeNull();
    expect(toJsonValue(Infinity)).toBeNull();
    expect(toJsonValue(() => 1)).toBeNull();
  });
});

describe('parseSseFrame', () => {
  it('decodes event/data/id and strips the single framing space', () => {
    expect(parseSseFrame('event: message\ndata: {"a":1}\nid: 7')).toEqual({
      event: 'message',
      data: '{"a":1}',
      id: '7',
    });
  });

  it('defaults the event name to "message" and joins multi-line data', () => {
    expect(parseSseFrame('data: one\ndata: two')).toEqual({ event: 'message', data: 'one\ntwo' });
  });

  it('ignores comments and returns null for a frame with no data', () => {
    expect(parseSseFrame(': keep-alive')).toBeNull();
    expect(parseSseFrame('event: ping')).toBeNull();
    expect(parseSseFrame('')).toBeNull();
  });
});

describe('parseSseStream', () => {
  it('yields frames in order across chunk boundaries', async () => {
    const stream = streamOf(
      'event: message\ndata: {"n"',
      ':1}\n\nevent: message\ndata: {"n":2}\n\n',
    );
    const frames = [];
    for await (const f of parseSseStream(stream)) frames.push(f);
    expect(frames.map((f) => f.data)).toEqual(['{"n":1}', '{"n":2}']);
  });

  it('yields a trailing frame that was never terminated by a blank line', async () => {
    const frames = [];
    for await (const f of parseSseStream(streamOf('data: last'))) frames.push(f);
    expect(frames).toEqual([{ event: 'message', data: 'last' }]);
  });

  it('handles CRLF framing', async () => {
    const frames = [];
    for await (const f of parseSseStream(streamOf('data: a\r\n\r\ndata: b\r\n\r\n')))
      frames.push(f);
    expect(frames.map((f) => f.data)).toEqual(['a', 'b']);
  });
});
