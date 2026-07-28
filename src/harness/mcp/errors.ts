/**
 * Typed failures for the HTTP `McpTargetPort` adapter — the same shape as
 * `DetectorError` (module 4) and `RunnerCellError` (module 3): a `code` callers
 * branch on, never a raw `fetch`/parser exception escaping.
 *
 * SECRET SAFETY: a message is assembled from method names, status codes and the
 * endpoint ORIGIN only. The BYOK key is never interpolated, and neither is the
 * endpoint's path/query (a user can paste a token into a query string).
 */

/** Normalized failure codes for a live MCP target. */
export type McpTargetErrorCode =
  /** The endpoint failed validation (not https, credentials embedded, unparseable). */
  | 'INVALID_ENDPOINT'
  /** The request never reached the target (DNS/TLS/socket). */
  | 'CONNECTION_FAILED'
  /** The request exceeded its deadline. */
  | 'TIMEOUT'
  /** The target answered with a non-2xx status. */
  | 'HTTP_ERROR'
  /** The body was not JSON-RPC 2.0, or failed its Zod schema. */
  | 'MALFORMED_RESPONSE'
  /** The target answered with a JSON-RPC `error` object. */
  | 'PROTOCOL_ERROR'
  /** The target speaks a transport this adapter cannot drive. */
  | 'UNSUPPORTED_TRANSPORT'
  /** The agent entrypoint tool is absent from the target's `tools/list`. */
  | 'TOOL_NOT_FOUND';

/** A typed MCP target failure. `retryable` marks transport faults worth a retry. */
export class McpTargetError extends Error {
  readonly code: McpTargetErrorCode;
  readonly retryable: boolean;
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;

  constructor(
    code: McpTargetErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean; status?: number },
  ) {
    super(message, options);
    this.name = 'McpTargetError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    if (options?.status !== undefined) this.status = options.status;
  }
}
