/**
 * Module 2 — ATTACK ENGINE (shared base).
 *
 * Each attack builds a REALISTIC, marker-free OBSERVABLE `Trace` paired with its
 * held-out `GroundTruth` (the known label, fixed AT CONSTRUCTION). The observable
 * trace is what the detector (module 4) and the UI consume; the ground truth is
 * NEVER placed in the trace and never given to the detector — it exists only to
 * MEASURE the detector (leakage separation). `TraceBuilder.build()` validates via
 * `TraceSchema`, so an observable trace can never carry a label/compromiseFlag.
 */
import type {
  Attack,
  AttackBuildResult,
  Category,
  GroundTruth,
  JsonValue,
  Scenario,
  Step,
  Trace,
} from '@/contract';
import { CategorySchema, GroundTruthSchema, TraceSchema } from '@/contract';

/** Which run to construct: a compromising attack or a benign control. */
export type AttackVariant = 'malicious' | 'benign';
export const ATTACK_VARIANTS = ['malicious', 'benign'] as const satisfies readonly AttackVariant[];

/** Typed error for attack-engine misuse (unknown variant, unregistered code). */
export class AttackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttackError';
  }
}

/** Narrow an arbitrary variant string to a known AttackVariant (fail-fast). */
export function parseVariant(variant: string): AttackVariant {
  if (variant === 'malicious' || variant === 'benign') return variant;
  throw new AttackError(`Unknown attack variant: ${variant}`);
}

export interface TraceMeta {
  runId: string;
  target: string;
  model: string;
  category: Category;
}

/**
 * Accumulates MARKER-FREE observable steps and assembles a schema-valid `Trace`.
 * Every `add` returns the generated step id, so an attack can anchor its held-out
 * `GroundTruth` to a REAL step. `build()` validates via `TraceSchema` (strict).
 */
export class TraceBuilder {
  private readonly steps: Step[] = [];
  private seq = 0;

  constructor(private readonly meta: TraceMeta) {}

  private nextId(): string {
    this.seq += 1;
    return `${this.meta.category.toLowerCase()}-s${this.seq}`;
  }

  private push(step: Step): string {
    this.steps.push(step);
    return step.id;
  }

  attacker(content: string): string {
    return this.push({ id: this.nextId(), type: 'attacker', content });
  }

  agentReasoning(content: string): string {
    return this.push({ id: this.nextId(), type: 'agent_reasoning', content });
  }

  toolCall(tool: string, args: Record<string, JsonValue>): string {
    return this.push({ id: this.nextId(), type: 'tool_call', tool, args });
  }

  toolResult(tool: string, result: JsonValue): string {
    return this.push({ id: this.nextId(), type: 'tool_result', tool, result });
  }

  memoryRead(key: string, value: JsonValue): string {
    return this.push({ id: this.nextId(), type: 'memory_read', key, value });
  }

  memoryWrite(key: string, value: JsonValue): string {
    return this.push({ id: this.nextId(), type: 'memory_write', key, value });
  }

  taskComplete(summary?: string): string {
    const id = this.nextId();
    return this.push(
      summary === undefined
        ? { id, type: 'task_complete' }
        : { id, type: 'task_complete', summary },
    );
  }

  /** Ids of the steps added so far, in order. */
  stepIds(): string[] {
    return this.steps.map((s) => s.id);
  }

  /** Validate + freeze into an observable `Trace` (throws if not schema-valid). */
  build(): Trace {
    return TraceSchema.parse({ ...this.meta, steps: this.steps });
  }
}

/** Held-out label: compromised, anchored at a specific (real) step. */
export function compromisedAt(category: Category, stepId: string): GroundTruth {
  return GroundTruthSchema.parse({ compromised: true, stepId, category });
}

/** Held-out label: a benign control — not compromised. */
export function notCompromised(category: Category): GroundTruth {
  return GroundTruthSchema.parse({ compromised: false, category });
}

/** An attack module — the contract `Attack` plus its known variant list. */
export interface AttackModule extends Attack {
  readonly category: Category;
  readonly variants: readonly AttackVariant[];
}

/** What an attack author implements — typed variants, no string parsing. */
export interface AttackDef {
  category: Category;
  build(variant: AttackVariant): AttackBuildResult;
  scenario(variant: AttackVariant): Scenario;
}

// ── registry (attacks self-register via defineAttack; files stay disjoint) ──
const registry = new Map<Category, AttackModule>();

/** The canonical Core-5 codes in scope — the registry's expected set. */
export const ATTACK_CODES: readonly Category[] = CategorySchema.options;

/**
 * Wrap a typed `AttackDef` into a contract-compatible `AttackModule` (validating
 * the variant string at the boundary) and register it under its category.
 */
export function defineAttack(def: AttackDef): AttackModule {
  const attack: AttackModule = {
    category: def.category,
    variants: ATTACK_VARIANTS,
    build: (variant: string): AttackBuildResult => def.build(parseVariant(variant)),
    scenario: (variant: string): Scenario => def.scenario(parseVariant(variant)),
  };
  registry.set(def.category, attack);
  return attack;
}

/** Resolve a registered attack by category (throws if none is registered). */
export function getAttack(category: Category): AttackModule {
  const attack = registry.get(category);
  if (!attack) throw new AttackError(`No attack registered for category: ${category}`);
  return attack;
}

/** Categories with a registered attack, sorted. */
export function listAttackCodes(): Category[] {
  return [...registry.keys()].sort();
}
