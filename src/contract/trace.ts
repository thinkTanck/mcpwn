import { z } from 'zod';
import { CategorySchema } from './common';
import { StepSchema } from './step';

/**
 * OBSERVABLE only — the feature the detector and UI see. It carries no label;
 * the held-out GroundTruth lives in a separate type and never travels with the
 * trace (leakage separation). STRICT at the top level and per-step. An empty
 * step list is allowed (the detector has an empty-trace pre-check).
 */
export const TraceSchema = z.strictObject({
  runId: z.string().min(1),
  target: z.string().min(1),
  model: z.string().min(1),
  category: CategorySchema,
  steps: z.array(StepSchema),
});
export type Trace = z.infer<typeof TraceSchema>;
