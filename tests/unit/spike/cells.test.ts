/**
 * RED spec for spike cell selection (`scripts/spike/cells.ts`).
 *
 * The module does not exist yet; loading it at run time is the expected red state,
 * imported dynamically so the miss fails the TEST, not the repo-wide `tsc` gate.
 *
 * `selectCells` reads the sweep dimensions from the environment into the arrays
 * `runMatrix` takes: `SPIKE_CATEGORIES` (comma list, or "all"), `SPIKE_FRAMINGS`
 * (comma list), `SPIKE_REPS` (int). "all" resolves to the canonical Core-7 list
 * from the contract, never a retyped copy.
 */
import { CategorySchema } from '@/contract';

interface CellSelection {
  categories: string[];
  framings: string[];
  reps: number;
}
interface CellsModule {
  selectCells: (env?: Record<string, string | undefined>) => CellSelection;
}

const CELLS_MODULE: string = '../../../scripts/spike/cells';
async function loadCells(): Promise<CellsModule> {
  return (await import(CELLS_MODULE)) as CellsModule;
}

function env(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    SPIKE_CATEGORIES: 'ASI02',
    SPIKE_FRAMINGS: 'malicious',
    SPIKE_REPS: '1',
    ...overrides,
  };
}

describe('selectCells (RED: scripts/spike/cells does not exist yet)', () => {
  it('parses comma lists and an integer rep count into runMatrix arrays', async () => {
    const { selectCells } = await loadCells();
    const selection = selectCells(
      env({ SPIKE_CATEGORIES: 'ASI02,ASI06', SPIKE_FRAMINGS: 'malicious,benign', SPIKE_REPS: '3' }),
    );
    expect(selection.categories).toEqual(['ASI02', 'ASI06']);
    expect(selection.framings).toEqual(['malicious', 'benign']);
    expect(selection.reps).toBe(3);
  });

  it('resolves "all" to the canonical Core-7 category list from the contract', async () => {
    const { selectCells } = await loadCells();
    const selection = selectCells(env({ SPIKE_CATEGORIES: 'all' }));
    // Sourced from CategorySchema.options, not retyped here.
    expect(selection.categories).toEqual([...CategorySchema.options]);
  });

  it('trims whitespace and drops empty entries in the comma lists', async () => {
    const { selectCells } = await loadCells();
    const selection = selectCells(env({ SPIKE_CATEGORIES: ' ASI02 , , ASI03 ' }));
    expect(selection.categories).toEqual(['ASI02', 'ASI03']);
  });

  it('rejects a rep count that is not a positive integer', async () => {
    const { selectCells } = await loadCells();
    expect(() => selectCells(env({ SPIKE_REPS: '0' }))).toThrow();
    expect(() => selectCells(env({ SPIKE_REPS: 'not-a-number' }))).toThrow();
  });
});
