/**
 * THE OPEN-RUN REGISTRY, as a durable port.
 *
 * ── WHY THIS EXISTS ──
 *
 * `createLiveRunHost` used to keep its open runs in a plain `Map` inside the
 * process. On a single long-lived server that is fine. On serverless it is a
 * correctness bug, not a nicety: an agent's `initialize` can land on one instance
 * and its first `tools/call` on another, and the second instance has never heard
 * of the run. The endpoint then refuses a connection that is perfectly valid, and
 * it does so at random, depending on which instance the platform picked.
 *
 * So the registry moves behind this port, and the process keeps only a CACHE of
 * live server objects. What is durable is everything needed to rebuild one:
 * the run's identity and framing, and the observable events recorded so far.
 *
 * ── WHY THE EVENTS ARE PART OF THE RECORD ──
 *
 * Resolving the run but losing what it recorded would be worse than a 404: the
 * run would finish, be judged, and produce a `RunResult` whose trace silently
 * omits everything the agent did before the instance changed. Evidence that is
 * quietly incomplete is the one failure this project cannot ship. The events are
 * therefore appended as they are observed, POSITIONALLY: each event carries the
 * index it occupies in the run, so a retried write lands on the same slot instead
 * of duplicating a step. `HostedMcpServer` is otherwise a pure function of
 * `(category, kind)`, so identity plus events is enough to rebuild it exactly.
 *
 * ── WHAT IS NOT STORED ──
 *
 * No token, no digest, no credential of any kind: the connection credential lives
 * in `run-token.ts` and its own table. A row here names a run, its owner, the
 * framing we served, and the steps the agent took. It grants nothing on its own —
 * holding it does not let anyone connect, because the endpoint still demands the
 * per-run token.
 *
 * ── EXPIRY: A SWEEP, DELIBERATELY, AND NOT A PREDICATE ──
 *
 * `expiresAt` here is HYGIENE, not access control, and the distinction is worth
 * stating because the other two stores enforce expiry differently.
 *
 * A session row is not a credential, so an old row cannot be "accepted" into
 * anything. Reaching a run still requires the per-run token, which expires on two
 * axes of its own (the run ending, and the wall clock) and is checked on every
 * inbound request. Filtering expired sessions out of `find()` would therefore add
 * no security, and it would take something away: a user who worked the whole TTL
 * and then asked to finish the run would find it unresolvable and lose the judge
 * verdict for work already done. So `find()` returns the row as stored, and the
 * TTL is drained by {@link LiveRunSessionStore.sweepExpired}, whose only job is to
 * stop the table growing without bound.
 *
 * Correctness never depends on the sweep running. If it never ran, the table
 * would get large and nothing would become reachable that was not reachable
 * already.
 *
 * ── FINDING THE RUNS NOBODY CLOSED ──
 *
 * {@link LiveRunSessionStore.findStale} answers the one question a scheduled job
 * has to ask: which runs are still OPEN although their whole window has passed.
 * It reuses `expiresAt` rather than inventing a second clock — that value is
 * already the token's wall-clock death plus the grace after it, so a run it
 * returns has been unable to record another step for the length of the grace,
 * and its owner has had that whole grace to finish it themselves.
 *
 * The answer is BOUNDED. A backlog is drained over passes, because one pass that
 * tries to judge every stale run at once is one pass that times out and finishes
 * none of them.
 */
import { z } from 'zod';
import { CategorySchema, JsonValueSchema, VariantKindSchema } from '@/contract';
import type { TargetStepEvent } from '@/harness';

/**
 * Zod over one observable step event.
 *
 * It mirrors `TargetStepEvent` rather than reusing the contract's step schemas,
 * because those carry the `id` the recorder assigns and these do not have one
 * yet. It exists at all because a row read back from Postgres is EXTERNAL INPUT:
 * the shape is ours by convention only, and a trace assembled from unvalidated
 * JSON would fail later, further from the cause.
 */
export const LiveRunStepEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('principal_instruction'), content: z.string() }),
  z.object({ type: z.literal('agent_reasoning'), content: z.string() }),
  z.object({
    type: z.literal('tool_call'),
    tool: z.string(),
    args: z.record(z.string(), JsonValueSchema),
  }),
  z.object({ type: z.literal('tool_result'), tool: z.string(), result: JsonValueSchema }),
  z.object({ type: z.literal('memory_read'), key: z.string(), value: JsonValueSchema }),
  z.object({ type: z.literal('memory_write'), key: z.string(), value: JsonValueSchema }),
  z.object({ type: z.literal('task_complete'), summary: z.string().optional() }),
]);

/** One open (or finished) run, as the registry holds it. */
export const LiveRunSessionRecordSchema = z.object({
  /** The run this row is. Unique. */
  runId: z.string().min(1),
  /** The account that owns it. Every read is checked against this. */
  userId: z.string().min(1),
  /** Which Core-7 scenario we served. */
  category: CategorySchema,
  /** Which framing we served: the poisoned run or its benign control. */
  kind: VariantKindSchema,
  /** Pinned model label, or null to use whatever the client claimed. */
  model: z.string().nullable(),
  /** The client's own claim from `initialize`. Unverified, and null until seen. */
  client: z.string().nullable(),
  /** What the recorder stamps as `Trace.target`. Category-free and project-free. */
  target: z.string().min(1),
  startedAt: z.string().min(1),
  /** Hygiene only — see the header. Never consulted by `find()`. */
  expiresAt: z.string().min(1),
  /** ISO-8601 once the run was claimed for finishing; null while it is open. */
  finishedAt: z.string().nullable(),
  /** Every observable step recorded so far, in order. */
  events: z.array(LiveRunStepEventSchema),
});

export type LiveRunSessionRecord = Omit<z.infer<typeof LiveRunSessionRecordSchema>, 'events'> & {
  readonly events: readonly TargetStepEvent[];
};

/** What `create()` is handed. A new session is open by definition. */
export type NewLiveRunSession = Omit<LiveRunSessionRecord, 'finishedAt'>;

/** One positional append of newly observed events. */
export interface AppendLiveRunEvents {
  readonly runId: string;
  /** The index the first of `events` occupies in the run. */
  readonly from: number;
  readonly events: readonly TargetStepEvent[];
  /** The client's claimed name, if the run has learned it since the last append. */
  readonly client?: string | null;
}

/**
 * One open run whose window has passed, as the sweep needs to see it: enough to
 * address the run and to say whose it is, and nothing else. The steps are read
 * separately, only for the runs that turn out to be worth judging.
 */
export interface StaleLiveRun {
  readonly runId: string;
  readonly userId: string;
  /** When the window closed. ISO-8601, carried so a caller can log the age. */
  readonly expiresAt: string;
}

/** How many stale runs one `findStale` answers with, unless a caller says otherwise. */
export const DEFAULT_STALE_RUN_LIMIT = 50;

/**
 * The registry port. Two adapters satisfy it: the in-memory one below (tests and
 * offline), and the Supabase one in `./live-run-store.supabase.ts` (production,
 * where the row outlives the instance that wrote it).
 */
export interface LiveRunSessionStore {
  /** Record a newly started run. */
  create(session: NewLiveRunSession): Promise<void>;
  /** The run, with everything it has recorded, or null. */
  find(runId: string): Promise<LiveRunSessionRecord | null>;
  /** Append newly observed events at their positions, and note the client. */
  appendEvents(input: AppendLiveRunEvents): Promise<void>;
  /**
   * CLAIM this run for finishing. True exactly once, for whichever caller wins;
   * false for a run already claimed, or one that does not exist.
   *
   * It is a claim rather than a write because "has this run already finished?"
   * used to be an in-process boolean, which two instances would each answer
   * "no" — and a run judged twice is charged twice and stored twice.
   */
  finish(runId: string, finishedAt: Date): Promise<boolean>;
  /**
   * The runs that are still open although their window has passed — the ones a
   * user started and never closed. Bounded; see the header.
   */
  findStale(now: Date, limit?: number): Promise<readonly StaleLiveRun[]>;
  /** Delete rows past their wall clock. Hygiene; correctness never depends on it. */
  sweepExpired(now: Date): Promise<number>;
}

/**
 * In-memory `LiveRunSessionStore` — the offline/test adapter, mirroring
 * `InMemoryRunRepository` and `InMemoryRunTokenStore`.
 *
 * It is deliberately NOT the production adapter: state here dies with the
 * process, which is the exact defect the port exists to fix.
 */
export class InMemoryLiveRunSessionStore implements LiveRunSessionStore {
  private rows = new Map<string, LiveRunSessionRecord>();

  async create(session: NewLiveRunSession): Promise<void> {
    this.rows.set(session.runId, { ...session, finishedAt: null });
  }

  async find(runId: string): Promise<LiveRunSessionRecord | null> {
    return this.rows.get(runId) ?? null;
  }

  async appendEvents(input: AppendLiveRunEvents): Promise<void> {
    const row = this.rows.get(input.runId);
    if (row === undefined) return;
    // Positional, exactly like the (run_id, idx) primary key the durable adapter
    // uses: a replayed append overwrites its own slots rather than adding steps
    // the agent never took.
    const events = [...row.events];
    input.events.forEach((event, offset) => {
      events[input.from + offset] = event;
    });
    this.rows.set(input.runId, {
      ...row,
      events,
      client: input.client === undefined ? row.client : input.client,
    });
  }

  async finish(runId: string, finishedAt: Date): Promise<boolean> {
    const row = this.rows.get(runId);
    if (row === undefined || row.finishedAt !== null) return false;
    this.rows.set(runId, { ...row, finishedAt: finishedAt.toISOString() });
    return true;
  }

  async findStale(now: Date, limit = DEFAULT_STALE_RUN_LIMIT): Promise<readonly StaleLiveRun[]> {
    const at = now.toISOString();
    const stale: StaleLiveRun[] = [];
    for (const row of this.rows.values()) {
      if (stale.length >= limit) break;
      if (row.finishedAt !== null || row.expiresAt > at) continue;
      stale.push({ runId: row.runId, userId: row.userId, expiresAt: row.expiresAt });
    }
    return stale;
  }

  async sweepExpired(now: Date): Promise<number> {
    const at = now.toISOString();
    let swept = 0;
    for (const [runId, row] of this.rows) {
      if (row.expiresAt <= at) {
        this.rows.delete(runId);
        swept += 1;
      }
    }
    return swept;
  }
}
