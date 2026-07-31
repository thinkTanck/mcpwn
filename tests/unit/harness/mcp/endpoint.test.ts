import {
  ProbeEndpointSchema,
  checkEndpoint,
  endpointLabel,
  isLoopbackHost,
} from '@/harness/mcp/endpoint';

/**
 * Probe endpoint validation is a SECURITY control, not a formatting nicety: the
 * user's key rides an Authorization header, so a non-HTTPS endpoint would leak
 * it, and credentials embedded in the URL would smuggle a secret into a label.
 */

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
