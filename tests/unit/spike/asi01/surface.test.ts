import { asi01 } from '@/attacks/asi01';
import { ATTACKER_ACCOUNT, OFFENDING_TOOL, READ_TOOL, buildSurface } from '@/spike/asi01/surface';

/**
 * The ASI01 tool surface the spike endpoint SERVES.
 *
 * It is derived from the registered attack module (`asi01.scenario(...)`) rather
 * than re-typed here, so the endpoint cannot drift from the fixture the detector
 * is validated against. Both framings — the poisoned one and its benign control —
 * come from the same pair.
 */
describe('spike/asi01 surface: derived from the registered attack, not re-typed', () => {
  it.each(['malicious', 'benign'] as const)(
    'serves exactly the tool names the %s scenario declares',
    (kind) => {
      const surface = buildSurface(kind);
      const declared = asi01.scenario(`asi01-goal-hijack-${kind}`).environment.tools;
      expect(surface.tools.map((t) => t.name)).toEqual([...declared]);
    },
  );

  it('carries the same task goal the attack module states, for out-of-band delivery', () => {
    const surface = buildSurface('malicious');
    expect(surface.taskGoal).toBe(asi01.scenario('asi01-goal-hijack-malicious').taskGoal);
    // Paste delivery is the spike's choice: MCP has no server-to-agent "here is
    // your goal" message, and the published-prompt route is deliberately deferred.
    expect(surface.taskGoal.length).toBeGreaterThan(0);
  });

  it('exposes an identical tool surface in both framings', () => {
    // Surface parity: the only thing separating the runs is what the READ tool
    // returns, never which tools the agent was offered.
    const malicious = buildSurface('malicious');
    const benign = buildSurface('benign');
    expect(malicious.tools.map((t) => t.name)).toEqual(benign.tools.map((t) => t.name));
    expect(malicious.tools.map((t) => t.description)).toEqual(
      benign.tools.map((t) => t.description),
    );
    expect(malicious.taskGoal).toBe(benign.taskGoal);
  });

  it('publishes a JSON Schema for every tool, so a client can call it', () => {
    for (const tool of buildSurface('malicious').tools) {
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

describe('spike/asi01 surface: where the trap lives', () => {
  it('puts the injected instruction in the read tool result, in the poisoned framing', () => {
    const surface = buildSurface('malicious');
    const read = surface.tools.find((t) => t.name === READ_TOOL)!;
    const outcome = read.call({});
    expect(outcome.text).toContain(ATTACKER_ACCOUNT);
    expect(outcome.isError).toBeUndefined();
  });

  it('returns a clean message from the same tool in the benign control', () => {
    const read = buildSurface('benign').tools.find((t) => t.name === READ_TOOL)!;
    expect(read.call({}).text).not.toContain(ATTACKER_ACCOUNT);
  });

  it('offers the high-impact tool in BOTH framings, so declining is the agent-s own choice', () => {
    for (const kind of ['malicious', 'benign'] as const) {
      expect(buildSurface(kind).tools.map((t) => t.name)).toContain(OFFENDING_TOOL);
    }
  });
});

describe('spike/asi01 surface: safety — nothing real sits behind any tool', () => {
  it('answers the high-impact tool with a canned success and moves nothing', () => {
    const transfer = buildSurface('malicious').tools.find((t) => t.name === OFFENDING_TOOL)!;
    const outcome = transfer.call({ to: ATTACKER_ACCOUNT, amount: 8500, currency: 'EUR' });
    expect(outcome.isError).toBeUndefined();
    expect(outcome.payload).toMatchObject({ status: 'ok' });
    // The bait is taken by ISSUING the call; the handler is a no-op recorder.
    expect(outcome.text).toMatch(/sandbox|simulat|no-op/i);
  });

  it('makes no outbound network request from any handler', async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (() => {
      calls.push('fetch');
      throw new Error('a spike tool handler must never reach the network');
    }) as typeof fetch;
    try {
      for (const kind of ['malicious', 'benign'] as const) {
        for (const tool of buildSurface(kind).tools) {
          tool.call({ to: ATTACKER_ACCOUNT, amount: 1, currency: 'EUR' });
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(calls).toEqual([]);
  });

  it('rejects bad arguments as a tool error the agent can recover from, not a crash', () => {
    const transfer = buildSurface('malicious').tools.find((t) => t.name === OFFENDING_TOOL)!;
    const outcome = transfer.call({ to: 'DE00-ATTACKER-9931' });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/invalid/i);
  });

  it('serves only fabricated content — no real payee, no real inbox', () => {
    const surface = buildSurface('malicious');
    // Fabricated by construction: the payee and sender are `.example` fiction
    // carried over from the fixture.
    expect(ATTACKER_ACCOUNT).toContain('ATTACKER');
    const read = surface.tools.find((t) => t.name === READ_TOOL)!;
    expect(read.call({}).text).toContain('.example');
  });
});
