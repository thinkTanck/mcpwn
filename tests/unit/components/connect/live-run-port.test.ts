import {
  createConnectLiveRunPort,
  notWiredLiveRunPort,
  LIVE_RUN_NOT_WIRED_MESSAGE,
  LIVE_RUN_UNREADABLE_STATE_MESSAGE,
  type ReadLiveRunStateAction,
  type StartLiveRunAction,
} from '@/components/connect/live-run-port';

/**
 * THE NARROW LOCAL PORT the Connect screen is coded against, and the ONE adapter
 * at its boundary.
 *
 * The screen needs exactly two things from the server: start a run, and read
 * that run's real lifecycle state. Everything else it draws, it draws from those
 * two answers. Keeping the port at two methods is what makes the boundary a
 * boundary: when the server action lands, the reconciliation is this file's two
 * structural action types and nothing else.
 *
 * The adapter's whole job is DISTRUST. A server answer is normalized before the
 * screen ever sees it, because the alternative is a screen that renders a phase
 * it does not understand as if it did.
 */

const TICKET = {
  runId: 'run-1',
  endpoint: 'https://mcpwn.dev/api/mcp/run-1',
  token: `mcpwn_rt_${'a'.repeat(32)}_${'b'.repeat(64)}`,
  expiresAt: '2026-08-05T12:00:00.000Z',
  category: 'ASI01' as const,
  promptName: 'session_brief',
  taskGoal: 'Clear the finance inbox and act on anything that needs a reply.',
};

const STATE = {
  runId: 'run-1',
  phase: 'recording' as const,
  steps: 4,
  observedAt: '2026-08-05T11:30:00.000Z',
  resultRunId: null,
};

const startsWith = (answer: Awaited<ReturnType<StartLiveRunAction>>): StartLiveRunAction =>
  vi.fn(async () => answer);

const readsWith = (answer: Awaited<ReturnType<ReadLiveRunStateAction>>): ReadLiveRunStateAction =>
  vi.fn(async () => answer);

describe('the not-wired default port', () => {
  it('refuses to start, and says plainly that nothing was issued', async () => {
    const answer = await notWiredLiveRunPort.start({ category: 'ASI01' });

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.refusal.code).toBe('NOT_WIRED');
    expect(answer.refusal.message).toBe(LIVE_RUN_NOT_WIRED_MESSAGE);
  });

  it('quotes no numeral, because it is not a cost decision', async () => {
    expect(LIVE_RUN_NOT_WIRED_MESSAGE).not.toMatch(/\d/);
  });

  it('refuses to read state as well, so no phase can be shown without a server', async () => {
    const answer = await notWiredLiveRunPort.readState({ runId: 'run-1' });

    expect(answer.ok).toBe(false);
  });
});

describe('the adapter · starting a run', () => {
  it('passes the chosen category through and returns the issued ticket', async () => {
    const start = startsWith({ ok: true, ticket: TICKET });
    const port = createConnectLiveRunPort({
      start,
      readState: readsWith({ ok: true, state: STATE }),
    });

    const answer = await port.start({ category: 'ASI01' });

    expect(start).toHaveBeenCalledWith({ category: 'ASI01' });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value.endpoint).toBe(TICKET.endpoint);
    expect(answer.value.token).toBe(TICKET.token);
    expect(answer.value.promptName).toBe('session_brief');
  });

  it('relays a gate refusal verbatim, code and sentence alike', async () => {
    const port = createConnectLiveRunPort({
      start: startsWith({
        ok: false,
        code: 'ALLOWANCE_EXHAUSTED',
        message: 'You have used 3 free live runs on this account. Sample playback stays open.',
      }),
      readState: readsWith({ ok: true, state: STATE }),
    });

    const answer = await port.start({ category: 'ASI01' });

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.refusal.code).toBe('ALLOWANCE_EXHAUSTED');
    // The count belongs to the server, which derives it from config. The screen
    // never authors it and the adapter never rewrites it.
    expect(answer.refusal.message).toContain('3 free live runs');
  });

  it('keeps an unknown refusal code readable without pretending to recognise it', async () => {
    const port = createConnectLiveRunPort({
      start: startsWith({ ok: false, code: 'SOMETHING_NEW', message: 'That run did not start.' }),
      readState: readsWith({ ok: true, state: STATE }),
    });

    const answer = await port.start({ category: 'ASI01' });

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.refusal.code).toBe('REFUSED');
    expect(answer.refusal.message).toBe('That run did not start.');
  });

  it('turns a thrown action into a refusal, never an unhandled rejection', async () => {
    const port = createConnectLiveRunPort({
      start: vi.fn(async () => {
        throw new Error('network down');
      }),
      readState: readsWith({ ok: true, state: STATE }),
    });

    const answer = await port.start({ category: 'ASI01' });

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.refusal.code).toBe('REFUSED');
    // The thrown detail is ours, not the visitor's: it never becomes copy.
    expect(answer.refusal.message).not.toContain('network down');
  });
});

describe('the adapter · reading real lifecycle state', () => {
  it('returns the phase and step count the server actually reported', async () => {
    const port = createConnectLiveRunPort({
      start: startsWith({ ok: true, ticket: TICKET }),
      readState: readsWith({ ok: true, state: STATE }),
    });

    const answer = await port.readState({ runId: 'run-1' });

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value.phase).toBe('recording');
    expect(answer.value.steps).toBe(4);
  });

  it('refuses a phase it does not recognise instead of guessing one', async () => {
    const port = createConnectLiveRunPort({
      start: startsWith({ ok: true, ticket: TICKET }),
      readState: readsWith({ ok: true, state: { ...STATE, phase: 'thinking' as never } }),
    });

    const answer = await port.readState({ runId: 'run-1' });

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.refusal.message).toBe(LIVE_RUN_UNREADABLE_STATE_MESSAGE);
  });

  it('refuses a step count that is not a whole non-negative number', async () => {
    const port = createConnectLiveRunPort({
      start: startsWith({ ok: true, ticket: TICKET }),
      readState: readsWith({ ok: true, state: { ...STATE, steps: -1 } }),
    });

    expect((await port.readState({ runId: 'run-1' })).ok).toBe(false);
  });

  it('carries the replay id through once the run has finished', async () => {
    const port = createConnectLiveRunPort({
      start: startsWith({ ok: true, ticket: TICKET }),
      readState: readsWith({
        ok: true,
        state: { ...STATE, phase: 'finished', resultRunId: 'run-1' },
      }),
    });

    const answer = await port.readState({ runId: 'run-1' });

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value.resultRunId).toBe('run-1');
  });
});
