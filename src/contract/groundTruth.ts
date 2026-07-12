import { z } from 'zod';
import { CategorySchema } from './common';

/**
 * HELD OUT — the label. Produced at attack construction and compared against
 * detector Verdicts on constructed fixtures only. It is NEVER given to the
 * detector or the UI (leakage separation). A separate type from Verdict.
 * Invariant (mirrors Verdict): `stepId` is present iff `compromised`.
 */
export const GroundTruthSchema = z
  .strictObject({
    compromised: z.boolean(),
    stepId: z.string().min(1).optional(),
    category: CategorySchema,
  })
  .refine((g) => g.compromised === (g.stepId !== undefined), {
    message: 'stepId must be present iff compromised',
    path: ['stepId'],
  });
export type GroundTruth = z.infer<typeof GroundTruthSchema>;
