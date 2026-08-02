import {
  ProbeEndpointSchema,
  checkEndpoint,
  endpointLabel,
  isLoopbackHost,
} from '@/harness/mcp/endpoint';

/**
 * Probe endpoint validation is a SECURITY control, not a formatting nicety: a
 * bearer credential rides an Authorization header, so a non-HTTPS endpoint would
 * leak it, and credentials embedded in the URL would smuggle a secret into a
 * label.
 */

/**
 * THE RETIRED MODEL MUST NOT SURVIVE IN COPY.
 *
 * Under [ADR-0006](docs/adr/0006-mcpwn-is-the-mcp-server.md) MCPwn IS the MCP
 * server and the user's agent connects TO us. We never call their agent, so we
 * never take their endpoint and never take their key. This module was re-scoped
 * to the narrower job of probing a target MCP *server* (the ASI02/ASI05
 * surfaces), but its user-facing strings were left behind describing the dead
 * outbound model: "the MCP endpoint URL of your agent", and an "API key field"
 * that ADR-0006 deleted from the product.
 *
 * That is not a cosmetic slip. The most damaging thing this product could do is
 * imply it wants a stranger's agent credentials, because the entire security
 * story of the inversion is that we hold none. Copy is where that promise is
 * actually made, so it gets a test rather than a reviewer's memory.
 */
describe('probe copy does not describe the retired outbound model', () => {
  const reasonsFor = (inputs: string[]) =>
    inputs.map((raw) => {
      const r = checkEndpoint(raw);
      return r.ok ? '' : r.reason;
    });

  // Every failure path a user can actually reach.
  const REASONS = reasonsFor([
    '',
    'not-a-url',
    'https://user:pass@host/mcp',
    'http://example.com/mcp',
  ]);

  it("never asks for the user AGENT's endpoint", () => {
    for (const reason of REASONS) {
      expect(reason.toLowerCase(), `"${reason}" still describes the retired model`).not.toMatch(
        /(endpoint|url)[^.]*\bof your agent\b|\byour agent's\b/,
      );
    }
  });

  it('never points at an API key field that no longer exists', () => {
    for (const reason of REASONS) {
      expect(reason.toLowerCase(), `"${reason}" names a field ADR-0006 removed`).not.toContain(
        'api key field',
      );
    }
  });

  it('still explains every failure in words', () => {
    // The counterweight: the assertions above are satisfiable by returning empty
    // strings, which would "fix" the copy by deleting it.
    for (const reason of REASONS) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});

describe('checkEndpoint', () => {
  it('accepts an https endpoint', () => {
    const result = checkEndpoint('https://agent.example/mcp');
    expect(result.ok).toBe(true);
    expect(result.ok && result.url.origin).toBe('https://agent.example');
  });

  it('trims surrounding whitespace from a pasted URL', () => {
    const result = checkEndpoint('  https://agent.example/mcp  ');
    expect(result.ok && result.url.href).toBe('https://agent.example/mcp');
  });

  it.each(['http://localhost:3000/mcp', 'http://127.0.0.1:8080/mcp', 'http://[::1]:8080/mcp'])(
    'allows plain http for the loopback dev host %s',
    (url) => {
      expect(checkEndpoint(url).ok).toBe(true);
    },
  );

  it('rejects plain http to a remote host (the key would cross the wire in clear)', () => {
    const result = checkEndpoint('http://agent.example/mcp');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/https/i);
  });

  it('rejects credentials embedded in the URL', () => {
    const result = checkEndpoint('https://user:sekret@agent.example/mcp');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/username and password/i);
  });

  it('rejects a non-URL and an empty value', () => {
    expect(checkEndpoint('not a url').ok).toBe(false);
    expect(checkEndpoint('   ').ok).toBe(false);
  });

  it.each(['ftp://agent.example/mcp', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'rejects the non-http(s) scheme %s',
    (url) => {
      expect(checkEndpoint(url).ok).toBe(false);
    },
  );
});

describe('isLoopbackHost', () => {
  it('matches the loopback names case-insensitively and nothing else', () => {
    expect(isLoopbackHost('LOCALHOST')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost.evil.example')).toBe(false);
  });
});

describe('ProbeEndpointSchema', () => {
  it('parses to the canonical href', () => {
    expect(ProbeEndpointSchema.parse('  https://agent.example/mcp ')).toBe(
      'https://agent.example/mcp',
    );
  });

  it('fails with the user-readable reason', () => {
    const result = ProbeEndpointSchema.safeParse('http://agent.example/mcp');
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toMatch(/https/i);
  });

  it('rejects an absurdly long value before parsing it', () => {
    expect(ProbeEndpointSchema.safeParse(`https://a.example/${'x'.repeat(3000)}`).success).toBe(
      false,
    );
  });
});

describe('endpointLabel', () => {
  it('reduces an endpoint to its origin, dropping a path or query that could hold a token', () => {
    expect(endpointLabel('https://agent.example/mcp?token=sekret')).toBe('https://agent.example');
  });

  it('never throws on a malformed value', () => {
    expect(endpointLabel('nonsense')).toBe('unknown-target');
  });
});
