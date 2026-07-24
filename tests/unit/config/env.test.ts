import {
  loadCoreConfig,
  getPersistenceConfig,
  getJudgeConfig,
  getMcpConfig,
  getSupabaseConfig,
  isAuthEnabled,
  getSupabaseServiceRoleKey,
  ConfigError,
} from '@/config/env';

/** Invoke `fn`, returning the thrown error; fails if the call does not throw. */
function caught(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected the call to throw, but it did not');
}

describe('loadCoreConfig — offline-safe core (fail-fast)', () => {
  it('loads a valid core config (typed)', () => {
    expect(loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'memory' })).toEqual({
      NODE_ENV: 'test',
      PERSISTENCE_DRIVER: 'memory',
    });
  });

  it.each(['development', 'test', 'production'])('accepts NODE_ENV=%s', (NODE_ENV) => {
    expect(loadCoreConfig({ NODE_ENV, PERSISTENCE_DRIVER: 'memory' }).NODE_ENV).toBe(NODE_ENV);
  });

  it.each(['memory', 'postgres'])('accepts PERSISTENCE_DRIVER=%s', (PERSISTENCE_DRIVER) => {
    expect(loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER }).PERSISTENCE_DRIVER).toBe(
      PERSISTENCE_DRIVER,
    );
  });

  it('defaults to development + memory when unset (offline boot)', () => {
    expect(loadCoreConfig({})).toEqual({ NODE_ENV: 'development', PERSISTENCE_DRIVER: 'memory' });
  });

  it('fails fast on an invalid NODE_ENV, naming the bad var', () => {
    expect(() => loadCoreConfig({ NODE_ENV: 'staging', PERSISTENCE_DRIVER: 'memory' })).toThrow(
      ConfigError,
    );
    expect(() => loadCoreConfig({ NODE_ENV: 'staging', PERSISTENCE_DRIVER: 'memory' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('fails fast on an invalid PERSISTENCE_DRIVER, naming the bad var', () => {
    expect(() => loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'sqlite' })).toThrow(
      /PERSISTENCE_DRIVER/,
    );
  });

  it('offline-safe: memory driver with NO deferred creds loads fine', () => {
    expect(() =>
      loadCoreConfig({ NODE_ENV: 'production', PERSISTENCE_DRIVER: 'memory' }),
    ).not.toThrow();
  });
});

describe('secrets are never echoed in error messages', () => {
  const SECRET = 'SUPERSECRET-do-not-leak';

  it('a persistence error never echoes the DATABASE_URL value', () => {
    const err = caught(() =>
      getPersistenceConfig({
        NODE_ENV: 'test',
        PERSISTENCE_DRIVER: 'postgres',
        DATABASE_URL: `mysql://user:${SECRET}@db/app`,
      }),
    );
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).not.toContain(SECRET);
    expect(err.message).toContain('DATABASE_URL');
  });

  it('a judge error never echoes the JUDGE_API_KEY value', () => {
    const err = caught(() =>
      getJudgeConfig({ JUDGE_MODEL: 'm', JUDGE_BASE_URL: 'ftp://host', JUDGE_API_KEY: SECRET }),
    );
    expect(err.message).not.toContain(SECRET);
    expect(err.message).toContain('JUDGE_BASE_URL');
  });

  it('an mcp error never echoes the MCP_TARGET_TOKEN value', () => {
    const err = caught(() =>
      getMcpConfig({ MCP_TARGET_URL: 'not a url', MCP_TARGET_TOKEN: SECRET }),
    );
    expect(err.message).not.toContain(SECRET);
    expect(err.message).toContain('MCP_TARGET_URL');
  });
});

describe('lazy persistence (postgres validated only when invoked)', () => {
  it('core loads with postgres driver and NO DATABASE_URL (validation is deferred)', () => {
    expect(() =>
      loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'postgres' }),
    ).not.toThrow();
  });

  it('the memory driver never asks for DATABASE_URL', () => {
    expect(getPersistenceConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'memory' })).toEqual({
      driver: 'memory',
    });
  });

  it('the postgres accessor throws only when invoked (missing DATABASE_URL)', () => {
    const env = { NODE_ENV: 'test', PERSISTENCE_DRIVER: 'postgres' };
    expect(() => loadCoreConfig(env)).not.toThrow();
    expect(() => getPersistenceConfig(env)).toThrow(ConfigError);
    expect(() => getPersistenceConfig(env)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres URL', () => {
    expect(() =>
      getPersistenceConfig({
        NODE_ENV: 'test',
        PERSISTENCE_DRIVER: 'postgres',
        DATABASE_URL: 'https://x/y',
      }),
    ).toThrow(ConfigError);
  });

  it('rejects an unparseable DATABASE_URL', () => {
    expect(() =>
      getPersistenceConfig({
        NODE_ENV: 'test',
        PERSISTENCE_DRIVER: 'postgres',
        DATABASE_URL: 'not-a-url',
      }),
    ).toThrow(ConfigError);
  });

  it('returns databaseUrl for a valid postgres:// URL', () => {
    expect(
      getPersistenceConfig({
        NODE_ENV: 'test',
        PERSISTENCE_DRIVER: 'postgres',
        DATABASE_URL: 'postgres://u:p@h:5432/db',
      }),
    ).toEqual({ driver: 'postgres', databaseUrl: 'postgres://u:p@h:5432/db' });
  });
});

describe('lazy JudgeModelPort accessor', () => {
  const valid = {
    JUDGE_MODEL: 'claude-x',
    JUDGE_BASE_URL: 'https://api.example.com',
    JUDGE_API_KEY: 'k',
  };

  it('throws only when invoked; core load ignores judge creds', () => {
    expect(() => loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'memory' })).not.toThrow();
    expect(() => getJudgeConfig({})).toThrow(ConfigError);
  });

  it('requires JUDGE_MODEL / JUDGE_BASE_URL / JUDGE_API_KEY', () => {
    expect(() => getJudgeConfig({ JUDGE_BASE_URL: 'https://x', JUDGE_API_KEY: 'k' })).toThrow(
      /JUDGE_MODEL/,
    );
    expect(() => getJudgeConfig({ JUDGE_MODEL: 'm', JUDGE_API_KEY: 'k' })).toThrow(
      /JUDGE_BASE_URL/,
    );
    expect(() => getJudgeConfig({ JUDGE_MODEL: 'm', JUDGE_BASE_URL: 'https://x' })).toThrow(
      /JUDGE_API_KEY/,
    );
  });

  it('coerces JUDGE_TEMPERATURE to a number', () => {
    expect(getJudgeConfig({ ...valid, JUDGE_TEMPERATURE: '0.7' }).temperature).toBe(0.7);
  });

  it('defaults JUDGE_TEMPERATURE to 0 when unset', () => {
    expect(getJudgeConfig(valid).temperature).toBe(0);
  });

  it('returns a clean typed judge config', () => {
    expect(getJudgeConfig(valid)).toEqual({
      model: 'claude-x',
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      temperature: 0,
    });
  });
});

describe('lazy McpTargetPort accessor', () => {
  it('throws only when invoked; requires MCP_TARGET_URL', () => {
    expect(() => loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'memory' })).not.toThrow();
    expect(() => getMcpConfig({})).toThrow(/MCP_TARGET_URL/);
  });

  it('accepts MCP_TARGET_URL with an optional token', () => {
    const noToken = getMcpConfig({ MCP_TARGET_URL: 'https://mcp.example.com' });
    expect(noToken.url).toBe('https://mcp.example.com');
    expect(noToken.token).toBeUndefined();

    const withToken = getMcpConfig({
      MCP_TARGET_URL: 'https://mcp.example.com',
      MCP_TARGET_TOKEN: 'tok',
    });
    expect(withToken.token).toBe('tok');
  });

  it('rejects an invalid MCP_TARGET_URL', () => {
    expect(() => getMcpConfig({ MCP_TARGET_URL: 'not a url' })).toThrow(ConfigError);
  });
});

describe('reads process.env by default (offline)', () => {
  it('loadCoreConfig() uses process.env', () => {
    expect(() => loadCoreConfig()).not.toThrow();
  });

  it('getPersistenceConfig() defaults to the memory driver offline', () => {
    expect(getPersistenceConfig()).toEqual({ driver: 'memory' });
  });

  it('getJudgeConfig() throws offline (no judge creds set)', () => {
    expect(() => getJudgeConfig()).toThrow(ConfigError);
  });

  it('getMcpConfig() throws offline (no mcp target set)', () => {
    expect(() => getMcpConfig()).toThrow(ConfigError);
  });
});

describe('getSupabaseConfig — offline-safe (absence is a first-class state)', () => {
  const URL = 'https://ref.supabase.co';
  const ANON = 'anon-key-123';

  it('returns null when unconfigured (no NEXT_PUBLIC_SUPABASE_URL) → auth inert', () => {
    expect(getSupabaseConfig({})).toBeNull();
    expect(isAuthEnabled({})).toBe(false);
  });

  it('returns the typed public config when configured', () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON };
    expect(getSupabaseConfig(env)).toEqual({ url: URL, anonKey: ANON });
    expect(isAuthEnabled(env)).toBe(true);
  });

  it('throws (does NOT silently disable) when the URL is set but the anon key is missing', () => {
    expect(() => getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: URL })).toThrow(ConfigError);
  });

  it('throws on a malformed URL, naming the var not its value', () => {
    const err = caught(() =>
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      }),
    );
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(err.message).not.toContain(ANON);
  });

  it('getSupabaseServiceRoleKey: null when unconfigured', () => {
    expect(getSupabaseServiceRoleKey({})).toBeNull();
  });

  it('getSupabaseServiceRoleKey: returns the key when configured', () => {
    const key = 'service-role-xyz';
    expect(
      getSupabaseServiceRoleKey({
        NEXT_PUBLIC_SUPABASE_URL: URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
        SUPABASE_SERVICE_ROLE_KEY: key,
      }),
    ).toBe(key);
  });

  it('getSupabaseServiceRoleKey: throws when auth is configured but the key is missing', () => {
    expect(() =>
      getSupabaseServiceRoleKey({
        NEXT_PUBLIC_SUPABASE_URL: URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      }),
    ).toThrow(ConfigError);
  });
});
