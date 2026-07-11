/**
 * Structured JSON logger.
 *
 * Emits exactly one JSON line per call — `{ level, msg, timestamp, ctx }` — via
 * an injectable sink, with an injectable clock so tests are deterministic.
 * Sensitive context values are redacted by key before serialization so secrets
 * never reach the log sink (12-factor / no-secret-leakage).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured context attached to a log line. */
export type LogContext = Record<string, unknown>;

/** The serialized shape of a single log line. */
export interface LogRecord {
  level: LogLevel;
  msg: string;
  timestamp: string;
  ctx: LogContext;
}

export interface LoggerOptions {
  /** Clock used for `timestamp`; defaults to the wall clock. */
  now?: () => Date;
  /** Destination for the serialized line; defaults to stdout via `console.log`. */
  sink?: (line: string) => void;
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
}

const REDACTED = '[REDACTED]';

/**
 * Case-insensitive match on keys that conventionally hold secrets. Covers
 * password, token, secret, apiKey / api_key, authorization, auth, and
 * credential(s).
 */
const SENSITIVE_KEY = /^(password|token|secret|api[_]?key|authorization|auth|credentials?)$/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Return a shallow copy of `ctx` with sensitive top-level values redacted. */
function redact(ctx: LogContext): LogContext {
  const out: LogContext = {};
  for (const [key, value] of Object.entries(ctx)) {
    out[key] = isSensitiveKey(key) ? REDACTED : value;
  }
  return out;
}

/** Create a logger bound to the given clock and sink. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const now = options.now ?? (() => new Date());
  const sink = options.sink ?? ((line: string) => console.log(line));

  const emit = (level: LogLevel, msg: string, ctx?: LogContext): void => {
    const record: LogRecord = {
      level,
      msg,
      timestamp: now().toISOString(),
      ctx: redact(ctx ?? {}),
    };
    sink(JSON.stringify(record));
  };

  return {
    debug: (msg, ctx) => emit('debug', msg, ctx),
    info: (msg, ctx) => emit('info', msg, ctx),
    warn: (msg, ctx) => emit('warn', msg, ctx),
    error: (msg, ctx) => emit('error', msg, ctx),
  };
}

/** Default logger instance using the wall clock and stdout sink. */
export const logger: Logger = createLogger();
