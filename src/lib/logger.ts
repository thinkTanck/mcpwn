/**
 * Structured JSON logger.
 *
 * Emits exactly one JSON line per call — `{ level, msg, timestamp, ctx }` — via
 * an injectable sink, with an injectable clock so tests are deterministic.
 *
 * REDACTION IS SHARED, NOT LOCAL. Both the message and the whole context tree go
 * through `@/lib/redact` before serialization, so a secret is removed whether it
 * arrives under a telling key (`token`), at any depth, inside an Error, or
 * interpolated into the message text where no key names it at all. This module
 * used to carry its own top-level key filter; it was the only redaction in the
 * codebase and it saw only the first level of one object.
 * `tests/unit/lib/secret-leakage.guard.test.ts` is the guard that keeps this
 * true for code not yet written.
 */
import { redactSecrets, redactString } from '@/lib/redact';

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

/** Create a logger bound to the given clock and sink. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const now = options.now ?? (() => new Date());
  const sink = options.sink ?? ((line: string) => console.log(line));

  const emit = (level: LogLevel, msg: string, ctx?: LogContext): void => {
    const record: LogRecord = {
      level,
      msg: redactString(msg),
      timestamp: now().toISOString(),
      ctx: redactSecrets(ctx ?? {}) as LogContext,
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
