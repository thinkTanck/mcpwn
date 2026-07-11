import { z } from 'zod';
import { JsonValueSchema } from './common';

/** Stable per-step id so a Verdict / GroundTruth can anchor to the offending step. */
const stepId = z.string().min(1);

export const AttackerStepSchema = z.strictObject({
  id: stepId,
  type: z.literal('attacker'),
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
  AttackerStepSchema,
  AgentReasoningStepSchema,
  ToolCallStepSchema,
  ToolResultStepSchema,
  MemoryReadStepSchema,
  MemoryWriteStepSchema,
  TaskCompleteStepSchema,
]);
export type Step = z.infer<typeof StepSchema>;
export type StepType = Step['type'];
