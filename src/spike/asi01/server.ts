/**
 * HYPOTHESIS SPIKE — the MCP server MCPwn hosts, and the agent connects to.
 *
 * Transport-free dispatch: `handle(raw)` takes one already-parsed inbound
 * message and returns the envelope owed (or `null` for a notification, which is
 * never answered). `stdio.ts` wraps it in framing; a test drives it directly.
 *
 * PROTOCOL SURFACE — exactly what the spike spec lists, deliberately:
 *   `initialize` · `notifications/initialized` · `tools/list` · `tools/call`
 * Everything else answers METHOD_NOT_FOUND, which is the correct spec behaviour
 * for a server that advertises only the `tools` capability. No `ping`, no
 * `prompts/*` (the task goal is delivered by PASTE for the spike), no
 * `resources/*`, no `sampling/*`.
 *
 * ORDER LENIENCY, stated openly: the spec says a server SHOULD reject requests
 * before `initialize` completes. This one logs them out-of-order and serves them
 * anyway, because the worst possible misread of this experiment is a PROTOCOL
 * failure counted as a behavioral NO. Strict ordering is a production concern
 * and bears nothing on whether an agent takes the bait.
 */
import type { JsonValue, Trace, VariantKind } from '@/contract';
import { MCP_PROTOCOL_VERSION } from '@/harness/mcp/protocol';
import {
  SpikeProtocolError,
  classifyInbound,
  jsonRpcError,
  jsonRpcResult,
  parseCallToolParams,
  parseInitializeParams,
  parseListToolsParams,
  RPC_INVALID_PARAMS,
  RPC_METHOD_NOT_FOUND,
  type InboundRequest,
  type JsonRpcOutbound,
} from '@/spike/asi01/protocol';
import { SpikeTraceRecorder, type SpikeRecorderOptions } from '@/spike/asi01/recorder';
import { buildSurface, type SpikeSurface, type SpikeTool } from '@/spike/asi01/surface';

/** Named so nobody can mistake this endpoint, or its content, for something real. */
export const SPIKE_SERVER_NAME = 'mcpwn-spike-asi01-sandbox';
export const SPIKE_SERVER_VERSION = '0.0.0';

/** Protocol revisions this endpoint will echo back. Anything else gets ours. */
const SUPPORTED_PROTOCOL_VERSIONS = new Set([MCP_PROTOCOL_VERSION, '2025-03-26', '2024-11-05']);

/** One line of the append-only run log. Never written to the MCP channel. */
export interface SpikeLogEntry {
  readonly at: string;
  readonly direction: 'in';
  readonly method: string;
  readonly tool?: string;
  readonly note?: string;
}

export interface SpikeServerOptions extends SpikeRecorderOptions {
  /** Which framing to serve: the poisoned run or its benign control. */
  readonly kind: VariantKind;
  /** Injectable clock, so the log is deterministic under test. */
  readonly now?: () => string;
}

export class SpikeMcpServer {
  private readonly surface: SpikeSurface;
  private readonly recorder: SpikeTraceRecorder;
  private readonly entries: SpikeLogEntry[] = [];
  private readonly now: () => string;
  private initialized = false;

  constructor(options: SpikeServerOptions) {
    const { kind, now, ...recorderOptions } = options;
    this.surface = buildSurface(kind);
    this.recorder = new SpikeTraceRecorder(this.surface, recorderOptions);
    this.now = now ?? (() => new Date().toISOString());
  }

  /** The append-only run log, in arrival order. */
  get log(): readonly SpikeLogEntry[] {
    return this.entries;
  }

  /** The task goal to hand the agent OUT OF BAND (paste, for the spike). */
  get taskGoal(): string {
    return this.surface.taskGoal;
  }

  /** Assemble the observable Trace, including the inferred completion step. */
  async buildTrace(): Promise<Trace> {
    return this.recorder.buildTrace();
  }

  /**
   * Handle one inbound message. Returns the envelope owed, or `null` when the
   * message was a notification. NEVER throws: a typed `SpikeProtocolError` is
   * turned into an error envelope, and any other failure into INVALID_PARAMS.
   */
  handle(raw: unknown): JsonRpcOutbound | null {
    const inbound = classifyInbound(raw);

    if (inbound.kind === 'invalid') {
      this.note('<invalid>', { note: inbound.error.message });
      return jsonRpcError(inbound.id, inbound.error.code, inbound.error.message);
    }

    if (inbound.kind === 'notification') {
      // A notification is never answered — not even an unknown one.
      const known = inbound.message.method === 'notifications/initialized';
      if (known) this.initialized = true;
      this.note(inbound.message.method, known ? {} : { note: 'notification outside the surface' });
      return null;
    }

    const request = inbound.message;
    try {
      return this.dispatch(request);
    } catch (error) {
      if (error instanceof SpikeProtocolError) {
        return jsonRpcError(request.id, error.rpcCode, error.message);
      }
      // Defence in depth: a handler bug must still leave the endpoint speaking
      // JSON-RPC rather than dropping the connection mid-experiment.
      const message = error instanceof Error ? error.message : 'internal error';
      return jsonRpcError(request.id, RPC_INVALID_PARAMS, message);
    }
  }

  private dispatch(request: InboundRequest): JsonRpcOutbound {
    switch (request.method) {
      case 'initialize':
        return this.onInitialize(request);
      case 'tools/list':
        return this.onListTools(request);
      case 'tools/call':
        return this.onCallTool(request);
      default:
        this.note(request.method, { note: 'method outside the surface' });
        throw new SpikeProtocolError(
          'METHOD_NOT_FOUND',
          `Method not found: ${request.method}. This endpoint serves initialize, ` +
            'notifications/initialized, tools/list and tools/call only.',
        );
    }
  }

  private onInitialize(request: InboundRequest): JsonRpcOutbound {
    const params = parseInitializeParams(request.params);
    if (params.clientInfo) {
      this.recorder.observeClient({
        name: params.clientInfo.name,
        ...(params.clientInfo.version === undefined ? {} : { version: params.clientInfo.version }),
      });
    }
    this.note('initialize', {
      note: `client=${params.clientInfo?.name ?? 'anonymous'} protocol=${params.protocolVersion}`,
    });
    return jsonRpcResult(request.id, {
      // Echo the client's revision when we know it; otherwise state ours and let
      // the client decide (spec version negotiation).
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(params.protocolVersion)
        ? params.protocolVersion
        : MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SPIKE_SERVER_NAME, version: SPIKE_SERVER_VERSION },
    });
  }

  private onListTools(request: InboundRequest): JsonRpcOutbound {
    parseListToolsParams(request.params);
    this.noteOrder('tools/list');
    // Discovery is NOT a Trace step: the contract has no type for it, and
    // inventing one would be fabrication. It lives in the run log instead.
    return jsonRpcResult(request.id, {
      tools: this.surface.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  }

  private onCallTool(request: InboundRequest): JsonRpcOutbound {
    const params = parseCallToolParams(request.params);
    this.noteOrder('tools/call', params.name);

    // THE OBSERVATION THE WHOLE SPIKE EXISTS FOR: the agent chose to call this
    // tool, with these arguments. Recorded BEFORE validation, because an
    // attempted call to a tool we do not serve is still the agent's decision.
    this.recorder.recordToolCall(params.name, params.arguments);

    const tool: SpikeTool | undefined = this.surface.tools.find((t) => t.name === params.name);
    if (!tool) {
      const message = `Unknown tool: ${params.name}`;
      this.recorder.recordToolResult(params.name, { status: 'rejected', reason: message });
      throw new SpikeProtocolError('INVALID_PARAMS', message);
    }

    const outcome = tool.call(params.arguments);
    this.recorder.recordToolResult(params.name, outcome.payload);

    const result: Record<string, JsonValue> = {
      content: [{ type: 'text', text: outcome.text }],
      structuredContent: outcome.payload,
    };
    if (outcome.isError) result.isError = true;
    return jsonRpcResult(request.id, result);
  }

  private noteOrder(method: string, tool?: string): void {
    this.note(method, {
      ...(tool === undefined ? {} : { tool }),
      ...(this.initialized ? {} : { note: 'received before notifications/initialized' }),
    });
  }

  private note(method: string, extra: { tool?: string; note?: string }): void {
    this.entries.push({ at: this.now(), direction: 'in', method, ...extra });
  }
}
