import { buildHostedSurface } from '@/harness/server/surfaces';
import {
  HostedTraceRecorder,
  INFERRED_TASK_COMPLETE_SUMMARY,
  UNKNOWN_CLIENT,
} from '@/harness/server/recorder';

const surface = (kind: 'malicious' | 'benign' = 'malicious') => buildHostedSurface('ASI01', kind);

describe('server/recorder: the principal instruction is the first and only inbound turn', () => {
  it('opens the trace with a single principal_instruction carrying the task goal', async () => {
    const rec = new HostedTraceRecorder(surface());
    const trace = await rec.buildTrace();
    const principals = trace.steps.filter((s) => s.type === 'principal_instruction');
    expect(principals).toHaveLength(1);
    expect(trace.steps[0]!.type).toBe('principal_instruction');
    if (trace.steps[0]!.type === 'principal_instruction') {
      expect(trace.steps[0]!.content).toBe(surface().taskGoal);
    }
  });

  it('never records an attacker step or an agent_reasoning step (unobservable)', async () => {
    const rec = new HostedTraceRecorder(surface());
    rec.recordToolCall('read_email', { mailbox: 'inbox' });
    rec.recordToolResult('read_email', { body: 'x' }, {});
    const trace = await rec.buildTrace();
    const types = new Set(trace.steps.map((s) => s.type));
    expect(types.has('agent_reasoning')).toBe(false);
    // The removed 'attacker' type is not part of the contract union at all.
    expect([...types].some((t) => (t as string) === 'attacker')).toBe(false);
  });
});

describe('server/recorder: observable tool calls become tool_call + tool_result', () => {
  it('records the agent decision and the served result, in order', async () => {
    const rec = new HostedTraceRecorder(surface());
    rec.recordToolCall('transfer_funds', { to: 'x', amount: 10 });
    rec.recordToolResult('transfer_funds', { status: 'ok' }, {});
    const trace = await rec.buildTrace();
    const kinds = trace.steps.map((s) => s.type);
    expect(kinds).toEqual(['principal_instruction', 'tool_call', 'tool_result', 'task_complete']);
  });
});

describe('server/recorder: memory-backed tools produce memory steps', () => {
  it('records a memory_write and a memory_read for the ASI06 memory tools', async () => {
    const asi06 = buildHostedSurface('ASI06', 'malicious');
    const rec = new HostedTraceRecorder(asi06);
    rec.recordToolCall('remember', { key: 'standing_instructions', value: 'note' });
    rec.recordToolResult(
      'remember',
      { key: 'standing_instructions', value: 'note' },
      {
        key: 'standing_instructions',
      },
    );
    rec.recordToolCall('recall', { key: 'standing_instructions' });
    rec.recordToolResult('recall', 'note', { key: 'standing_instructions' });
    const trace = await rec.buildTrace();
    const memWrite = trace.steps.find((s) => s.type === 'memory_write');
    const memRead = trace.steps.find((s) => s.type === 'memory_read');
    expect(memWrite).toMatchObject({ key: 'standing_instructions' });
    expect(memRead).toMatchObject({ key: 'standing_instructions', value: 'note' });
  });
});

describe('server/recorder: task_complete is INFERRED and labelled', () => {
  it('appends exactly one task_complete whose summary states it is inferred', async () => {
    const rec = new HostedTraceRecorder(surface());
    const trace = await rec.buildTrace();
    const complete = trace.steps.filter((s) => s.type === 'task_complete');
    expect(complete).toHaveLength(1);
    if (complete[0]!.type === 'task_complete') {
      expect(complete[0]!.summary).toBe(INFERRED_TASK_COMPLETE_SUMMARY);
      expect(complete[0]!.summary).toMatch(/inferred/i);
    }
  });
});

describe('server/recorder: run identity carries no held-out label', () => {
  it('derives a kind-free runId from the pinned realization slug', async () => {
    const trace = await new HostedTraceRecorder(surface('malicious')).buildTrace();
    expect(trace.runId).toBe('asi01-goal-hijack');
    expect(trace.runId).not.toMatch(/malicious|benign/);
  });

  it('labels the model from the observed client, or unknown-client when none', async () => {
    const rec = new HostedTraceRecorder(surface());
    let trace = await rec.buildTrace();
    expect(trace.model).toBe(UNKNOWN_CLIENT);
    rec.observeClient({ name: 'some-agent', version: '1.0' });
    trace = await rec.buildTrace();
    expect(trace.model).toBe('some-agent');
  });

  it('a pinned model wins over the client name', async () => {
    const rec = new HostedTraceRecorder(surface(), { model: 'pinned-model' });
    rec.observeClient({ name: 'some-agent' });
    const trace = await rec.buildTrace();
    expect(trace.model).toBe('pinned-model');
  });
});
