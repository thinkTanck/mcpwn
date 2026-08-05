/**
 * HOSTED MCP SERVER — Node `http` adapter.
 *
 * Bridges Node's `IncomingMessage` / `ServerResponse` to the framework-agnostic
 * Streamable HTTP handler (`http.ts`), so the same handler that mounts as a Next
 * route can also run behind a plain Node server — which is what the integration
 * test drives on an isolated port, and what an operator runs to point a real
 * agent at a loopback endpoint.
 *
 * SAFETY (spec "Safety"): bind loopback only by default. The tools served are
 * hostile by design and nothing real sits behind them, but the endpoint is still
 * inbound attack surface, so it is not exposed publicly from here.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { StreamableHttpHandler } from '@/harness/server/http';

/** Read a Node request body fully into a string. */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Convert a Node request into a Web `Request` the handler understands. */
async function toWebRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const url = `${origin}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await readBody(req) : undefined;
  return new Request(url, {
    method,
    headers,
    ...(body === undefined || body === '' ? {} : { body }),
  });
}

/** Write a Web `Response` back onto the Node response. */
async function writeWebResponse(res: ServerResponse, web: Response): Promise<void> {
  const headers: Record<string, string> = {};
  web.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(web.status, headers);
  const text = await web.text();
  res.end(text);
}

/** Build a Node request listener from a Streamable HTTP handler. */
export function nodeListener(handler: StreamableHttpHandler, origin = 'http://127.0.0.1') {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const web = await toWebRequest(req, origin);
      const response = await handler.handle(web);
      await writeWebResponse(res, response);
    } catch (error) {
      // Defence in depth: never drop the socket mid-run. Answer plainly.
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'internal error' }));
    }
  };
}

/**
 * Start a loopback Node server for the handler and resolve with the server and
 * the port it bound. Loopback only, by design.
 */
export function startNodeServer(
  handler: StreamableHttpHandler,
  port = 0,
  host = '127.0.0.1',
): Promise<{ server: Server; port: number }> {
  const server = createServer(nodeListener(handler, `http://${host}`));
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const bound = typeof address === 'object' && address !== null ? address.port : port;
      resolve({ server, port: bound });
    });
  });
}
