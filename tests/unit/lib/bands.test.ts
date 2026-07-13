import { bandFor, bandToken, type Band } from '@/lib/hud/bands';
import { stepColorToken, isBreachStep, breachIndex } from '@/lib/hud/trace-view';
import { asi06Run } from '@/data/fixtures/asi06-trace';

describe('robustness bands', () => {
  it('classifies robustness at the .80 / .50 thresholds', () => {
    expect(bandFor(1)).toBe('nominal');
    expect(bandFor(0.8)).toBe('nominal');
    expect(bandFor(0.79)).toBe('caution');
    expect(bandFor(0.5)).toBe('caution');
    expect(bandFor(0.49)).toBe('breach');
    expect(bandFor(0)).toBe('breach');
  });

  it('every band carries a status token AND an UPPERCASE label (never color-only)', () => {
    for (const band of ['nominal', 'caution', 'breach'] as Band[]) {
      const token = bandToken(band);
      expect(token.status).toMatch(/^var\(--status-/);
      expect(token.glow).toMatch(/^var\(--glow-/);
      expect(token.label).toMatch(/^[A-Z]+$/);
    }
  });
});

describe('trace-view helpers', () => {
  it('maps each step type to a semantic token', () => {
    expect(stepColorToken('tool_call')).toContain('--status-nominal');
    expect(stepColorToken('memory_write')).toContain('--line-emphasis');
    expect(stepColorToken('task_complete')).toContain('--status-caution');
    expect(stepColorToken('attacker')).toContain('--text');
  });

  it('derives the breach from verdict.stepId only', () => {
    expect(isBreachStep(asi06Run, 's11')).toBe(true);
    expect(isBreachStep(asi06Run, 's10')).toBe(false);
    expect(breachIndex(asi06Run)).toBe(10);
  });
});
