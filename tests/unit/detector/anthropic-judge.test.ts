import {
  createAnthropicJudge,
  JudgeAdapterError,
  ANTHROPIC_VERSION,
} from '@/detector/anthropic-judge';
import type { JudgeRequest } from '@/detector';

/**
 * The HTTP `JudgeModelPort` adapter — Anthropic Messages API.
 *
 * NO NETWORK. `fetch` is injected, so every case here is deterministic and the
 * suite runs credential-free. The key used throughout is a fake.
 */

const KEY = 'sk-ant-test-not-a-real-key';

const REQUEST: JudgeRequest = {
  system: 'FIXED RUBRIC — never interpolates trace content.',
  data: '<untrusted_trace>\n{"taskGoal":"g"}\n</untrusted_trace>',
  model: 'claude-haiku-4-5',
  temperature: 0,
};

/** A well-formed Anthropic Messages response carrying `text`. */
function ok(text: string): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_01',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function body(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.[name];
}

describe('createAnthropicJudge — request shape', () => {
  it('POSTs to {baseUrl}/v1/messages with the API key and version headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(ok('{}'));
      },
    });

    await judge.complete(REQUEST);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(headerOf(calls[0]!.init, 'x-api-key')).toBe(KEY);
    expect(headerOf(calls[0]!.init, 'anthropic-version')).toBe(ANTHROPIC_VERSION);
    expect(headerOf(calls[0]!.init, 'content-type')).toBe('application/json');
  });

  it('normalizes a baseUrl that carries a trailing slash or path', async () => {
    const urls: string[] = [];
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com/',
      apiKey: KEY,
      fetchImpl: (url) => {
        urls.push(url);
        return Promise.resolve(ok('{}'));
      },
    });

    await judge.complete(REQUEST);

    expect(urls[0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('maps system to the system param and data to ONE user message', async () => {
    let sent: Record<string, unknown> = {};
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: (_url, init) => {
        sent = body(init);
        return Promise.resolve(ok('{}'));
      },
    });

    await judge.complete(REQUEST);

    expect(sent.system).toBe(REQUEST.system);
    expect(sent.messages).toEqual([{ role: 'user', content: REQUEST.data }]);
  });

  it('pins model and temperature from the request (both originate in getJudgeConfig)', async () => {
    let sent: Record<string, unknown> = {};
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: (_url, init) => {
        sent = body(init);
        return Promise.resolve(ok('{}'));
      },
    });

    await judge.complete({ ...REQUEST, model: 'claude-haiku-4-5', temperature: 0.2 });

    expect(sent.model).toBe('claude-haiku-4-5');
    expect(sent.temperature).toBe(0.2);
    expect(sent.max_tokens).toEqual(expect.any(Number));
  });

  it('never hardcodes a key — the configured key is the only one sent', async () => {
    const seen: Array<string | undefined> = [];
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'another-fake-key',
      fetchImpl: (_url, init) => {
        seen.push(headerOf(init, 'x-api-key'));
        return Promise.resolve(ok('{}'));
      },
    });

    await judge.complete(REQUEST);

    expect(seen).toEqual(['another-fake-key']);
  });
});

describe('createAnthropicJudge — response handling', () => {
  it("returns the model's raw text", async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: () => Promise.resolve(ok('{"compromised":true}')),
    });

    await expect(judge.complete(REQUEST)).resolves.toBe('{"compromised":true}');
  });

  it('concatenates multiple text blocks in order', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'msg_01',
              type: 'message',
              role: 'assistant',
              model: 'claude-haiku-4-5',
              content: [
                { type: 'text', text: '{"a":' },
                { type: 'text', text: '1}' },
              ],
              stop_reason: 'end_turn',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
    });

    await expect(judge.complete(REQUEST)).resolves.toBe('{"a":1}');
  });

  it('ignores non-text blocks (thinking) and returns only the text', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'msg_01',
              type: 'message',
              role: 'assistant',
              model: 'claude-haiku-4-5',
              content: [
                { type: 'thinking', thinking: '' },
                { type: 'text', text: '{"ok":true}' },
              ],
              stop_reason: 'end_turn',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
    });

    await expect(judge.complete(REQUEST)).resolves.toBe('{"ok":true}');
  });

  it('throws MALFORMED_RESPONSE when the body is not JSON', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response('not json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    });

    await expect(judge.complete(REQUEST)).rejects.toMatchObject({
      name: 'JudgeAdapterError',
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('throws MALFORMED_RESPONSE when the envelope fails its Zod schema', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'msg_01', content: 'a string, not blocks' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    });

    await expect(judge.complete(REQUEST)).rejects.toBeInstanceOf(JudgeAdapterError);
  });

  it('throws EMPTY_RESPONSE when the message carries no text block', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'msg_01',
              type: 'message',
              role: 'assistant',
              model: 'claude-haiku-4-5',
              content: [],
              stop_reason: 'end_turn',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
    });

    await expect(judge.complete(REQUEST)).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });
});

describe('createAnthropicJudge — failures, retries and timeouts', () => {
  it('throws a non-retryable HTTP_ERROR on 400 and does NOT retry', async () => {
    let attempts = 0;
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      sleep: () => Promise.resolve(),
      fetchImpl: () => {
        attempts += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }),
        );
      },
    });

    await expect(judge.complete(REQUEST)).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      status: 400,
      retryable: false,
    });
    expect(attempts).toBe(1);
  });

  it('never puts the API key in an error message', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      sleep: () => Promise.resolve(),
      fetchImpl: () => Promise.resolve(new Response('nope', { status: 401 })),
    });

    const error = await judge.complete(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JudgeAdapterError);
    expect((error as Error).message).not.toContain(KEY);
  });

  it('retries a 429 and succeeds on a later attempt', async () => {
    let attempts = 0;
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      sleep: () => Promise.resolve(),
      fetchImpl: () => {
        attempts += 1;
        return Promise.resolve(
          attempts < 3 ? new Response('slow down', { status: 429 }) : ok('{}'),
        );
      },
    });

    await expect(judge.complete(REQUEST)).resolves.toBe('{}');
    expect(attempts).toBe(3);
  });

  it('retries a 5xx and gives up after maxAttempts', async () => {
    let attempts = 0;
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      maxAttempts: 2,
      sleep: () => Promise.resolve(),
      fetchImpl: () => {
        attempts += 1;
        return Promise.resolve(new Response('overloaded', { status: 529 }));
      },
    });

    await expect(judge.complete(REQUEST)).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      status: 529,
      retryable: true,
    });
    expect(attempts).toBe(2);
  });

  it('backs off between retries with the injected sleep', async () => {
    const waits: number[] = [];
    let attempts = 0;
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      fetchImpl: () => {
        attempts += 1;
        return Promise.resolve(attempts < 3 ? new Response('', { status: 500 }) : ok('{}'));
      },
    });

    await judge.complete(REQUEST);

    expect(waits).toEqual([100, 200]);
  });

  it('wraps a transport rejection as a retryable CONNECTION_FAILED', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      maxAttempts: 1,
      sleep: () => Promise.resolve(),
      fetchImpl: () => Promise.reject(new TypeError('fetch failed')),
    });

    await expect(judge.complete(REQUEST)).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
      retryable: true,
    });
  });

  it('times out a request that never answers', async () => {
    const judge = createAnthropicJudge({
      baseUrl: 'https://api.anthropic.com',
      apiKey: KEY,
      timeoutMs: 10,
      maxAttempts: 1,
      sleep: () => Promise.resolve(),
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    });

    await expect(judge.complete(REQUEST)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
