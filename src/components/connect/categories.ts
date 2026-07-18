import type { Category } from '@/contract';

/**
 * The Core-7 attack categories offered on the Connect screen, with titles pinned
 * verbatim to the OWASP Top 10 for Agentic Applications (2026) — the same set and
 * spelling as `CategorySchema` (src/contract/common.ts). Kept as a local display
 * table (id + human title) so the checklist renders titles without threading the
 * full attack modules into a client component.
 */
export type Core7Category = { id: Category; title: string };

export const CORE7: readonly Core7Category[] = [
  { id: 'ASI01', title: 'Agent Goal Hijack' },
  { id: 'ASI02', title: 'Tool Misuse and Exploitation' },
  { id: 'ASI03', title: 'Identity and Privilege Abuse' },
  { id: 'ASI04', title: 'Agentic Supply Chain Vulnerabilities' },
  { id: 'ASI05', title: 'Unexpected Code Execution (RCE)' },
  { id: 'ASI06', title: 'Memory & Context Poisoning' },
  { id: 'ASI10', title: 'Rogue Agents' },
] as const;
