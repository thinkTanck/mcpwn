/**
 * Module 1 — MCP HARNESS / RECORDER (offline).
 *
 * Drives an MCP tool-using target through a `Scenario` and RECORDS what it does
 * as an OBSERVABLE, marker-free `Trace`. The target is reached through the
 * domain-named `McpTargetPort`; here (Phase 5) the port is MOCKED — no creds, no
 * network. The real HTTP MCP adapter arrives in Phase 8 and satisfies the same
 * port.
 *
 * The target emits a stream of `TargetStepEvent`s (the 7 observable step kinds,
 * WITHOUT an id — the recorder assigns ids). `record` maps each event, in order,
 * onto the matching `TraceBuilder` adder and returns `builder.build()`, so the
 * trace is schema-valid and marker-free BY CONSTRUCTION (`TraceSchema` rejects a
 * `label`/`compromiseFlag`). The recorder NEVER attaches a label — the held-out
 * GroundTruth lives elsewhere (leakage separation).
 */
import type { Category, JsonValue, Scenario, Trace } from '@/contract';
import { TraceBuilder } from '@/attacks/engine';

/**
 * One observable event a running target emits — a 7-way discriminated union on
 * `type`, mirroring the contract step payloads but WITHOUT an `id` (the recorder
 * assigns ids) and WITHOUT any label (observable-only).
 */
export type TargetStepEvent =
  | { type: 'principal_instruction'; content: string }
  | { type: 'agent_reasoning'; content: string }
  | { type: 'tool_call'; tool: string; args: Record<string, JsonValue> }
  | { type: 'tool_result'; tool: string; result: JsonValue }
  | { type: 'memory_read'; key: string; value: JsonValue }
  | { type: 'memory_write'; key: string; value: JsonValue }
  | { type: 'task_complete'; summary?: string };

/** Run-level identity stamped onto the recorded `Trace`. */
export interface TargetRunMeta {
  runId: string;
  target: string;
  model: string;
  category: Category;
}

/**
 * Domain-named port for an MCP target. `run` drives the target through a
 * `Scenario` and yields its observable events in order. The offline mock and the
 * Phase-8 HTTP adapter both satisfy this single interface.
 */
export interface McpTargetPort {
  run(scenario: Scenario): AsyncIterable<TargetStepEvent>;
}

/**
 * Drive `port.run(scenario)` and record every emitted event, in order, onto a
 * `TraceBuilder`, returning a validated observable `Trace`. An empty stream
 * yields a valid Trace with zero steps.
 */
export async function record(
  port: McpTargetPort,
  scenario: Scenario,
  meta: TargetRunMeta,
): Promise<Trace> {
  const builder = new TraceBuilder(meta);

  for await (const event of port.run(scenario)) {
    switch (event.type) {
      case 'principal_instruction':
        builder.principalInstruction(event.content);
        break;
      case 'agent_reasoning':
        builder.agentReasoning(event.content);
        break;
      case 'tool_call':
        builder.toolCall(event.tool, event.args);
        break;
      case 'tool_result':
        builder.toolResult(event.tool, event.result);
        break;
      case 'memory_read':
        builder.memoryRead(event.key, event.value);
        break;
      case 'memory_write':
        builder.memoryWrite(event.key, event.value);
        break;
      case 'task_complete':
        builder.taskComplete(event.summary);
        break;
    }
  }

  return builder.build();
}
