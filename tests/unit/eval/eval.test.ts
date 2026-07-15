import { getAttack, listAttackCodes, type AttackModule } from '@/attacks';
import type { Category, GroundTruth, Trace } from '@/contract';
import { metricsFrom, evaluate, evaluateAll, type DetectorFn } from '@/eval';

const CORE_7 = ['ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05', 'ASI06', 'ASI10'] as const;
const rec = (category: Category, actual: boolean, predicted: boolean) => ({
  category,
  actual,
  predicted,
});

// --- mock detectors (test fixtures; each sees ONLY the trace, never groundTruth) ---

const alwaysCompromised: DetectorFn = (trace) => ({
  runId: trace.runId,
  compromised: true,
  score: 1,
  severity: 'High',
  category: trace.category,
  rationale: 'mock',
  stepId: trace.steps[0]!.id,
});

const alwaysNotCompromised: DetectorFn = (trace) => ({
  runId: trace.runId,
  compromised: false,
  score: 0,
  severity: 'None',
  category: trace.category,
  rationale: 'mock',
});

/** An ORACLE fixture simulating a perfect detector: it precomputes the correct
 *  answer per (deterministic) trace. This is a test double — the harness still
 *  only ever hands the detector the trace + goal, never the groundTruth. */
function perfectDetector(attacks: AttackModule[]): DetectorFn {
  const answers = new Map<string, GroundTruth>();
  for (const a of attacks) {
    for (const v of ['malicious', 'benign'] as const) {
      const { trace, groundTruth } = a.build(v);
      answers.set(JSON.stringify(trace), groundTruth);
    }
  }
  return (trace) => {
    const gt = answers.get(JSON.stringify(trace))!;
    return gt.compromised
      ? {
          runId: trace.runId,
          compromised: true,
          score: 1,
          severity: 'Critical',
          category: gt.category,
          rationale: 'oracle',
          stepId: gt.stepId!,
        }
      : {
          runId: trace.runId,
          compromised: false,
          score: 0,
          severity: 'None',
          category: gt.category,
          rationale: 'oracle',
        };
  };
}

describe('metricsFrom — precision/recall math (deterministic)', () => {
  it('perfect predictions -> P = R = 1', () => {
    const records = [
      rec('ASI01', true, true),
      rec('ASI01', false, false),
      rec('ASI02', true, true),
      rec('ASI02', false, false),
    ];
    expect(metricsFrom(records)).toMatchObject({
      precision: 1,
      recall: 1,
      tp: 2,
      fp: 0,
      fn: 0,
      tn: 2,
      total: 4,
    });
  });

  it('always-positive predictions -> recall 1, precision drops', () => {
    expect(metricsFrom([rec('ASI01', true, true), rec('ASI01', false, true)])).toMatchObject({
      precision: 0.5,
      recall: 1,
      tp: 1,
      fp: 1,
    });
  });

  it('always-negative predictions -> recall 0 (precision vacuously 1)', () => {
    expect(metricsFrom([rec('ASI01', true, false), rec('ASI01', false, false)])).toMatchObject({
      recall: 0,
      precision: 1,
      tp: 0,
      fn: 1,
      tn: 1,
    });
  });

  it('no actual positives -> recall vacuously 1', () => {
    const m = metricsFrom([rec('ASI01', false, false), rec('ASI01', false, true)]);
    expect(m.recall).toBe(1);
    expect(m.precision).toBe(0);
  });

  it('empty records -> P = R = 1 vacuously', () => {
    expect(metricsFrom([])).toMatchObject({ precision: 1, recall: 1, total: 0 });
  });

  it('mixed confusion matrix', () => {
    const records = [
      rec('ASI01', true, true),
      rec('ASI01', false, true),
      rec('ASI01', true, false),
      rec('ASI01', false, false),
    ];
    expect(metricsFrom(records)).toMatchObject({
      precision: 0.5,
      recall: 0.5,
      tp: 1,
      fp: 1,
      fn: 1,
      tn: 1,
    });
  });
});

describe('evaluate — mock detectors over the 7 attacks (leakage-safe)', () => {
  it('a perfect detector scores P = R = 1 overall and per category', async () => {
    const attacks = listAttackCodes().map(getAttack);
    const report = await evaluate(attacks, perfectDetector(attacks));
    expect(report.overall).toMatchObject({ precision: 1, recall: 1, total: 14 });
    for (const code of CORE_7) {
      expect(report.byCategory[code]).toMatchObject({ precision: 1, recall: 1, total: 2 });
    }
  });

  it('always-compromised -> recall 1, precision 0.5 (false positives on benign)', async () => {
    const report = await evaluateAll(alwaysCompromised);
    expect(report.overall).toMatchObject({ recall: 1, precision: 0.5, tp: 7, fp: 7, total: 14 });
  });

  it('always-not-compromised -> recall 0 on malicious', async () => {
    const report = await evaluateAll(alwaysNotCompromised);
    expect(report.overall).toMatchObject({ recall: 0, fn: 7, tp: 0, total: 14 });
  });

  it('the detector only ever receives (trace, taskGoal) — never groundTruth', async () => {
    const seen: [Trace, string][] = [];
    const spy: DetectorFn = (trace, taskGoal) => {
      seen.push([trace, taskGoal]);
      return {
        runId: trace.runId,
        compromised: false,
        score: 0,
        severity: 'None',
        category: trace.category,
        rationale: 'x',
      };
    };
    await evaluateAll(spy);
    expect(seen).toHaveLength(14);
    for (const [trace, taskGoal] of seen) {
      expect(typeof taskGoal).toBe('string');
      expect(trace).toHaveProperty('steps');
      expect(trace).not.toHaveProperty('compromised');
      expect(trace).not.toHaveProperty('groundTruth');
    }
  });
});

// The two categories added this wave get their own P/R fixtures. Each needs a
// BENIGN control that scores not-compromised — without it precision is undefined
// and we could only ever measure recall.
describe('P/R for the new Core-7 categories (ASI03, ASI05)', () => {
  const NEW_CODES = ['ASI03', 'ASI05'] as const;

  it.each(NEW_CODES)(
    '%s: a perfect detector scores P = R = 1 (malicious = TP, benign = TN)',
    async (code) => {
      const attack = getAttack(code);
      const report = await evaluate([attack], perfectDetector([attack]));
      expect(report.byCategory[code]).toMatchObject({
        precision: 1,
        recall: 1,
        tp: 1,
        fp: 0,
        fn: 0,
        tn: 1,
        total: 2,
      });
    },
  );

  it.each(NEW_CODES)('%s: the benign control is a not-compromised true negative', (code) => {
    const { trace, groundTruth } = getAttack(code).build('benign');
    expect(groundTruth).toEqual({ compromised: false, category: code });
    // A perfect detector predicts not-compromised on that benign trace (a TN).
    const verdict = perfectDetector([getAttack(code)])(
      trace,
      getAttack(code).scenario('benign').taskGoal,
    );
    return Promise.resolve(verdict).then((v) => expect(v.compromised).toBe(false));
  });

  it.each(NEW_CODES)(
    '%s: the benign control is what makes precision measurable (always-compromised -> P 0.5)',
    async (code) => {
      const report = await evaluate([getAttack(code)], alwaysCompromised);
      // malicious -> TP, benign -> FP: recall stays 1 but precision drops to 0.5.
      expect(report.byCategory[code]).toMatchObject({
        recall: 1,
        precision: 0.5,
        tp: 1,
        fp: 1,
        total: 2,
      });
    },
  );

  it('leakage barrier holds: the detector only ever sees (trace, taskGoal), never groundTruth', async () => {
    const attacks = NEW_CODES.map(getAttack);
    const seen: [Trace, string][] = [];
    const spy: DetectorFn = (trace, taskGoal) => {
      seen.push([trace, taskGoal]);
      return {
        runId: trace.runId,
        compromised: false,
        score: 0,
        severity: 'None',
        category: trace.category,
        rationale: 'x',
      };
    };
    await evaluate(attacks, spy);
    expect(seen).toHaveLength(4); // 2 categories x {malicious, benign}
    for (const [trace] of seen) {
      expect(trace).not.toHaveProperty('groundTruth');
      expect(trace).not.toHaveProperty('compromised');
    }
  });
});
