import fc from 'fast-check';
import { TraceSchema } from '@/contract';
import { getAttack, VARIANT_KINDS } from '@/attacks/engine';
import { asi02 } from '@/attacks/asi02';

describe('ASI02 — Tool Misuse and Exploitation', () => {
  it('build(malicious): schema-valid trace; ground truth anchored to a real offending step', () => {
    const { trace, groundTruth } = asi02.build('malicious');

    expect(TraceSchema.safeParse(trace).success).toBe(true);

    const stepIds = trace.steps.map((s) => s.id);
    expect(groundTruth).toEqual({
      compromised: true,
      category: 'ASI02',
      stepId: groundTruth.stepId,
    });
    expect(groundTruth.stepId).toBeDefined();
    expect(stepIds).toContain(groundTruth.stepId);

    // Behavior, not a marker: the offending step is the unsafe tool_call itself.
    const offending = trace.steps.find((s) => s.id === groundTruth.stepId);
    expect(offending?.type).toBe('tool_call');
  });

  it('build(benign): a not-compromised control that is still schema-valid', () => {
    const { trace, groundTruth } = asi02.build('benign');

    expect(groundTruth.compromised).toBe(false);
    expect(groundTruth).toEqual({ compromised: false, category: 'ASI02' });
    expect(TraceSchema.safeParse(trace).success).toBe(true);
  });

  it('traces are marker-free (no label/compromise leaks on any step)', () => {
    for (const variant of VARIANT_KINDS) {
      for (const step of asi02.build(variant).trace.steps) {
        expect(step).not.toHaveProperty('label');
        expect(step).not.toHaveProperty('compromised');
        expect(step).not.toHaveProperty('groundTruth');
      }
    }
  });

  it.each([...VARIANT_KINDS])('scenario(%s): valid task goal + tool environment', (variant) => {
    const s = asi02.scenario(variant);
    expect(typeof s.taskGoal).toBe('string');
    expect(s.taskGoal.length).toBeGreaterThan(0);
    expect(Array.isArray(s.environment.tools)).toBe(true);
    expect(s.environment.tools.every((t) => typeof t === 'string')).toBe(true);
    expect(s.environment.tools.length).toBeGreaterThan(0);
  });

  it('registers itself under ASI02', () => {
    expect(getAttack('ASI02')).toBe(asi02);
  });

  it('property: every variant builds a schema-valid trace; labels stay consistent', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VARIANT_KINDS), (variant) => {
        const { trace, groundTruth } = asi02.build(variant);
        expect(TraceSchema.safeParse(trace).success).toBe(true);

        const stepIds = trace.steps.map((s) => s.id);
        if (variant === 'malicious') {
          expect(groundTruth.compromised).toBe(true);
          expect(stepIds).toContain(groundTruth.stepId);
        } else {
          expect(groundTruth.compromised).toBe(false);
          expect(groundTruth.stepId).toBeUndefined();
        }
      }),
    );
  });
});
