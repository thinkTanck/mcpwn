import * as envModule from '@/config/env';
import {
  loadCoreConfig,
  getJudgeConfig,
  getMcpConfig,
  getSupabaseConfig,
  isAuthEnabled,
  isGithubOAuthEnabled,
  getSupabaseServiceRoleKey,
  getSiteOrigin,
  DEFAULT_SITE_ORIGIN,
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
    expect(loadCoreConfig({ NODE_ENV: 'test' })).toEqual({ NODE_ENV: 'test' });
  });

  it.each(['development', 'test', 'production'])('accepts NODE_ENV=%s', (NODE_ENV) => {
    expect(loadCoreConfig({ NODE_ENV }).NODE_ENV).toBe(NODE_ENV);
  });

  it('defaults to development when unset (offline boot)', () => {
    expect(loadCoreConfig({})).toEqual({ NODE_ENV: 'development' });
  });

  it('fails fast on an invalid NODE_ENV, naming the bad var', () => {
    expect(() => loadCoreConfig({ NODE_ENV: 'staging' })).toThrow(ConfigError);
    expect(() => loadCoreConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('offline-safe: NO deferred creds loads fine', () => {
    expect(() => loadCoreConfig({ NODE_ENV: 'production' })).not.toThrow();
  });
});

// The second run store (`src/persistence/*`) was deleted; the config that chose
// between its two adapters went with it. These pin the removal so the switch
// cannot drift back in as config that claims to select a backend but selects
// nothing. `DATABASE_URL` deliberately survives in `.env.example` — see the L12
// row in plan.md — but no accessor reads or validates it any more.
describe('the deleted persistence driver leaves no config behind', () => {
  it('no longer exports a persistence accessor', () => {
    expect(envModule).not.toHaveProperty('getPersistenceConfig');
  });

  it('PERSISTENCE_DRIVER is no longer part of the core contract', () => {
    expect(loadCoreConfig({ NODE_ENV: 'test' })).not.toHaveProperty('PERSISTENCE_DRIVER');
  });

  it('a stale PERSISTENCE_DRIVER in the environment is ignored, not an error', () => {
    // A leftover value in someone's .env.local must not fail the boot of an app
    // that no longer has the driver it names.
    expect(() => loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'sqlite' })).not.toThrow();
    expect(loadCoreConfig({ NODE_ENV: 'test', PERSISTENCE_DRIVER: 'postgres' })).toEqual({
      NODE_ENV: 'test',
    });
  });

  it('a DATABASE_URL in the environment is neither read nor validated', () => {
    // It is kept as documented operator config (the Supabase database password
    // lives in it — see supabase/README.md), but nothing in the app parses it,
    // so even a malformed value cannot fail a boot.
    expect(() => loadCoreConfig({ NODE_ENV: 'test', DATABASE_URL: 'not-a-url' })).not.toThrow();
    expect(loadCoreConfig({ NODE_ENV: 'test', DATABASE_URL: 'not-a-url' })).toEqual({
      NODE_ENV: 'test',
    });
  });
});

describe('secrets are never echoed in error messages', () => {
  const SECRET = 'SUPERSECRET-do-not-leak';

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

describe('lazy JudgeModelPort accessor', () => {
  const valid = {
    JUDGE_MODEL: 'claude-x',
    JUDGE_BASE_URL: 'https://api.example.com',
    JUDGE_API_KEY: 'k',
  };

  it('throws only when invoked; core load ignores judge creds', () => {
    expect(() => loadCoreConfig({ NODE_ENV: 'test' })).not.toThrow();
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
    expect(() => loadCoreConfig({ NODE_ENV: 'test' })).not.toThrow();
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

  it('normalizes a URL with a trailing slash to its bare origin', () => {
    expect(
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://ref.supabase.co/',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      })?.url,
    ).toBe(URL);
  });

  it('trims surrounding whitespace and drops a stray path, keeping the origin', () => {
    expect(
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: '  https://ref.supabase.co/rest/v1  ',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      })?.url,
    ).toBe(URL);
  });

  it('trims surrounding whitespace on the anon key', () => {
    expect(
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: `  ${ANON}\n`,
      })?.anonKey,
    ).toBe(ANON);
  });

  it('treats a blank/whitespace-only URL as unconfigured (inert), not an error', () => {
    expect(getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: '   ' })).toBeNull();
    expect(isAuthEnabled({ NEXT_PUBLIC_SUPABASE_URL: '  \n' })).toBe(false);
  });

  it('throws when the URL is set but the anon key is only whitespace', () => {
    expect(() =>
      getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ' }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('trims the service-role key and rejects a whitespace-only one', () => {
    const base = { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON };
    expect(getSupabaseServiceRoleKey({ ...base, SUPABASE_SERVICE_ROLE_KEY: '  svc-key  ' })).toBe(
      'svc-key',
    );
    expect(() => getSupabaseServiceRoleKey({ ...base, SUPABASE_SERVICE_ROLE_KEY: '   ' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('isGithubOAuthEnabled: only when auth is configured AND the flag is true', () => {
    const base = { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON };
    expect(isGithubOAuthEnabled({})).toBe(false); // no auth
    expect(isGithubOAuthEnabled(base)).toBe(false); // auth, flag off
    expect(isGithubOAuthEnabled({ ...base, NEXT_PUBLIC_GITHUB_OAUTH_ENABLED: 'true' })).toBe(true);
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

describe('getSiteOrigin — the canonical public origin (metadataBase)', () => {
  it('defaults to the canonical production origin when unset', () => {
    expect(getSiteOrigin({})).toBe(DEFAULT_SITE_ORIGIN);
    expect(DEFAULT_SITE_ORIGIN).toBe('https://mcpwn.dev');
  });

  it('treats a blank/whitespace-only value as unset, not an error', () => {
    expect(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: '   ' })).toBe(DEFAULT_SITE_ORIGIN);
  });

  it('honors an override (12-Factor III: the origin is configuration)', () => {
    expect(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://staging.mcpwn.dev' })).toBe(
      'https://staging.mcpwn.dev',
    );
  });

  it('normalizes a trailing slash, a stray path and surrounding whitespace to the origin', () => {
    // Every relative metadata URL resolves against this, so a pasted path would
    // silently prefix every canonical and Open Graph URL the app emits.
    expect(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: '  https://mcpwn.dev/connect/  ' })).toBe(
      'https://mcpwn.dev',
    );
  });

  it('keeps an explicit port (a local or preview origin stays reachable)', () => {
    expect(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000',
    );
  });

  it('throws on a set-but-malformed value, naming the var', () => {
    const err = caught(() => getSiteOrigin({ NEXT_PUBLIC_SITE_URL: 'mcpwn.dev' }));
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).toContain('NEXT_PUBLIC_SITE_URL');
  });

  it('rejects a non-http(s) scheme rather than emitting an unusable base', () => {
    expect(() => getSiteOrigin({ NEXT_PUBLIC_SITE_URL: 'ftp://mcpwn.dev' })).toThrow(ConfigError);
  });
});
