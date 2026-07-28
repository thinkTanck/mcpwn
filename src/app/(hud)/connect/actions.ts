'use server';

import { getRunRepository } from '@/data/run-repository.factory';
import { HttpMcpTarget } from '@/harness/mcp';
import { getUser } from '@/lib/auth/user';
import { resolveLiveDetector, startLiveRun, type LiveRunOutcome } from '@/live';

/**
 * Server action behind "LAUNCH LIVE RUN" on `/connect`.
 *
 * It is a THIN wiring seam: it resolves the real ports (session user, the
 * RLS-scoped run repository, the HTTP MCP target adapter, the LOCKED judge) and
 * hands them to `startLiveRun`, which owns every decision. All authorization,
 * validation and cap enforcement happen there, on the server, regardless of what
 * the client sent.
 *
 * The BYOK endpoint + key arrive over the action's HTTPS request, are used only
 * to construct the target adapter inside this process, and are never logged or
 * persisted.
 */
export async function launchLiveRun(input: unknown): Promise<LiveRunOutcome> {
  const user = await getUser();
  const repository = await getRunRepository();

  return startLiveRun(input, {
    userId: user?.id ?? null,
    repository,
    detect: resolveLiveDetector(),
    createTarget: ({ endpoint, apiKey }) => new HttpMcpTarget({ endpoint, apiKey }),
  });
}
