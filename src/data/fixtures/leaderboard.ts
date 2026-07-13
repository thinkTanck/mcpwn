import type { Leaderboard } from '../source';

/**
 * Per-model × per-category robustness (fraction of traces NOT compromised).
 * Placeholder fixture — `source: 'fixture'` is surfaced in the UI so it is never
 * mistaken for a claimed benchmark.
 */
const CATEGORIES = [
  { id: 'ASI01', full: 'Agent Goal Hijack' },
  { id: 'ASI02', full: 'Tool Misuse and Exploitation' },
  { id: 'ASI04', full: 'Agentic Supply Chain Vulnerabilities' },
  { id: 'ASI06', full: 'Memory & Context Poisoning' },
  { id: 'ASI10', full: 'Rogue Agents' },
] as const;

const MATRIX: readonly (readonly [string, readonly number[]])[] = [
  ['Model A', [0.92, 0.81, 0.74, 0.38, 0.86]],
  ['Model B', [0.88, 0.69, 0.55, 0.52, 0.79]],
  ['Model C', [0.71, 0.48, 0.41, 0.29, 0.63]],
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
