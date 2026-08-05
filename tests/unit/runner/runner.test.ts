import { getAttack } from '@/attacks';
import { RunResultSchema, type Category, type Trace, type Verdict } from '@/contract';
import type { McpTargetPort } from '@/harness';
import type { DetectorFn } from '@/eval';
import { detect, type JudgeModelPort } from '@/detector';
import { runMatrix, RunnerCellError } from '@/runner';

/** A deterministic mocked target: yields a fixed, marker-free event stream. */
function mockTarget(): McpTargetPort {
  return {
    async *run(scenario) {
      yield { type: 'principal_instruction', content: scenario.taskGoal };
      yield { type: 'agent_reasoning', content: 'considering the request' };
      yield { type: 'tool_call', tool: 'read_email', args: { mailbox: 'inbox' } };
      yield { type: 'task_complete', summary: 'done' };
    },
  };
}

function verdictFor(trace: Trace, compromised: boolean): Verdict {
  return compromised
    ? {
        runId: trace.runId,
        compromised: true,
        score: 0.8,
        severity: 'High',
        category: trace.category,
        rationale: 'mock',
        stepId: trace.steps[0]!.id,
      }
    : {
        runId: trace.runId,
        compromised: false,
        score: 0.1,
        severity: 'None',
        category: trace.category,
        rationale: 'mock',
      };
}

const robustDetect: DetectorFn = (trace) => verdictFor(trace, false);
const attacksOf = (...codes: Category[]) => codes.map((c) => getAttack(c));

describe('runMatrix — run-matrix over model × attack (mocked ports)', () => {
  it('assembles a RunResult for every cell; none carries groundTruth', async () => {
    const models = ['model-a', 'model-b'];
    const { results, errors } = await runMatrix(models, attacksOf('ASI01', 'ASI02'), {
      target: mockTarget(),
      detect: robustDetect,
    });
    expect(errors).toHaveLength(0);
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(RunResultSchema.safeParse(r).success).toBe(true);
      expect(r).not.toHaveProperty('groundTruth');
    }
    expect(results.map((r) => r.model).sort()).toEqual([
      'model-a',
      'model-a',
      'model-b',
      'model-b',
    ]);
    expect(new Set(results.map((r) => r.category))).toEqual(new Set(['ASI01', 'ASI02']));
  });

  it('produces a deterministic runId per cell and a default target label', async () => {
    const { results } = await runMatrix(['m1'], attacksOf('ASI01'), {
      target: mockTarget(),
      detect: robustDetect,
    });
    expect(results[0]!.runId).toBe('m1::ASI01');
    expect(results[0]!.target).toBe('mock-target');
  });

  it('honours an explicit target label', async () => {
    const { results } = await runMatrix(['m1'], attacksOf('ASI01'), {
      target: mockTarget(),
      detect: robustDetect,
      targetLabel: 'acme-mcp',
    });
    expect(results[0]!.target).toBe('acme-mcp');
  });

  it('the detector receives only (trace, taskGoal) — never groundTruth', async () => {
    const seen: [Trace, string][] = [];
    const spy: DetectorFn = (trace, goal) => {
      seen.push([trace, goal]);
      return verdictFor(trace, false);
    };
    await runMatrix(['m'], attacksOf('ASI06'), { target: mockTarget(), detect: spy });
    expect(seen).toHaveLength(1);
    const [trace, goal] = seen[0]!;
    expect(typeof goal).toBe('string');
    expect(trace).toHaveProperty('steps');
    expect(trace).not.toHaveProperty('groundTruth');
  });

  it('a detector failure becomes a typed RunnerCellError without crashing the matrix', async () => {
    const flaky: DetectorFn = (trace) => {
      if (trace.category === 'ASI02') throw new Error('judge exploded');
      return verdictFor(trace, false);
    };
    const { results, errors } = await runMatrix(['m'], attacksOf('ASI01', 'ASI02'), {
      target: mockTarget(),
      detect: flaky,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.category).toBe('ASI01');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RunnerCellError);
    expect(errors[0]!.model).toBe('m');
    expect(errors[0]!.category).toBe('ASI02');
  });

  it('a target failure is also a typed cell error', async () => {
    const badTarget: McpTargetPort = {
      run() {
        return (async function* () {
          throw new Error('target unreachable');
        })();
      },
    };
    const { results, errors } = await runMatrix(['m'], attacksOf('ASI01'), {
      target: badTarget,
      detect: robustDetect,
    });
    expect(results).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RunnerCellError);
  });

  it('drives the REAL detector with a mocked judge end-to-end', async () => {
    const judge: JudgeModelPort = {
      complete: vi.fn(async () =>
        JSON.stringify({
          compromised: false,
          score: 0,
          severity: 'None',
          category: 'ASI01',
          rationale: 'ok',
          stepId: '',
        }),
      ),
    };
    const detectFn: DetectorFn = (trace, goal) =>
      detect(trace, goal, { judge, judgeConfig: { model: 'm', temperature: 0 } });
    const { results, errors } = await runMatrix(['model-x'], attacksOf('ASI01'), {
      target: mockTarget(),
      detect: detectFn,
    });
    expect(errors).toHaveLength(0);
    expect(results).toHaveLength(1);
    expect(results[0]!.verdict.compromised).toBe(false);
    expect(judge.complete).toHaveBeenCalledTimes(1);
  });
});
