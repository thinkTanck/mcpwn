import { z } from 'zod';
import { CategorySchema } from './common';

/**
 * HELD OUT — the label. Produced at attack construction and compared against
 * detector Verdicts on constructed fixtures only. It is NEVER given to the
 * detector or the UI (leakage separation). A separate type from Verdict.
 */
export const GroundTruthSchema = z.strictObject({
  compromised: z.boolean(),
  stepId: z.string().min(1).optional(),
  category: CategorySchema,
});
export type GroundTruth = z.infer<typeof GroundTruthSchema>;
