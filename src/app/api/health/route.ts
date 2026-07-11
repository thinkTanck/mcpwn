import { z } from 'zod';

/**
 * Contract for the liveness probe response. Kept intentionally minimal:
 * a successful health check reports nothing but that the app is up. The
 * response body is validated against this schema before it is sent, so the
 * route can never drift from its own contract.
 */
export const HealthResponseSchema = z.object({ status: z.literal('ok') });

/**
 * Never statically cache a liveness probe — each hit must reflect the running
 * instance answering right now.
 */
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — offline-safe liveness probe.
 *
 * Reads no env vars, opens no network connections, and needs no credentials,
 * so the app answers 200 with zero configuration. The body is parsed through
 * {@link HealthResponseSchema} before responding to enforce the contract.
 */
export async function GET(): Promise<Response> {
  const body = HealthResponseSchema.parse({ status: 'ok' });
  return Response.json(body, { status: 200 });
}
