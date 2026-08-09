import {
  DEFAULT_TRACE_PATH,
  SPIKE_USAGE,
  SpikeOptionsError,
  parseSpikeOptions,
  uniqueTracePath,
} from '@/spike/asi04/options';

/**
 * The operator's flags. `--framing` is REQUIRED rather than defaulted, because
 * running the poisoned framing twice while believing you ran the control is the
 * cheapest way to fool yourself in this experiment.
 */

describe('spike/asi04 options', () => {
  it('requires an explicit framing', () => {
    expect(() => parseSpikeOptions([])).toThrow(SpikeOptionsError);
    expect(() => parseSpikeOptions(['--framing', 'sideways'])).toThrow(SpikeOptionsError);
  });

  it('accepts both framings and the artefact paths', () => {
    const options = parseSpikeOptions([
      '--framing',
      'malicious',
      '--trace',
      'out/trace-A.json',
      '--log',
      'out/run-A.log',
      '--model',
      'some-agent',
    ]);
    expect(options).toMatchObject({
      framing: 'malicious',
      tracePath: 'out/trace-A.json',
      logPath: 'out/run-A.log',
      model: 'some-agent',
      printGoal: false,
    });
    expect(parseSpikeOptions(['--framing', 'benign']).framing).toBe('benign');
  });

  it('defaults the trace path and supports --print-goal', () => {
    const options = parseSpikeOptions(['--framing', 'benign', '--print-goal']);
    expect(options.tracePath).toBe(DEFAULT_TRACE_PATH);
    expect(options.printGoal).toBe(true);
  });

  it('rejects an unknown flag and a flag with no value', () => {
    expect(() => parseSpikeOptions(['--framing', 'benign', '--wat'])).toThrow(SpikeOptionsError);
    expect(() => parseSpikeOptions(['--framing', 'benign', '--trace'])).toThrow(SpikeOptionsError);
  });

  it('documents this spike, not the ASI01 one it was mirrored from', () => {
    expect(SPIKE_USAGE).toContain('asi04-stdio.ts');
    expect(SPIKE_USAGE).toContain('DESCRIPTION');
    expect(SPIKE_USAGE).not.toContain('asi01');
  });
});

describe('spike/asi04 options: never clobber an earlier run', () => {
  it('suffixes -2, -3 when the requested path is taken', () => {
    // Each session is one observation. A client config names ONE --trace path and
    // is reused run after run, so overwriting run 1 with run 3 would silently
    // destroy the only data the experiment produces.
    const taken = new Set(['out/trace-A.json', 'out/trace-A-2.json']);
    expect(uniqueTracePath('out/trace-A.json', (p) => taken.has(p))).toBe('out/trace-A-3.json');
  });

  it('returns the requested path when it is free', () => {
    expect(uniqueTracePath('out/trace-B.json', () => false)).toBe('out/trace-B.json');
  });

  it('handles a path with no extension', () => {
    const taken = new Set(['trace']);
    expect(uniqueTracePath('trace', (p) => taken.has(p))).toBe('trace-2');
  });
});
