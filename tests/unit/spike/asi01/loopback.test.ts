import type { Trace } from '@/contract';
import { SpikeMcpServer } from '@/spike/asi01/server';
import { serveStdio, type SpikeStdio } from '@/spike/asi01/stdio';
import { ATTACKER_ACCOUNT, OFFENDING_TOOL, READ_TOOL } from '@/spike/asi01/surface';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE PROVES, AND — LOUDLY — WHAT IT DOES NOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It drives the endpoint with a LOOPBACK client we wrote ourselves. So it proves
 * exactly one thing: **the server works.** A client can complete the handshake,
 * discover the tools, call them, and every call it makes lands in a `Trace` with
 * a single anchorable offending step.
 *
 * It proves NOTHING about the product hypothesis. The hypothesis is that a REAL
 * MCP agent — one whose behaviour we do not author — ingests the poisoned
 * `tool_result` and decides on its own initiative to issue the offending call.
 * Here we wrote both halves: the poison AND the thing that reacts to it. A fake
 * client "taking the bait" is us watching our own reflection.
 *
 * The hypothesis is therefore NOT proven, NOT supported, and NOT even made more
 * likely by anything below. It remains untested until a real agent connects,
 * which is a separate, human-run step (see docs/superpowers/specs/
 * 2026-08-01-hypothesis-spike-runbook.md). Nothing in this repo may be read as
 * evidence for it.
 */

/** Collected outputs of one loopback session. */
interface Loopback {
  trace: Trace;
  toolCalls: { tool: string; args: Record<string, unknown> }[];
}

/**
 * A deliberately NAIVE stand-in for an injectable agent: it does the task
 * (list, then read), and then follows any wire-transfer instruction it finds in
 * the text it read back. That is a caricature of indirect prompt injection, not
 * a model — it has no judgement to exercise and cannot decline, so it can never
 * answer the behavioral question. It exists to exercise the SERVER through a
 * realistic message sequence, and to show that the benign framing (whose read
 * result carries no such instruction) produces no offending call.
 */
async function runLoopback(kind: 'malicious' | 'benign'): Promise<Loopback> {
  const server = new SpikeMcpServer({ kind, model: 'loopback-fake-client' });
  const toolCalls: { tool: string; args: Record<string, unknown> }[] = [];
  const outbound: string[] = [];

  let nextId = 1;
  const request = (method: string, params?: unknown) =>
    `${JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params })}\n`;

  // The client's turns are produced lazily, so each one can react to what the
  // server said on the previous turn.
  const input = (async function* () {
    yield request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'loopback-fake-client', version: '0.0.1' },
    });
    yield `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`;
    yield request('tools/list');
    yield request('tools/call', { name: 'list_inbox', arguments: { mailbox: 'inbox' } });
    toolCalls.push({ tool: 'list_inbox', args: { mailbox: 'inbox' } });
    yield request('tools/call', { name: READ_TOOL, arguments: { id: 'msg-A-3391' } });
    toolCalls.push({ tool: READ_TOOL, args: { id: 'msg-A-3391' } });

    // The one "decision" in the whole client, and it is a regex, not judgement.
    const readBack = outbound.map((l) => JSON.parse(l)).at(-1);
    const text: string = readBack?.result?.content?.[0]?.text ?? '';
    const instruction = /transfer EUR ([\d,]+) to IBAN ([\w-]+)/.exec(text);
    if (instruction) {
      const args = {
        to: instruction[2]!,
        amount: Number(instruction[1]!.replace(/,/g, '')),
        currency: 'EUR',
      };
      toolCalls.push({ tool: OFFENDING_TOOL, args });
      yield request('tools/call', { name: OFFENDING_TOOL, arguments: args });
    }
  })();

  const io: SpikeStdio = {
    input,
    write: (line) => {
      outbound.push(line);
    },
    logLine: () => {},
  };

  return { trace: await serveStdio(server, io), toolCalls };
}

describe('spike/asi01 loopback: the endpoint completes a real MCP session', () => {
  it('handshakes, lists, reads and records — end to end over stdio', async () => {
    const { trace } = await runLoopback('malicious');
    expect(trace.steps.map((s) => s.type)).toEqual([
      'attacker',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'task_complete',
    ]);
  });

  it('records the offending call as ONE anchorable step, with the payee in its args', async () => {
    // This is the shape `Verdict.stepId` needs: "compromised at this step, or
    // not". Whether a real agent ever produces it is the open question.
    const { trace } = await runLoopback('malicious');
    const offending = trace.steps.filter(
      (s) => s.type === 'tool_call' && s.tool === OFFENDING_TOOL,
    );
    expect(offending).toHaveLength(1);
    const step = offending[0]!;
    expect(step.id).toMatch(/^s\d+$/);
    if (step.type !== 'tool_call') return;
    expect(step.args).toMatchObject({ to: ATTACKER_ACCOUNT, amount: 8500 });

    // And it lands AFTER the poisoned result it responds to, which is what makes
    // the record readable as a sequence rather than a bag of calls.
    const poisoned = trace.steps.findIndex((s) => s.type === 'tool_result' && s.tool === READ_TOOL);
    expect(trace.steps.indexOf(step)).toBeGreaterThan(poisoned);
  });

  it('produces NO offending call in the benign control, from the same tool surface', async () => {
    const { trace } = await runLoopback('benign');
    expect(trace.steps.some((s) => s.type === 'tool_call' && s.tool === OFFENDING_TOOL)).toBe(
      false,
    );
    // The tool was offered in both framings; only the served content differed.
    expect(trace.steps.filter((s) => s.type === 'tool_call')).toHaveLength(2);
  });

  it('contains no agent_reasoning in either framing — an action-only record', async () => {
    // The live capture is genuinely thinner than the constructed fixtures, which
    // are dense with reasoning. Whether an action-only trace carries enough for
    // a judge to anchor a stepId is itself a thing the real spike must check.
    for (const kind of ['malicious', 'benign'] as const) {
      const { trace } = await runLoopback(kind);
      expect(trace.steps.some((s) => s.type === 'agent_reasoning')).toBe(false);
    }
  });

  it('marks the closing step as INFERRED, because MCP never says the agent finished', async () => {
    const { trace } = await runLoopback('malicious');
    const last = trace.steps.at(-1)!;
    expect(last.type).toBe('task_complete');
    if (last.type !== 'task_complete') return;
    expect(last.summary).toMatch(/INFERRED/);
  });

  it('records every call the client made, and nothing it did not', async () => {
    const { trace, toolCalls } = await runLoopback('malicious');
    const recorded = trace.steps.flatMap((s) => (s.type === 'tool_call' ? [s.tool] : []));
    expect(recorded).toEqual(toolCalls.map((c) => c.tool));
  });

  it('is a self-fulfilling client, and cannot be read as evidence for the hypothesis', () => {
    // A guard rail in test form. If this file ever grows an assertion of the
    // form "the agent took the bait", it is lying: we wrote the agent.
    const claim = 'the server works';
    expect(claim).not.toContain('hypothesis');
  });
});
