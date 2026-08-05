/**
 * Supabase-backed `RunTokenStore` — the durable half of the per-run connection
 * credential (ADR-0006).
 *
 * The port and all of the reasoning live in `./run-token.ts`; this file is only
 * the adapter that lands it on `public.run_tokens`
 * (`supabase/migrations/0002_run_tokens.sql`). Two things about it are worth
 * stating here, because they are easy to get wrong in an adapter.
 *
 * ── STILL NO PLAINTEXT ──
 *
 * The row carries `verifier_hash` and never the verifier. That is a property of
 * the record this adapter is handed, not something it does: `issueRunToken`
 * returns the plaintext separately, exactly once, and there is no field on
 * `RunTokenRecord` that could carry it here. This adapter writes the record's
 * fields and adds nothing.
 *
 * ── EXPIRY IS ENFORCED IN `verifyRunToken`, NOT IN THIS QUERY ──
 *
 * `findBySelector` returns the row as stored, INCLUDING an ended or expired one,
 * and that is deliberate. `verifyRunToken` already refuses on both axes — a
 * stamped `ended_at` is final, and `now >= expires_at` is refused against an
 * injected clock — so a dead row cannot be accepted by the only code that decides
 * anything. Adding a second predicate here would put the decision in two places
 * running on two clocks, and it would cost the incident trail: `RUN_ENDED` and
 * `EXPIRED` would collapse into `UNKNOWN`, and we would lose the ability to tell
 * "the run finished" from "someone is guessing selectors" in our own logs.
 *
 * What this adapter adds instead is {@link SupabaseRunTokenStore.sweepExpired},
 * which DELETES rows no verification could ever accept. That is hygiene: it
 * bounds the table and shortens the life of even a digest. Correctness does not
 * depend on it running, and a swept row and an expired row are refused alike.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  RUN_TOKEN_HASH_ALGORITHM,
  type RunTokenRecord,
  type RunTokenStore,
} from '@/runs/run-token';

const TABLE = 'run_tokens';
const COLS = 'selector, verifier_hash, algorithm, run_id, user_id, issued_at, expires_at, ended_at';

/**
 * Zod over a row read back from Postgres. The shape is ours by convention, not by
 * guarantee, and a row whose `algorithm` is something we do not hash with must
 * NOT be quietly compared against a sha256 digest.
 */
const RowSchema = z.object({
  selector: z.string().min(1),
  verifier_hash: z.string().min(1),
  algorithm: z.literal(RUN_TOKEN_HASH_ALGORITHM),
  run_id: z.string().min(1),
  user_id: z.string().min(1),
  issued_at: z.string().min(1),
  expires_at: z.string().min(1),
  ended_at: z.string().nullable(),
});

function toRecord(row: unknown): RunTokenRecord {
  const parsed = RowSchema.parse(row);
  return {
    selector: parsed.selector,
    verifierHash: parsed.verifier_hash,
    algorithm: parsed.algorithm,
    runId: parsed.run_id,
    userId: parsed.user_id,
    issuedAt: parsed.issued_at,
    expiresAt: parsed.expires_at,
    endedAt: parsed.ended_at,
  };
}

export class SupabaseRunTokenStore implements RunTokenStore {
  constructor(private readonly client: SupabaseClient) {}

  async save(record: RunTokenRecord): Promise<void> {
    const { error } = await this.client.from(TABLE).insert({
      selector: record.selector,
      verifier_hash: record.verifierHash,
      algorithm: record.algorithm,
      run_id: record.runId,
      user_id: record.userId,
      issued_at: record.issuedAt,
      expires_at: record.expiresAt,
      ended_at: record.endedAt,
    });
    if (error) throw new Error(`run token save failed: ${error.message}`);
  }

  async findBySelector(selector: string): Promise<RunTokenRecord | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select(COLS)
      .eq('selector', selector)
      .maybeSingle();
    if (error) throw new Error(`run token lookup failed: ${error.message}`);
    return data ? toRecord(data) : null;
  }

  async endRun(runId: string, endedAt: Date): Promise<void> {
    // `is('ended_at', null)` is the same rule the in-memory adapter states: a run
    // ends once, and re-stamping would push the revocation later, which is the
    // wrong direction for a control whose job is to close the window.
    const { error } = await this.client
      .from(TABLE)
      .update({ ended_at: endedAt.toISOString() })
      .eq('run_id', runId)
      .is('ended_at', null);
    if (error) throw new Error(`run token revoke failed: ${error.message}`);
  }

  /** Delete rows past their wall clock. Hygiene; see the header. */
  async sweepExpired(now: Date): Promise<number> {
    const { data, error } = await this.client
      .from(TABLE)
      .delete()
      .lte('expires_at', now.toISOString())
      .select('selector');
    if (error) throw new Error(`run token sweep failed: ${error.message}`);
    return (data ?? []).length;
  }
}
