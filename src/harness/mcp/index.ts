/**
 * HTTP `McpTargetPort` adapter (Phase 8 / hosted-release Slice 3). Satisfies the
 * same port as the offline mock, so the harness recorder and the run-matrix
 * runner are unchanged.
 */
export { McpTargetError, type McpTargetErrorCode } from './errors';
export { ByokEndpointSchema, checkEndpoint, endpointLabel, isLoopbackHost } from './endpoint';
export { HttpMcpTarget, DEFAULT_AGENT_TOOL, type HttpMcpTargetOptions } from './target';
export {
  openMcpSession,
  type FetchLike,
  type McpRequestOutcome,
  type McpSession,
  type McpTransportOptions,
} from './transport';
export { MCP_PROTOCOL_VERSION } from './protocol';
