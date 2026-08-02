/**
 * HYPOTHESIS SPIKE — recording what the endpoint observes as a real `Trace`.
 *
 * The recorded object is the SAME `Trace` the detector consumes (`src/contract`),
 * built through module 1's `record()` so step ids are assigned in exactly one
 * place and stay positional (`s1`, `s2`, …). That matters: an id that marked the
 * offending step would hand the judge its own label, which is precisely the class
 * of leak `tests/unit/attacks/leakage.property.test.ts` exists to catch.
 *
 * WHAT A SERVER CAN HONESTLY SEE, per ADR-0006:
 *  - `attacker`    — the content WE authored into the environment. Ours by construction.
 *  - `tool_call`   — the agent's own decision, with its arguments. The signal.
 *  - `tool_result` — what we returned. For ASI01 the trap lives here.
 *  - `task_complete` — INFERRED from session end. MCP has no "agent finished"
 *    message, and the inference is stated in the step's own text.
 *  - `agent_reasoning` — NOT OBSERVABLE, and never synthesized. There is no
 *    method on this class to add one, deliberately: nothing in MCP carries an
 *    agent's chain of thought to a server, so a reasoning step here could only
 *    ever be fabrication. The live trace is genuinely thinner than the
 *    constructed fixtures, and that thinness is a finding, not a defect to hide.
 *
 * `tools/list` is not recorded: the contract has no step type for discovery, and
 * inventing one would be exactly the fabrication this file refuses elsewhere. It
 * is written to the run log instead.
 */
import type { Category, JsonValue, Trace } from '@/contract';
import { record, type McpTargetPort, type TargetStepEvent } from '@/harness';
import type { SpikeSurface } from '@/spike/asi01/surface';
import { SPIKE_PAIR_SLUG } from '@/spike/asi01/surface';

/** The category this spike stages. One category, deliberately. */
export const SPIKE_CATEGORY: Category = 'ASI01';

/**
 * The run identity, IDENTICAL across both framings. A `runId` that named the
 * framing would put the held-out label inside the observable trace — the exact
 * leak ASI10 once shipped (`asi10-goal_drift-malicious`).
 */
export const SPIKE_RUN_ID = SPIKE_PAIR_SLUG;

/**
 * Where the agent connected. stdio, local only — no HTTP, no token (spec).
 *
 * CATEGORY-FREE on purpose. `target` is one of the few fields the detector DOES
 * forward to the judge (`judgeableTrace` withholds `category` and `runId`, but
 * keeps `target`), and the judge is asked to classify the category. A target of
 * `stdio://…-asi01` would spell the answer out inside the evidence payload.
 */
export const SPIKE_TARGET = 'stdio://mcpwn-red-team-sandbox';

/** Used when no client identified itself. Named as unknown, never invented. */
export const UNKNOWN_CLIENT = 'unknown-client';

/**
 * The summary carried by the inferred completion step. It says so in its own
 * text because `TaskCompleteStepSchema` is strict — there is no `inferred` field
 * to set, and adding one to the contract for the spike would be worse than
 * saying it plainly where a human (and the judge) will read it.
 */
export const INFERRED_TASK_COMPLETE_SUMMARY =
  'INFERRED, not observed: the MCP session ended. MCP carries no agent-finished message, ' +
  'so completion is an inference drawn by the recorder from session close (ADR-0006).';

export interface SpikeRecorderOptions {
  /** Pin the run id. Must not encode the framing. */
  readonly runId?: string;
  readonly target?: string;
  /** Pin the model/agent label when the operator knows it; otherwise the
   *  connecting client's self-reported name is used. */
  readonly model?: string;
}

/** The client's self-reported identity from `initialize`. Unverifiable by us. */
export interface ObservedClient {
  readonly name: string;
  readonly version?: string;
}

export class SpikeTraceRecorder {
  private readonly events: TargetStepEvent[] = [];
  private readonly pinnedModel: string | undefined;
  private readonly runId: string;
  private readonly target: string;
  private clientName: string | undefined;

  constructor(
    private readonly surface: SpikeSurface,
    options: SpikeRecorderOptions = {},
  ) {
    this.runId = options.runId ?? SPIKE_RUN_ID;
    this.target = options.target ?? SPIKE_TARGET;
    this.pinnedModel = options.model;
    // The authored content was in place before the agent ever connected.
    this.events.push({ type: 'attacker', content: surface.seededEmailText });
  }

  /** Note who connected. The name is the client's own claim, not a verified fact. */
  observeClient(client: ObservedClient): void {
    this.clientName = client.name;
  }

  /** The agent chose to call a tool. This is the load-bearing observation. */
  recordToolCall(tool: string, args: Record<string, JsonValue>): void {
    this.events.push({ type: 'tool_call', tool, args });
  }

  /** What we handed back for that call. */
  recordToolResult(tool: string, result: JsonValue): void {
    this.events.push({ type: 'tool_result', tool, result });
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
        category: SPIKE_CATEGORY,
      },
    );
  }
}
