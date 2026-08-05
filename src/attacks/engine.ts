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
  AttackVariant,
  Category,
  GroundTruth,
  JsonValue,
  Scenario,
  Step,
  Trace,
  VariantKind,
  VariantPair,
} from '@/contract';
import { CategorySchema, GroundTruthSchema, TraceSchema, VariantKindSchema } from '@/contract';

export type { AttackVariant, VariantKind, VariantPair };

/** The two GroundTruth-bearing kinds every realization is one of. */
export const VARIANT_KINDS = VariantKindSchema.options;

/** Typed error for attack-engine misuse (unknown variant, unregistered code). */
export class AttackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttackError';
  }
}

/** The addressable id of one side of a realization pair. */
export function variantIdFor(slug: string, kind: VariantKind): string {
  return `${slug}-${kind}`;
}

/**
 * Expand declared pairs into the flat, ordered realization list. Each pair emits
 * its malicious run followed by its benign sibling, so the FIRST pair supplies
 * the pinned default for both bare kinds.
 */
export function expandPairs(pairs: readonly VariantPair[]): AttackVariant[] {
  return pairs.flatMap((pair) =>
    VARIANT_KINDS.map((kind) => ({ ...pair, kind, id: variantIdFor(pair.slug, kind) })),
  );
}

/**
 * Resolve a variant reference at the untyped boundary (fail-fast).
 *
 * A bare kind resolves to the FIRST realization of that kind — the pinned
 * default, which is what keeps `build('malicious')` serving the same sample run
 * the screens and the runner already show. Anything else must match a
 * realization id exactly; a bare pair slug is rejected because it does not say
 * which side of the pair is wanted.
 */
export function parseVariant(variants: readonly AttackVariant[], variant: string): AttackVariant {
  const kind = VariantKindSchema.safeParse(variant);
  if (kind.success) {
    const first = variants.find((v) => v.kind === kind.data);
    if (!first) throw new AttackError(`No ${kind.data} realization is registered.`);
    return first;
  }
  const found = variants.find((v) => v.id === variant);
  if (!found) throw new AttackError(`Unknown attack variant: ${variant}`);
  return found;
}

/** The realizations of `attack` with the given kind, in declared order. */
export function variantsOfKind(attack: Attack, kind: VariantKind): readonly AttackVariant[] {
  return attack.variants.filter((v) => v.kind === kind);
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

  /**
   * Positional and CATEGORY-FREE.
   *
   * Ids used to be `asi06-s11`, which quietly published `groundTruth.category`
   * into every step the judge reads — and the judge is asked to CLASSIFY the
   * category. Withholding `trace.category` from the judge payload alone was not
   * enough while every step id still spelled it out. `s11` anchors a verdict just
   * as well and discloses nothing. Locked by the detector-boundary property in
   * `tests/unit/attacks/leakage.property.test.ts`.
   */
  private nextId(): string {
    this.seq += 1;
    return `s${this.seq}`;
  }

  private push(step: Step): string {
    this.steps.push(step);
    return step.id;
  }

  /**
   * The inbound instruction turn: the task goal as the PRINCIPAL stated it.
   * Exactly one per trace, first — pinned by the principal-instruction invariant
   * in `tests/unit/attacks/leakage.property.test.ts`. Untrusted third-party
   * content belongs on `toolResult` / `memoryRead`, never here
   * ([ADR-0011](../../docs/adr/0011-the-principal-instruction-is-its-own-step-type.md)).
   */
  principalInstruction(content: string): string {
    return this.push({ id: this.nextId(), type: 'principal_instruction', content });
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

/** An attack module — the contract `Attack`, narrowed to a Core-7 category. */
export interface AttackModule extends Attack {
  readonly category: Category;
}

/** What an attack author implements — typed realizations, no string parsing. */
export interface AttackDef {
  category: Category;
  /** The realization pairs this category ships; the first is the pinned default. */
  pairs: readonly VariantPair[];
  build(variant: AttackVariant): AttackBuildResult;
  scenario(variant: AttackVariant): Scenario;
}

// ── registry (attacks self-register via defineAttack; files stay disjoint) ──
const registry = new Map<Category, AttackModule>();

/** The canonical Core-7 codes in scope — the registry's expected set. */
export const ATTACK_CODES: readonly Category[] = CategorySchema.options;

/**
 * Reject a pair declaration that could not produce unambiguous ids: an empty
 * list or slug, a duplicate slug, or a slug that collides with the bare-kind
 * namespace (`malicious` / `benign`, or anything ending in one of them, which
 * would be indistinguishable from another pair's realization id).
 */
function validatePairs(category: Category, pairs: readonly VariantPair[]): void {
  if (pairs.length === 0) {
    throw new AttackError(`${category} declares no realization pairs.`);
  }
  const seen = new Set<string>();
  for (const { slug } of pairs) {
    if (slug.length === 0) throw new AttackError(`${category} declares an empty pair slug.`);
    if (seen.has(slug))
      throw new AttackError(`${category} declares a duplicate pair slug: ${slug}`);
    for (const kind of VARIANT_KINDS) {
      if (slug === kind || slug.endsWith(`-${kind}`)) {
        throw new AttackError(`${category} pair slug "${slug}" collides with the kind namespace.`);
      }
    }
    seen.add(slug);
  }
}

/**
 * Wrap a typed `AttackDef` into a contract-compatible `AttackModule` (validating
 * the declaration up front and the variant string at the boundary) and register
 * it under its category.
 */
export function defineAttack(def: AttackDef): AttackModule {
  validatePairs(def.category, def.pairs);
  const variants = expandPairs(def.pairs);
  const attack: AttackModule = {
    category: def.category,
    variants,
    build: (variant: string): AttackBuildResult => def.build(parseVariant(variants, variant)),
    scenario: (variant: string): Scenario => def.scenario(parseVariant(variants, variant)),
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
