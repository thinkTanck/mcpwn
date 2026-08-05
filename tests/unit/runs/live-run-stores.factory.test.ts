import { createAdminSupabase } from '@/lib/supabase/server';
import { InMemoryLiveRunSessionStore } from '@/runs/live-run-store';
import { SupabaseLiveRunSessionStore } from '@/runs/live-run-store.supabase';
import { getLiveRunSessionStore, getRunTokenStore } from '@/runs/live-run-stores.factory';
import { InMemoryRunTokenStore } from '@/runs/run-token';
import { SupabaseRunTokenStore } from '@/runs/run-token.supabase';

vi.mock('@/lib/supabase/server', () => ({ createAdminSupabase: vi.fn() }));

describe('the live-run stores are picked the way every other store is picked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
