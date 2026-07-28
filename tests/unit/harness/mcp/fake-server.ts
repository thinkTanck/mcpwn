/**
 * In-process fake MCP server used to test the HTTP adapter. Two flavours, both
 * driven through an injected `fetch`, so no socket is opened and nothing here
 * ever talks to a real agent:
 *
 *  - `streamableFetch` — MCP Streamable HTTP: one endpoint, JSON-RPC over POST,
 *    answering `application/json` or `text/event-stream`.
 *  - `legacySseFetch` — the 2024-11-05 HTTP+SSE transport: a GET stream that
 *    announces a message endpoint, POSTs answered 202, responses pushed back
 *    down the GET stream.
 */
import type { FetchLike } from '@/harness/mcp';

export interface ToolCallHandlerResult {
  /** JSON-RPC `result` for `tools/call`. */
  result?: unknown;
  /** JSON-RPC `error` for `tools/call`. */
  error?: { code: number; message: string };
  /** `notifications/message` frames emitted before the response (SSE mode only). */
  notifications?: string[];
}

export interface FakeServerOptions {
  tools?: string[];
  /** Answer requests with an SSE body instead of a JSON body. */
  sse?: boolean;
  onToolCall?: (name: string, args: unknown) => ToolCallHandlerResult;
  /** Session id echoed on the initialize response. */
  sessionId?: string;
}

export interface FakeServer {
  fetch: FetchLike;
  /** Every request the adapter made: method + the headers it sent. */
  readonly calls: RecordedCall[];
}

/** One recorded outbound request. `body` is the parsed JSON-RPC envelope, if any. */
export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: { method?: string; id?: unknown; params?: { name?: string; arguments?: unknown } };
}

function jsonResponse(body: unknown, init?: { headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

function sseResponse(frames: string[], init?: { headers?: Record<string, string> }): Response {
  return new Response(frames.map((f) => `${f}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...(init?.headers ?? {}) },
  });
}

function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = init?.headers as Record<string, string> | undefined;
  for (const [k, v] of Object.entries(raw ?? {})) out[k.toLowerCase()] = v;
  return out;
}

/** MCP Streamable HTTP fake. */
export function streamableFetch(options: FakeServerOptions = {}): FakeServer {
  const tools = (options.tools ?? ['agent']).map((name) => ({ name }));
  const calls: FakeServer['calls'] = [];

  const fetchImpl: FetchLike = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: String(init?.method ?? 'GET'), url, headers: headersOf(init), body });

    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (init?.method !== 'POST') return new Response('method not allowed', { status: 405 });
    if (body?.id === undefined) return new Response(null, { status: 202 }); // notification

    const respond = (result: unknown, extraHeaders?: Record<string, string>) => {
      const message = { jsonrpc: '2.0', id: body.id, result };
      return options.sse
        ? sseResponse([`event: message\ndata: ${JSON.stringify(message)}`], {
            headers: extraHeaders,
          })
        : jsonResponse(message, { headers: extraHeaders });
    };

    if (body.method === 'initialize') {
      return respond(
        {
          protocolVersion: '2025-06-18',
          capabilities: {},
          serverInfo: { name: 'fake', version: '1' },
        },
        options.sessionId ? { 'mcp-session-id': options.sessionId } : undefined,
      );
    }
    if (body.method === 'tools/list') return respond({ tools });
    if (body.method === 'tools/call') {
      const outcome = options.onToolCall?.(body.params?.name, body.params?.arguments) ?? {
        result: { content: [{ type: 'text', text: 'done' }] },
      };
      if (outcome.error) {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, error: outcome.error });
      }
      const frames = [
        ...(outcome.notifications ?? []).map(
          (text) =>
            `event: message\ndata: ${JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/message',
              params: { level: 'info', data: text },
            })}`,
        ),
        `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: outcome.result })}`,
      ];
      return options.sse || outcome.notifications?.length
        ? sseResponse(frames)
        : jsonResponse({ jsonrpc: '2.0', id: body.id, result: outcome.result });
    }
    return jsonResponse({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32601, message: 'method not found' },
    });
  };

  return { fetch: fetchImpl, calls };
}

/**
 * Legacy HTTP+SSE fake (MCP 2024-11-05). POSTing to the base endpoint is refused
 * with 405 (the signal that Streamable HTTP is unsupported); the GET stream
 * announces `/messages` and carries every response.
 */
export function legacySseFetch(options: FakeServerOptions = {}): FakeServer {
  const tools = (options.tools ?? ['agent']).map((name) => ({ name }));
  const calls: FakeServer['calls'] = [];
  const encoder = new TextEncoder();
  let push: ((frame: string) => void) | undefined;

  const fetchImpl: FetchLike = async (url, init) => {
    const method = String(init?.method ?? 'GET');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, headers: headersOf(init), body });

    if (method === 'GET') {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          push = (frame: string) => controller.enqueue(encoder.encode(`${frame}\n\n`));
          controller.enqueue(encoder.encode(`event: endpoint\ndata: /messages\n\n`));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    if (method === 'POST' && !url.includes('/messages')) {
      return new Response('use the SSE transport', { status: 405 });
    }

    // Message POST: acknowledge, then answer on the GET stream.
    if (body?.id !== undefined) {
      const answer = (result: unknown) =>
        push?.(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}`);
      queueMicrotask(() => {
        if (body.method === 'initialize') {
          answer({ protocolVersion: '2024-11-05', capabilities: {} });
        } else if (body.method === 'tools/list') {
          answer({ tools });
        } else if (body.method === 'tools/call') {
          const outcome = options.onToolCall?.(body.params?.name, body.params?.arguments) ?? {
            result: { content: [{ type: 'text', text: 'legacy done' }] },
          };
          for (const text of outcome.notifications ?? []) {
            push?.(
              `event: message\ndata: ${JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/message',
                params: { level: 'info', data: text },
              })}`,
            );
          }
          answer(outcome.result);
        }
      });
    }
    return new Response(null, { status: 202 });
  };

  return { fetch: fetchImpl, calls };
}
