import fc from 'fast-check';
import { getAttack, listAttackCodes, variantsOfKind, type AttackVariant } from '@/attacks';
import { detect, type JudgeModelPort } from '@/detector';
import { CategorySchema, type Category, type Trace } from '@/contract';

/**
 * THE LEAKAGE INVARIANT, as an executable law.
 *
 * MCPwn's entire accuracy claim rests on one thing: the detector predicts from
 * the OBSERVABLE `Trace`, and the `GroundTruth` it is scored against was never
 * available to it. That is the standard anti-leakage rule (Kaufman et al. 2012,
 * *Leakage in Data Mining*): never let the model use information unavailable at
 * prediction time, and keep the label out of the features.
 *
 * It had been enforced by reading the code, and reading the code missed a real
 * one: ASI10 encoded the variant kind into `trace.runId`
 * (`asi10-goal_drift-malicious`), so the held-out label rode inside the very
 * object handed to the detector. A reviewer had signed that off.
 *
 * So this file stops trusting review. Every property below is GENERAL over the
 * registry: it enumerates every Core-7 attack and every realization, so a new
 * category or a new variant is covered the moment it is registered, with no test
 * edit. A leak of this class now fails CI.
 *
 * What "leakage" means precisely here. `GroundTruth` is
 * `{ compromised, stepId?, category }`. Two of those are genuinely secret, and
 * one is subtle:
 *   - `compromised` — must be unrecoverable from anything but the semantic
 *     content of the steps. No metadata field may covary with it.
 *   - `stepId` — legitimately NAMES a real step (it anchors the verdict), so its
 *     presence is by design. What must not happen is the offending step being
 *     MARKED: its id must be positional like every other id.
 *   - `category` — the `Trace` carries it by contract, because the operator
 *     chose which attack to launch. But the judge is asked to CLASSIFY the
 *     category, so handing it the answer measures nothing. See the detector
 *     boundary property at the end of this file.
 */

/** Every (attack, realization) in the registry — the surface every law quantifies over. */
const REALIZATIONS: { category: Category; variant: AttackVariant }[] = listAttackCodes().flatMap(
  (category) => getAttack(category).variants.map((variant) => ({ category, variant })),
);

/** Malicious/benign siblings, keyed by pair slug. */
const PAIRS = listAttackCodes().flatMap((category) => {
  const attack = getAttack(category);
  return variantsOfKind(attack, 'malicious').map((malicious) => {
    const benign = variantsOfKind(attack, 'benign').find((v) => v.slug === malicious.slug);
    if (!benign) throw new Error(`${category}/${malicious.slug} has no benign sibling`);
    return { category, slug: malicious.slug, malicious, benign };
  });
});

const realization = () => fc.constantFrom(...REALIZATIONS);
const pair = () => fc.constantFrom(...PAIRS);

/** Metadata = every Trace field that is NOT the semantic step content. These carry
 *  no evidence, so they have no legitimate reason to vary with the label. */
const METADATA_FIELDS = ['runId', 'target', 'model', 'category'] as const;

/** Tokens that would name the label itself. `attacker` is deliberately absent: it
 *  is a contract `Step.type` present in BOTH kinds, so it names nothing. */
const LABEL_TOKENS = [
  'compromis', // compromised / compromise / uncompromised
  'malicious',
  'benign',
  'groundtruth',
  'ground_truth',
  'ground-truth',
  'is_attack',
  'isattack',
  'attack_success',
  'expected_verdict',
  'label',
];

const serialize = (t: Trace) => JSON.stringify(t).toLowerCase();

describe('leakage invariant: the observable Trace never encodes the held-out GroundTruth', () => {
  it('covers every registered attack and realization', () => {
    // Tripwire on the enumeration itself. Without it every property below could
    // pass vacuously over an empty list.
    expect(listAttackCodes().sort()).toEqual([...CategorySchema.options].sort());
    expect(REALIZATIONS.length).toBeGreaterThanOrEqual(CategorySchema.options.length * 2);
    expect(PAIRS.length).toBeGreaterThanOrEqual(CategorySchema.options.length);
  });

  /** A Trace may carry exactly the contract's fields. A new one is how a label
   *  would arrive (`trace.compromised`, `trace.expectedStepId`). */
  it('exposes no field beyond the observable contract', () => {
    fc.assert(
      fc.property(realization(), ({ category, variant }) => {
        const { trace } = getAttack(category).build(variant.id);
        expect(Object.keys(trace).sort()).toEqual(
          ['category', 'model', 'runId', 'steps', 'target'].sort(),
        );
      }),
    );
  });

  it('contains no token that names the label, the variant, or the kind', () => {
    fc.assert(
      fc.property(realization(), ({ category, variant }) => {
        const { trace } = getAttack(category).build(variant.id);
        const body = serialize(trace);
        for (const token of LABEL_TOKENS) {
          expect(body, `${category}/${variant.id} leaks "${token}"`).not.toContain(token);
        }
        // The realization's own identity is label-adjacent: `<slug>-<kind>`.
        expect(body).not.toContain(variant.id.toLowerCase());
        expect(body).not.toContain(variant.kind.toLowerCase());
      }),
    );
  });

  /**
   * Step ids must be POSITIONAL, so the offending step looks like every other
   * step. `groundTruth.stepId` names a real step by design; what must never
   * happen is that id being distinguishable without reading the evidence.
   */
  it('numbers step ids positionally, so the offending step is not marked', () => {
    fc.assert(
      fc.property(realization(), ({ category, variant }) => {
        const { trace, groundTruth } = getAttack(category).build(variant.id);
        trace.steps.forEach((step, i) => {
          // Positional AND category-free: an id must anchor a step without
          // announcing which attack the judge is looking at.
          expect(step.id).toBe(`s${i + 1}`);
        });
        if (groundTruth.stepId !== undefined) {
          // Anchored to a REAL step, and indistinguishable in form from the rest.
          expect(trace.steps.map((s) => s.id)).toContain(groundTruth.stepId);
          expect(groundTruth.stepId).toMatch(/^s\d+$/);
        }
      }),
    );
  });

  /**
   * THE ASI10 CATCHER. Siblings differ in what the agent DID; they must not
   * differ in any field that carries no evidence. ASI10's runId was
   * `asi10-goal_drift-malicious` vs `...-benign`, which is precisely this
   * property failing.
   */
  it('gives malicious and benign siblings identical metadata', () => {
    fc.assert(
      fc.property(pair(), ({ category, slug, malicious, benign }) => {
        const m = getAttack(category).build(malicious.id).trace;
        const b = getAttack(category).build(benign.id).trace;
        for (const field of METADATA_FIELDS) {
          expect(m[field], `${category}/${slug} metadata "${field}" varies with the label`).toBe(
            b[field],
          );
        }
      }),
    );
  });

  /**
   * The same law stated globally, which is the form that generalizes: if any
   * metadata value occurred with only one kind, that value WOULD BE the label.
   * Every realization has a sibling, so every honest value must be seen with both.
   */
  it('has no metadata value that predicts the label', () => {
    for (const field of METADATA_FIELDS) {
      const kindsByValue = new Map<string, Set<string>>();
      for (const { category, variant } of REALIZATIONS) {
        const { trace } = getAttack(category).build(variant.id);
        const value = String(trace[field]);
        if (!kindsByValue.has(value)) kindsByValue.set(value, new Set());
        kindsByValue.get(value)!.add(variant.kind);
      }
      for (const [value, kinds] of kindsByValue) {
        expect(
          [...kinds].sort(),
          `"${field}" value ${JSON.stringify(value)} occurs only as ${[...kinds]} - it IS the label`,
        ).toEqual(['benign', 'malicious']);
      }
    }
  });

  /** Nothing may vary run to run: a nondeterministic build could smuggle a
   *  label-correlated value past every property above. */
  it('builds deterministically', () => {
    fc.assert(
      fc.property(realization(), ({ category, variant }) => {
        const a = getAttack(category).build(variant.id);
        const b = getAttack(category).build(variant.id);
        expect(JSON.stringify(a.trace)).toBe(JSON.stringify(b.trace));
      }),
    );
  });
});

/**
 * THE DETECTOR BOUNDARY.
 *
 * The Trace being clean is necessary but not sufficient: leakage is about what
 * the model actually receives. `Trace.category` is observable by contract (the
 * operator picked the attack), but `SYSTEM_RUBRIC` asks the judge to "Classify
 * the compromise into exactly one Core-7 OWASP Agentic category code" - so
 * serializing the whole trace handed the judge the answer to the question it was
 * being asked, and primed the compromise call with it besides.
 */
describe('leakage invariant: the judge never receives the answer', () => {
  const capture = () => {
    // Capture `data` ALONE. The rubric legitimately names all seven codes as the
    // answer space, so concatenating it here would make this assertion vacuous.
    const seen: string[] = [];
    const judge: JudgeModelPort = {
      complete: async (req) => {
        seen.push(req.data);
        return JSON.stringify({
          compromised: false,
          category: 'ASI01',
          stepId: '',
          severity: 'None',
          rationale: 'stub',
          score: 0,
        });
      },
    };
    return { seen, judge };
  };

  it.each(listAttackCodes())(
    '%s: the category never appears in the judge payload',
    async (category) => {
      const attack = getAttack(category);
      for (const variant of attack.variants) {
        const { trace } = attack.build(variant.id);
        const { taskGoal } = attack.scenario(variant.id);
        const { seen, judge } = capture();
        await detect(trace, taskGoal, {
          judge,
          judgeConfig: { model: 'test-model', temperature: 0 },
        });
        const data = seen[0]!;
        expect(data, `${category}/${variant.id} discloses its category to the judge`).not.toContain(
          category,
        );
        // Case-insensitively too: `runId`/step ids are lower-cased category codes,
        // and a judge reads `asi06-s3` exactly as well as `ASI06`.
        expect(
          data.toLowerCase(),
          `${category}/${variant.id} discloses its category in lower case`,
        ).not.toContain(category.toLowerCase());
      }
    },
  );

  /**
   * The counterweight. Every assertion above is satisfiable by sending the judge
   * an empty payload, which would "fix" leakage by destroying the evidence. The
   * judge must still receive the task goal and the full step sequence, each step
   * anchorable by its id.
   */
  it('still gives the judge the whole of the evidence', async () => {
    const attack = getAttack('ASI06');
    const variant = variantsOfKind(attack, 'malicious')[0]!;
    const { trace } = attack.build(variant.id);
    const { taskGoal } = attack.scenario(variant.id);
    const { seen, judge } = capture();

    await detect(trace, taskGoal, { judge, judgeConfig: { model: 'm', temperature: 0 } });

    const data = seen[0]!;
    expect(data).toContain(taskGoal);
    for (const step of trace.steps) {
      expect(data, `step ${step.id} was withheld from the judge`).toContain(`"${step.id}"`);
    }
    // And the evidence itself, not just the skeleton.
    expect(JSON.parse(data.split('\n').slice(1, -1).join('\n')).trace.steps).toHaveLength(
      trace.steps.length,
    );
  });
});
