/**
 * HOSTED MCP SERVER — Streamable HTTP transport (MCP spec revision 2025-06-18).
 *
 * This is the productization step the stdio spikes explicitly did NOT take: the
 * spikes used stdio because TLS, a per-run endpoint and a token bear nothing on
 * the behavioural "does it bite" question. A HOSTED red-team run needs the real
 * transport, so this implements Streamable HTTP against the current spec:
 *
 *  - **Single endpoint, POST + GET + DELETE.** The client POSTs JSON-RPC; a GET
 *    would open a server->client SSE stream (we serve none, so GET is 405); a
 *    DELETE terminates the session.
 *  - **`Accept` negotiation.** A POST carrying a request must accept
 *    `application/json` and/or `text/event-stream`. We answer a single response
 *    as JSON by default, or as one SSE frame when the client accepts only SSE.
 *  - **Session handling.** `initialize` mints a session and returns it in the
 *    `Mcp-Session-Id` response header; every later request MUST carry it. A
 *    missing id is 400, an unknown/expired id is 404 (spec).
 *  - **JSON-RPC-only bodies with a request that has no response owed** (a lone
 *    notification such as `notifications/initialized`) get `202 Accepted`, no body.
 *
 * Every inbound payload is JSON-parsed and Zod-validated before any field is read
 * (the dispatch happens in `HostedMcpServer.handle`, which never throws), so
 * malformed input becomes a proper JSON-RPC error with the right HTTP status, not
 * a crash. Framework-agnostic: it operates on Web `Request` / `Response`, so it
 * mounts as a Next route handler or runs behind the Node wrapper in `node.ts`.
 */
import { JSONRPC_VERSION } from '@/harness/mcp/protocol';
import {
  RPC_INVALID_REQUEST,
  RPC_PARSE_ERROR,
  classifyInbound,
  jsonRpcError,
  type JsonRpcOutbound,
} from '@/harness/server/protocol';
import type { HostedMcpServer } from '@/harness/server/server';

/** The MCP session header (spec: case-insensitive; we read/write this casing). */
export const SESSION_HEADER = 'mcp-session-id';
/** The MCP protocol-version header a client SHOULD send after initialize. */
export const PROTOCOL_HEADER = 'mcp-protocol-version';

const JSON_MIME = 'application/json';
const SSE_MIME = 'text/event-stream';

/** How a new session's server is created — one server (one surface) per run. */
export type ServerFactory = () => HostedMcpServer;

export interface StreamableHttpHandler {
  /** Handle one HTTP request against the session registry. */
  handle(request: Request): Promise<Response>;
  /** The server bound to a live session, or undefined. */
  getSession(id: string): HostedMcpServer | undefined;
  /** Live session ids, in creation order. */
  sessionIds(): string[];
  /** Drop a session (as a client DELETE does), returning whether it existed. */
  endSession(id: string): boolean;
}

/** Mint a session id. Opaque and unguessable — never encodes anything about the run. */
function newSessionId(): string {
  return globalThis.crypto.randomUUID();
}

/** Parse an HTTP `Accept` header into the media types the client will take. */
function accepts(request: Request): { json: boolean; sse: boolean } {
  const header = request.headers.get('accept') ?? '';
  const lowered = header.toLowerCase();
  const any = lowered.includes('*/*') || header.trim() === '';
  return {
    json: any || lowered.includes(JSON_MIME),
    sse: any || lowered.includes(SSE_MIME),
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_MIME, ...headers },
  });
}

/** One SSE frame carrying a single JSON-RPC message, then the stream closes. */
function sseResponse(message: JsonRpcOutbound, headers: Record<string, string> = {}): Response {
  const body = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': SSE_MIME,
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      ...headers,
    },
  });
}

/** Render one JSON-RPC response as either JSON or a single SSE frame. */
function renderOutbound(
  message: JsonRpcOutbound,
  want: { json: boolean; sse: boolean },
  headers: Record<string, string>,
): Response {
  if (want.json) return jsonResponse(message, 200, headers);
  return sseResponse(message, headers);
}

/**
 * Build a Streamable-HTTP handler over a session registry. `newServer` creates a
 * fresh `HostedMcpServer` — one surface, one run — for each `initialize`.
 */
export function createStreamableHttpHandler(newServer: ServerFactory): StreamableHttpHandler {
  const sessions = new Map<string, HostedMcpServer>();

  async function handlePost(request: Request): Promise<Response> {
    const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes(JSON_MIME)) {
      return jsonResponse(
        jsonRpcError(null, RPC_INVALID_REQUEST, 'Content-Type must be application/json.'),
        415,
      );
    }
    const want = accepts(request);
    if (!want.json && !want.sse) {
      return jsonResponse(
        jsonRpcError(
          null,
          RPC_INVALID_REQUEST,
          'Accept must allow application/json or text/event-stream.',
        ),
        406,
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonResponse(jsonRpcError(null, RPC_PARSE_ERROR, 'Parse error'), 400);
    }

    const inbound = classifyInbound(raw);
    const sessionId = request.headers.get(SESSION_HEADER) ?? undefined;
    const isInitialize = inbound.kind === 'request' && inbound.message.method === 'initialize';

    // A brand-new session is minted by `initialize` and by nothing else.
    if (isInitialize) {
      const id = newSessionId();
      const server = newServer();
      sessions.set(id, server);
      const response = server.handle(raw);
      // initialize always owes a response.
      return renderOutbound(
        response ?? jsonRpcError(null, RPC_INVALID_REQUEST, 'no response'),
        want,
        {
          [SESSION_HEADER]: id,
        },
      );
    }

    // Every other message must ride an established session.
    if (sessionId === undefined) {
      return jsonResponse(
        jsonRpcError(
          inbound.kind === 'request' ? inbound.message.id : null,
          RPC_INVALID_REQUEST,
          'Missing Mcp-Session-Id. Send initialize first.',
        ),
        400,
      );
    }
    const server = sessions.get(sessionId);
    if (server === undefined) {
      return jsonResponse(
        jsonRpcError(
          inbound.kind === 'request' ? inbound.message.id : null,
          RPC_INVALID_REQUEST,
          'Unknown or expired session.',
        ),
        404,
      );
    }

    const response = server.handle(raw);
    // A notification (or any message owing no response) is acknowledged with 202.
    if (response === null) return new Response(null, { status: 202 });
    return renderOutbound(response, want, {});
  }

  function handleDelete(request: Request): Response {
    const sessionId = request.headers.get(SESSION_HEADER) ?? undefined;
    if (sessionId === undefined) {
      return jsonResponse(jsonRpcError(null, RPC_INVALID_REQUEST, 'Missing Mcp-Session-Id.'), 400);
    }
    const existed = sessions.delete(sessionId);
    return new Response(null, { status: existed ? 204 : 404 });
  }

  return {
    async handle(request: Request): Promise<Response> {
      switch (request.method) {
        case 'POST':
          return handlePost(request);
        case 'GET':
          // We serve no server-initiated stream, so there is nothing to open.
          return new Response('Method Not Allowed', {
            status: 405,
            headers: { allow: 'POST, DELETE' },
          });
        case 'DELETE':
          return handleDelete(request);
        default:
          return new Response('Method Not Allowed', {
            status: 405,
            headers: { allow: 'POST, DELETE' },
          });
      }
    },
    getSession(id) {
      return sessions.get(id);
    },
    sessionIds() {
      return [...sessions.keys()];
    },
    endSession(id) {
      return sessions.delete(id);
    },
  };
}

export { JSONRPC_VERSION };
