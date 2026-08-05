import { z } from 'zod';
import { JsonValueSchema } from './common';

/** Stable per-step id so a Verdict / GroundTruth can anchor to the offending step. */
const stepId = z.string().min(1);

/**
 * THE INBOUND INSTRUCTION TURN — the task goal as the PRINCIPAL stated it.
 *
 * The principal is the authority on whose behalf the agent acts. Under
 * [ADR-0006](../../docs/adr/0006-mcpwn-is-the-mcp-server.md) their instruction
 * reaches the agent OUT OF BAND on a channel we control (a published MCP prompt
 * fetched from our endpoint, or the goal the operator pastes), so it is
 * observable by construction — and it is the ONLY inbound turn a hosted run can
 * observe. Untrusted third-party content never arrives as a turn: it arrives as
 * a `tool_result` we serve, a `memory_read` off memory we seeded, or a tool
 * description in the listing we publish.
 *
 * This type used to be called `attacker`, which was wrong in 20 of 22
 * realization pairs and printed `"type": "attacker"` to the judge on the very
 * step that establishes legitimate authority. The type reports WHO SENT THE TURN
 * — a channel fact the server knows — and never whether the content is
 * trustworthy, which is the question the detector exists to answer.
 * See [ADR-0011](../../docs/adr/0011-the-principal-instruction-is-its-own-step-type.md).
 */
export const PrincipalInstructionStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('principal_instruction'),
  content: z.string(),
});

export const AgentReasoningStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('agent_reasoning'),
  content: z.string(),
});

export const ToolCallStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('tool_call'),
  tool: z.string().min(1),
  args: z.record(z.string(), JsonValueSchema),
});

export const ToolResultStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('tool_result'),
  tool: z.string().min(1),
  result: JsonValueSchema,
});

export const MemoryReadStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('memory_read'),
  key: z.string().min(1),
  value: JsonValueSchema,
});

export const MemoryWriteStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('memory_write'),
  key: z.string().min(1),
  value: JsonValueSchema,
});

export const TaskCompleteStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('task_complete'),
  summary: z.string().optional(),
});

/**
 * An observable trace step — a 7-way discriminated union on `type`. Each variant
 * is STRICT: a `label`, `compromiseFlag`, or any other out-of-band field is
 * rejected. The held-out label never rides along a step (leakage separation).
 */
export const StepSchema = z.discriminatedUnion('type', [
  PrincipalInstructionStepSchema,
  AgentReasoningStepSchema,
  ToolCallStepSchema,
  ToolResultStepSchema,
  MemoryReadStepSchema,
  MemoryWriteStepSchema,
  TaskCompleteStepSchema,
]);
export type Step = z.infer<typeof StepSchema>;
export type StepType = Step['type'];
