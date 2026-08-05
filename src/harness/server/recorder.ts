/**
 * HOSTED MCP SERVER — recording what the endpoint observes as a real `Trace`.
 *
 * The recorded object is the SAME `Trace` the detector consumes (`src/contract`),
 * assembled through module 1's `record()` so step ids are assigned in exactly one
 * place and stay positional (`s1`, `s2`, …). An id that marked the offending step
 * would hand the judge its own label — the class of leak the leakage property
 * test exists to catch.
 *
 * OBSERVABLE-ONLY, per [ADR-0006](../../../docs/adr/0006-mcpwn-is-the-mcp-server.md).
 * A hosted server can honestly record:
 *  - `principal_instruction` — the task goal as the principal stated it, delivered
 *    OUT OF BAND on a channel we control (a published prompt, or paste). It is the
 *    ONLY inbound turn a hosted run observes, exactly one, FIRST (ADR-0011).
 *  - `tool_call`   — the agent's own decision, with arguments. THE signal.
 *  - `tool_result` — what we returned. The attack content lives here for ASI01/05.
 *  - `memory_read` / `memory_write` — ONLY when memory is a hosted tool.
 *  - `task_complete` — INFERRED from session end, and labelled inferred; MCP has
 *    no agent-finished message.
 *
 * `agent_reasoning` is NOT OBSERVABLE and is never synthesized — there is no
 * method here to add one, deliberately. Nothing in MCP carries an agent's chain
 * of thought to a server, so a reasoning step could only ever be fabrication. The
 * live trace is genuinely thinner than the constructed fixtures, and that
 * thinness is a finding, not a defect to paper over. Tool DISCOVERY (`tools/list`)
 * is likewise not a Trace step: the contract has no type for it.
 */
import type { JsonValue, Trace } from '@/contract';
import { record, type McpTargetPort, type TargetStepEvent } from '@/harness';
import type { HostedSurface } from '@/harness/server/surface';

/**
 * The summary carried by the inferred completion step. It states its own
 * provenance in text because `TaskCompleteStepSchema` is strict — there is no
 * `inferred` field, and adding one to the contract for the server would be worse
 * than saying it plainly where a human and the judge will read it.
 */
export const INFERRED_TASK_COMPLETE_SUMMARY =
  'INFERRED, not observed: the MCP session ended. MCP carries no agent-finished message, ' +
  'so completion is an inference drawn by the recorder from session close (ADR-0006).';

/** Used when no client identified itself. Named as unknown, never invented. */
export const UNKNOWN_CLIENT = 'unknown-client';

export interface HostedRecorderOptions {
  /**
   * The run id, IDENTICAL across both framings of a pair. A run id that named the
   * framing would put the held-out label inside the observable trace.
   */
  readonly runId?: string;
  /**
   * Where the agent connected. CATEGORY-FREE and PROJECT-FREE on purpose: the
   * judge is shown `target` and asked to classify the category, so a target
   * naming the category or the project would spell the answer out.
   */
  readonly target?: string;
  /** Pin the model/agent label; otherwise the client's self-reported name is used. */
  readonly model?: string;
}

/** The client's self-reported identity from `initialize`. Unverifiable by us. */
export interface ObservedClient {
  readonly name: string;
  readonly version?: string;
}

export class HostedTraceRecorder {
  private readonly events: TargetStepEvent[] = [];
  private readonly pinnedModel: string | undefined;
  private readonly runId: string;
  private readonly target: string;
  private clientName: string | undefined;

  constructor(
    private readonly surface: HostedSurface,
    options: HostedRecorderOptions = {},
  ) {
    // The pinned-default realization slug is the kind-free run id.
    this.runId = options.runId ?? this.surface.variantId.replace(/-(malicious|benign)$/, '');
    this.target = options.target ?? 'https://mcp.example.com/mcp';
    this.pinnedModel = options.model;
    // The principal's own goal is the first, and only, inbound turn.
    this.events.push({ type: 'principal_instruction', content: surface.taskGoal });
  }

  /** Note who connected. The name is the client's own claim, not a verified fact. */
  observeClient(client: ObservedClient): void {
    this.clientName = client.name;
  }

  /** The agent chose to call a tool. This is the load-bearing observation. */
  recordToolCall(tool: string, args: Record<string, JsonValue>): void {
    this.events.push({ type: 'tool_call', tool, args });
  }

  /** What we handed back for that call, as a `tool_result` or a memory step. */
  recordToolResult(tool: string, result: JsonValue, args: Record<string, JsonValue>): void {
    const recording = this.surface.tools.find((t) => t.name === tool)?.recording ?? { as: 'tool' };
    if (recording.as === 'memory_read') {
      this.events.push({
        type: 'memory_read',
        key: this.memoryKey(recording.keyArg, args, tool),
        value: result,
      });
    } else if (recording.as === 'memory_write') {
      this.events.push({
        type: 'memory_write',
        key: this.memoryKey(recording.keyArg, args, tool),
        value: result,
      });
    } else {
      this.events.push({ type: 'tool_result', tool, result });
    }
  }

  private memoryKey(
    keyArg: string | undefined,
    args: Record<string, JsonValue>,
    fallback: string,
  ): string {
    const raw = keyArg === undefined ? undefined : args[keyArg];
    return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
  }

  /** The observable events so far, in order (excluding the inferred completion). */
  observed(): readonly TargetStepEvent[] {
    return [...this.events];
  }

  /**
   * Assemble the observable `Trace`, appending the INFERRED completion step.
   * Non-mutating, so it can be called more than once (e.g. on an early exit).
   */
  async buildTrace(): Promise<Trace> {
    const events: TargetStepEvent[] = [
      ...this.events,
      { type: 'task_complete', summary: INFERRED_TASK_COMPLETE_SUMMARY },
    ];
    const port: McpTargetPort = {
      async *run() {
        yield* events;
      },
    };
    return record(
      port,
      { taskGoal: this.surface.taskGoal, environment: { tools: [] } },
      {
        runId: this.runId,
        target: this.target,
        model: this.pinnedModel ?? this.clientName ?? UNKNOWN_CLIENT,
        category: this.surface.category,
      },
    );
  }
}
