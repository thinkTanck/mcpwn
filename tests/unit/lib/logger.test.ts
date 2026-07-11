import { createLogger, logger, type LogLevel } from '@/lib/logger';

const FIXED_ISO = '2026-07-11T00:00:00.000Z';
const fixedNow = () => new Date(FIXED_ISO);

describe('createLogger', () => {
  it('emits exactly one JSON line with { level, msg, timestamp, ctx } and redacts sensitive keys', () => {
    const lines: string[] = [];
    const log = createLogger({ now: fixedNow, sink: (l) => lines.push(l) });

    log.info('hello', { userId: 1, password: 'p@ss', token: 'abc' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      level: 'info',
      msg: 'hello',
      timestamp: FIXED_ISO,
      ctx: { userId: 1, password: '[REDACTED]', token: '[REDACTED]' },
    });
  });

  it('emits a single line with no embedded newline', () => {
    const lines: string[] = [];
    const log = createLogger({ now: fixedNow, sink: (l) => lines.push(l) });

    log.info('hello', { userId: 1, password: 'p@ss', token: 'abc' });

    expect(lines[0]).not.toContain('\n');
  });

  it('does not leak the raw secret values into the serialized line', () => {
    const lines: string[] = [];
    const log = createLogger({ now: fixedNow, sink: (l) => lines.push(l) });

    log.info('hello', { userId: 1, password: 'p@ss', token: 'abc' });

    expect(lines[0]).not.toContain('p@ss');
    expect(lines[0]).not.toContain('abc');
  });

  it('defaults ctx to {} when omitted', () => {
    const lines: string[] = [];
    const log = createLogger({ now: fixedNow, sink: (l) => lines.push(l) });

    log.info('no context here');

    expect(JSON.parse(lines[0]!)).toEqual({
      level: 'info',
      msg: 'no context here',
      timestamp: FIXED_ISO,
      ctx: {},
    });
  });

  it('keeps non-sensitive values intact', () => {
    const lines: string[] = [];
    const log = createLogger({ now: fixedNow, sink: (l) => lines.push(l) });

    log.info('plain', { userId: 42, role: 'admin', count: 3 });

    expect(JSON.parse(lines[0]!).ctx).toEqual({ userId: 42, role: 'admin', count: 3 });
  });

  it('redacts every sensitive key variant case-insensitively', () => {
    const lines: string[] = [];
    const log = createLogger({ now: fixedNow, sink: (l) => lines.push(l) });

    log.info('secrets', {
      Password: 'x',
      TOKEN: 'x',
      secret: 'x',
      apiKey: 'x',
      api_key: 'x',
      Authorization: 'x',
      auth: 'x',
      credential: 'x',
      credentials: 'x',
      keep: 'me',
    });

    expect(JSON.parse(lines[0]!).ctx).toEqual({
      Password: '[REDACTED]',
      TOKEN: '[REDACTED]',
      secret: '[REDACTED]',
      apiKey: '[REDACTED]',
      api_key: '[REDACTED]',
      Authorization: '[REDACTED]',
      auth: '[REDACTED]',
      credential: '[REDACTED]',
      credentials: '[REDACTED]',
      keep: 'me',
    });
  });

  it.each<LogLevel>(['debug', 'info', 'warn', 'error'])(
    'writes level "%s" onto the record',
    (level) => {
      const lines: string[] = [];
      const log = createLogger({ now: fixedNow, sink: (l) => lines.push(l) });

      log[level]('msg for ' + level);

      const record = JSON.parse(lines[0]!);
      expect(record.level).toBe(level);
      expect(record.msg).toBe('msg for ' + level);
      expect(record.timestamp).toBe(FIXED_ISO);
      expect(record.ctx).toEqual({});
    },
  );

  it('exposes a default logger instance with the four level methods', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('default logger writes a single JSON line to its sink', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      logger.info('via default', { ok: true });
      expect(spy).toHaveBeenCalledTimes(1);
      const line = spy.mock.calls[0]![0] as string;
      expect(line).not.toContain('\n');
      const record = JSON.parse(line);
      expect(record.level).toBe('info');
      expect(record.msg).toBe('via default');
      expect(record.ctx).toEqual({ ok: true });
      expect(typeof record.timestamp).toBe('string');
    } finally {
      spy.mockRestore();
    }
  });
});
