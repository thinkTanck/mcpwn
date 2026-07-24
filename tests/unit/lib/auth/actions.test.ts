import { sendMagicLink } from '@/lib/auth/actions';
import { createServerSupabase } from '@/lib/supabase/server';

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => (k === 'host' ? 'mcpwn.test' : k === 'x-forwarded-proto' ? 'https' : null),
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));

const mockClient = (otp: ReturnType<typeof vi.fn>) =>
  vi.mocked(createServerSupabase).mockResolvedValue({
    auth: { signInWithOtp: otp },
  } as never);

describe('sendMagicLink (magic-link server action)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is inert (ok:false) when auth is not configured', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue(null);
    const res = await sendMagicLink('a@b.com');
    expect(res.ok).toBe(false);
  });

  it('emails a one-time link that returns to /auth/callback', async () => {
    const otp = vi.fn().mockResolvedValue({ error: null });
    mockClient(otp);
    const res = await sendMagicLink('a@b.com');
    expect(res).toEqual({ ok: true });
    expect(otp).toHaveBeenCalledWith({
      email: 'a@b.com',
      options: { emailRedirectTo: 'https://mcpwn.test/auth/callback' },
    });
  });

  it('surfaces the provider error without leaving the page', async () => {
    const otp = vi.fn().mockResolvedValue({ error: { message: 'rate limited' } });
    mockClient(otp);
    expect(await sendMagicLink('a@b.com')).toEqual({ ok: false, error: 'rate limited' });
  });
});
