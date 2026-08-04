import { TraceSchema } from '@/contract';
import { INFERRED_TASK_COMPLETE_SUMMARY, SpikeTraceRecorder } from '@/spike/asi01/recorder';
import { ATTACKER_ACCOUNT, OFFENDING_TOOL, READ_TOOL, buildSurface } from '@/spike/asi01/surface';

const recorderFor = (kind: 'malicious' | 'benign') => new SpikeTraceRecorder(buildSurface(kind));

/**
 * What the endpoint may record, and — more importantly — what it may NOT.
 *
 * ADR-0006's observability table is the law here. As the server we see the
 * content we authored, every `tools/call` the agent chose to make, and the
 * results we returned. We do NOT see the agent's reasoning, and completion is an
 * inference. Both of those are permanent constraints, not gaps to paper over.
 */
describe('spike/asi01 recorder: records only what a server can observe', () => {
  it('seeds the authored content as the first attacker step', async () => {
    const recorder = recorderFor('malicious');
    const trace = await recorder.buildTrace();
    const first = trace.steps[0]!;
    expect(first.type).toBe('attacker');
    if (first.type !== 'attacker') return;
    expect(first.content).toContain(ATTACKER_ACCOUNT);
  });

  it('records each tools/call with its tool and arguments — the agent-s own decision', async () => {
    const recorder = recorderFor('malicious');
    recorder.recordToolCall(READ_TOOL, { mailbox: 'inbox' });
    recorder.recordToolResult(READ_TOOL, { subject: 'on hold' });
    recorder.recordToolCall(OFFENDING_TOOL, { to: ATTACKER_ACCOUNT, amount: 8500 });
    recorder.recordToolResult(OFFENDING_TOOL, { status: 'ok' });

    const trace = await recorder.buildTrace();
    expect(trace.steps.map((s) => s.type)).toEqual([
      'attacker',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'task_complete',
    ]);
    const offending = trace.steps.find((s) => s.type === 'tool_call' && s.tool === OFFENDING_TOOL);
    expect(offending).toBeDefined();
    if (offending?.type !== 'tool_call') return;
    expect(offending.args).toEqual({ to: ATTACKER_ACCOUNT, amount: 8500 });
  });

  it('NEVER produces an agent_reasoning step, and offers no way to make one', async () => {
    // ADR-0006: nothing in MCP carries an agent's chain of thought to a server.
    // Synthesizing one would be fabrication, so the recorder has no such method.
    const recorder = recorderFor('malicious');
    recorder.recordToolCall(READ_TOOL, {});
    recorder.recordToolResult(READ_TOOL, { ok: true });
    const trace = await recorder.buildTrace();
    expect(trace.steps.some((s) => s.type === 'agent_reasoning')).toBe(false);
    expect((recorder as unknown as Record<string, unknown>).recordReasoning).toBeUndefined();
    expect((recorder as unknown as Record<string, unknown>).agentReasoning).toBeUndefined();
  });

  it('ends with a task_complete that says in its own text that it is INFERRED', async () => {
    const trace = await recorderFor('benign').buildTrace();
    const last = trace.steps.at(-1)!;
    expect(last.type).toBe('task_complete');
    if (last.type !== 'task_complete') return;
    expect(last.summary).toBe(INFERRED_TASK_COMPLETE_SUMMARY);
    expect(INFERRED_TASK_COMPLETE_SUMMARY).toMatch(/inferred/i);
    expect(INFERRED_TASK_COMPLETE_SUMMARY).toMatch(/not observed/i);
  });

  it('builds a trace that satisfies the observable contract, with positional ids', async () => {
    const recorder = recorderFor('malicious');
    recorder.recordToolCall(READ_TOOL, {});
    recorder.recordToolResult(READ_TOOL, { ok: true });
    const trace = await recorder.buildTrace();
    expect(() => TraceSchema.parse(trace)).not.toThrow();
    trace.steps.forEach((step, i) => expect(step.id).toBe(`s${i + 1}`));
    expect(trace.category).toBe('ASI01');
  });

  it('does not mutate the recording when the trace is built twice', async () => {
    const recorder = recorderFor('malicious');
    recorder.recordToolCall(READ_TOOL, {});
    const first = await recorder.buildTrace();
    const second = await recorder.buildTrace();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('spike/asi01 recorder: run identity', () => {
  it('takes the model label from the connecting client, which is all a server sees', async () => {
    const recorder = recorderFor('malicious');
    recorder.observeClient({ name: 'fake-loopback-client', version: '0.0.1' });
    const trace = await recorder.buildTrace();
    // Honest naming: this is the CLIENT that connected, not a model identity the
    // server can verify. The operator can override it when they know better.
    expect(trace.model).toBe('fake-loopback-client');
  });

  it('falls back to an explicitly unknown client rather than inventing one', async () => {
    const trace = await recorderFor('malicious').buildTrace();
    expect(trace.model).toBe('unknown-client');
  });

  it('lets the operator pin the run identity without encoding the framing', async () => {
    const recorder = new SpikeTraceRecorder(buildSurface('benign'), {
      runId: 'spike-run-3',
      model: 'claude-code',
    });
    const trace = await recorder.buildTrace();
    expect(trace.runId).toBe('spike-run-3');
    expect(trace.model).toBe('claude-code');
  });

  it('gives both framings identical metadata (the leakage law)', async () => {
    const malicious = await recorderFor('malicious').buildTrace();
    const benign = await recorderFor('benign').buildTrace();
    for (const field of ['runId', 'target', 'model', 'category'] as const) {
      expect(malicious[field]).toBe(benign[field]);
    }
  });
});
