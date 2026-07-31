/**
 * OUTBOUND MCP client: server probing + the shared transport layer.
 *
 * SCOPE, per [ADR-0006](../../../docs/adr/0006-mcpwn-is-the-mcp-server.md). This
 * is **NOT** the live agent path. A live run means the user's agent connecting
 * to an MCP server WE host, because attacks are staged through the tool surface
 * and you cannot poison what you do not serve. Calling someone else's endpoint
 * cannot stage ASI01/02/04/05/06 at all.
 *
 * What this layer IS for:
 *  - **Probing a target MCP *server*** — the ASI02 (tool misuse) and ASI05
 *    (unexpected code execution) surfaces, where the thing under test really is
 *    a server's exposed tools.
 *  - **The shared transport** — Streamable HTTP with a legacy HTTP+SSE fallback,
 *    JSON-RPC framing, Zod validation of every inbound message, typed errors,
 *    deadlines and bounded retries. The hosted server reuses this.
 *
 * It satisfies `McpTargetPort`, so the harness recorder and the run-matrix
 * runner are unchanged.
 */
export { McpTargetError, type McpTargetErrorCode } from './errors';
export { ProbeEndpointSchema, checkEndpoint, endpointLabel, isLoopbackHost } from './endpoint';
export { HttpMcpTarget, DEFAULT_AGENT_TOOL, type HttpMcpTargetOptions } from './target';
export {
  openMcpSession,
  type FetchLike,
  type McpRequestOutcome,
  type McpSession,
  type McpTransportOptions,
} from './transport';
export { MCP_PROTOCOL_VERSION } from './protocol';
