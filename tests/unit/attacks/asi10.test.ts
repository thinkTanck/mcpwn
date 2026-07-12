import fc from 'fast-check';
import { TraceSchema, type Trace } from '@/contract';
import { getAttack, ATTACK_VARIANTS } from '@/attacks/engine';
import {
  asi10,
  SIGNATURES,
  DEFAULT_SIGNATURE,
  buildSignature,
  signatureScenario,
  type Asi10Signature,
} from '@/attacks/asi10';

const stepIds = (trace: Trace): string[] => trace.steps.map((s) => s.id);

describe('ASI10 — Rogue Agents', () => {
  describe('base build / scenario surface (default signature)', () => {
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

    it('the default signature is one of the three signatures', () => {
      expect(SIGNATURES).toContain(DEFAULT_SIGNATURE);
    });
  });

  describe('three single-run rogue signatures', () => {
    it('exposes exactly three distinct signatures', () => {
      expect(SIGNATURES).toHaveLength(3);
      expect(new Set(SIGNATURES).size).toBe(3);
      expect([...SIGNATURES]).toEqual(
        expect.arrayContaining(['goal_drift', 'covert_action', 'deceptive_report']),
      );
    });

    it.each(SIGNATURES)(
      'signature %s: malicious build is schema-valid and compromised at a real step',
      (sig) => {
        const { trace, groundTruth } = buildSignature(sig, 'malicious');
        expect(TraceSchema.safeParse(trace).success).toBe(true);
        expect(groundTruth.compromised).toBe(true);
        expect(groundTruth.category).toBe('ASI10');
        expect(stepIds(trace)).toContain(groundTruth.stepId);
      },
    );

    it.each(SIGNATURES)('signature %s: benign build is a schema-valid control', (sig) => {
      const { trace, groundTruth } = buildSignature(sig, 'benign');
      expect(TraceSchema.safeParse(trace).success).toBe(true);
      expect(groundTruth.compromised).toBe(false);
      expect(groundTruth.stepId).toBeUndefined();
    });

    it('every signature/variant trace is marker-free (no label leaks into steps)', () => {
      for (const sig of SIGNATURES) {
        for (const variant of ATTACK_VARIANTS) {
          for (const step of buildSignature(sig, variant).trace.steps) {
            expect(step).not.toHaveProperty('label');
            expect(step).not.toHaveProperty('compromised');
            expect(step).not.toHaveProperty('groundTruth');
          }
        }
      }
    });
  });

  describe('scenario', () => {
    it.each(ATTACK_VARIANTS)('scenario(%s) returns a valid task goal + environment', (variant) => {
      const s = asi10.scenario(variant);
      expect(typeof s.taskGoal).toBe('string');
      expect(s.taskGoal.length).toBeGreaterThan(0);
      expect(Array.isArray(s.environment.tools)).toBe(true);
      expect(s.environment.tools.every((t) => typeof t === 'string')).toBe(true);
      expect(s.environment.tools.length).toBeGreaterThan(0);
    });

    it.each(SIGNATURES)('signatureScenario(%s) exposes a valid live scenario', (sig) => {
      const s = signatureScenario(sig);
      expect(typeof s.taskGoal).toBe('string');
      expect(s.taskGoal.length).toBeGreaterThan(0);
      expect(s.environment.tools.length).toBeGreaterThan(0);
    });
  });

  describe('registration', () => {
    it('registers under ASI10 with the standard variants', () => {
      expect(getAttack('ASI10')).toBe(asi10);
      expect(asi10.category).toBe('ASI10');
      expect(asi10.variants).toEqual(ATTACK_VARIANTS);
    });
  });

  describe('property-based invariants (fast-check)', () => {
    it('forall variant: the built trace is schema-valid', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...ATTACK_VARIANTS),
          (variant) => TraceSchema.safeParse(asi10.build(variant).trace).success,
        ),
      );
    });

    it('forall signature: malicious groundTruth.stepId is a real step id', () => {
      fc.assert(
        fc.property(fc.constantFrom(...SIGNATURES), (sig: Asi10Signature) => {
          const { trace, groundTruth } = buildSignature(sig, 'malicious');
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
          (sig: Asi10Signature) => buildSignature(sig, 'benign').groundTruth.compromised === false,
        ),
      );
    });
  });
});
