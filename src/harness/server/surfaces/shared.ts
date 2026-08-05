/**
 * HOSTED MCP SERVER — helpers every surface shares.
 *
 * The out-of-band task goal and the role framing come from the REGISTERED attack
 * module, not re-typed here, so the hosted endpoint cannot quietly drift from the
 * fixture the detector is validated against. The tool HANDLERS (what each tool
 * returns) are authored per surface, because a `Scenario.environment` declares
 * tool NAMES and seeded content but not per-call results.
 */
import { getAttack } from '@/attacks';
import type { Category, JsonValue, Scenario, VariantKind } from '@/contract';

/** The pinned-default scenario for a category and framing (the first realization
 *  pair, which the bare kind resolves to). */
export function pinnedScenario(category: Category, kind: VariantKind): Scenario {
  return getAttack(category).scenario(kind);
}

/** Render a seeded email/document record as the plain text an agent reads. */
export function renderMessage(record: Record<string, JsonValue>): string {
  const from = typeof record.from === 'string' ? record.from : undefined;
  const subject = typeof record.subject === 'string' ? record.subject : undefined;
  const body = typeof record.body === 'string' ? record.body : JSON.stringify(record);
  const header = [from ? `From: ${from}` : null, subject ? `Subject: ${subject}` : null]
    .filter((line): line is string => line !== null)
    .join('\n');
  return header === '' ? body : `${header}\n\n${body}`;
}

/** A canned NO-OP success payload for a high-impact tool. Nothing moved. */
export function accepted(confirmation: string): JsonValue {
  return { status: 'ok', confirmation };
}
