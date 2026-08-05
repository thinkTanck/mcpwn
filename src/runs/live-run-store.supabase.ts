/**
 * Supabase-backed `LiveRunSessionStore` — the durable open-run registry.
 *
 * The port and the reasoning live in `./live-run-store.ts`; this is the adapter
 * that lands it on `public.live_runs` and `public.live_run_events`
 * (`supabase/migrations/0003_durable_stores.sql`). Three choices are worth
 * stating here.
 *
 * ── EVENTS ARE ROWS, NOT AN ARRAY COLUMN ──
 *
 * A `jsonb` array would have to be read, appended to, and written back whole,
 * which makes two instances writing at once a lost-update race. One row per step,
 * keyed `(run_id, idx)`, makes an append a plain insert: it cannot clobber
 * another instance's step, it cannot reorder, and a retried write lands on its
 * own primary key instead of duplicating the step. The upsert is there for
 * exactly that retry, so a response the caller never saw costs nothing.
 *
 * ── FINISHING IS A CONDITIONAL UPDATE, NOT A READ THEN A WRITE ──
 *
 * `update ... where finished_at is null` is decided by the database, once, and
 * whichever caller sees rows back is the one that won. A read-then-write would
 * let two instances both read null and both judge the run, which costs the
 * operator two judge calls and stores the run twice.
 *
 * ── EXPIRY: SWEPT, NOT FILTERED ──
 *
 * `find()` does NOT filter on `expires_at`, deliberately. A session row is not a
 * credential — reaching a run still requires the per-run token, which expires on
 * two axes of its own and is checked on every inbound request — so an old row
 * grants nobody anything. Filtering here would only take something away: a user
 * who worked the whole TTL and then asked to finish would lose the verdict for
 * work already done. The TTL is drained by
 * {@link SupabaseLiveRunSessionStore.sweepExpired}, whose only job is to bound
 * the table, and deleting a run cascades its event rows with it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { TargetStepEvent } from '@/harness';
import {
  LiveRunSessionRecordSchema,
  LiveRunStepEventSchema,
  type AppendLiveRunEvents,
  type LiveRunSessionRecord,
  type LiveRunSessionStore,
  type NewLiveRunSession,
} from '@/runs/live-run-store';

const RUNS = 'live_runs';
const EVENTS = 'live_run_events';
const RUN_COLS =
  'run_id, user_id, category, kind, model, client, target, started_at, expires_at, finished_at';

/** Zod over a run row. A row read back from Postgres is external input. */
const RunRowSchema = z.object({
  run_id: z.string().min(1),
  user_id: z.string().min(1),
  category: z.string(),
  kind: z.string(),
  model: z.string().nullable(),
  client: z.string().nullable(),
  target: z.string().min(1),
  started_at: z.string().min(1),
  expires_at: z.string().min(1),
  finished_at: z.string().nullable(),
});

const EventRowSchema = z.object({ idx: z.number().int().min(0), event: LiveRunStepEventSchema });

export class SupabaseLiveRunSessionStore implements LiveRunSessionStore {
  constructor(private readonly client: SupabaseClient) {}

  async create(session: NewLiveRunSession): Promise<void> {
    const { error } = await this.client.from(RUNS).insert({
      run_id: session.runId,
      user_id: session.userId,
      category: session.category,
      kind: session.kind,
      model: session.model,
      client: session.client,
      target: session.target,
      started_at: session.startedAt,
      expires_at: session.expiresAt,
      finished_at: null,
    });
    if (error) throw new Error(`live run create failed: ${error.message}`);
    await this.writeEvents(session.runId, 0, session.events);
  }

  async find(runId: string): Promise<LiveRunSessionRecord | null> {
    const run = await this.client.from(RUNS).select(RUN_COLS).eq('run_id', runId).maybeSingle();
    if (run.error) throw new Error(`live run lookup failed: ${run.error.message}`);
    if (!run.data) return null;
    const row = RunRowSchema.parse(run.data);

    const events = await this.client
      .from(EVENTS)
      .select('idx, event')
      .eq('run_id', runId)
      .order('idx', { ascending: true });
    if (events.error) throw new Error(`live run steps lookup failed: ${events.error.message}`);

    // Validated as ONE record, so a run row and its steps are accepted or
    // refused together rather than half-trusted.
    const parsed = LiveRunSessionRecordSchema.parse({
      runId: row.run_id,
      userId: row.user_id,
      category: row.category,
      kind: row.kind,
      model: row.model,
      client: row.client,
      target: row.target,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      finishedAt: row.finished_at,
      events: (events.data ?? []).map((e) => EventRowSchema.parse(e).event),
    });
    return parsed as LiveRunSessionRecord;
  }

  async appendEvents(input: AppendLiveRunEvents): Promise<void> {
    await this.writeEvents(input.runId, input.from, input.events);
    if (input.client === undefined) return;
    const { error } = await this.client
      .from(RUNS)
      .update({ client: input.client })
      .eq('run_id', input.runId);
    if (error) throw new Error(`live run client update failed: ${error.message}`);
  }

  async finish(runId: string, finishedAt: Date): Promise<boolean> {
    const { data, error } = await this.client
      .from(RUNS)
      .update({ finished_at: finishedAt.toISOString() })
      .eq('run_id', runId)
      .is('finished_at', null)
      .select('run_id');
    if (error) throw new Error(`live run finish failed: ${error.message}`);
    return (data ?? []).length === 1;
  }

  async sweepExpired(now: Date): Promise<number> {
    const { data, error } = await this.client
      .from(RUNS)
      .delete()
      .lte('expires_at', now.toISOString())
      .select('run_id');
    if (error) throw new Error(`live run sweep failed: ${error.message}`);
    const swept = data ?? [];
    // The migration cascades event rows with their run; this mirrors it for the
    // adapter's own sake so a test double does not have to model foreign keys.
    for (const row of swept) {
      const runId = z.object({ run_id: z.string() }).parse(row).run_id;
      const dropped = await this.client.from(EVENTS).delete().eq('run_id', runId).select('idx');
      if (dropped.error) throw new Error(`live run sweep failed: ${dropped.error.message}`);
    }
    return swept.length;
  }

  private async writeEvents(
    runId: string,
    from: number,
    events: readonly TargetStepEvent[],
  ): Promise<void> {
    if (events.length === 0) return;
    const { error } = await this.client.from(EVENTS).upsert(
      events.map((event, offset) => ({ run_id: runId, idx: from + offset, event })),
      { onConflict: 'run_id,idx' },
    );
    if (error) throw new Error(`live run steps append failed: ${error.message}`);
  }
}
