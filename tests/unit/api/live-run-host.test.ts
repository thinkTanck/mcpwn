/**
 * THE PRODUCTION WIRING of the live-run pipeline: which real module each seam of
 * `createLiveRunHost` is bound to, and the process-local registry that records
 * what this instance has observed about a run.
 *
 * The pipeline's own behaviour is tested in `tests/unit/runs/live-run.test.ts`.
 * What is asserted here is only that the seams point at the real things: the
 * gate is `checkLiveRunPreflight`, persistence is the RLS-scoped
 * `getRunRepository()`, and the judge is `resolveLiveDetector()`.
 */
import type { RunResult } from '@/contract';
import { checkLiveRunPreflight } from '@/runs/preflight';
import { getRunRepository } from '@/data/run-repository.factory';
import { resolveLiveDetector } from '@/detector/resolve';
import {
  getLiveRunHost,
  liveRunDeps,
  noteAgentRequest,
  noteRunFinished,
  readAgentActivity,
  readRunFinishedAt,
  resetLiveRunRegistry,
} from '@/app/api/mcp/host';

vi.mock('@/runs/preflight', () => ({ checkLiveRunPreflight: vi.fn() }));
vi.mock('@/data/run-repository.factory', () => ({ getRunRepository: vi.fn() }));
vi.mock('@/detector/resolve', () => ({ resolveLiveDetector: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  resetLiveRunRegistry();
});

describe('the live-run host wiring', () => {
  it('is one host per process, so a run keeps the instance that started it', () => {
    expect(getLiveRunHost()).toBe(getLiveRunHost());
  });

  it('binds the gate to checkLiveRunPreflight, clock and all', async () => {
    vi.mocked(checkLiveRunPreflight).mockResolvedValue({ allowed: true });
    const at = new Date('2026-08-05T10:00:00.000Z');
    await expect(liveRunDeps().preflight({ userId: 'user-1', now: at })).resolves.toEqual({
      allowed: true,
    });
    expect(checkLiveRunPreflight).toHaveBeenCalledWith({ userId: 'user-1', now: at });
  });

  it('relays a gate refusal rather than deciding one of its own', async () => {
    vi.mocked(checkLiveRunPreflight).mockResolvedValue({
      allowed: false,
      refusal: { code: 'ALLOWANCE_EXHAUSTED', message: 'no runs left' },
    });
    await expect(liveRunDeps().preflight({ userId: 'user-1' })).resolves.toEqual({
      allowed: false,
      refusal: { code: 'ALLOWANCE_EXHAUSTED', message: 'no runs left' },
    });
  });

  it('persists through the owner-scoped run repository, resolved per call', async () => {
    const saveRun = vi.fn().mockResolvedValue({ id: 'row-1' });
    vi.mocked(getRunRepository).mockResolvedValue({ saveRun } as never);
    const run = { runId: 'r1' } as unknown as RunResult;

    await expect(liveRunDeps().repository.saveRun('user-1', run)).resolves.toEqual({ id: 'row-1' });
    expect(getRunRepository).toHaveBeenCalledTimes(1);
    expect(saveRun).toHaveBeenCalledWith('user-1', run);
  });

  it('resolves the judge through resolveLiveDetector, so an unconfigured judge is null', () => {
    vi.mocked(resolveLiveDetector).mockReturnValue(null);
    expect(liveRunDeps().resolveDetector()).toBeNull();
    expect(resolveLiveDetector).toHaveBeenCalled();
  });
});

describe('the run observation registry', () => {
  it('knows nothing about a run no agent has reached', () => {
    expect(readAgentActivity('run-1')).toBeNull();
    expect(readRunFinishedAt('run-1')).toBeNull();
  });

  it('records the first and last authenticated request, and counts them', () => {
    noteAgentRequest('run-1', new Date('2026-08-05T10:00:00.000Z'));
    noteAgentRequest('run-1', new Date('2026-08-05T10:00:05.000Z'));
    expect(readAgentActivity('run-1')).toEqual({
      connectedAt: '2026-08-05T10:00:00.000Z',
      lastSeenAt: '2026-08-05T10:00:05.000Z',
      requests: 2,
    });
  });

  it('keeps runs apart', () => {
    noteAgentRequest('run-1', new Date('2026-08-05T10:00:00.000Z'));
    expect(readAgentActivity('run-2')).toBeNull();
  });

  it('stamps a finished run once, and the first stamp stands', () => {
    noteRunFinished('run-1', new Date('2026-08-05T11:00:00.000Z'));
    noteRunFinished('run-1', new Date('2026-08-05T12:00:00.000Z'));
    expect(readRunFinishedAt('run-1')).toBe('2026-08-05T11:00:00.000Z');
  });
});
