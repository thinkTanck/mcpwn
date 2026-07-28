import { z } from 'zod';
import type { JsonValue } from '@/contract';

/**
 * MCP wire protocol: JSON-RPC 2.0 envelopes, the handful of MCP result shapes
 * this adapter reads, and an SSE frame parser.
 *
 * EVERY message crossing the wire is validated here with Zod before any field is
 * touched (CLAUDE.md: Zod on all external inputs). Schemas are LOOSE objects on
 * purpose: MCP servers legitimately add fields, and an unknown extra key must
 * not fail a run. What is enforced is the shape we actually read.
 */

export const JSONRPC_VERSION = '2.0';

/**
 * MCP protocol revision this adapter negotiates. The server may answer with a
 * different revision; we record it and do not hard-fail (spec: version
 * negotiation), because we only use the lowest-common-denominator methods
 * (`initialize`, `tools/list`, `tools/call`).
 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

export const JsonRpcIdSchema = z.union([z.string(), z.number()]);
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

export const JsonRpcErrorSchema = z.looseObject({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcErrorBody = z.infer<typeof JsonRpcErrorSchema>;

export const JsonRpcResponseSchema = z.looseObject({
  jsonrpc: z.literal(JSONRPC_VERSION),
  id: JsonRpcIdSchema,
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
});
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const JsonRpcNotificationSchema = z.looseObject({
  jsonrpc: z.literal(JSONRPC_VERSION),
  method: z.string().min(1),
  params: z.unknown().optional(),
});
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;

/**
 * A single inbound message: a response to one of our requests, a server
 * notification, or a server-initiated request (which this adapter records but
 * never answers, since it advertises no client capabilities).
 */
export type InboundMessage =
  | { kind: 'response'; message: JsonRpcResponse }
  | { kind: 'notification'; message: JsonRpcNotification }
  | { kind: 'unknown'; raw: unknown };

/** Classify + validate one parsed JSON message from the wire. */
export function classifyMessage(raw: unknown): InboundMessage {
  const response = JsonRpcResponseSchema.safeParse(raw);
  if (response.success) return { kind: 'response', message: response.data };
  const notification = JsonRpcNotificationSchema.safeParse(raw);
  if (notification.success) return { kind: 'notification', message: notification.data };
  return { kind: 'unknown', raw };
}

// ── MCP result shapes (only what this adapter reads) ──

export const InitializeResultSchema = z.looseObject({
  protocolVersion: z.string().min(1),
  capabilities: z.looseObject({}).optional(),
  serverInfo: z.looseObject({ name: z.string(), version: z.string() }).optional(),
});
export type InitializeResult = z.infer<typeof InitializeResultSchema>;

export const ToolDescriptorSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export const ToolsListResultSchema = z.looseObject({
  tools: z.array(ToolDescriptorSchema),
  nextCursor: z.string().optional(),
});
export type ToolsListResult = z.infer<typeof ToolsListResultSchema>;

export const CallToolResultSchema = z.looseObject({
  content: z.array(z.looseObject({ type: z.string() })).optional(),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional(),
});
export type CallToolResult = z.infer<typeof CallToolResultSchema>;

/**
 * MCP logging notification (`notifications/message`). This is the ONE
 * spec-defined channel through which a remote target can narrate what it is
 * doing, so it is the only honest source of an `agent_reasoning` step from a
 * black-box endpoint. Targets are not required to emit it.
 */
export const LoggingNotificationParamsSchema = z.looseObject({
  level: z.string().optional(),
  logger: z.string().optional(),
  data: z.unknown(),
});

/** Extract human-readable narration from a `notifications/message`, or null. */
export function loggingText(params: unknown): string | null {
  const parsed = LoggingNotificationParamsSchema.safeParse(params);
  if (!parsed.success) return null;
  const { data } = parsed.data;
  if (typeof data === 'string') return data.trim() === '' ? null : data;
  if (typeof data === 'object' && data !== null) {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim() !== '') return message;
  }
  return null;
}

// ── JsonValue coercion ──

/**
 * Coerce an arbitrary parsed-JSON value into the contract's `JsonValue`. The
 * wire is JSON so this is total in practice; the guard exists so a `undefined`
 * hole (from a loose schema) can never reach `StepSchema` and throw at build
 * time. Unrepresentable values become `null`.
 */
export function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'object': {
      if (Array.isArray(value)) return value.map(toJsonValue);
      const out: Record<string, JsonValue> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== undefined) out[key] = toJsonValue(v);
      }
      return out;
    }
    default:
      return null;
  }
}

// ── Server-Sent Events ──

/** One decoded SSE frame. `event` defaults to `message` per the SSE spec. */
export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

/** Decode one `\n\n`-delimited SSE frame, or null when it carries no data. */
export function parseSseFrame(chunk: string): SseEvent | null {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  let sawField = false;

  for (const line of chunk.split(/\r?\n/)) {
    if (line === '' || line.startsWith(':')) continue; // blank line / comment
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // A single leading space after the colon is part of the framing, not the value.
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') {
      event = value;
      sawField = true;
    } else if (field === 'data') {
      data.push(value);
      sawField = true;
    } else if (field === 'id') {
      id = value;
      sawField = true;
    }
  }

  if (!sawField || data.length === 0) return null;
  return id === undefined ? { event, data: data.join('\n') } : { event, data: data.join('\n'), id };
}

/** Stream a `ReadableStream` of SSE bytes as decoded frames, in order. */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer);
        if (!match) break;
        const frame = parseSseFrame(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (frame) yield frame;
      }
    }
    const tail = parseSseFrame(buffer);
    if (tail) yield tail;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
