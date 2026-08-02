/**
 * Module 4 — the HTTP `JudgeModelPort` adapter (Anthropic Messages API).
 *
 * This is the ONLY place the judge credential is read and the only place the
 * detector touches the network. `detect()` stays pure over an injected port; this
 * adapter turns one `JudgeRequest` into one `POST /v1/messages` and hands back the
 * model's RAW text for the detector to parse and Zod-validate into a `Verdict`.
 *
 * Contract kept deliberately narrow:
 *  - `system` carries the FIXED rubric; `data` carries the UNTRUSTED, delimited
 *    trace as a single user message. They are never concatenated here, so the
 *    injection boundary the detector establishes survives the wire format.
 *  - `model` and `temperature` come off the REQUEST, not off this adapter's
 *    config. Both originate in `getJudgeConfig()` and are pinned by `detect()`;
 *    reading them from the request keeps one source of truth instead of two that
 *    can silently disagree about which model produced a measured number.
 *  - Failures are typed (`JudgeAdapterError`). A raw `fetch` rejection, a non-200,
 *    or a body that fails its schema never escapes as an untyped crash.
 *  - The API key is assembled into a header here and interpolated into NOTHING.
 *    Error messages are built from the endpoint origin, the status and the
 *    method — never the credential.
 *
 * MODEL CONSTRAINT: `temperature` is sent on every request, because a pinned low
 * temperature is part of what makes a measured P/R reproducible. Anthropic removed
 * the sampling parameters on the Claude 4.7+ and 5 families, which reject
 * `temperature` with a 400. `JUDGE_MODEL` must therefore name a model that still
 * accepts it (`claude-haiku-4-5` is the intended cheap validated judge). A model
 * that does not surfaces as a loud, typed `HTTP_ERROR` quoting the API's own
 * message rather than a silently dropped determinism setting.
 */
import { z } from 'zod';
import type { JudgeModelPort, JudgeRequest } from './index';

/** The Anthropic API version this adapter is written against. */
export const ANTHROPIC_VERSION = '2023-06-01';

/** Normalized failure codes — callers branch on `.code`, never on message text. */
export type JudgeAdapterErrorCode =
  /** The request never reached the API (DNS/TLS/socket). */
  | 'CONNECTION_FAILED'
  /** The request exceeded its deadline. */
  | 'TIMEOUT'
  /** The API answered with a non-2xx status. */
  | 'HTTP_ERROR'
  /** The body was not JSON, or failed its Zod schema. */
  | 'MALFORMED_RESPONSE'
  /** The API answered 200 with no text content for the detector to parse. */
  | 'EMPTY_RESPONSE'
  /** The reply was cut off at the output cap, so the JSON is half-written. */
  | 'TRUNCATED_RESPONSE';

/** A typed judge-transport failure. `retryable` marks faults worth another attempt. */
export class JudgeAdapterError extends Error {
  readonly code: JudgeAdapterErrorCode;
  readonly retryable: boolean;
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;

  constructor(
    code: JudgeAdapterErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean; status?: number },
  ) {
    super(message, options);
    this.name = 'JudgeAdapterError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    if (options?.status !== undefined) this.status = options.status;
  }
}

/** The subset of `fetch` this adapter uses (injectable, so units never hit the network). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AnthropicJudgeOptions {
  /** API origin, e.g. `https://api.anthropic.com`. Normalized to its origin. */
  baseUrl: string;
  /** The judge credential. Sent as `x-api-key`, never logged, never interpolated. */
  apiKey: string;
  /** Output cap for one verdict. The judge emits a small JSON object. */
  maxTokens?: number;
  /** Per-request deadline in ms (default 60000 — a judged trace can be long). */
  timeoutMs?: number;
  /** Total attempts per request, including the first (default 3). */
  maxAttempts?: number;
  /** Backoff base in ms; attempt n waits `base * 2^(n-1)` (default 500). */
  baseDelayMs?: number;
  fetchImpl?: FetchLike;
  /** Injectable delay so backoff is instant and deterministic in tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = {
  maxTokens: 1024,
  timeoutMs: 60_000,
  maxAttempts: 3,
  baseDelayMs: 500,
} as const;

type Resolved = Required<AnthropicJudgeOptions>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collapse the configured base to a bare origin. A dashboard or `.env` paste can
 * carry a trailing slash or a path, either of which would produce a double slash
 * or a wrong path once `/v1/messages` is appended.
 */
function normalizeBase(baseUrl: string): string {
  return new URL(baseUrl.trim()).origin;
}

function resolveOptions(options: AnthropicJudgeOptions): Resolved {
  return {
    baseUrl: normalizeBase(options.baseUrl),
    apiKey: options.apiKey,
    maxTokens: options.maxTokens ?? DEFAULTS.maxTokens,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    maxAttempts: options.maxAttempts ?? DEFAULTS.maxAttempts,
    baseDelayMs: options.baseDelayMs ?? DEFAULTS.baseDelayMs,
    fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
    sleep: options.sleep ?? defaultSleep,
  };
}

/**
 * The response envelope, validated rather than trusted. Only the fields this
 * adapter reads are modelled; the loose objects keep the schema from breaking
 * when the API adds a field, while still proving `content` is a block array.
 */
const MessageBlockSchema = z.looseObject({ type: z.string() });
const MessageResponseSchema = z.looseObject({
  content: z.array(MessageBlockSchema),
  stop_reason: z.string().nullish(),
});

/** A text block, once the envelope has been validated. */
const TextBlockSchema = z.object({ type: z.literal('text'), text: z.string() });

/** Run `fn` under a deadline, converting an abort into a typed TIMEOUT. */
async function withDeadline<T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (cause) {
    if (timedOut) {
      throw new JudgeAdapterError('TIMEOUT', `The judge request timed out after ${timeoutMs}ms.`, {
        cause,
        retryable: true,
      });
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/** Retry a retryable fault with bounded exponential backoff. */
async function withRetry<T>(o: Resolved, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= o.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const retryable = error instanceof JudgeAdapterError && error.retryable;
      if (!retryable || attempt === o.maxAttempts) throw error;
      await o.sleep(o.baseDelayMs * 2 ** (attempt - 1));
    }
  }
  /* c8 ignore next -- unreachable: the loop either returns or throws. */
  throw last;
}

/** Non-2xx → typed error. 429 and 5xx are transient; everything else is not. */
function httpError(o: Resolved, status: number): JudgeAdapterError {
  return new JudgeAdapterError(
    'HTTP_ERROR',
    `The judge API at ${o.baseUrl} answered HTTP ${status}.`,
    { status, retryable: status === 429 || status >= 500 },
  );
}

/**
 * Build the `JudgeModelPort` HTTP adapter. Nothing is validated or dialled at
 * construction, so wiring one up is free; the first `complete` call is what
 * touches the network.
 */
export function createAnthropicJudge(options: AnthropicJudgeOptions): JudgeModelPort {
  const o = resolveOptions(options);
  const endpoint = `${o.baseUrl}/v1/messages`;

  async function exchange(req: JudgeRequest): Promise<string> {
    const payload = JSON.stringify({
      model: req.model,
      max_tokens: o.maxTokens,
      temperature: req.temperature,
      system: req.system,
      // ONE user message carrying the delimited untrusted block, exactly as the
      // detector assembled it. Never merged with `system`.
      messages: [{ role: 'user', content: req.data }],
    });

    const response = await withDeadline(o.timeoutMs, async (signal) => {
      try {
        return await o.fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': o.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: payload,
          signal,
        });
      } catch (cause) {
        if (signal.aborted) throw cause; // withDeadline turns this into TIMEOUT
        throw new JudgeAdapterError(
          'CONNECTION_FAILED',
          `Could not reach the judge API at ${o.baseUrl}.`,
          {
            cause,
            retryable: true,
          },
        );
      }
    });

    if (!response.ok) {
      // Release the error body before unwinding. A retryable 429 or 5xx sends us
      // straight back around the loop, and an unread body keeps its connection
      // held — a leak that only shows up under exactly the rate limiting the
      // retry exists to survive.
      await response.body?.cancel().catch(() => undefined);
      throw httpError(o, response.status);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (cause) {
      throw new JudgeAdapterError(
        'MALFORMED_RESPONSE',
        'The judge API did not return valid JSON.',
        {
          cause,
        },
      );
    }

    const envelope = MessageResponseSchema.safeParse(parsed);
    if (!envelope.success) {
      throw new JudgeAdapterError(
        'MALFORMED_RESPONSE',
        'The judge API response did not match the Messages API schema.',
      );
    }

    // Text blocks only, joined in order. A thinking block (or any future block
    // type) carries no verdict and is skipped rather than corrupting the JSON the
    // detector is about to parse.
    const text = envelope.data.content
      .map((block) => TextBlockSchema.safeParse(block))
      .filter((result) => result.success)
      .map((result) => result.data.text)
      .join('');

    if (text.length === 0) {
      throw new JudgeAdapterError(
        'EMPTY_RESPONSE',
        'The judge API returned a message with no text content.',
      );
    }

    // A reply cut off at the output cap is still well-formed text, so it would
    // reach `detect()` as a half-written JSON object and surface there as
    // "did not return valid JSON" — indistinguishable from a judge that cannot
    // follow its output contract, and fixed by something completely different
    // (raise maxTokens, not change the model or the rubric). Say which it is.
    if (envelope.data.stop_reason === 'max_tokens') {
      throw new JudgeAdapterError(
        'TRUNCATED_RESPONSE',
        `The judge reply was cut off at the ${o.maxTokens}-token output cap.`,
      );
    }
    return text;
  }

  return { complete: (req: JudgeRequest) => withRetry(o, () => exchange(req)) };
}
