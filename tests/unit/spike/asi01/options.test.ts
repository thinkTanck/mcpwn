import {
  SPIKE_USAGE,
  SpikeOptionsError,
  parseSpikeOptions,
  uniqueTracePath,
} from '@/spike/asi01/options';

/**
 * The operator-facing flags. Small on purpose: the spike has no auth, no
 * persistence and no UI, so there is nothing to configure but WHICH framing to
 * serve and where to put the two artefacts (the run log and the recorded Trace).
 */
describe('spike/asi01 options', () => {
  it('requires the framing to be stated explicitly', () => {
    // Defaulting it would make it too easy to run the poisoned framing twice and
    // believe you ran the control.
    expect(() => parseSpikeOptions([])).toThrow(SpikeOptionsError);
  });

  it.each(['malicious', 'benign'] as const)('accepts --framing %s', (framing) => {
    expect(parseSpikeOptions(['--framing', framing]).framing).toBe(framing);
  });

  it('rejects a framing outside the pair', () => {
    expect(() => parseSpikeOptions(['--framing', 'poisoned'])).toThrow(/malicious.*benign/s);
  });

  it('defaults the trace output next to the run, and logs to stderr', () => {
    const options = parseSpikeOptions(['--framing', 'malicious']);
    expect(options.tracePath).toMatch(/\.json$/);
    expect(options.logPath).toBeUndefined();
    expect(options.printGoal).toBe(false);
  });

  it('takes explicit paths and a pinned agent label', () => {
    const options = parseSpikeOptions([
      '--framing',
      'benign',
      '--trace',
      'out/trace.json',
      '--log',
      'out/run.log',
      '--model',
      'claude-code',
      '--run-id',
      'spike-2',
    ]);
    expect(options).toMatchObject({
      framing: 'benign',
      tracePath: 'out/trace.json',
      logPath: 'out/run.log',
      model: 'claude-code',
      runId: 'spike-2',
    });
  });

  it('supports printing the out-of-band task goal for pasting', () => {
    expect(parseSpikeOptions(['--framing', 'malicious', '--print-goal']).printGoal).toBe(true);
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    expect(() => parseSpikeOptions(['--framing', 'malicious', '--http'])).toThrow(
      SpikeOptionsError,
    );
  });

  it('rejects a flag with no value', () => {
    expect(() => parseSpikeOptions(['--framing'])).toThrow(SpikeOptionsError);
  });

  it('publishes usage text that names the two framings', () => {
    expect(SPIKE_USAGE).toContain('--framing');
    expect(SPIKE_USAGE).toContain('malicious');
    expect(SPIKE_USAGE).toContain('benign');
  });
});

describe('spike/asi01 options: a recorded run is never overwritten', () => {
  it('uses the requested path when nothing is there', () => {
    expect(uniqueTracePath('out/trace.json', () => false)).toBe('out/trace.json');
  });

  it('suffixes rather than clobbering an existing record', () => {
    // A client config names one --trace path and is reused run after run. Each
    // session is one observation, and silently overwriting run 1 with run 3 is
    // the cheapest way to lose the only data this experiment produces.
    const taken = new Set(['out/trace.json', 'out/trace-2.json']);
    expect(uniqueTracePath('out/trace.json', (p) => taken.has(p))).toBe('out/trace-3.json');
  });

  it('suffixes a path with no extension too', () => {
    expect(uniqueTracePath('trace', (p) => p === 'trace')).toBe('trace-2');
  });
});
