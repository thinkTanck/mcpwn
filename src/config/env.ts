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
