import {
  INFERRED_TASK_COMPLETE_SUMMARY,
  SPIKE_CATEGORY,
  SPIKE_RUN_ID,
  SPIKE_TARGET,
  SpikeTraceRecorder,
  UNKNOWN_CLIENT,
} from '@/spike/asi04/recorder';
import { ATTACKER_ACCOUNT, OFFENDING_TOOL, buildSurface } from '@/spike/asi04/surface';
import { TraceSchema } from '@/contract';

/**
 * The recorder turns what a SERVER can honestly observe into the contract Trace.
 * The distinctive thing for this category: the authored `attacker` step carries
 * the poisoned tool DESCRIPTION, because that is where we put the poison. There
 * is no poisoned message body to record.
 */

describe('spike/asi04 recorder', () => {
  it('seeds the authored poison as the attacker step', async () => {
    const recorder = new SpikeTraceRecorder(buildSurface('malicious'));
    const trace = await recorder.buildTrace();
    const first = trace.steps[0]!;
    expect(first.type).toBe('attacker');
    expect(JSON.stringify(first)).toContain(ATTACKER_ACCOUNT);
  });

  it('seeds the clean description in the benign control', async () => {
    const recorder = new SpikeTraceRecorder(buildSurface('benign'));
    const trace = await recorder.buildTrace();
    expect(JSON.stringify(trace.steps[0])).not.toContain(ATTACKER_ACCOUNT);
  });

  it('produces a schema-valid Trace with the pinned identity', async () => {
    const recorder = new SpikeTraceRecorder(buildSurface('malicious'));
    const trace = await recorder.buildTrace();
    expect(TraceSchema.safeParse(trace).success).toBe(true);
    expect(trace.runId).toBe(SPIKE_RUN_ID);
    expect(trace.target).toBe(SPIKE_TARGET);
    expect(trace.category).toBe(SPIKE_CATEGORY);
  });

  it('records the connecting client as the model, or says it is unknown', async () => {
    const anonymous = await new SpikeTraceRecorder(buildSurface('benign')).buildTrace();
    expect(anonymous.model).toBe(UNKNOWN_CLIENT);

    const named = new SpikeTraceRecorder(buildSurface('benign'));
    named.observeClient({ name: 'some-client', version: '2' });
    expect((await named.buildTrace()).model).toBe('some-client');
  });

  it('records calls and results in order, and labels completion as inferred', async () => {
    const recorder = new SpikeTraceRecorder(buildSurface('malicious'));
    recorder.recordToolCall(OFFENDING_TOOL, { to: ATTACKER_ACCOUNT, amount: 8500 });
    recorder.recordToolResult(OFFENDING_TOOL, { status: 'ok' });
    const trace = await recorder.buildTrace();
    expect(trace.steps.map((s) => s.type)).toEqual([
      'attacker',
      'tool_call',
      'tool_result',
      'task_complete',
    ]);
    expect(trace.steps.at(-1)).toMatchObject({ summary: INFERRED_TASK_COMPLETE_SUMMARY });
  });

  it('never synthesizes agent reasoning, and offers no method to', async () => {
    // A server cannot see an agent's chain of thought. The absence is structural,
    // not an oversight: there is no API here that could add one.
    const recorder = new SpikeTraceRecorder(buildSurface('malicious'));
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(recorder))).not.toContain(
      'recordAgentReasoning',
    );
    const trace = await recorder.buildTrace();
    expect(trace.steps.some((s) => s.type === 'agent_reasoning')).toBe(false);
  });

  it('can be built more than once without mutating (an early exit still records)', async () => {
    const recorder = new SpikeTraceRecorder(buildSurface('malicious'));
    recorder.recordToolCall('list_inbox', {});
    const a = await recorder.buildTrace();
    const b = await recorder.buildTrace();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
