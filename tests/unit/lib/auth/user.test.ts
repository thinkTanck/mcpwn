import { getUser, requireUser } from '@/lib/auth/user';
import { createServerSupabase } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const withUser = (user: unknown) =>
  vi.mocked(createServerSupabase).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
  } as never);

describe('getUser / requireUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getUser: null when auth is not configured', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue(null);
    expect(await getUser()).toBeNull();
  });

  it('getUser: returns the signed-in user', async () => {
    withUser({ id: 'u1', email: 'a@b.com' });
    expect((await getUser())?.id).toBe('u1');
  });

  it('requireUser: redirects to /sign-in?next when signed out', async () => {
    withUser(null);
    await expect(requireUser('/account')).rejects.toThrow('REDIRECT:/sign-in?next=%2Faccount');
  });

  it('requireUser: returns the user when signed in', async () => {
    withUser({ id: 'u1' });
    expect((await requireUser())?.id).toBe('u1');
  });
});
