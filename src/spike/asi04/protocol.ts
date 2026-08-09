/**
 * HYPOTHESIS SPIKE (ASI04) — inbound JSON-RPC surface.
 *
 * REUSED, NOT RE-TYPED. The server-side JSON-RPC layer built for the ASI01 spike
 * contains nothing ASI01-specific: it validates envelopes, classifies requests
 * against notifications, parses the params of the four served methods, and
 * builds result/error envelopes. Copying it here to satisfy a directory boundary
 * would fork two identical hostile-input validators, and the fork would rot the
 * first time one of them was hardened.
 *
 * So this module re-exports it. The `asi01/` path is an artefact of which spike
 * happened to need a JSON-RPC server first, not a statement that the code is
 * category-specific. If a third category ever needs it, this is the moment to
 * lift it to `src/spike/shared/` — a move that would touch `asi01/`, which this
 * change is scoped out of.
 */
export {
  RPC_PARSE_ERROR,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_INVALID_PARAMS,
  SpikeProtocolError,
  InboundRequestSchema,
  InboundNotificationSchema,
  InitializeParamsSchema,
  ListToolsParamsSchema,
  CallToolParamsSchema,
  classifyInbound,
  parseInitializeParams,
  parseListToolsParams,
  parseCallToolParams,
  jsonRpcResult,
  jsonRpcError,
  type SpikeErrorCode,
  type InboundRequest,
  type InboundNotification,
  type InboundMessage,
  type JsonRpcErrorBody,
  type JsonRpcResultEnvelope,
  type JsonRpcErrorEnvelope,
  type JsonRpcOutbound,
  type InitializeParams,
  type ListToolsParams,
  type CallToolParams,
} from '@/spike/asi01/protocol';
