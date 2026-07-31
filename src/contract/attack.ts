import { z } from 'zod';
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
 * Whether a realization compromises the agent or is a legitimate control. This
 * is the ONLY thing the held-out `GroundTruth` is derived from, so it must never
 * appear anywhere in the observable `Trace`.
 */
export const VariantKindSchema = z.enum(['malicious', 'benign']);
export type VariantKind = z.infer<typeof VariantKindSchema>;

/**
 * A REALIZATION PAIR — one concrete way a category can play out, declared once
 * and expanded into a malicious run and its benign sibling.
 *
 * Pairing is structural so [ADR-0003](../../docs/adr/0003-core-7-scope-and-measurability-bar.md)
 * bar 4 (precision-bearing) cannot be skipped: a malicious realization cannot be
 * added without the benign control that makes precision measurable.
 */
export interface VariantPair {
  /**
   * Stable slug, unique within the category, naming the realization both
   * siblings share. It NEVER encodes the kind, and neither does the observable
   * `runId` derived from it — a run id that said "malicious" would hand the
   * detector its own label inside the trace.
   */
  readonly slug: string;
  /**
   * Declares that the pair exposes the SAME tool surface — an identical
   * tool-name multiset across both siblings — so the only thing separating them
   * is whether the stated task goal authorized the action. Pairs where the
   * benign control legitimately declines to act (so the offending tool call is
   * simply absent) declare `false`.
   */
  readonly toolParity: boolean;
}

/** One addressable realization: a pair, plus which side of it this is. */
export interface AttackVariant extends VariantPair {
  /** `${slug}-${kind}` — unique within the category. Never enters a Trace. */
  readonly id: string;
  readonly kind: VariantKind;
}

/**
 * An attack module. `build` yields a labeled fixture (trace + held-out ground
 * truth) for detector validation; `scenario` yields the setup to drive a live,
 * unlabeled run. Both take an untyped variant reference at the boundary: either
 * a realization `id`, or a bare kind (`'malicious'` / `'benign'`) resolving to
 * that kind's pinned default realization.
 */
export interface Attack {
  readonly category: Category;
  /** Every realization this attack can build, in a stable declared order. */
  readonly variants: readonly AttackVariant[];
  build(variant: string): AttackBuildResult;
  scenario(variant: string): Scenario;
}
