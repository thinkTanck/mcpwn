import { z } from 'zod';
import { CategorySchema, SeveritySchema } from './common';

/**
 * The detector's output over an observable Trace. STRICT.
 * Invariant: `stepId` is present iff `compromised` — a compromise anchors to the
 * offending step; a clean run anchors to nothing.
 */
export const VerdictSchema = z
  .strictObject({
    runId: z.string().min(1),
    compromised: z.boolean(),
    // Detector confidence in [0, 1]. (The numeric AIVSS score is left open; the
    // qualitative severity band is carried separately.)
    score: z.number().min(0).max(1),
    severity: SeveritySchema,
    category: CategorySchema,
    rationale: z.string(),
    stepId: z.string().min(1).optional(),
  })
  .refine((v) => v.compromised === (v.stepId !== undefined), {
    message: 'stepId must be present iff compromised',
    path: ['stepId'],
  });
export type Verdict = z.infer<typeof VerdictSchema>;
