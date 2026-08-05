import { expectTypeOf } from 'vitest';
import type {
  Category,
  Severity,
  Step,
  Trace,
  GroundTruth,
  Verdict,
  RunResult,
  Attack,
} from '@/contract';

describe('type-level contract (compile-time; enforced by tsc --noEmit)', () => {
  it('Category is exactly the Core-7 union', () => {
    expectTypeOf<Category>().toEqualTypeOf<
      'ASI01' | 'ASI02' | 'ASI03' | 'ASI04' | 'ASI05' | 'ASI06' | 'ASI10'
    >();
  });

  it('Severity is exactly the CVSS v4 bands', () => {
    expectTypeOf<Severity>().toEqualTypeOf<'None' | 'Low' | 'Medium' | 'High' | 'Critical'>();
  });

  it('Step.type is the 7-way union', () => {
    expectTypeOf<Step['type']>().toEqualTypeOf<
      | 'principal_instruction'
      | 'agent_reasoning'
      | 'tool_call'
      | 'tool_result'
      | 'memory_read'
      | 'memory_write'
      | 'task_complete'
    >();
  });

  it('Trace is observable-only (steps present; no label/compromiseFlag/groundTruth field)', () => {
    expectTypeOf<Trace>().toHaveProperty('runId').toEqualTypeOf<string>();
    expectTypeOf<Trace>().toHaveProperty('steps').toEqualTypeOf<Step[]>();
    expectTypeOf<Trace>().not.toHaveProperty('label');
    expectTypeOf<Trace>().not.toHaveProperty('compromiseFlag');
    expectTypeOf<Trace>().not.toHaveProperty('groundTruth');
  });

  it('GroundTruth is a separate type (stepId optional)', () => {
    expectTypeOf<GroundTruth>().toHaveProperty('compromised').toEqualTypeOf<boolean>();
    expectTypeOf<GroundTruth>().toHaveProperty('category').toEqualTypeOf<Category>();
    expectTypeOf<GroundTruth['stepId']>().toEqualTypeOf<string | undefined>();
  });

  it('Verdict.stepId is an optional string', () => {
    expectTypeOf<Verdict['stepId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Verdict>().toHaveProperty('severity').toEqualTypeOf<Severity>();
  });

  it('RunResult is unlabeled (trace + verdict; no groundTruth field)', () => {
    expectTypeOf<RunResult>().toHaveProperty('trace').toEqualTypeOf<Trace>();
    expectTypeOf<RunResult>().toHaveProperty('verdict').toEqualTypeOf<Verdict>();
    expectTypeOf<RunResult>().not.toHaveProperty('groundTruth');
  });

  it('Attack exposes build + scenario type signatures only', () => {
    expectTypeOf<Attack>().toHaveProperty('build').toBeFunction();
    expectTypeOf<Attack>().toHaveProperty('scenario').toBeFunction();
    expectTypeOf<Attack['build']>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<Attack['build']>().returns.toHaveProperty('trace').toEqualTypeOf<Trace>();
    expectTypeOf<Attack['build']>()
      .returns.toHaveProperty('groundTruth')
      .toEqualTypeOf<GroundTruth>();
    expectTypeOf<Attack['scenario']>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<Attack['scenario']>().returns.toHaveProperty('taskGoal').toEqualTypeOf<string>();
    expectTypeOf<Attack['scenario']>().returns.toHaveProperty('environment');
  });
});
