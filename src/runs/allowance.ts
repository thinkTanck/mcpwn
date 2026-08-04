/**
 * The per-account LIFETIME free-run allowance — the primary cost control from
 * [ADR-0007](../../docs/adr/0007-access-and-cost-model.md).
 *
 * WHY LIFETIME, NOT A WINDOW. A rolling cap (N runs per 24h) bounds the RATE and
 * not the TOTAL: an exhausted account simply returns tomorrow, so the operator's
 * exposure per user is unbounded. The free tier exists so people can EVALUATE
 * MCPwn, and evaluating it takes a handful of runs once, not a run a day. So the
 * count starts at account creation and never moves. The superseded
 * `LIVE_RUN_CAP` / `LIVE_RUN_WINDOW_HOURS` pair is not coming back.
 *
 * The number itself is a TUNABLE DEFAULT read from `LIVE_RUN_ALLOWANCE`, never a
 * literal — see `getLiveRunAllowance()`. Copy that quotes it goes through
 * {@link describeLiveRunAllowance} so the sentence and the enforcement cannot
 * drift apart the way the OTP length and its copy once did.
 *
 * REFUSAL IS A VALUE, NOT A CRASH. Over-cap returns a decision carrying a typed
 * {@link LiveRunAllowanceError}, whose message is already the sentence a screen
 * can print. That mirrors `resolveLiveDetector()` returning `null` for an
 * unconfigured judge: a bounded, expected state the app states plainly, rather
 * than an exception surfacing as a 500 on a public route.
 *
 * ── INTEGRATION POINT (deliberately not wired yet) ──
 *
 * This module is TESTED PURE LOGIC with no production caller, because there is
 * nothing honest to attach it to yet: under
 * [ADR-0006](../../docs/adr/0006-mcpwn-is-the-mcp-server.md) a live run means the
 * user's agent connecting to an MCP server WE host, and that server does not
 * exist (plan.md B2, gated on the hypothesis spike). Fabricating a live pipeline
 * to have somewhere to put a gate would make the gate a fiction too.
 *
 * When the live-run entry point lands (the `/connect` server action that issues a
 * per-run endpoint and token), it calls this BEFORE it spends anything:
 *
 *   const user = await requireUser('/connect');            // already exists
 *   const repository = await getRunRepository();           // already exists
 *   const decision = await checkLiveRunAllowance({
 *     repository,
 *     userId: user.id,
 *     accountCreatedAt: user.created_at,
 *   });
 *   if (!decision.allowed) return { ok: false, reason: decision.error.code,
 *                                   message: decision.error.message };
 *
 * The order matters: the allowance is checked after authentication and before the
 * judge is resolved or a run is persisted, so a refused run costs nothing.
 * Auth and RLS are untouched — the count is read through the caller's own
 * RLS-scoped repository, so an account can only ever count its own runs.
 */
import { getLiveRunAllowance } from '@/config/env';
import type { RunRepository } from '@/data/run-repository';

type Env = Record<string, string | undefined>;

/** The one place the allowance number becomes words. */
export function describeLiveRunAllowance(allowance?: number, env: Env = process.env): string {
  const n = allowance ?? getLiveRunAllowance(env);
  if (n === 0) return 'no free live runs';
  return n === 1 ? '1 free live run' : `${n} free live runs`;
}

/**
 * The refusal an exhausted account meets. Its `message` is user-facing copy, so
 * it names the path that still works instead of dead-ending, and it derives the
 * count from the configured allowance rather than stating a numeral of its own.
 */
export class LiveRunAllowanceError extends Error {
  /** Stable discriminator for callers that map outcomes to UI states. */
  readonly code = 'ALLOWANCE_EXHAUSTED' as const;
  readonly allowance: number;
  readonly used: number;

  constructor(allowance: number, used: number) {
    super(
      `You have used ${describeLiveRunAllowance(allowance)} on this account. ` +
        `Sample playback stays open to everyone.`,
    );
    this.name = 'LiveRunAllowanceError';
    this.allowance = allowance;
    this.used = used;
  }
}

/** What a caller needs from persistence: the lifetime count, nothing more. */
export type RunCounter = Pick<RunRepository, 'countRunsSince'>;

export interface LiveRunAllowanceQuery {
  /** The caller's own RLS-scoped repository (see `getRunRepository()`). */
  readonly repository: RunCounter;
  /** Supabase auth user id — the account the allowance belongs to. */
  readonly userId: string;
  /** The account's creation instant (`user.created_at`). Optional; see below. */
  readonly accountCreatedAt?: Date | string | null;
  /** Environment to read the allowance from. Defaults to `process.env`. */
  readonly env?: Env;
}

/** A granted run: how large the allowance is, how much is spent, what is left. */
export interface LiveRunAllowanceGranted {
  readonly allowed: true;
  readonly allowance: number;
  readonly used: number;
  readonly remaining: number;
}

/** A refused run: the same accounting, plus the typed error the UI states. */
export interface LiveRunAllowanceRefused {
  readonly allowed: false;
  readonly allowance: number;
  readonly used: number;
  readonly remaining: 0;
  readonly error: LiveRunAllowanceError;
}

export type LiveRunAllowanceDecision = LiveRunAllowanceGranted | LiveRunAllowanceRefused;

/**
 * Where lifetime counting starts.
 *
 * A run cannot predate its owner's account, so account creation and the epoch
 * yield the SAME total; passing the real instant just says what is meant (and
 * lets Postgres bound the scan). An absent or unparseable value therefore falls
 * back to the epoch, which is the fail-CLOSED choice: it can only ever
 * over-count, never let a spent allowance slip through.
 */
function lifetimeCountFrom(accountCreatedAt?: Date | string | null): Date {
  if (accountCreatedAt instanceof Date) {
    return Number.isNaN(accountCreatedAt.getTime()) ? new Date(0) : accountCreatedAt;
  }
  if (typeof accountCreatedAt === 'string') {
    const parsed = new Date(accountCreatedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

/**
 * Decide whether this account may start another live run.
 *
 * Reads the account's LIFETIME run count and compares it to the configured
 * allowance. Never throws for the over-cap case — that is a decision, returned.
 * A persistence failure DOES propagate: "the store is unreachable" is not the
 * same answer as "you are out of runs", and quietly granting a run on a failed
 * read would turn an outage into unbounded spend.
 */
export async function checkLiveRunAllowance(
  query: LiveRunAllowanceQuery,
): Promise<LiveRunAllowanceDecision> {
  const allowance = getLiveRunAllowance(query.env ?? process.env);
  const used = await query.repository.countRunsSince(
    query.userId,
    lifetimeCountFrom(query.accountCreatedAt),
  );

  if (used >= allowance) {
    return {
      allowed: false,
      allowance,
      used,
      remaining: 0,
      error: new LiveRunAllowanceError(allowance, used),
    };
  }

  return { allowed: true, allowance, used, remaining: allowance - used };
}
