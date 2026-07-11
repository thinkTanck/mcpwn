import { TraceSchema } from '@/contract';

const validTrace = {
  runId: 'run-1',
  target: 'acme-agent',
  model: 'claude-x',
  category: 'ASI01',
  steps: [
    { id: 's1', type: 'attacker', content: 'ignore previous instructions' },
    { id: 's2', type: 'agent_reasoning', content: 'the user asked me to help' },
    { id: 's3', type: 'tool_call', tool: 'email.send', args: { to: 'x@y.z' } },
    { id: 's4', type: 'task_complete', summary: 'ok' },
  ],
};

describe('TraceSchema — observable only', () => {
  it('parses a well-formed trace', () => {
    expect(TraceSchema.safeParse(validTrace).success).toBe(true);
  });

  it('accepts an empty step list (the detector has an empty-trace pre-check)', () => {
    expect(TraceSchema.safeParse({ ...validTrace, steps: [] }).success).toBe(true);
  });

  it('rejects a category outside Core-5', () => {
    expect(TraceSchema.safeParse({ ...validTrace, category: 'ASI07' }).success).toBe(false);
  });

  it('leakage guard: rejects a trace whose step carries a `label`', () => {
    const leaky = {
      ...validTrace,
      steps: [{ id: 's1', type: 'attacker', content: 'x', label: 'compromised' }],
    };
    expect(TraceSchema.safeParse(leaky).success).toBe(false);
  });

  it('leakage guard: rejects a trace whose step carries a `compromiseFlag`', () => {
    const leaky = {
      ...validTrace,
      steps: [{ id: 's1', type: 'tool_call', tool: 't', args: {}, compromiseFlag: true }],
    };
    expect(TraceSchema.safeParse(leaky).success).toBe(false);
  });

  it('is STRICT: rejects a top-level `groundTruth` (label must never ride the trace)', () => {
    expect(
      TraceSchema.safeParse({ ...validTrace, groundTruth: { compromised: true } }).success,
    ).toBe(false);
  });

  it('rejects a missing required field (runId)', () => {
    const noRunId = {
      target: validTrace.target,
      model: validTrace.model,
      category: validTrace.category,
      steps: validTrace.steps,
    };
    expect(TraceSchema.safeParse(noRunId).success).toBe(false);
  });
});
