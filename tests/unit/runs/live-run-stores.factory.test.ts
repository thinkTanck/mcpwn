import { createAdminSupabase } from '@/lib/supabase/server';
import { InMemoryLiveRunSessionStore } from '@/runs/live-run-store';
import { SupabaseLiveRunSessionStore } from '@/runs/live-run-store.supabase';
import {
  getLiveRunSessionStore,
  getRunTokenStore,
  resetOfflineLiveRunStores,
} from '@/runs/live-run-stores.factory';
import { InMemoryRunTokenStore, issueRunToken } from '@/runs/run-token';
import { SupabaseRunTokenStore } from '@/runs/run-token.supabase';

vi.mock('@/lib/supabase/server', () => ({ createAdminSupabase: vi.fn() }));

describe('the live-run stores are picked the way every other store is picked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOfflineLiveRunStores();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('returns the in-memory adapters when Supabase is not configured', () => {
    expect(getRunTokenStore()).toBeInstanceOf(InMemoryRunTokenStore);
    expect(getLiveRunSessionStore()).toBeInstanceOf(InMemoryLiveRunSessionStore);
  });

  it('returns the durable adapters when Supabase is configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    vi.mocked(createAdminSupabase).mockReturnValue({ from: () => ({}) } as never);

    expect(getRunTokenStore()).toBeInstanceOf(SupabaseRunTokenStore);
    expect(getLiveRunSessionStore()).toBeInstanceOf(SupabaseLiveRunSessionStore);
  });

  it('reaches these tables through the SERVICE-ROLE client, because they have no policies', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    vi.mocked(createAdminSupabase).mockReturnValue({ from: () => ({}) } as never);

    getRunTokenStore();
    getLiveRunSessionStore();

    expect(createAdminSupabase).toHaveBeenCalledTimes(2);
  });

  it('falls back to in-memory when the admin client cannot be built', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    vi.mocked(createAdminSupabase).mockReturnValue(null as never);

    expect(getRunTokenStore()).toBeInstanceOf(InMemoryRunTokenStore);
    expect(getLiveRunSessionStore()).toBeInstanceOf(InMemoryLiveRunSessionStore);
  });
});

/**
 * The offline adapters keep their state in the process, so there has to be ONE of
 * each. A fresh instance per call would be a store that forgets every write the
 * moment the caller returns, which is not an adapter at all.
 */
describe('offline, there is ONE of each in-memory adapter per process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOfflineLiveRunStores();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('hands back the same token store every time', () => {
    expect(getRunTokenStore()).toBe(getRunTokenStore());
  });

  it('hands back the same open-run registry every time', () => {
    expect(getLiveRunSessionStore()).toBe(getLiveRunSessionStore());
  });

  it('finds a token one call saved when another call looks it up', async () => {
    const { record } = issueRunToken({ runId: 'run-1', userId: 'user-1' });
    await getRunTokenStore().save(record);

    await expect(getRunTokenStore().findBySelector(record.selector)).resolves.toEqual(record);
  });

  it('finds a run one call created when another call resolves it', async () => {
    await getLiveRunSessionStore().create({
      runId: 'run-1',
      userId: 'user-1',
      category: 'ASI01',
      kind: 'malicious',
      model: null,
      client: null,
      target: '/api/mcp',
      startedAt: '2026-08-05T10:00:00.000Z',
      expiresAt: '2026-08-05T11:00:00.000Z',
      events: [],
    });

    await expect(getLiveRunSessionStore().find('run-1')).resolves.toMatchObject({
      runId: 'run-1',
      userId: 'user-1',
    });
  });

  it('forgets everything once the test seam clears it', async () => {
    const { record } = issueRunToken({ runId: 'run-1', userId: 'user-1' });
    await getRunTokenStore().save(record);
    resetOfflineLiveRunStores();

    await expect(getRunTokenStore().findBySelector(record.selector)).resolves.toBeNull();
  });
});

/**
 * The durable adapters hold no state of their own — the state is in Postgres — so
 * they are built per call, exactly as `getRunRepository()` builds its own. That
 * is what lets a deployment that gains (or loses) Supabase pick the right store
 * without a restart.
 */
describe('the durable adapters are built per call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOfflineLiveRunStores();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    vi.mocked(createAdminSupabase).mockReturnValue({ from: () => ({}) } as never);
  });

  it('builds a fresh token store each time', () => {
    expect(getRunTokenStore()).not.toBe(getRunTokenStore());
  });

  it('builds a fresh open-run registry each time', () => {
    expect(getLiveRunSessionStore()).not.toBe(getLiveRunSessionStore());
  });
});
