import type { Category } from '@/contract';

/**
 * The Core-7 as the Home front door lists them. Titles are the OWASP Agentic
 * Top 10 (2026) verbatim spellings, pinned so they never drift: ASI02/03 use
 * "and", ASI04 = "Agentic Supply Chain Vulnerabilities", ASI05 keeps "(RCE)",
 * ASI06 uses "&". `num` mirrors the ASI code numeral.
 */
export type Core7Entry = { num: string; id: Category; title: string };

export const CORE7: Core7Entry[] = [
  { num: '01', id: 'ASI01', title: 'Agent Goal Hijack' },
  { num: '02', id: 'ASI02', title: 'Tool Misuse and Exploitation' },
  { num: '03', id: 'ASI03', title: 'Identity and Privilege Abuse' },
  { num: '04', id: 'ASI04', title: 'Agentic Supply Chain Vulnerabilities' },
  { num: '05', id: 'ASI05', title: 'Unexpected Code Execution (RCE)' },
  { num: '06', id: 'ASI06', title: 'Memory & Context Poisoning' },
  { num: '10', id: 'ASI10', title: 'Rogue Agents' },
];
