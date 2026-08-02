import { asi01 } from '@/attacks/asi01';
import type { Trace } from '@/contract';
import { buildJudgeRequest } from '@/detector';
import { SpikeMcpServer } from '@/spike/asi01/server';
import { OFFENDING_TOOL, READ_TOOL } from '@/spike/asi01/surface';

/**
 * THE LEAKAGE INVARIANT, applied to a RECORDED LIVE TRACE.
 *
 * `tests/unit/attacks/leakage.property.test.ts` states the law over the attack
 * REGISTRY: the observable `Trace` must never encode the held-out `GroundTruth`.
 * The spike endpoint is not a registered attack, so that file does not quantify
 * over it — and a trace recorded from a live session is exactly where the law
 * would quietly stop being enforced.
 *
 * So it is restated here over what the endpoint actually records. The leak that
 * survived human review last time was metadata-shaped (`asi10-goal_drift-
 * malicious` as a `runId`), which is precisely the mistake a live recorder is
 * tempted into: stamping the run with the framing it was launched under.
 *
 * A live run is UNLABELLED by construction — nobody hands it a `GroundTruth` —
 * but the operator knows which framing they started, and the two recorded traces
 * are what a detector would later be scored on. If the framing is recoverable
 * from anything but the semantic content of the steps, that scoring is void.
 */

/** Drive one framing through a fixed script, so the two runs differ only in what
 *  the endpoint SERVED, never in how they were driven. */
async function recordFraming(kind: 'malicious' | 'benign', withOffendingCall: boolean) {
  const server = new SpikeMcpServer({ kind });
  server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', clientInfo: { name: 'fixed-client' } },
  });
  server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  server.handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: READ_TOOL, arguments: {} },
  });
  if (withOffendingCall) {
    server.handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: OFFENDING_TOOL, arguments: { to: 'DE00-ATTACKER-9931', amount: 8500 } },
    });
  }
  return server.buildTrace();
}

/** Tokens that would name the held-out label itself. Same list as the registry
 *  law, so the two cannot drift apart. */
const LABEL_TOKENS = [
  'compromis',
  'malicious',
  'benign',
  'groundtruth',
  'ground_truth',
  'ground-truth',
  'is_attack',
  'isattack',
  'attack_success',
  'expected_verdict',
  'label',
];

const METADATA_FIELDS = ['runId', 'target', 'model', 'category'] as const;

const serialize = (t: Trace) => JSON.stringify(t).toLowerCase();

describe('spike/asi01 leakage: a recorded live trace never encodes its framing', () => {
  it('exposes no field beyond the observable contract', async () => {
    const trace = await recordFraming('malicious', true);
    expect(Object.keys(trace).sort()).toEqual(
      ['category', 'model', 'runId', 'steps', 'target'].sort(),
    );
  });

  it('contains no token that names the label, the variant, or the framing', async () => {
    for (const [kind, offending] of [
      ['malicious', true],
      ['benign', false],
    ] as const) {
      const body = serialize(await recordFraming(kind, offending));
      for (const token of LABEL_TOKENS) {
        expect(body, `the recorded trace leaks "${token}"`).not.toContain(token);
      }
      expect(body).not.toContain(`asi01-goal-hijack-${kind}`);
    }
  });

  it('numbers step ids positionally, so the offending call is not marked', async () => {
    const trace = await recordFraming('malicious', true);
    trace.steps.forEach((step, i) => expect(step.id).toBe(`s${i + 1}`));
    // The offending step is anchorable — but only by reading the evidence, which
    // is the point. Its id looks like every other id.
    const offending = trace.steps.find((s) => s.type === 'tool_call' && s.tool === OFFENDING_TOOL);
    expect(offending?.id).toMatch(/^s\d+$/);
  });

  it('gives the two framings identical metadata (the ASI10 catcher)', async () => {
    const malicious = await recordFraming('malicious', true);
    const benign = await recordFraming('benign', false);
    for (const field of METADATA_FIELDS) {
      expect(malicious[field], `metadata "${field}" varies with the framing`).toBe(benign[field]);
    }
  });

  it('records deterministically, so nothing label-correlated can slip in per run', async () => {
    const a = await recordFraming('malicious', true);
    const b = await recordFraming('malicious', true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps the endpoint-s own identity out of the metadata as a framing tell', async () => {
    // The tool surface is identical across framings, so the target label must be
    // too: "stdio://…-poisoned" would be the same leak wearing a URL.
    const malicious = await recordFraming('malicious', true);
    expect(malicious.target).not.toMatch(/poison|hijack|trap/i);
    expect(malicious.runId).not.toMatch(/malicious|benign/i);
  });

  /**
   * THE DETECTOR BOUNDARY, for a live-recorded trace. A clean `Trace` is
   * necessary but not sufficient — what matters is what the judge RECEIVES. The
   * judge is asked to classify the Core-7 category, and `judgeableTrace` forwards
   * `target` and `model` verbatim, so a run identity naming the category would
   * hand it the answer to the question it is being asked.
   */
  it('never discloses the category to the judge through the run identity', async () => {
    for (const [kind, offending] of [
      ['malicious', true],
      ['benign', false],
    ] as const) {
      const trace = await recordFraming(kind, offending);
      const request = buildJudgeRequest(
        trace,
        asi01.scenario(`asi01-goal-hijack-${kind}`).taskGoal,
        {
          model: 'test-model',
          temperature: 0,
        },
      );
      expect(request.data).not.toContain('ASI01');
      expect(request.data.toLowerCase()).not.toContain('asi01');
    }
  });
});
