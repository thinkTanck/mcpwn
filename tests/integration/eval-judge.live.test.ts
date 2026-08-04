import { getAttack, listAttackCodes } from '@/attacks';
import { resolveLiveDetector } from '@/detector/resolve';
import { evaluateAll, type EvalReport, type Metrics } from '@/eval';
import type { Category, Trace, Verdict } from '@/contract';

/**
 * The eval harness driven by the REAL judge, end to end.
 *
 * GATED on `JUDGE_API_KEY`, so it skips in CI and in every credential-free unit
 * run. It costs one live judge call per labeled realization, so run it
 * deliberately:
 *
 *   npx dotenv -e .env.local -- npx vitest run tests/integration/eval-judge.live.test.ts
 *
 * WHAT THIS PROVES, and what it deliberately does not. It proves the pipeline
 * runs against a real model, that the leakage barrier holds on the wire, and
 * that every anchored verdict points at a step that exists. It asserts NO
 * precision or recall value. A test that pinned a number would either fail on
 * normal model variance or, worse, quietly become the place a P/R claim lives —
 * and the measured number belongs in a report produced by `npm run eval:measure`,
 * dated and labelled, not frozen into an assertion.
 */
const LIVE = Boolean(process.env.JUDGE_API_KEY?.trim());

/** One judged call, captured so the assertions can inspect what actually happened. */
interface Judged {
  trace: Trace;
  verdict: Verdict;
  /** The `{taskGoal, trace}` payload that went on the wire, parsed back. */
  payload: { taskGoal: unknown; trace: Record<string, unknown> };
}

describe.runIf(LIVE)('eval harness against the live judge', () => {
  let report: EvalReport;
  const judged: Judged[] = [];
  /** Arity of every detector invocation — a third argument would be a label channel. */
  const arities: number[] = [];

  beforeAll(async () => {
    // The real detector, with `fetch` wrapped purely to observe. It still calls
    // the live API; the wrapper only records the outgoing body so the leakage
    // assertion can be made against the actual wire payload rather than against
    // a re-derivation of it.
    const bodies: string[] = [];
    const detect = resolveLiveDetector({
      fetchImpl: (url, init) => {
        bodies.push(String(init?.body));
        return fetch(url, init);
      },
    });
    if (!detect) throw new Error('JUDGE_API_KEY is set but the live detector did not resolve.');

    // `evaluate` awaits each realization in turn, so the body belonging to a
    // verdict is the LAST one recorded when that verdict resolves. Indexing by
    // call count instead would desync the moment a 429 triggered a retry and
    // pushed a second body for the same realization.
    report = await evaluateAll(async (...args: [Trace, string]) => {
      arities.push(args.length);
      const [trace, taskGoal] = args;
      const verdict = await detect(trace, taskGoal);
      const body = JSON.parse(bodies[bodies.length - 1]!) as {
        messages: Array<{ content: string }>;
      };
      const content = body.messages[0]!.content;
      const inner = content.slice(
        content.indexOf('\n') + 1,
        content.lastIndexOf('</untrusted_trace>'),
      );
      judged.push({
        trace,
        verdict,
        payload: JSON.parse(inner) as Judged['payload'],
      });
      return verdict;
    });
  }, 600_000);

  it('produces an aggregate and a per-category Metrics block', () => {
    const shape = (m: Metrics | undefined) => {
      expect(m).toBeDefined();
      expect(m!.precision).toBeGreaterThanOrEqual(0);
      expect(m!.precision).toBeLessThanOrEqual(1);
      expect(m!.recall).toBeGreaterThanOrEqual(0);
      expect(m!.recall).toBeLessThanOrEqual(1);
      expect(m!.tp + m!.fp + m!.fn + m!.tn).toBe(m!.total);
    };

    shape(report.overall);
    for (const category of listAttackCodes()) shape(report.byCategory[category]);
  });

  it('scores every registered realization exactly once', () => {
    const expected = listAttackCodes().reduce((n, c) => n + getAttack(c).variants.length, 0);
    expect(report.overall.total).toBe(expected);
    expect(judged).toHaveLength(expected);
  });

  it('never hands the detector the held-out GroundTruth', () => {
    // Two independent checks. The detector is called with exactly (trace, goal),
    // so there is no third argument a label could ride in on...
    expect(new Set(arities)).toEqual(new Set([2]));

    for (const { trace, payload } of judged) {
      // ...and the object it receives carries no label field, however named.
      expect(Object.keys(trace)).not.toContain('groundTruth');
      // The wire payload is an ALLOW-LIST: a field added to `Trace` later is
      // withheld by default rather than leaked on arrival.
      expect(Object.keys(payload.trace).sort()).toEqual(['model', 'steps', 'target']);
      expect(JSON.stringify(payload)).not.toContain('groundTruth');
    }
  });

  it('anchors every compromised verdict to a step that exists in its trace', () => {
    for (const { trace, verdict } of judged) {
      if (!verdict.compromised) {
        expect(verdict.stepId).toBeUndefined();
        continue;
      }
      expect(verdict.stepId).toBeDefined();
      expect(trace.steps.map((s) => s.id)).toContain(verdict.stepId);
    }
  });

  it('returns a contract-valid runId on every verdict', () => {
    for (const { trace, verdict } of judged) expect(verdict.runId).toBe(trace.runId);
  });

  it('covers all seven Core-7 categories', () => {
    const covered = Object.keys(report.byCategory).sort() as Category[];
    expect(covered).toEqual(listAttackCodes());
  });
});
