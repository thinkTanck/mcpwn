/**
 * A FAKE POSTGREST, backed by plain arrays.
 *
 * The durable adapters are the only code that speaks supabase-js, so testing
 * them needs something that answers the same query builder. This is that: a
 * handful of tables in memory, and the subset of the builder the adapters
 * actually use (`select` with an exact head count, `insert`, `upsert` with a
 * conflict target, `update`, `delete`, `eq` / `is` / `gte` / `lte`, `order`,
 * `limit`, `single` / `maybeSingle`, and awaiting the builder itself).
 *
 * WHAT IT IS FOR, PRECISELY. It is not a Postgres emulator and it does not claim
 * to be one — no RLS, no constraints, no types. It exists so a test can hold ONE
 * backing store and build TWO adapter instances over it, which is what an
 * instance restart looks like from the application's side: the process state is
 * gone, the database is not.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type FakeRow = Record<string, unknown>;

type Filter = (row: FakeRow) => boolean;

type Operation = 'select' | 'insert' | 'upsert' | 'update' | 'delete';

interface Outcome {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

/** The shared tables. One of these stands in for one database. */
export class FakeDatabase {
  private tables = new Map<string, FakeRow[]>();
  /** Set to a message to make every query fail, so error paths are testable. */
  failWith: string | null = null;

  /** The rows of a table, for assertions. Live, not a copy. */
  rows(table: string): FakeRow[] {
    let rows = this.tables.get(table);
    if (rows === undefined) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  /**
   * A client facade over these tables. Call it again for a SECOND client that
   * shares the same rows: two instances, one database.
   */
  client(): SupabaseClient {
    return {
      from: (table: string) => new FakeQuery(this, table),
    } as unknown as SupabaseClient;
  }
}

class FakeQuery implements PromiseLike<Outcome> {
  private op: Operation = 'select';
  private filters: Filter[] = [];
  private payload: FakeRow[] = [];
  private patch: FakeRow = {};
  private conflict: string[] = [];
  private wantsCount = false;
  private headOnly = false;
  private sort: { column: string; ascending: boolean } | null = null;
  private take: number | null = null;

  constructor(
    private readonly db: FakeDatabase,
    private readonly table: string,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    if (options?.count) this.wantsCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(value: FakeRow | FakeRow[]): this {
    this.op = 'insert';
    this.payload = Array.isArray(value) ? value : [value];
    return this;
  }

  upsert(value: FakeRow | FakeRow[], options?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.payload = Array.isArray(value) ? value : [value];
    this.conflict = (options?.onConflict ?? '').split(',').filter((c) => c.length > 0);
    return this;
  }

  update(patch: FakeRow): this {
    this.op = 'update';
    this.patch = patch;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => compare(row[column], value) >= 0);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push((row) => compare(row[column], value) <= 0);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sort = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number): this {
    this.take = count;
    return this;
  }

  async single(): Promise<Outcome> {
    const outcome = this.run();
    const rows = Array.isArray(outcome.data) ? outcome.data : [];
    if (outcome.error) return outcome;
    if (rows.length !== 1) return { data: null, count: null, error: { message: 'no rows' } };
    return { ...outcome, data: rows[0] };
  }

  async maybeSingle(): Promise<Outcome> {
    const outcome = this.run();
    const rows = Array.isArray(outcome.data) ? outcome.data : [];
    if (outcome.error) return outcome;
    return { ...outcome, data: rows[0] ?? null };
  }

  then<A = Outcome, B = never>(
    onFulfilled?: ((value: Outcome) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every((filter) => filter(row));
  }

  private run(): Outcome {
    if (this.db.failWith) return { data: null, count: null, error: { message: this.db.failWith } };
    const rows = this.db.rows(this.table);

    if (this.op === 'insert' || this.op === 'upsert') {
      const written: FakeRow[] = [];
      for (const incoming of this.payload) {
        const at =
          this.op === 'upsert' && this.conflict.length > 0
            ? rows.findIndex((row) => this.conflict.every((key) => row[key] === incoming[key]))
            : -1;
        if (at === -1) rows.push({ ...incoming });
        else rows[at] = { ...incoming };
        written.push({ ...incoming });
      }
      return { data: written, count: written.length, error: null };
    }

    if (this.op === 'update') {
      const touched: FakeRow[] = [];
      rows.forEach((row, index) => {
        if (!this.matches(row)) return;
        const next = { ...row, ...this.patch };
        rows[index] = next;
        touched.push(next);
      });
      return { data: touched, count: touched.length, error: null };
    }

    if (this.op === 'delete') {
      const removed = rows.filter((row) => this.matches(row));
      const kept = rows.filter((row) => !this.matches(row));
      rows.length = 0;
      rows.push(...kept);
      return { data: removed, count: removed.length, error: null };
    }

    let selected = rows.filter((row) => this.matches(row)).map((row) => ({ ...row }));
    if (this.sort) {
      const { column, ascending } = this.sort;
      selected = [...selected].sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1));
    }
    if (this.take !== null) selected = selected.slice(0, this.take);
    return {
      data: this.headOnly ? null : selected,
      count: this.wantsCount ? selected.length : null,
      error: null,
    };
  }
}

/** Order numbers numerically and everything else as text, like the columns we use. */
function compare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}
