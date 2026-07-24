import { getRunRepository } from '@/data/run-repository.factory';
import { InMemoryRunRepository } from '@/data/run-repository';
import { SupabaseRunRepository } from '@/data/run-repository.supabase';
import { createServerSupabase } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));

describe('getRunRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('returns the in-memory adapter when auth is not configured', async () => {
    expect(await getRunRepository()).toBeInstanceOf(InMemoryRunRepository);
  });

  it('returns the Supabase adapter (RLS) when auth is configured', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    vi.mocked(createServerSupabase).mockResolvedValue({ from: () => ({}) } as never);
    expect(await getRunRepository()).toBeInstanceOf(SupabaseRunRepository);
  });
});
