import { GroundTruthSchema } from '@/contract';

describe('GroundTruthSchema — held out (the label)', () => {
  it('parses a compromised ground truth with a stepId', () => {
    expect(
      GroundTruthSchema.safeParse({ compromised: true, stepId: 's3', category: 'ASI02' }).success,
    ).toBe(true);
  });

  it('parses a not-compromised ground truth without a stepId', () => {
    expect(GroundTruthSchema.safeParse({ compromised: false, category: 'ASI06' }).success).toBe(
      true,
    );
  });

  it('rejects an unknown category', () => {
    expect(GroundTruthSchema.safeParse({ compromised: false, category: 'ASI99' }).success).toBe(
      false,
    );
  });

  it('rejects a missing compromised flag', () => {
    expect(GroundTruthSchema.safeParse({ category: 'ASI01' }).success).toBe(false);
  });

  it('is STRICT: rejects extra keys', () => {
    expect(
      GroundTruthSchema.safeParse({
        compromised: true,
        stepId: 's1',
        category: 'ASI01',
        note: 'leak',
      }).success,
    ).toBe(false);
  });
});
