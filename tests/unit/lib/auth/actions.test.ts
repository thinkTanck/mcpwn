import { requestEmailCode, verifyEmailCode } from '@/lib/auth/actions';
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => (k === 'host' ? 'mcpwn.test' : k === 'x-forwarded-proto' ? 'https' : null),
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));

const mockOtp = (otp: ReturnType<typeof vi.fn>) =>
  vi.mocked(createServerSupabase).mockResolvedValue({ auth: { signInWithOtp: otp } } as never);
const mockVerify = (verifyOtp: ReturnType<typeof vi.fn>) =>
  vi.mocked(createServerSupabase).mockResolvedValue({ auth: { verifyOtp } } as never);

describe('requestEmailCode (email OTP request)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is inert (ok:false) when auth is not configured', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue(null);
    expect((await requestEmailCode('a@b.com')).ok).toBe(false);
  });

  it('sends a code via signInWithOtp (no emailRedirectTo)', async () => {
    const otp = vi.fn().mockResolvedValue({ error: null });
    mockOtp(otp);
    expect(await requestEmailCode('a@b.com')).toEqual({ ok: true });
    expect(otp).toHaveBeenCalledWith({ email: 'a@b.com', options: { shouldCreateUser: true } });
  });

  it('surfaces the provider error', async () => {
    const otp = vi.fn().mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    mockOtp(otp);
    expect(await requestEmailCode('a@b.com')).toEqual({
      ok: false,
      error: 'email rate limit exceeded',
    });
  });
});

describe('verifyEmailCode (email OTP verify)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is inert (ok:false) when auth is not configured', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue(null);
    expect((await verifyEmailCode('a@b.com', '123456')).ok).toBe(false);
  });

  it('verifies with type email and redirects to a safe next (cookies set first)', async () => {
    const order: string[] = [];
    const verifyOtp = vi.fn(async () => {
      order.push('verify');
      return { error: null };
    });
    vi.mocked(redirect).mockImplementation(() => {
      order.push('redirect');
      return undefined as never;
    });
    mockVerify(verifyOtp);
    await verifyEmailCode('a@b.com', '123456', '/leaderboard');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'email' });
    expect(redirect).toHaveBeenCalledWith('/leaderboard');
    expect(order).toEqual(['verify', 'redirect']);
  });

  it('falls back to type signup for a new-account code', async () => {
    const verifyOtp = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'otp_expired' } })
      .mockResolvedValueOnce({ error: null });
    mockVerify(verifyOtp);
    await verifyEmailCode('new@b.com', '654321');
    expect(verifyOtp).toHaveBeenNthCalledWith(2, {
      email: 'new@b.com',
      token: '654321',
      type: 'signup',
    });
    expect(redirect).toHaveBeenCalledWith('/account');
  });

  it('returns a typed error and does not redirect when both types fail', async () => {
    const verifyOtp = vi
      .fn()
      .mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    mockVerify(verifyOtp);
    expect(await verifyEmailCode('a@b.com', '000000')).toEqual({
      ok: false,
      error: 'Token has expired or is invalid',
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['//evil.com', '/account'],
    ['https://evil.com', '/account'],
    ['javascript:alert(1)', '/account'],
    ['/leaderboard', '/leaderboard'],
    [undefined, '/account'],
  ])('sanitizes next=%s to %s', async (next, expected) => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    mockVerify(verifyOtp);
    await verifyEmailCode('a@b.com', '123456', next as string | undefined);
    expect(redirect).toHaveBeenCalledWith(expected);
  });
});
