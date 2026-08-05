import { StepSchema } from '@/contract';

const base = { id: 's1' };

const validByType: Record<string, Record<string, unknown>> = {
  principal_instruction: {
    ...base,
    type: 'principal_instruction',
    content: 'review my latest email and tell me if anything needs action',
  },
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

  /**
   * The retired name. `attacker` carried the inbound instruction turn, which in
   * 20 of 22 realization pairs is the PRINCIPAL's own request — so the contract
   * typed the authority as the adversary, and `judgeableTrace` serialized that
   * to the judge ([ADR-0011](../../../docs/adr/0011-the-principal-instruction-is-its-own-step-type.md)).
   * It must not be quietly re-admitted alongside its replacement.
   */
  it('rejects the retired `attacker` step type', () => {
    expect(StepSchema.safeParse({ id: 's1', type: 'attacker', content: 'x' }).success).toBe(false);
  });

  it('rejects a step missing its discriminant type', () => {
    expect(StepSchema.safeParse({ id: 's1', content: 'x' }).success).toBe(false);
  });

  it('rejects a step with a missing/empty id', () => {
    expect(StepSchema.safeParse({ type: 'principal_instruction', content: 'x' }).success).toBe(
      false,
    );
    expect(
      StepSchema.safeParse({ id: '', type: 'principal_instruction', content: 'x' }).success,
    ).toBe(false);
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
