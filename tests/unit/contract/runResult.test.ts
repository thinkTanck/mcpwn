import { RunResultSchema } from '@/contract';

const trace = {
  runId: 'run-1',
  target: 't',
  model: 'm',
  category: 'ASI01',
  steps: [{ id: 's1', type: 'principal_instruction', content: 'x' }],
};

const verdict = {
  runId: 'run-1',
  compromised: true,
  stepId: 's1',
  score: 0.8,
  severity: 'High',
  category: 'ASI01',
  rationale: 'r',
};

const validRunResult = {
  runId: 'run-1',
  target: 't',
  model: 'm',
  category: 'ASI01',
  trace,
  verdict,
};

describe('RunResultSchema — a live, unlabeled run', () => {
  it('parses a well-formed run result', () => {
    expect(RunResultSchema.safeParse(validRunResult).success).toBe(true);
  });

  it('leakage guard: STRICT rejects a `groundTruth` key (live runs are unlabeled)', () => {
    const labeled = {
      ...validRunResult,
      groundTruth: { compromised: true, stepId: 's1', category: 'ASI01' },
    };
    expect(RunResultSchema.safeParse(labeled).success).toBe(false);
  });

  it('rejects an invalid nested verdict (compromised without stepId)', () => {
    const badVerdict = {
      runId: 'run-1',
      compromised: true,
      score: 0.8,
      severity: 'High',
      category: 'ASI01',
      rationale: 'r',
    };
    expect(RunResultSchema.safeParse({ ...validRunResult, verdict: badVerdict }).success).toBe(
      false,
    );
  });

  it('rejects a missing trace', () => {
    const noTrace = {
      runId: validRunResult.runId,
      target: validRunResult.target,
      model: validRunResult.model,
      category: validRunResult.category,
      verdict: validRunResult.verdict,
    };
    expect(RunResultSchema.safeParse(noTrace).success).toBe(false);
  });
});
