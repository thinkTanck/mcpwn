import { StepSchema } from '@/contract';

const base = { id: 's1' };

const validByType: Record<string, Record<string, unknown>> = {
  attacker: { ...base, type: 'attacker', content: 'ignore previous instructions' },
  agent_reasoning: { ...base, type: 'agent_reasoning', content: 'the user asked me to...' },
  tool_call: { ...base, type: 'tool_call', tool: 'fs.read', args: { path: '/etc/passwd' } },
  tool_result: { ...base, type: 'tool_result', tool: 'fs.read', result: 'root:x:0:0' },
  memory_read: { ...base, type: 'memory_read', key: 'prefs', value: 'v' },
  memory_write: { ...base, type: 'memory_write', key: 'prefs', value: { nested: true } },
  task_complete: { ...base, type: 'task_complete', summary: 'done' },
};

describe('StepSchema — 7 observable step types', () => {
  it.each(Object.entries(validByType))('validates a %s step', (_type, step) => {
    expect(StepSchema.safeParse(step).success).toBe(true);
  });

  it('rejects an unknown step type', () => {
    expect(StepSchema.safeParse({ id: 's1', type: 'exfiltrate', content: 'x' }).success).toBe(
      false,
    );
  });

  it('rejects a step missing its discriminant type', () => {
    expect(StepSchema.safeParse({ id: 's1', content: 'x' }).success).toBe(false);
  });

  it('rejects a step with a missing/empty id', () => {
    expect(StepSchema.safeParse({ type: 'attacker', content: 'x' }).success).toBe(false);
    expect(StepSchema.safeParse({ id: '', type: 'attacker', content: 'x' }).success).toBe(false);
  });

  it.each(Object.entries(validByType))(
    'is STRICT: rejects a %s step carrying a `label` leakage key',
    (_type, step) => {
      expect(StepSchema.safeParse({ ...step, label: 'compromised' }).success).toBe(false);
    },
  );

  it.each(Object.entries(validByType))(
    'is STRICT: rejects a %s step carrying a `compromiseFlag` leakage key',
    (_type, step) => {
      expect(StepSchema.safeParse({ ...step, compromiseFlag: true }).success).toBe(false);
    },
  );

  it('task_complete summary is optional', () => {
    expect(StepSchema.safeParse({ id: 's9', type: 'task_complete' }).success).toBe(true);
  });
});
