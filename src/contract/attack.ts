import type { Category, JsonValue } from './common';
import type { Trace } from './trace';
import type { GroundTruth } from './groundTruth';

/**
 * The observable environment handed to a live agent to drive an attack scenario.
 */
export interface Environment {
  /** MCP tool names exposed to the agent for this scenario. */
  readonly tools: readonly string[];
  /** Seed memory state, if any. */
  readonly memory?: Readonly<Record<string, JsonValue>>;
  /** Optional system-prompt / role framing. */
  readonly systemPrompt?: string;
}

/** What an attack hands a live-agent runner: a task goal and its environment. */
export interface Scenario {
  readonly taskGoal: string;
  readonly environment: Environment;
}

/** What an attack constructs for detector validation: an observable trace paired
 *  with its held-out ground-truth label. */
export interface AttackBuildResult {
  readonly trace: Trace;
  readonly groundTruth: GroundTruth;
}

/**
 * An attack module. Type signatures only — implementations arrive in Phase 3.
 * `build` yields a labeled fixture (trace + held-out ground truth) for detector
 * validation; `scenario` yields the setup to drive a live, unlabeled run.
 */
export interface Attack {
  readonly category: Category;
  build(variant: string): AttackBuildResult;
  scenario(variant: string): Scenario;
}
