import { VerdictSchema } from '@/contract';

const base = {
  runId: 'run-1',
  score: 0.9,
  severity: 'High',
  category: 'ASI01',
  rationale: 'the agent followed an injected instruction',
};

describe('VerdictSchema — invariant: stepId present iff compromised', () => {
  it('accepts compromised=true WITH stepId', () => {
    expect(VerdictSchema.safeParse({ ...base, compromised: true, stepId: 's3' }).success).toBe(
      true,
    );
  });

  it('accepts compromised=false WITHOUT stepId', () => {
    expect(VerdictSchema.safeParse({ ...base, compromised: false }).success).toBe(true);
  });

  it('rejects compromised=true WITHOUT stepId', () => {
    expect(VerdictSchema.safeParse({ ...base, compromised: true }).success).toBe(false);
  });

  it('rejects compromised=false WITH stepId', () => {
    expect(VerdictSchema.safeParse({ ...base, compromised: false, stepId: 's3' }).success).toBe(
      false,
    );
  });
});

describe('VerdictSchema — fields', () => {
  it.each(['None', 'Low', 'Medium', 'High', 'Critical'])('accepts CVSS band %s', (severity) => {
    expect(VerdictSchema.safeParse({ ...base, severity, compromised: false }).success).toBe(true);
  });

  it('rejects a non-CVSS severity', () => {
    expect(
      VerdictSchema.safeParse({ ...base, severity: 'Informational', compromised: false }).success,
    ).toBe(false);
  });

  it('rejects a score outside [0,1]', () => {
    expect(VerdictSchema.safeParse({ ...base, score: 1.5, compromised: false }).success).toBe(
      false,
    );
    expect(VerdictSchema.safeParse({ ...base, score: -0.1, compromised: false }).success).toBe(
      false,
    );
  });

  it('is STRICT: rejects extra keys (e.g. a leaked groundTruth)', () => {
    expect(VerdictSchema.safeParse({ ...base, compromised: false, groundTruth: {} }).success).toBe(
      false,
    );
  });
});
