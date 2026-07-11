import { GET, HealthResponseSchema } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('resolves to a Response with HTTP 200', async () => {
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  it('returns a JSON body of { status: "ok" } that satisfies the schema', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
    expect(() => HealthResponseSchema.parse(body)).not.toThrow();
    expect(HealthResponseSchema.parse(body)).toEqual({ status: 'ok' });
  });

  it('advertises a JSON content type', async () => {
    const res = await GET();
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('is offline-safe: works with no env and no network stubbing', async () => {
    // No env is set and no network is stubbed in this file; GET must just work.
    await expect(GET()).resolves.toBeInstanceOf(Response);
  });
});
