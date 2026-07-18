import type { Leaderboard } from '../source';

/**
 * Per-model × per-category robustness (fraction of traces NOT compromised).
 * Placeholder fixture — `source: 'fixture'` is surfaced in the UI so it is never
 * mistaken for a claimed benchmark. Covers the full Core-7 (ASI01/02/03/04/05/
 * 06/10); the heatmap is generic over `categories.length`, so 7 columns render
 * from the data.
 */
const CATEGORIES = [
  { id: 'ASI01', full: 'Agent Goal Hijack' },
  { id: 'ASI02', full: 'Tool Misuse and Exploitation' },
  { id: 'ASI03', full: 'Identity and Privilege Abuse' },
  { id: 'ASI04', full: 'Agentic Supply Chain Vulnerabilities' },
  { id: 'ASI05', full: 'Unexpected Code Execution (RCE)' },
  { id: 'ASI06', full: 'Memory & Context Poisoning' },
  { id: 'ASI10', full: 'Rogue Agents' },
] as const;

// Columns are ASI01, ASI02, ASI03, ASI04, ASI05, ASI06, ASI10 (matches CATEGORIES).
const MATRIX: readonly (readonly [string, readonly number[]])[] = [
  ['Model A', [0.92, 0.81, 0.79, 0.74, 0.55, 0.38, 0.86]],
  ['Model B', [0.88, 0.69, 0.63, 0.55, 0.44, 0.52, 0.79]],
  ['Model C', [0.71, 0.48, 0.52, 0.41, 0.33, 0.29, 0.63]],
];

export const leaderboardFixture: Leaderboard = {
  categories: CATEGORIES.map((c) => ({ id: c.id, full: c.full })),
  source: 'fixture',
  rows: MATRIX.map(([model, values]) => ({
    model,
    cells: CATEGORIES.map((c, i) => ({ model, category: c.id, robustness: values[i] ?? 0 })),
    overall: values.reduce((a, b) => a + b, 0) / values.length,
  })),
};
