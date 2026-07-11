import { z } from 'zod';

/**
 * OWASP Agentic Top 10 (2026) — the Core-5 categories in scope.
 * ASI01 Agent Goal Hijack · ASI02 Tool Misuse & Exploitation ·
 * ASI04 Agentic Supply Chain · ASI06 Memory & Context Poisoning · ASI10 Rogue Agents.
 */
export const CategorySchema = z.enum(['ASI01', 'ASI02', 'ASI04', 'ASI06', 'ASI10']);
export type Category = z.infer<typeof CategorySchema>;

/**
 * CVSS v4.0 qualitative severity bands (as a string). The numeric AIVSS score
 * is left open — this is the qualitative band only.
 */
export const SeveritySchema = z.enum(['None', 'Low', 'Medium', 'High', 'Critical']);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Arbitrary observable JSON payload — tool arguments/results and memory values.
 * Recursive, so it accepts nested arrays and string-keyed objects.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
