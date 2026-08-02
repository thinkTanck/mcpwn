/**
 * Module 4 — resolving the LIVE detector from environment configuration.
 *
 * This is the seam between "the detector is a pure function over an injected
 * port" and "there is a real judge behind it". It is also the ONLY consumer of
 * `JUDGE_BASE_URL` and `JUDGE_API_KEY`: before this existed, `getJudgeConfig()`
 * validated those two variables and then `detect()` read neither, so a run could
 * fail on credentials it went on to discard.
 *
 * ABSENCE IS A FIRST-CLASS STATE. With no judge credential, this returns `null`
 * rather than throwing. An unconfigured judge means live detection is
 * unavailable — something the app states plainly — and the sample-playback path,
 * which needs no credential at all, must keep working. A crash on a public route
 * because an operator has not supplied a key is a worse failure than a clear
 * "not available" message.
 *
 * A HALF-configured judge is different, and is a real error: a key set without a
 * base URL or without a model is a deployment mistake that will otherwise
 * surface as a confusing 4xx on the first live run. That throws a typed
 * `ConfigError` naming the missing variable and never its value — the same shape
 * `getSupabaseConfig()` uses, for the same reason.
 *
 * The judge is OPERATOR-PROVIDED AND LOCKED (ADR-0007). Nothing here reads a
 * user-supplied model, key or endpoint, because the measured accuracy only holds
 * for the validated judge configuration.
 */
import { getJudgeConfig } from '@/config/env';
import type { Trace, Verdict } from '@/contract';
import { detect } from './index';
import { createAnthropicJudge, type FetchLike } from './anthropic-judge';

type Env = Record<string, string | undefined>;

/**
 * A detector bound to a real judge: observable trace + task goal in, `Verdict`
 * out. It never receives `GroundTruth` — that is the leakage barrier, and it is
 * enforced by this signature having nowhere to put a label.
 */
export type LiveDetector = (trace: Trace, taskGoal: string) => Promise<Verdict>;

export interface ResolveLiveDetectorOptions {
  /** Environment to read. Defaults to `process.env`. */
  env?: Env;
  /** Injected `fetch`, so units and gated tests can drive this without network. */
  fetchImpl?: FetchLike;
  /** Injected delay, so retry backoff is instant in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-request deadline in ms, passed through to the adapter. */
  timeoutMs?: number;
  /** Total attempts per request, passed through to the adapter. */
  maxAttempts?: number;
}

/**
 * Resolve the live detector, or `null` when no judge credential is configured.
 *
 * Presence is keyed on a non-blank `JUDGE_API_KEY` — the credential is the thing
 * an operator either has or does not. Once it IS set, the whole judge
 * configuration must validate.
 */
export function resolveLiveDetector(options: ResolveLiveDetectorOptions = {}): LiveDetector | null {
  const env = options.env ?? process.env;
  if (!env.JUDGE_API_KEY?.trim()) return null; // judge unconfigured → live detection off

  const config = getJudgeConfig(env);
  const judge = createAnthropicJudge({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
  });

  // `judgeConfig` is passed explicitly rather than left to `detect()`'s
  // `getJudgeConfig()` default, so the model and temperature that reach the wire
  // are the ones resolved from THIS env — the same object the adapter was built
  // from. Two independent reads of process.env could otherwise drift apart in a
  // test or a request that supplies its own environment.
  return (trace: Trace, taskGoal: string) =>
    detect(trace, taskGoal, {
      judge,
      judgeConfig: { model: config.model, temperature: config.temperature },
    });
}
