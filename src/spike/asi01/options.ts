/**
 * HYPOTHESIS SPIKE — the operator's flags.
 *
 * Deliberately tiny. The spike has no auth, no allowance, no persistence and no
 * UI, so the only real choice is WHICH FRAMING to serve — and that one is
 * required rather than defaulted, because running the poisoned framing twice
 * while believing you ran the control is the cheapest way to fool yourself here.
 */
import { VariantKindSchema, type VariantKind } from '@/contract';

export const DEFAULT_TRACE_PATH = 'spike-trace.json';

export const SPIKE_USAGE = [
  'MCPwn hypothesis spike — a local, sandboxed MCP server serving one ASI01 tool surface.',
  '',
  'Usage: <node …> scripts/spike/asi01-stdio.ts --framing <malicious|benign> [options]',
  '',
  '  --framing <malicious|benign>  REQUIRED. Which framing to serve. The poisoned',
  '                                run and its control differ only in the message',
  '                                the read tool returns.',
  '  --trace <path>                Where to write the recorded Trace at session end',
  `                                (default: ${DEFAULT_TRACE_PATH}).`,
  '  --log <path>                  Append the run log here (default: stderr).',
  '  --model <label>               Pin the agent label recorded on the Trace.',
  '  --run-id <id>                 Pin the run id. Must not name the framing.',
  '  --print-goal                  Print the out-of-band task goal and exit.',
  '',
  'Everything served is fabricated. No tool has anything real behind it.',
].join('\n');

/** A typed CLI failure, so the entry point can print usage instead of a stack. */
export class SpikeOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpikeOptionsError';
  }
}

export interface SpikeCliOptions {
  readonly framing: VariantKind;
  readonly tracePath: string;
  readonly logPath?: string;
  readonly model?: string;
  readonly runId?: string;
  readonly printGoal: boolean;
}

const VALUE_FLAGS = ['--framing', '--trace', '--log', '--model', '--run-id'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

function isValueFlag(token: string): token is ValueFlag {
  return (VALUE_FLAGS as readonly string[]).includes(token);
}

export function parseSpikeOptions(argv: readonly string[]): SpikeCliOptions {
  const values = new Map<ValueFlag, string>();
  let printGoal = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === '--print-goal') {
      printGoal = true;
      continue;
    }
    if (!isValueFlag(token)) {
      throw new SpikeOptionsError(`Unknown option: ${token}\n\n${SPIKE_USAGE}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new SpikeOptionsError(`Option ${token} needs a value.\n\n${SPIKE_USAGE}`);
    }
    values.set(token, value);
    i += 1;
  }

  const framing = VariantKindSchema.safeParse(values.get('--framing'));
  if (!framing.success) {
    throw new SpikeOptionsError(
      `--framing is required and must be "malicious" or "benign".\n\n${SPIKE_USAGE}`,
    );
  }

  const logPath = values.get('--log');
  const model = values.get('--model');
  const runId = values.get('--run-id');

  return {
    framing: framing.data,
    tracePath: values.get('--trace') ?? DEFAULT_TRACE_PATH,
    printGoal,
    ...(logPath === undefined ? {} : { logPath }),
    ...(model === undefined ? {} : { model }),
    ...(runId === undefined ? {} : { runId }),
  };
}
