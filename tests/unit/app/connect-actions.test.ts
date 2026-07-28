import { launchLiveRun } from '@/app/(hud)/connect/actions';
import { getUser } from '@/lib/auth/user';
import { getRunRepository } from '@/data/run-repository.factory';
import { InMemoryRunRepository } from '@/data/run-repository';

vi.mock('@/lib/auth/user', () => ({ getUser: vi.fn() }));
vi.mock('@/data/run-repository.factory', () => ({ getRunRepository: vi.fn() }));

/**
 * The `/connect` server action. It is deliberately thin: it resolves the real
 * ports and delegates every decision to `startLiveRun`. What is asserted here is
 * that the wiring is honest -- a signed-out caller is refused, and a signed-in
 * caller is refused for the RIGHT reason (the LOCKED validated judge is not
 * connected) rather than being handed a fabricated result.
 */

describe('launchLiveRun server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRunRepository).mockResolvedValue(new InMemoryRunRepository());
  });

  const request = {
    endpoint: 'https://agent.example/mcp',
    apiKey: 'sk-secret',
    categories: ['ASI01'],
  };

  it('refuses a signed-out caller', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(launchLiveRun(request)).resolves.toMatchObject({
      ok: false,
      code: 'NOT_SIGNED_IN',
    });
  });

  it('refuses a signed-in caller while the validated judge is not connected', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as never);
    await expect(launchLiveRun(request)).resolves.toMatchObject({
      ok: false,
      code: 'JUDGE_UNAVAILABLE',
    });
  });

  it('validates the payload on the server, whatever the client sent', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as never);
    await expect(launchLiveRun({ endpoint: 'not-a-url' })).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_REQUEST',
    });
  });
});
