import fc from 'fast-check';
import { StepSchema, TraceSchema, VerdictSchema, RunResultSchema } from '@/contract';

const categoryArb = fc.constantFrom('ASI01', 'ASI02', 'ASI04', 'ASI06', 'ASI10');
const severityArb = fc.constantFrom('None', 'Low', 'Medium', 'High', 'Critical');
const nonEmpty = fc.string({ minLength: 1, maxLength: 20 });
const idArb = fc.string({ minLength: 1, maxLength: 12 });
const scoreArb = fc.double({ min: 0, max: 1, noNaN: true });

// Flat JSON (depth <= 2). Object keys are <= 6 chars to avoid `__proto__`/`constructor`.
const scalar = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null));
const safeKey = fc.string({ minLength: 1, maxLength: 6 });
const jsonArb = fc.oneof(
  scalar,
  fc.array(scalar, { maxLength: 3 }),
  fc.dictionary(safeKey, scalar, { maxKeys: 3 }),
);

const stepArb = fc.oneof(
  fc.record({ id: idArb, type: fc.constant('attacker'), content: fc.string() }),
  fc.record({ id: idArb, type: fc.constant('agent_reasoning'), content: fc.string() }),
  fc.record({
    id: idArb,
    type: fc.constant('tool_call'),
    tool: nonEmpty,
    args: fc.dictionary(safeKey, jsonArb, { maxKeys: 3 }),
  }),
  fc.record({ id: idArb, type: fc.constant('tool_result'), tool: nonEmpty, result: jsonArb }),
  fc.record({ id: idArb, type: fc.constant('memory_read'), key: nonEmpty, value: jsonArb }),
  fc.record({ id: idArb, type: fc.constant('memory_write'), key: nonEmpty, value: jsonArb }),
  fc.record({ id: idArb, type: fc.constant('task_complete'), summary: fc.string() }),
);

const traceArb = fc.record({
  runId: nonEmpty,
  target: nonEmpty,
  model: nonEmpty,
  category: categoryArb,
  steps: fc.array(stepArb, { maxLength: 6 }),
});

const validVerdictArb = fc.boolean().chain((compromised) => {
  const common = {
    runId: nonEmpty,
    compromised: fc.constant(compromised),
    score: scoreArb,
    severity: severityArb,
    category: categoryArb,
    rationale: fc.string(),
  };
  return compromised ? fc.record({ ...common, stepId: idArb }) : fc.record(common);
});

const runResultArb = fc.record({
  runId: nonEmpty,
  target: nonEmpty,
  model: nonEmpty,
  category: categoryArb,
  trace: traceArb,
  verdict: validVerdictArb,
});

describe('property: Verdict invariant (compromised <=> stepId defined)', () => {
  it('every valid verdict parses and preserves the invariant', () => {
    fc.assert(
      fc.property(validVerdictArb, (v) => {
        const r = VerdictSchema.safeParse(v);
        expect(r.success).toBe(true);
        if (r.success) {
          expect(r.data.compromised).toBe(r.data.stepId !== undefined);
        }
      }),
    );
  });

  it('the schema rejects every invariant violation', () => {
    const violating = fc.oneof(
      fc.record({
        runId: nonEmpty,
        compromised: fc.constant(true),
        score: scoreArb,
        severity: severityArb,
        category: categoryArb,
        rationale: fc.string(),
      }),
      fc.record({
        runId: nonEmpty,
        compromised: fc.constant(false),
        stepId: idArb,
        score: scoreArb,
        severity: severityArb,
        category: categoryArb,
        rationale: fc.string(),
      }),
    );
    fc.assert(
      fc.property(violating, (v) => {
        expect(VerdictSchema.safeParse(v).success).toBe(false);
      }),
    );
  });
});

describe('property: leakage guards', () => {
  it('a Step carrying any label/compromiseFlag key is rejected', () => {
    fc.assert(
      fc.property(stepArb, fc.constantFrom('label', 'compromiseFlag'), (step, key) => {
        expect(StepSchema.safeParse({ ...step, [key]: 'leak' }).success).toBe(false);
      }),
    );
  });

  it('a RunResult carrying a groundTruth key is rejected (live runs are unlabeled)', () => {
    fc.assert(
      fc.property(runResultArb, (rr) => {
        expect(RunResultSchema.safeParse(rr).success).toBe(true);
        const labeled = {
          ...rr,
          groundTruth: { compromised: true, stepId: 's1', category: 'ASI01' },
        };
        expect(RunResultSchema.safeParse(labeled).success).toBe(false);
      }),
    );
  });
});

describe('property: parse round-trips (no coercion or stripping)', () => {
  it('Trace round-trips', () => {
    fc.assert(
      fc.property(traceArb, (t) => {
        const r = TraceSchema.safeParse(t);
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual(t);
      }),
    );
  });

  it('Verdict round-trips', () => {
    fc.assert(
      fc.property(validVerdictArb, (v) => {
        const r = VerdictSchema.safeParse(v);
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual(v);
      }),
    );
  });

  it('RunResult round-trips', () => {
    fc.assert(
      fc.property(runResultArb, (rr) => {
        const r = RunResultSchema.safeParse(rr);
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual(rr);
      }),
    );
  });
});
