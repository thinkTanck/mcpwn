import { z } from 'zod';
import { CategorySchema } from '@/contract';
import { ByokEndpointSchema } from '@/harness/mcp';

/**
 * The external input of a BYOK live run. Everything here arrives from the
 * browser, so it is Zod-validated at the server boundary before a single field
 * is read (CLAUDE.md: Zod input validation on all external inputs) — the client
 * form's own checks are convenience, never the gate.
 *
 * The `apiKey` is bounded but otherwise opaque: it is the user's secret, used
 * server-side only, never logged, never persisted.
 */
export const LiveRunRequestSchema = z.strictObject({
  endpoint: ByokEndpointSchema,
  apiKey: z
    .string()
    .min(1, { message: 'Enter the API key or token your MCP agent expects.' })
    .max(4096, { message: 'That API key is too long.' }),
  /** Free-text model identifier, recorded on the run for the leaderboard. */
  modelId: z.string().trim().max(120).optional(),
  categories: z
    .array(CategorySchema)
    .min(1, { message: 'Select at least one attack category to launch.' })
    .max(7),
});

export type LiveRunRequest = z.infer<typeof LiveRunRequestSchema>;

/** Model label recorded on a run when the user did not name one. */
export const UNSPECIFIED_MODEL = 'byok-agent';
