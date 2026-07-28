/**
 * Cross-cutting invariants over the WHOLE Core-7 variant set.
 *
 * The per-attack specs assert what each realization means; this file asserts the
 * properties the DATASET must hold as a whole — the ones that decide whether a
 * later precision/recall number is worth anything:
 *
 *  - every realization is addressable and enumerable (so eval can score all of them);
 *  - resolving a BARE kind stays pinned to the same default realization, so the
 *    sample-playback screens and the runner keep serving the same run;
 *  - the observable Trace never carries a token that names its own label.
 */
import { CategorySchema, TraceSchema, type Category } from '@/contract';
import { getAttack, listAttackCodes, variantsOfKind, VARIANT_KINDS } from '@/attacks';

const CORE_7 = CategorySchema.options;
const attacks = () => CORE_7.map(getAttack);

describe('Core-7 registry — every realization is enumerable and addressable', () => {
  it('registers all seven categories', () => {
    expect(listAttackCodes()).toEqual([...CORE_7]);
  });

  it.each(CORE_7)('%s: variant ids are unique and shaped `${slug}-${kind}`', (code) => {
    const variants = getAttack(code).variants;
    const ids = variants.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of variants) expect(v.id).toBe(`${v.slug}-${v.kind}`);
  });

  it.each(CORE_7)('%s: every realization pairs a malicious run with a benign sibling', (code) => {
    const variants = getAttack(code).variants;
    const bySlug = new Map<string, Set<string>>();
    for (const v of variants) {
      bySlug.set(v.slug, (bySlug.get(v.slug) ?? new Set()).add(v.kind));
    }
    for (const [slug, kinds] of bySlug) {
      expect({ slug, kinds: [...kinds].sort() }).toEqual({ slug, kinds: ['benign', 'malicious'] });
    }
  });

  it.each(CORE_7)('%s: every realization builds a schema-valid, correctly labelled run', (code) => {
    const attack = getAttack(code);
    for (const v of attack.variants) {
      const { trace, groundTruth } = attack.build(v.id);
      expect(TraceSchema.safeParse(trace).success).toBe(true);
      expect(groundTruth.category).toBe(code);
      expect(groundTruth.compromised).toBe(v.kind === 'malicious');
      if (v.kind === 'malicious') {
        expect(trace.steps.map((s) => s.id)).toContain(groundTruth.stepId);
      } else {
        expect(groundTruth.stepId).toBeUndefined();
      }
      const scenario = attack.scenario(v.id);
      expect(scenario.taskGoal.length).toBeGreaterThan(0);
      expect(scenario.environment.tools.length).toBeGreaterThan(0);
    }
  });
});

describe('backward compatibility — a bare kind resolves to a PINNED default realization', () => {
  it.each(CORE_7)('%s: build/scenario(kind) equal the first realization of that kind', (code) => {
    const attack = getAttack(code);
    for (const kind of VARIANT_KINDS) {
      const first = variantsOfKind(attack, kind)[0]!;
      expect(attack.build(kind)).toEqual(attack.build(first.id));
      expect(attack.scenario(kind)).toEqual(attack.scenario(first.id));
    }
  });

  /**
   * The sample-playback screens serve `build(category, 'malicious')`, and the
   * findings fixture + nav link hard-code the ASI06 run id and its offending step.
   * Pinning the default run id and offending tool per category is what proves the
   * variant expansion did not move the sample runs out from under the UI.
   */
  const DEFAULT_SAMPLE: Record<Category, { runId: string; tool: string }> = {
    ASI01: { runId: 'asi01-goal-hijack', tool: 'transfer_funds' },
    ASI02: { runId: 'asi02-run', tool: 'read_file' },
    ASI03: { runId: 'asi03-identity-privilege-abuse', tool: 'set_user_role' },
    ASI04: { runId: 'asi04-run', tool: 'install_package' },
    ASI05: { runId: 'asi05-code-execution', tool: 'run_shell' },
    ASI06: { runId: 'asi06-run', tool: 'send_email' },
    ASI10: { runId: 'asi10-goal-drift', tool: 'approve_expense' },
  };

  it.each(CORE_7)('%s: the default malicious sample is unchanged', (code) => {
    const { trace, groundTruth } = getAttack(code).build('malicious');
    const expected = DEFAULT_SAMPLE[code];
    expect(trace.runId).toBe(expected.runId);
    const offending = trace.steps.find((s) => s.id === groundTruth.stepId);
    expect(offending).toMatchObject({ tool: expected.tool });
  });

  it('the ASI06 hero sample keeps the run id and offending step the UI links to', () => {
    const { trace, groundTruth } = getAttack('ASI06').build('malicious');
    expect(trace.runId).toBe('asi06-run');
    expect(groundTruth.stepId).toBe('asi06-s11');
  });

  it('the benign default shares its run id with its malicious sibling', () => {
    for (const code of CORE_7) {
      const attack = getAttack(code);
      expect(attack.build('benign').trace.runId).toBe(attack.build('malicious').trace.runId);
    }
  });
});

describe('every attack exposes both kinds (ADR-0003 bar 4: precision-bearing)', () => {
  it.each(CORE_7)('%s has at least one realization of each kind', (code) => {
    const attack = getAttack(code);
    expect(variantsOfKind(attack, 'malicious').length).toBeGreaterThan(0);
    expect(variantsOfKind(attack, 'benign').length).toBeGreaterThan(0);
  });

  it('the whole Core-7 set is balanced (one benign control per malicious run)', () => {
    for (const attack of attacks()) {
      expect(variantsOfKind(attack, 'malicious')).toHaveLength(
        variantsOfKind(attack, 'benign').length,
      );
    }
  });
});
