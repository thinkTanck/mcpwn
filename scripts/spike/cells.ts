/**
 * Spike cell selection: read the sweep dimensions from the environment into the
 * arrays `runMatrix` takes.
 *
 * `SPIKE_CATEGORIES` is a comma list, or the literal `all` for the whole Core-7
 * set; `SPIKE_FRAMINGS` is a comma list; `SPIKE_REPS` is a positive integer.
 * Nothing is hardcoded, and `all` resolves to the canonical list from the
 * contract rather than a retyped copy.
 */
import { CategorySchema } from '@/contract';

type Env = Record<string, string | undefined>;

/** The three arrays `runMatrix` enumerates over. */
export interface CellSelection {
  categories: string[];
  framings: string[];
  reps: number;
}

function requireEnv(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCategories(raw: string): string[] {
  if (raw.trim().toLowerCase() === 'all') return [...CategorySchema.options];
  const categories = parseList(raw);
  if (categories.length === 0) throw new Error('SPIKE_CATEGORIES resolved to no categories');
  return categories;
}

function parsePositiveInt(raw: string, name: string): number {
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name} must be a positive integer`);
  const value = Number.parseInt(raw, 10);
  if (value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

/** Read `SPIKE_CATEGORIES` / `SPIKE_FRAMINGS` / `SPIKE_REPS` into the sweep arrays. */
export function selectCells(env: Env = process.env): CellSelection {
  const categories = parseCategories(requireEnv(env, 'SPIKE_CATEGORIES'));
  const framings = parseList(requireEnv(env, 'SPIKE_FRAMINGS'));
  if (framings.length === 0) throw new Error('SPIKE_FRAMINGS resolved to no framings');
  const reps = parsePositiveInt(requireEnv(env, 'SPIKE_REPS'), 'SPIKE_REPS');
  return { categories, framings, reps };
}
