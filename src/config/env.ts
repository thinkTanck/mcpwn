import { z } from 'zod';

/**
 * Env-only configuration (12-Factor III), split into an offline-safe CORE that
 * is validated fail-fast at load, and DEFERRED adapter creds (persistence /
 * JudgeModelPort / McpTargetPort) that are validated LAZILY — only when their
 * accessor is invoked (i.e. at adapter construction). The offline app boots with
 * none of the deferred creds set.
 */

type Env = Record<string, string | undefined>;

/**
 * Thrown when environment configuration is invalid or missing. Secret-safe: the
 * message names the offending variables but NEVER echoes their values.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Build a secret-safe error naming the offending vars — values are never included. */
function toConfigError(error: z.ZodError, context: string): ConfigError {
  const vars = [...new Set(error.issues.map((issue) => String(issue.path[0])))];
  return new ConfigError(`${context}: invalid or missing ${vars.join(', ')}`);
}

// Reusable URL validators. On failure they contribute only the field name to the
// error path — the (possibly secret) value is never surfaced.
const httpUrl = z.string().refine(
  (u) => {
    try {
      const { protocol } = new URL(u);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'must be an http(s) URL' },
);

const postgresUrl = z.string().refine(
  (u) => {
    try {
      const { protocol } = new URL(u);
      return protocol === 'postgres:' || protocol === 'postgresql:';
    } catch {
      return false;
    }
  },
  { message: 'must be a postgres:// connection string' },
);

// ── CORE (offline-safe; validated at load) ──
export const CoreEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PERSISTENCE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
});
export type CoreConfig = z.infer<typeof CoreEnvSchema>;

/** Validate the offline-safe core immediately (fail-fast). Reads process.env by
 *  default and never touches deferred adapter creds. */
export function loadCoreConfig(env: Env = process.env): CoreConfig {
  const result = CoreEnvSchema.safeParse(env);
  if (!result.success) throw toConfigError(result.error, 'Invalid core environment');
  return result.data;
}

// ── CORE: the canonical public origin (metadata base) ──
//
// Next.js resolves every RELATIVE metadata URL (Open Graph, canonical, images)
// against `metadata.metadataBase`. With no base set it falls back to
// `http://localhost:3000`, so a production page advertises localhost OG and
// canonical URLs. The origin is env-only (12-Factor III) with the canonical
// production host as the default, so a clean clone renders correct absolute URLs
// with zero configuration.

/** The canonical production origin, used when `NEXT_PUBLIC_SITE_URL` is unset. */
export const DEFAULT_SITE_ORIGIN = 'https://mcpwn.dev';

// Trimmed, gated as http(s), then collapsed to the bare origin — the same
// normalization the Supabase URL gets, for the same reason: a dashboard/CI paste
// can carry a trailing slash or a path, and either one corrupts every relative
// URL resolved against it.
const SiteUrlSchema = z
  .object({
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .transform((s) => s.trim())
      .pipe(httpUrl)
      .transform((u) => new URL(u).origin),
  })
  .transform((v) => v.NEXT_PUBLIC_SITE_URL);

/**
 * The canonical public origin as an absolute `https://host[:port]` string.
 * Falls back to {@link DEFAULT_SITE_ORIGIN} when `NEXT_PUBLIC_SITE_URL` is unset
 * or blank; a SET-but-invalid value is a real error, not a silent fallback.
 */
export function getSiteOrigin(env: Env = process.env): string {
  if (!env.NEXT_PUBLIC_SITE_URL?.trim()) return DEFAULT_SITE_ORIGIN;
  const result = SiteUrlSchema.safeParse(env);
  if (!result.success) throw toConfigError(result.error, 'Invalid site URL configuration');
  return result.data;
}

// ── LAZY: persistence (Neon Postgres behind the repository port) ──
const PostgresEnvSchema = z
  .object({ DATABASE_URL: postgresUrl })
  .transform((v) => ({ driver: 'postgres' as const, databaseUrl: v.DATABASE_URL }));

export type PersistenceConfig = { driver: 'memory' } | z.infer<typeof PostgresEnvSchema>;

/** Resolve persistence config. The memory driver never asks for DATABASE_URL;
 *  the postgres driver validates it here (only when this accessor is invoked). */
export function getPersistenceConfig(env: Env = process.env): PersistenceConfig {
  const { PERSISTENCE_DRIVER } = loadCoreConfig(env);
  if (PERSISTENCE_DRIVER === 'memory') return { driver: 'memory' };
  const result = PostgresEnvSchema.safeParse(env);
  if (!result.success) throw toConfigError(result.error, 'Invalid persistence configuration');
  return result.data;
}

// ── LAZY: Supabase Auth (gates live runs; OFFLINE-SAFE) ──
//
// Unlike the other deferred creds, absence is a first-class state: with no
// Supabase URL set, auth is INERT (the accessor returns null), so the app boots
// credential-free — sign-in stays in its honest preview and everything runs on
// the in-memory data source. When the URL IS set, the public pair is required and
// validated (a half-configured project is a real error, not silent inertness).
const SupabaseEnvSchema = z
  .object({
    // Trim then canonicalize to the bare origin. A dashboard paste can carry a
    // trailing slash, a path, or surrounding whitespace — none of which fail the
    // URL gate, but any of which corrupts supabase-js's `${url}/auth/v1/...`
    // concatenation into an unreachable host ("fetch failed" in prod). `.origin`
    // collapses all of that to exactly `https://host[:port]`. (It cannot repair a
    // wrong/truncated host — that stays a real, surfaced error.)
    NEXT_PUBLIC_SUPABASE_URL: z
      .string()
      .transform((s) => s.trim())
      .pipe(httpUrl)
      .transform((u) => new URL(u).origin),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1)),
  })
  .transform((v) => ({
    url: v.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: v.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }));
export type SupabaseConfig = z.infer<typeof SupabaseEnvSchema>;

/**
 * Public Supabase config (url + anon key) usable in browser AND server, or
 * `null` when auth is not configured (offline-safe). Presence is keyed on a
 * non-blank `NEXT_PUBLIC_SUPABASE_URL`; if that is set but the pair is
 * incomplete/invalid, a typed `ConfigError` is thrown (naming the vars, never
 * their values). The URL is normalized to its origin (see the schema).
 */
export function getSupabaseConfig(env: Env = process.env): SupabaseConfig | null {
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim()) return null; // unset/blank → auth inert
  const result = SupabaseEnvSchema.safeParse(env);
  if (!result.success) throw toConfigError(result.error, 'Invalid Supabase configuration');
  return result.data;
}

/** True when Supabase Auth is configured. Gate real auth behaviour on this. */
export function isAuthEnabled(env: Env = process.env): boolean {
  return getSupabaseConfig(env) !== null;
}

/**
 * True when GitHub OAuth should be OFFERED (the button is enabled). Kept behind
 * its own flag so the sign-in path doesn't block on the GitHub app creds: the
 * server action always exists, but the button only lights up once GitHub is
 * configured in Supabase and `NEXT_PUBLIC_GITHUB_OAUTH_ENABLED=true` is set.
 * Requires auth to be configured at all.
 */
export function isGithubOAuthEnabled(env: Env = process.env): boolean {
  return isAuthEnabled(env) && env.NEXT_PUBLIC_GITHUB_OAUTH_ENABLED === 'true';
}

/**
 * SERVER-ONLY: the Supabase service-role key (bypasses RLS). `null` when auth is
 * not configured; throws when auth IS configured but the key is missing. NEVER
 * call this from browser/client code — it must never reach the bundle.
 */
export function getSupabaseServiceRoleKey(env: Env = process.env): string | null {
  if (!getSupabaseConfig(env)) return null;
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new ConfigError('Invalid Supabase configuration: missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return key;
}

// ── Email OTP length — ONE source of truth for a number humans also read ──
//
// The Supabase project decides how many digits an emailed sign-in code has, and
// the dashboard permits 6 to 10. Nothing in the app can query that setting at
// runtime, so it is mirrored here as env-only config and EVERYTHING a human
// reads (the placeholder, the "N-digit code" copy, the length the form accepts)
// is DERIVED from this one value rather than restated next to it.
//
// This exists because the two drifted and shipped: the project emitted 8 while
// the UI said "6-digit code" and capped input at 6, silently truncating every
// real code to a prefix so no one could sign in. A mirrored value can still fall
// out of step with the dashboard, which is why the pairing is proven against the
// REAL project by the gated `tests/integration/otp-length.live.test.ts`.

/** The range Supabase's dashboard actually allows. */
export const EMAIL_OTP_LENGTH_BOUNDS = { min: 6, max: 10 } as const;

const EmailOtpLengthSchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(EMAIL_OTP_LENGTH_BOUNDS.min).max(EMAIL_OTP_LENGTH_BOUNDS.max));

/** Default when unset. MUST match the live project's Email OTP Length setting. */
const DEFAULT_EMAIL_OTP_LENGTH = 8;

/**
 * How many digits an emailed sign-in code has. Env-only
 * (`NEXT_PUBLIC_EMAIL_OTP_LENGTH`), so it can follow the dashboard without a code
 * change. Throws a typed `ConfigError` on an out-of-range or non-numeric value —
 * a wrong length breaks every sign-in, so it must fail loudly at the boundary
 * rather than quietly mis-render a placeholder.
 */
export function getEmailOtpLength(env: Env = process.env): number {
  const raw = env.NEXT_PUBLIC_EMAIL_OTP_LENGTH;
  if (raw === undefined) return DEFAULT_EMAIL_OTP_LENGTH;
  const result = EmailOtpLengthSchema.safeParse(raw);
  if (!result.success) {
    // The value is not secret, but keeping it out of the message keeps every
    // config error in this module uniformly value-free.
    throw new ConfigError(
      `Invalid NEXT_PUBLIC_EMAIL_OTP_LENGTH: expected an integer ` +
        `${EMAIL_OTP_LENGTH_BOUNDS.min}-${EMAIL_OTP_LENGTH_BOUNDS.max}.`,
    );
  }
  return result.data;
}

// ── LAZY: JudgeModelPort (blind LLM alignment-auditor) ──
const JudgeEnvSchema = z
  .object({
    JUDGE_MODEL: z.string().min(1),
    JUDGE_BASE_URL: httpUrl,
    JUDGE_API_KEY: z.string().min(1),
    JUDGE_TEMPERATURE: z.coerce.number().default(0),
  })
  .transform((v) => ({
    model: v.JUDGE_MODEL,
    baseUrl: v.JUDGE_BASE_URL,
    apiKey: v.JUDGE_API_KEY,
    temperature: v.JUDGE_TEMPERATURE,
  }));
export type JudgeConfig = z.infer<typeof JudgeEnvSchema>;

/** Resolve JudgeModelPort creds — validated only when this accessor is invoked. */
export function getJudgeConfig(env: Env = process.env): JudgeConfig {
  const result = JudgeEnvSchema.safeParse(env);
  if (!result.success) {
    throw toConfigError(result.error, 'Invalid judge (JudgeModelPort) configuration');
  }
  return result.data;
}

// ── LAZY: McpTargetPort (target MCP agent under test) ──
const McpEnvSchema = z
  .object({
    MCP_TARGET_URL: httpUrl,
    MCP_TARGET_TOKEN: z.string().min(1).optional(),
  })
  .transform((v) => ({ url: v.MCP_TARGET_URL, token: v.MCP_TARGET_TOKEN }));
export type McpConfig = z.infer<typeof McpEnvSchema>;

/** Resolve McpTargetPort creds — validated only when this accessor is invoked. */
export function getMcpConfig(env: Env = process.env): McpConfig {
  const result = McpEnvSchema.safeParse(env);
  if (!result.success) {
    throw toConfigError(result.error, 'Invalid MCP target (McpTargetPort) configuration');
  }
  return result.data;
}
