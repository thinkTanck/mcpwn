import { getAttack } from '@/attacks';
import { ConfigError } from '@/config/env';
import { resolveLiveDetector } from '@/detector/resolve';

/**
 * `resolveLiveDetector()` — the ONLY consumer of `JUDGE_BASE_URL` / `JUDGE_API_KEY`.
 *
 * Two behaviours matter equally. When the operator has supplied a judge
 * credential, this returns a `detect` bound to the real HTTP adapter. When they
 * have not, it returns `null` and does NOT throw: an unconfigured judge means
 * "live detection is unavailable", which the app states plainly, not a crash on
 * a route a signed-out visitor can reach.
 *
 * NO NETWORK: `fetch` is injected throughout, and the keys are fakes.
 */

const LIVE_ENV = {
  JUDGE_MODEL: 'claude-haiku-4-5',
  JUDGE_BASE_URL: 'https://api.anthropic.com',
  JUDGE_API_KEY: 'sk-ant-test-not-a-real-key',
  JUDGE_TEMPERATURE: '0',
};

/** A judge reply that satisfies `VerdictSchema` once `detect` assembles it. */
function judgeReply(stepId: string): Response {
  return new Response(
    JSON.stringify({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            compromised: true,
            category: 'ASI06',
            stepId,
            severity: 'High',
            rationale: 'The agent acted on a poisoned memory entry.',
            score: 0.9,
          }),
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('resolveLiveDetector — unconfigured (graceful fail-safe)', () => {
  it('returns null when no judge env is set at all', () => {
    expect(resolveLiveDetector({ env: {} })).toBeNull();
  });

  it('returns null when the API key is absent', () => {
    const env = { JUDGE_MODEL: LIVE_ENV.JUDGE_MODEL, JUDGE_BASE_URL: LIVE_ENV.JUDGE_BASE_URL };
    expect(resolveLiveDetector({ env })).toBeNull();
  });

  it('returns null when the API key is present but blank', () => {
    expect(resolveLiveDetector({ env: { ...LIVE_ENV, JUDGE_API_KEY: '   ' } })).toBeNull();
  });

  it('never throws when the judge is unconfigured', () => {
    expect(() => resolveLiveDetector({ env: {} })).not.toThrow();
  });
});

describe('resolveLiveDetector — half-configured is a real error', () => {
  it('throws ConfigError when a key is supplied without a base URL', () => {
    const env = { JUDGE_MODEL: LIVE_ENV.JUDGE_MODEL, JUDGE_API_KEY: LIVE_ENV.JUDGE_API_KEY };
    expect(() => resolveLiveDetector({ env })).toThrow(ConfigError);
  });

  it('throws ConfigError when a key is supplied without a model', () => {
    const env = { JUDGE_BASE_URL: LIVE_ENV.JUDGE_BASE_URL, JUDGE_API_KEY: LIVE_ENV.JUDGE_API_KEY };
    expect(() => resolveLiveDetector({ env })).toThrow(ConfigError);
  });

  it('names the offending variable without echoing the secret', () => {
    const env = { JUDGE_MODEL: LIVE_ENV.JUDGE_MODEL, JUDGE_API_KEY: LIVE_ENV.JUDGE_API_KEY };
    const error = (() => {
      try {
        resolveLiveDetector({ env });
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toContain('JUDGE_BASE_URL');
    expect(error?.message).not.toContain(LIVE_ENV.JUDGE_API_KEY);
  });
});

describe('resolveLiveDetector — configured', () => {
  it('returns a detect function when the judge env is complete', () => {
    expect(resolveLiveDetector({ env: LIVE_ENV })).toBeInstanceOf(Function);
  });

  it('judges a real trace through the live adapter and returns a Verdict', async () => {
    const { trace } = getAttack('ASI06').build('malicious');
    const { taskGoal } = getAttack('ASI06').scenario('malicious');
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    const detect = resolveLiveDetector({
      env: LIVE_ENV,
      fetchImpl: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(judgeReply(trace.steps[0]!.id));
      },
    });

    const verdict = await detect!(trace, taskGoal);

    expect(verdict.runId).toBe(trace.runId);
    expect(verdict.compromised).toBe(true);
    expect(verdict.stepId).toBe(trace.steps[0]!.id);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect((calls[0]!.init?.headers as Record<string, string>)['x-api-key']).toBe(
      LIVE_ENV.JUDGE_API_KEY,
    );
  });

  it('pins the configured model and temperature on the wire', async () => {
    const { trace } = getAttack('ASI01').build('malicious');
    let sent: Record<string, unknown> = {};

    const detect = resolveLiveDetector({
      env: { ...LIVE_ENV, JUDGE_TEMPERATURE: '0.1' },
      fetchImpl: (_url, init) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve(judgeReply(trace.steps[0]!.id));
      },
    });

    await detect!(trace, 'goal');

    expect(sent.model).toBe('claude-haiku-4-5');
    expect(sent.temperature).toBe(0.1);
  });

  it('closes L4 — the judge creds now have a consumer that actually reads them', async () => {
    const { trace } = getAttack('ASI02').build('benign');
    let sentToBase = '';

    const detect = resolveLiveDetector({
      env: { ...LIVE_ENV, JUDGE_BASE_URL: 'https://judge.example.test' },
      fetchImpl: (url) => {
        sentToBase = url;
        return Promise.resolve(judgeReply(trace.steps[0]!.id));
      },
    });

    await detect!(trace, 'goal');

    expect(sentToBase).toBe('https://judge.example.test/v1/messages');
  });
});
