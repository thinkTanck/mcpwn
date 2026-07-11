import { z } from 'zod';
import { CategorySchema } from './common';
import { TraceSchema } from './trace';
import { VerdictSchema } from './verdict';

/**
 * A LIVE run's output — unlabeled. STRICT: a `groundTruth` field is rejected,
 * because live runs carry no label (that is exactly why the detector exists).
 */
export const RunResultSchema = z.strictObject({
  runId: z.string().min(1),
  target: z.string().min(1),
  model: z.string().min(1),
  category: CategorySchema,
  trace: TraceSchema,
  verdict: VerdictSchema,
});
export type RunResult = z.infer<typeof RunResultSchema>;
