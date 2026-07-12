import fc from 'fast-check';
import { TraceSchema, type Category } from '@/contract';
import { getAttack } from '@/attacks/engine';
import { asi04 } from '@/attacks/asi04';

const CATEGORY: Category = 'ASI04';
const VARIANTS = ['malicious', 'benign'] as const;

describe('ASI04 — Agentic Supply Chain Vulnerabilities', () => {
  it('build(malicious): schema-valid trace; ground truth compromised and anchored to a real install step', () => {
    const { trace, groundTruth } = asi04.build('malicious');

    expect(TraceSchema.safeParse(trace).success).toBe(true);

    const ids = trace.steps.map((s) => s.id);
    // Exact shape (no extra keys) + the anchor is a REAL step id in the trace.
    expect(groundTruth).toEqual({
      compromised: true,
      category: CATEGORY,
      stepId: groundTruth.stepId,
    });
    expect(ids).toContain(groundTruth.stepId);

    // The offending step is the tool_call that installs the untrusted dependency.
    const offending = trace.steps.find((s) => s.id === groundTruth.stepId);
    expect(offending?.type).toBe('tool_call');
  });

  it('build(benign): not-compromised control; schema-valid trace', () => {
    const { trace, groundTruth } = asi04.build('benign');

    expect(TraceSchema.safeParse(trace).success).toBe(true);
    expect(groundTruth.compromised).toBe(false);
    expect(groundTruth).toEqual({ compromised: false, category: CATEGORY });
  });

  it('trace is marker-free (no held-out label rides along a step)', () => {
    for (const v of VARIANTS) {
      for (const step of asi04.build(v).trace.steps) {
        expect(step).not.toHaveProperty('label');
        expect(step).not.toHaveProperty('compromiseFlag');
        expect(step).not.toHaveProperty('groundTruth');
      }
    }
  });

  it.each(VARIANTS)('scenario(%s): valid task goal + tool environment', (v) => {
    const s = asi04.scenario(v);
    expect(typeof s.taskGoal).toBe('string');
    expect(s.taskGoal.length).toBeGreaterThan(0);
    expect(Array.isArray(s.environment.tools)).toBe(true);
    expect(s.environment.tools.length).toBeGreaterThan(0);
    expect(s.environment.tools.every((t) => typeof t === 'string')).toBe(true);
  });

  it('registers under ASI04 in the attack registry', () => {
    expect(getAttack('ASI04')).toBe(asi04);
    expect(asi04.category).toBe(CATEGORY);
  });

  it('property: every variant builds a schema-valid trace with a consistent ground-truth anchor', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VARIANTS), (v) => {
        const { trace, groundTruth } = asi04.build(v);
        expect(TraceSchema.safeParse(trace).success).toBe(true);

        const ids = trace.steps.map((s) => s.id);
        if (v === 'malicious') {
          expect(groundTruth.compromised).toBe(true);
          expect(groundTruth.stepId).toBeDefined();
          expect(ids).toContain(groundTruth.stepId);
        } else {
          expect(groundTruth.compromised).toBe(false);
        }
      }),
    );
  });
});
