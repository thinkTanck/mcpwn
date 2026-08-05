/**
 * THE PRODUCTION WIRING of the live-run pipeline, plus the small registry of what
 * this instance has observed about a run.
 *
 * `createLiveRunHost` (`src/runs/live-run.ts`) takes every external thing as an
 * injected port and shipped with NO production caller. This module is that
 * caller: it binds each seam to the real module the pipeline's own documentation
 * names, and nothing else. No policy is decided here.
 *
 *   preflight        -> `checkLiveRunPreflight` (the allowance + the spend cap)
 *   tokens           -> the per-run token store
 *   repository       -> `getRunRepository()`, RLS-scoped to the caller's session
 *   resolveDetector  -> `resolveLiveDetector()`, the LOCKED validated judge
 *
 * ── ONE HOST PER PROCESS, AND WHY THAT IS STATED RATHER THAN HIDDEN ──
 *
 * A hosted run is a live object holding a live recorder, so it cannot be
 * serialized into Postgres and read back mid-run. The pipeline says so, and this
 * module inherits the consequence exactly: a run in progress belongs to the
 * instance that started it, and a restart loses an unfinished trace. What DOES
 * outlive the process already does — the token record, and the finished
 * `RunResult`. Sticky routing or a durable recorder is a decision no evidence has
 * been gathered for, so it is not invented here.
 *
 * The instance is cached on `globalThis` so a dev-server hot reload does not
 * strand a run behind a second, fresh registry.
 *
 * ── THE OBSERVATION REGISTRY ──
 *
 * The pipeline can answer "what has been recorded" (the trace). It cannot answer
 * "has the agent turned up yet", because a client that only initializes and lists
 * tools has taken no step the contract has a type for. So the endpoint notes each
 * AUTHENTICATED inbound request here, and the status action reads it. Refused
 * requests are never noted: a stranger hammering the endpoint must not be able to
 * make a run look connected.
 *
 * Nothing in this registry is a secret. It holds a run id, two timestamps and a
 * count — never a token, never a payload.
 */
import type { RunResult } from '@/contract';
import { resolveLiveDetector } from '@/detector/resolve';
import { logger } from '@/lib/logger';
import { createLiveRunHost, type LiveRunHost, type LiveRunHostDeps } from '@/runs/live-run';
import { checkLiveRunPreflight } from '@/runs/preflight';
import { InMemoryRunTokenStore, type RunTokenStore } from '@/runs/run-token';

/** What this instance has seen of one run's agent. Timestamps are ISO-8601. */
export interface AgentActivity {
  /** The first authenticated request. */
  readonly connectedAt: string;
  /** The most recent authenticated request. */
  readonly lastSeenAt: string;
  /** How many authenticated requests have been served. */
  readonly requests: number;
}

interface LiveRunRegistry {
  host?: LiveRunHost;
  tokens?: RunTokenStore;
  activity: Map<string, AgentActivity>;
  finished: Map<string, string>;
}

const REGISTRY_KEY = Symbol.for('mcpwn.live-run-registry');

type RegistryHolder = { [REGISTRY_KEY]?: LiveRunRegistry };

function registry(): LiveRunRegistry {
  const holder = globalThis as unknown as RegistryHolder;
  holder[REGISTRY_KEY] ??= { activity: new Map(), finished: new Map() };
  return holder[REGISTRY_KEY];
}

/**
 * Where per-run tokens live.
 *
 * IN-MEMORY, and that is the honest state of it: the durable adapter for
 * `supabase/migrations/0002_run_tokens.sql` is a separate piece of work, and
 * wiring a store that does not exist would be a fiction. The bound this puts on a
 * run is the SAME bound the session registry above already puts on it — a run
 * belongs to the instance that started it — so nothing is made worse by it, and a
 * durable store drops in at this one line.
 */
function tokenStore(): RunTokenStore {
  const cache = registry();
  cache.tokens ??= new InMemoryRunTokenStore();
  return cache.tokens;
}

/**
 * The production ports, each pointed at the real module.
 *
 * The repository is resolved PER CALL rather than held, because it is bound to
 * the caller's cookie session: one long-lived client would carry one user's
 * session into another user's request. `checkLiveRunPreflight` is called with the
 * clock the pipeline hands it, so a test that pins the clock pins the gate too.
 */
export function liveRunDeps(): LiveRunHostDeps {
  return {
    preflight: async ({ userId, now }) =>
      checkLiveRunPreflight({ userId, ...(now === undefined ? {} : { now }) }),
    tokens: tokenStore(),
    repository: {
      async saveRun(userId: string, run: RunResult) {
        // Imported here, not at the top: the factory reaches for the cookie-bound
        // Supabase client, which pulls `next/headers`, and this module has to stay
        // importable by anything that only wants a type off it.
        const { getRunRepository } = await import('@/data/run-repository.factory');
        const repository = await getRunRepository();
        return repository.saveRun(userId, run);
      },
    },
    resolveDetector: () => resolveLiveDetector(),
    logger,
  };
}

/** The one live-run host this process serves every run from. */
export function getLiveRunHost(): LiveRunHost {
  const cache = registry();
  cache.host ??= createLiveRunHost(liveRunDeps());
  return cache.host;
}

/** Note one AUTHENTICATED inbound request. Refused requests never reach here. */
export function noteAgentRequest(runId: string, at: Date = new Date()): void {
  const { activity } = registry();
  const seenAt = at.toISOString();
  const previous = activity.get(runId);
  activity.set(runId, {
    connectedAt: previous?.connectedAt ?? seenAt,
    lastSeenAt: seenAt,
    requests: (previous?.requests ?? 0) + 1,
  });
}

/** What this instance has seen of a run's agent, or `null` if it has seen none. */
export function readAgentActivity(runId: string): AgentActivity | null {
  return registry().activity.get(runId) ?? null;
}

/** Stamp a run finished. A run finishes once, so the first stamp stands. */
export function noteRunFinished(runId: string, at: Date = new Date()): void {
  const { finished } = registry();
  if (!finished.has(runId)) finished.set(runId, at.toISOString());
}

/** When the run finished, or `null` if it has not. */
export function readRunFinishedAt(runId: string): string | null {
  return registry().finished.get(runId) ?? null;
}

/**
 * Drop everything this process holds about live runs.
 *
 * Test seam, mirroring `otpRateLimitStore.reset()`: the registry is process-wide
 * by design, so a suite that could not clear it would carry one test's runs into
 * the next. Production never calls it.
 */
export function resetLiveRunRegistry(): void {
  const holder = globalThis as unknown as RegistryHolder;
  holder[REGISTRY_KEY] = { activity: new Map(), finished: new Map() };
}
