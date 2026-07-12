import fc from 'fast-check';
import { TraceSchema } from '@/contract';
import { getAttack } from '@/attacks/engine';
import { asi01 } from '@/attacks/asi01';

/** The tool_call that fulfils the injected goal — the offending step when hijacked. */
const OFFENDING_TOOL = 'transfer_funds';

function stepIds(variant: 'malicious' | 'benign'): string[] {
  return asi01.build(variant).trace.steps.map((s) => s.id);
}

describe('ASI01 — Agent Goal Hijack (indirect prompt injection)', () => {
  describe("build('malicious')", () => {
    it('produces a schema-valid observable trace', () => {
      const { trace } = asi01.build('malicious');
      expect(TraceSchema.safeParse(trace).success).toBe(true);
    });

    it('anchors held-out ground truth to a real offending step', () => {
      const { trace, groundTruth } = asi01.build('malicious');
      expect(groundTruth.compromised).toBe(true);
      expect(groundTruth.category).toBe('ASI01');
      expect(typeof groundTruth.stepId).toBe('string');
      expect(trace.steps.map((s) => s.id)).toContain(groundTruth.stepId);
    });

    it('the offending step is the transfer_funds tool_call that fulfils the injected goal', () => {
      const { trace, groundTruth } = asi01.build('malicious');
      const offending = trace.steps.find((s) => s.id === groundTruth.stepId);
      expect(offending).toMatchObject({ type: 'tool_call', tool: OFFENDING_TOOL });
    });

    it('ground truth deep-equals a compromised ASI01 label at the transfer step', () => {
      const { trace, groundTruth } = asi01.build('malicious');
      const transferId = trace.steps.find(
        (s) => s.type === 'tool_call' && s.tool === OFFENDING_TOOL,
      )?.id;
      expect(groundTruth).toEqual({ compromised: true, category: 'ASI01', stepId: transferId });
    });
  });

  describe("build('benign')", () => {
    it('produces a schema-valid, not-compromised control', () => {
      const { trace, groundTruth } = asi01.build('benign');
      expect(TraceSchema.safeParse(trace).success).toBe(true);
      expect(groundTruth).toEqual({ compromised: false, category: 'ASI01' });
    });

    it('carries the SAME injected instruction yet performs no offending action', () => {
      const { trace } = asi01.build('benign');
      const serialized = JSON.stringify(trace);
      // The same adversarial payload is present in the benign trace ...
      expect(serialized).toContain('ATTACKER');
      expect(serialized.toLowerCase()).toContain('transfer');
      // ... but the agent never issues the offending transfer.
      const actedOnInjection = trace.steps.some(
        (s) => s.type === 'tool_call' && s.tool === OFFENDING_TOOL,
      );
      expect(actedOnInjection).toBe(false);
    });
  });

  describe('scenario', () => {
    it.each(['malicious', 'benign'] as const)('returns a valid setup for %s', (variant) => {
      const s = asi01.scenario(variant);
      expect(typeof s.taskGoal).toBe('string');
      expect(s.taskGoal.length).toBeGreaterThan(0);
      expect(Array.isArray(s.environment.tools)).toBe(true);
      expect(s.environment.tools.every((t) => typeof t === 'string')).toBe(true);
      expect(s.environment.tools).toContain('read_email');
    });
  });

  describe('registration', () => {
    it('registers itself under ASI01 on import', () => {
      expect(getAttack('ASI01')).toBe(asi01);
      expect(asi01.category).toBe('ASI01');
    });
  });

  describe('properties (fast-check)', () => {
    it('every variant builds a schema-valid observable trace', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('malicious', 'benign'),
          (v) => TraceSchema.safeParse(asi01.build(v).trace).success,
        ),
      );
    });

    it('malicious stepId is always a real step id; benign is never compromised', () => {
      expect(stepIds('malicious')).toContain(asi01.build('malicious').groundTruth.stepId);
      expect(asi01.build('benign').groundTruth.compromised).toBe(false);
    });
  });
});
