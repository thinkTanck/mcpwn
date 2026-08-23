/**
 * The real ExecutorDeps for the spike runner, plus the service-role host they run
 * against.
 *
 * The four small adapters (spawn, fs write/delete, mint, judge) are thin and
 * injectable, so their contracts are tested against fakes with nothing launched or
 * requested. `buildSpikeRuntime` is the integration wiring: it reuses the app's own
 * stores, meter, gate and pipeline, injected with a service-role client.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { writeFile as nodeWriteFile, rm as nodeRm } from 'node:fs/promises';
import { join } from 'node:path';
import { CategorySchema, VariantKindSchema, type Verdict } from '@/contract';
import type { LiveRunHost, LiveRunHostDeps } from '@/runs/live-run';
import type { RunCounter } from '@/runs/allowance';
import type { Cell, Classification } from './run-matrix';
import type { RunTicket } from './executor';

/** The child process surface the spawn adapter uses: just its two events. */
interface SpawnResult {
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
}
/** How a process is launched. Defaults to `node:child_process` spawn; injectable. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { stdio: 'inherit' },
) => SpawnResult;
/** How the temp config is written / removed. Defaults to `node:fs/promises`. */
export type WriteFn = (path: string, data: string) => Promise<void>;
export type RemoveFn = (path: string, options: { force: true }) => Promise<void>;

const DEFAULT_SPAWN = nodeSpawn as unknown as SpawnFn;
const DEFAULT_WRITE: WriteFn = (path, data) => nodeWriteFile(path, data);
const DEFAULT_REMOVE: RemoveFn = (path, options) => nodeRm(path, options);

/** Run `command args`, inheriting stdio; resolve on exit 0, reject otherwise. */
export function spawnAgent(
  command: string,
  args: readonly string[],
  spawn: SpawnFn = DEFAULT_SPAWN,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 'null'}`));
    });
  });
}

/** Write the per-run MCP config to a temp file. */
export function writeConfig(
  path: string,
  contents: string,
  write: WriteFn = DEFAULT_WRITE,
): Promise<void> {
  return write(path, contents);
}

/** Delete the per-run MCP config. Tolerant: a config already gone is not an error. */
export function removeConfig(path: string, remove: RemoveFn = DEFAULT_REMOVE): Promise<void> {
  return remove(path, { force: true });
}

/**
 * Mint a run per cell through the host's `start()`, for the cell's category and
 * framing. The endpoint and goal come back on the ticket, so each cell points the
 * agent at its own run. A refusal (allowance, spend cap) throws.
 */
export function createIssueRun(
  host: Pick<LiveRunHost, 'start'>,
  opts: { userId: string; model?: string },
): (cell: Cell) => Promise<RunTicket> {
  return async (cell) => {
    const category = CategorySchema.parse(cell.category);
    const kind = VariantKindSchema.parse(cell.framing);
    const decision = await host.start({
      userId: opts.userId,
      category,
      kind,
      ...(opts.model === undefined ? {} : { model: opts.model }),
    });
    if (!decision.ok) {
      throw new Error(
        `could not mint a run for ${cell.category}/${cell.framing}: ${decision.error.message}`,
      );
    }
    const { runId, token, endpoint, taskGoal } = decision.value;
    return { runId, token, endpoint, taskGoal };
  };
}

/**
 * Judge a finished run through the host's `finish()` and return the frozen judge's
 * verdict. A FRESH host per call so its cache is empty and the run is rebuilt from
 * the durable session row the running server flushed the agent's steps to. This is
 * the product's real judged path: `finish()` also revokes the token, re-gates the
 * spend cap, and persists the RunResult.
 */
export function createJudge(
  makeHost: () => Pick<LiveRunHost, 'finish'>,
  userId: string,
): (runId: string) => Promise<Verdict> {
  return async (runId) => {
    const decision = await makeHost().finish({ runId, userId });
    if (!decision.ok) {
      throw new Error(`could not judge ${runId}: ${decision.error.message}`);
    }
    return decision.value.verdict;
  };
}

/** Persist one judged run's trace and verdict to disk. */
export type ExportTrace = (
  runId: string,
  category: string,
  framing: string,
  verdict: Verdict,
) => Promise<void>;

/**
 * Write a judged run's full trace to disk right after its verdict, so it survives
 * the reaper. Reads the run's steps back through the host's `getTrace` (the same
 * durable read path the judge used), then writes one JSON file per run named
 * `<category>_<framing>_<runId>.json` under `exportDir`, carrying the ordered trace
 * steps and the verdict fields the fix report keys off. A refused read throws, so a
 * lost trace is never silently skipped. `exportDir` is the caller's config, never
 * hardcoded; the filesystem write is injected so the contract tests write nothing.
 */
export function createExportTrace(
  makeHost: () => Pick<LiveRunHost, 'getTrace'>,
  userId: string,
  exportDir: string,
  write: WriteFn = DEFAULT_WRITE,
): ExportTrace {
  return async (runId, category, framing, verdict) => {
    const decision = await makeHost().getTrace({ runId, userId });
    if (!decision.ok) {
      throw new Error(`could not read the trace for ${runId}: ${decision.error.message}`);
    }
    const record = {
      runId,
      category,
      framing,
      steps: decision.value.steps,
      verdict: {
        compromised: verdict.compromised,
        severity: verdict.severity,
        stepId: verdict.stepId ?? null,
        rationale: verdict.rationale,
      },
    };
    const path = join(exportDir, `${category}_${framing}_${runId}.json`);
    await write(path, JSON.stringify(record, null, 2));
  };
}

/** The judge verdict becomes the sweep's classification: compromised is harmful. */
export function verdictClassification(result: unknown): Classification {
  const compromised =
    typeof result === 'object' &&
    result !== null &&
    (result as { compromised?: unknown }).compromised === true;
  return compromised ? 'BITE' : 'RESIST';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The composed, ready-to-use side effects a run needs, over the durable store. */
export interface SpikeRuntime {
  /** Mint a run per cell (start). */
  mint: (cell: Cell) => Promise<RunTicket>;
  /** Judge a finished run and return the frozen judge's verdict. */
  judge: (runId: string) => Promise<Verdict>;
  /** Persist a judged run's trace and verdict to the export dir. */
  exportTrace: ExportTrace;
  /** The account's run counter, for the sweep's allowance ceiling. */
  repository: RunCounter;
}

/**
 * Build the real service-role runtime the sweep runs against.
 *
 * WHY A RAW ADMIN CLIENT. The app's `createAdminSupabase` lives in a module that
 * imports `next/headers` and is server-only, so a `tsx` process cannot import it.
 * The client is built directly from the same env here; every store, meter and gate
 * below is the app's own code, injected with that client, so nothing is
 * reimplemented. The imports are lazy so the adapter contract tests never pull the
 * pipeline.
 *
 * The judge is the REAL frozen `resolveLiveDetector()`, so `start()` now refuses
 * a run when JUDGE_API_KEY is unconfigured, and `finish()` judges, re-gates the
 * spend cap and persists the RunResult. The origin is read from env so the ticket
 * endpoint points at the local server. `mint` reuses one host; `judge` builds a
 * fresh host per call so its empty cache rebuilds from the durable row the running
 * server flushed the agent to.
 */
export async function buildSpikeRuntime(opts: {
  userId: string;
  model?: string;
  /** Where each run's trace file is written. Caller reads it from the environment. */
  exportDir: string;
}): Promise<SpikeRuntime> {
  const { createClient } = await import('@supabase/supabase-js');
  const { getSupabaseConfig, getSupabaseServiceRoleKey } = await import('@/config/env');
  const { createLiveRunHost } = await import('@/runs/live-run');
  const { SupabaseRunRepository } = await import('@/data/run-repository.supabase');
  const { SupabaseRunTokenStore } = await import('@/runs/run-token.supabase');
  const { SupabaseLiveRunSessionStore } = await import('@/runs/live-run-store.supabase');
  const { createRunTableSpendMeter } = await import('@/runs/spend-cap');
  const { checkLiveRunPreflight } = await import('@/runs/preflight');
  const { resolveLiveDetector } = await import('@/detector/resolve');

  const cfg = getSupabaseConfig();
  const key = getSupabaseServiceRoleKey();
  if (!cfg || !key) {
    throw new Error('Supabase service-role config is required to mint spike runs');
  }

  const admin = createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repository = new SupabaseRunRepository(admin);
  const tokens = new SupabaseRunTokenStore(admin);
  const sessions = new SupabaseLiveRunSessionStore(admin);
  const meter = createRunTableSpendMeter(admin);
  const origin = requireEnv('SPIKE_SITE_ORIGIN');

  const deps: LiveRunHostDeps = {
    preflight: (input) => checkLiveRunPreflight({ ...input, repository, meter, env: process.env }),
    tokens,
    sessions,
    repository,
    // The real frozen judge. It reads JUDGE_API_KEY / JUDGE_BASE_URL / JUDGE_MODEL
    // from the environment and returns null when unconfigured, which start() turns
    // into a refusal, so a missing judge key stops the run rather than mis-scoring it.
    resolveDetector: () => resolveLiveDetector(),
    origin,
  };
  const makeHost = (): LiveRunHost => createLiveRunHost(deps);

  return {
    mint: createIssueRun(makeHost(), opts),
    judge: createJudge(makeHost, opts.userId),
    // A fresh host per export rebuilds the run from the durable row, the same way
    // the judge did, and writes it out before the reaper can sweep it.
    exportTrace: createExportTrace(makeHost, opts.userId, opts.exportDir),
    repository,
  };
}
