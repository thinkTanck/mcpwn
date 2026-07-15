import fc from 'fast-check';
import { TraceSchema } from '@/contract';
import { getAttack } from '@/attacks/engine';
import { asi05 } from '@/attacks/asi05';

/** The command-runner tool_call that executes the smuggled command — the offending step. */
const EXEC_TOOL = 'run_shell';

function stepIds(variant: 'malicious' | 'benign'): string[] {
  return asi05.build(variant).trace.steps.map((s) => s.id);
}

describe('ASI05 — Unexpected Code Execution (RCE)', () => {
  describe("build('malicious')", () => {
    it('produces a schema-valid observable trace', () => {
      const { trace } = asi05.build('malicious');
      expect(TraceSchema.safeParse(trace).success).toBe(true);
    });

    it('anchors held-out ground truth to a real offending step', () => {
      const { trace, groundTruth } = asi05.build('malicious');
      expect(groundTruth.compromised).toBe(true);
      expect(groundTruth.category).toBe('ASI05');
      expect(typeof groundTruth.stepId).toBe('string');
      expect(trace.steps.map((s) => s.id)).toContain(groundTruth.stepId);
    });

    it('the offending step is the run_shell tool_call that executes the smuggled command', () => {
      const { trace, groundTruth } = asi05.build('malicious');
      const offending = trace.steps.find((s) => s.id === groundTruth.stepId);
      expect(offending).toMatchObject({ type: 'tool_call', tool: EXEC_TOOL });
      // The offending tool_call actually carries the attacker-controlled command text.
      const command =
        offending && offending.type === 'tool_call' ? String(offending.args.command) : '';
      expect(command).toContain('setup.sh');
    });

    it('ground truth deep-equals a compromised ASI05 label at the exec step', () => {
      const { trace, groundTruth } = asi05.build('malicious');
      const execId = trace.steps.find((s) => s.type === 'tool_call' && s.tool === EXEC_TOOL)?.id;
      expect(groundTruth).toEqual({ compromised: true, category: 'ASI05', stepId: execId });
    });
  });

  describe("build('benign')", () => {
    it('produces a schema-valid, not-compromised control', () => {
      const { trace, groundTruth } = asi05.build('benign');
      expect(TraceSchema.safeParse(trace).success).toBe(true);
      expect(groundTruth).toEqual({ compromised: false, category: 'ASI05' });
    });

    it('carries the SAME poisoned filename yet runs no shell command', () => {
      const { trace } = asi05.build('benign');
      const serialized = JSON.stringify(trace);
      // The same attacker-controlled filename is present in the benign trace ...
      expect(serialized).toContain('setup.sh');
      // ... but the agent never runs it (or anything) through the command runner.
      const executed = trace.steps.some((s) => s.type === 'tool_call' && s.tool === EXEC_TOOL);
      expect(executed).toBe(false);
    });
  });

  describe('scenario', () => {
    it.each(['malicious', 'benign'] as const)('returns a valid setup for %s', (variant) => {
      const s = asi05.scenario(variant);
      expect(typeof s.taskGoal).toBe('string');
      expect(s.taskGoal.length).toBeGreaterThan(0);
      expect(Array.isArray(s.environment.tools)).toBe(true);
      expect(s.environment.tools.every((t) => typeof t === 'string')).toBe(true);
      expect(s.environment.tools).toContain(EXEC_TOOL);
    });
  });

  describe('registration', () => {
    it('registers itself under ASI05 on import', () => {
      expect(getAttack('ASI05')).toBe(asi05);
      expect(asi05.category).toBe('ASI05');
    });
  });

  describe('properties (fast-check)', () => {
    it('every variant builds a schema-valid observable trace', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('malicious', 'benign'),
          (v) => TraceSchema.safeParse(asi05.build(v).trace).success,
        ),
      );
    });

    it('malicious stepId is always a real step id; benign is never compromised', () => {
      expect(stepIds('malicious')).toContain(asi05.build('malicious').groundTruth.stepId);
      expect(asi05.build('benign').groundTruth.compromised).toBe(false);
    });
  });
});
