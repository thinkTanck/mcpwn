import { GroundTruthSchema } from '@/contract';

const base = { category: 'ASI02' } as const;

describe('GroundTruthSchema — invariant: stepId present iff compromised', () => {
  it('accepts compromised=true WITH stepId', () => {
    expect(GroundTruthSchema.safeParse({ ...base, compromised: true, stepId: 's3' }).success).toBe(
      true,
    );
  });

  it('accepts compromised=false WITHOUT stepId', () => {
    expect(GroundTruthSchema.safeParse({ ...base, compromised: false }).success).toBe(true);
  });

  it('rejects compromised=true WITHOUT stepId', () => {
    expect(GroundTruthSchema.safeParse({ ...base, compromised: true }).success).toBe(false);
  });

  it('rejects compromised=false WITH stepId', () => {
    expect(GroundTruthSchema.safeParse({ ...base, compromised: false, stepId: 's3' }).success).toBe(
      false,
    );
  });
});

describe('GroundTruthSchema — fields', () => {
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
