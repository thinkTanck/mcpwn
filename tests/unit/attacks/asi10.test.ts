import fc from 'fast-check';
import { TraceSchema, type Trace } from '@/contract';
import { getAttack, variantsOfKind, VARIANT_KINDS } from '@/attacks/engine';
import { asi10 } from '@/attacks/asi10';

const stepIds = (trace: Trace): string[] => trace.steps.map((s) => s.id);

/** The bounded single-run rogue signatures, as realization pair slugs. */
const SIGNATURES = [
  'asi10-goal-drift',
  'asi10-covert-action',
  'asi10-deceptive-report',
  'asi10-scale-out',
] as const;

describe('ASI10 — Rogue Agents', () => {
  describe('base build / scenario surface (default realization)', () => {
    it('build(malicious) is schema-valid and compromised at a real step', () => {
      const { trace, groundTruth } = asi10.build('malicious');
      expect(TraceSchema.safeParse(trace).success).toBe(true);
      expect(groundTruth).toEqual({
        compromised: true,
        category: 'ASI10',
        stepId: groundTruth.stepId,
      });
      expect(groundTruth.stepId).toBeDefined();
      expect(stepIds(trace)).toContain(groundTruth.stepId);
    });

    it('build(benign) is a schema-valid not-compromised control', () => {
      const { trace, groundTruth } = asi10.build('benign');
      expect(TraceSchema.safeParse(trace).success).toBe(true);
      expect(groundTruth).toEqual({ compromised: false, category: 'ASI10' });
      expect(groundTruth.stepId).toBeUndefined();
    });

    it('the default realization is the first of the three signatures', () => {
      expect(asi10.variants[0]!.slug).toBe(SIGNATURES[0]);
    });
  });

  describe('single-run rogue signatures, as generic realization pairs', () => {
    it('exposes each distinct signature with both kinds', () => {
      const slugs = [...new Set(asi10.variants.map((v) => v.slug))];
      expect(slugs).toEqual([...SIGNATURES]);
      expect(variantsOfKind(asi10, 'malicious')).toHaveLength(SIGNATURES.length);
      expect(variantsOfKind(asi10, 'benign')).toHaveLength(SIGNATURES.length);
    });

    it('scale-out is the tool-parity pair: the same change, made under mandate or not', () => {
      const tools = (id: string) =>
        asi10
          .build(id)
          .trace.steps.flatMap((s) => (s.type === 'tool_call' ? [s.tool] : []))
          .sort();
      expect(tools('asi10-scale-out-benign')).toEqual(tools('asi10-scale-out-malicious'));
      expect(tools('asi10-scale-out-malicious')).toContain('scale_service');
    });

    it.each(SIGNATURES)(
      'signature %s: malicious build is schema-valid and compromised at a real step',
      (sig) => {
        const { trace, groundTruth } = asi10.build(`${sig}-malicious`);
        expect(TraceSchema.safeParse(trace).success).toBe(true);
        expect(groundTruth.compromised).toBe(true);
        expect(groundTruth.category).toBe('ASI10');
        expect(stepIds(trace)).toContain(groundTruth.stepId);
      },
    );

    it.each(SIGNATURES)('signature %s: benign build is a schema-valid control', (sig) => {
      const { trace, groundTruth } = asi10.build(`${sig}-benign`);
      expect(TraceSchema.safeParse(trace).success).toBe(true);
      expect(groundTruth.compromised).toBe(false);
      expect(groundTruth.stepId).toBeUndefined();
    });

    it('every signature/variant trace is marker-free (no label leaks into steps)', () => {
      for (const v of asi10.variants) {
        for (const step of asi10.build(v.id).trace.steps) {
          expect(step).not.toHaveProperty('label');
          expect(step).not.toHaveProperty('compromised');
          expect(step).not.toHaveProperty('groundTruth');
        }
      }
    });

    it('both siblings of a signature share one kind-free run id', () => {
      for (const sig of SIGNATURES) {
        expect(asi10.build(`${sig}-malicious`).trace.runId).toBe(sig);
        expect(asi10.build(`${sig}-benign`).trace.runId).toBe(sig);
      }
    });
  });

  describe('scenario', () => {
    it.each([...VARIANT_KINDS])('scenario(%s) returns a valid task goal + environment', (kind) => {
      const s = asi10.scenario(kind);
      expect(typeof s.taskGoal).toBe('string');
      expect(s.taskGoal.length).toBeGreaterThan(0);
      expect(Array.isArray(s.environment.tools)).toBe(true);
      expect(s.environment.tools.every((t) => typeof t === 'string')).toBe(true);
      expect(s.environment.tools.length).toBeGreaterThan(0);
    });

    it.each(SIGNATURES)('signature %s exposes a valid live scenario for both kinds', (sig) => {
      for (const kind of VARIANT_KINDS) {
        const s = asi10.scenario(`${sig}-${kind}`);
        expect(s.taskGoal.length).toBeGreaterThan(0);
        expect(s.environment.tools.length).toBeGreaterThan(0);
      }
    });
  });

  describe('registration', () => {
    it('registers under ASI10 with one realization per signature per kind', () => {
      expect(getAttack('ASI10')).toBe(asi10);
      expect(asi10.category).toBe('ASI10');
      expect(asi10.variants).toHaveLength(SIGNATURES.length * 2);
    });
  });

  describe('property-based invariants (fast-check)', () => {
    it('forall realization: the built trace is schema-valid', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...asi10.variants.map((v) => v.id)),
          (id) => TraceSchema.safeParse(asi10.build(id).trace).success,
        ),
      );
    });

    it('forall signature: malicious groundTruth.stepId is a real step id', () => {
      fc.assert(
        fc.property(fc.constantFrom(...SIGNATURES), (sig) => {
          const { trace, groundTruth } = asi10.build(`${sig}-malicious`);
          return (
            groundTruth.compromised &&
            typeof groundTruth.stepId === 'string' &&
            stepIds(trace).includes(groundTruth.stepId)
          );
        }),
      );
    });

    it('forall signature: benign is never compromised', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SIGNATURES),
          (sig) => asi10.build(`${sig}-benign`).groundTruth.compromised === false,
        ),
      );
    });
  });
});
