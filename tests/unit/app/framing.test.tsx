import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import Home from '@/app/(hud)/page';
import { FindingsReport } from '@/components/findings';
import { generateFixReport } from '@/fix-report';
import {
  MEASURED_CLASSIFICATION,
  MEASURED_CLASSIFICATION_PROVENANCE,
  MEASURED_COMPROMISE,
  MEASURED_COMPROMISE_PROVENANCE,
} from '@/eval/measured';
import type { RunResult } from '@/contract';

/**
 * THE FRAMING GUARD.
 *
 * MCPwn measures how one agent handled one attack. A run ends in one of two
 * first-class results: a COMPROMISE, which yields a fix report anchored to the
 * offending step, or a CLEAN RESISTANCE, which yields a robustness result.
 * Neither is the expected result and neither is the failure result.
 *
 * ── WHAT THIS FILE EXISTS TO STOP ──
 *
 * 1. COPY THAT PREDICTS THE ANSWER. We have no evidence about how often real
 *    agents take the bait. The ASI01 spike came back a confounded no, and the
 *    ASI04 spike has never been run against a naive client. So "we will find
 *    your agent's weaknesses" and "most agents resist" are equally unsupported,
 *    and marketing pressure pushes on the first one every time somebody rewrites
 *    a headline. The screens may describe what we measure and how. They may not
 *    describe what the reader will find.
 *
 * 2. THE TWO MEASURED FIGURES COLLAPSING INTO ONE. Compromise precision/recall
 *    and category-classification accuracy have different denominators and
 *    different failure modes. A single label over both ("detector accuracy") is
 *    how they merge, and once merged the weaker figure is hidden by the stronger
 *    one. Every published numeral is imported from `src/eval/measured.ts`, so
 *    re-typing one into a screen is also banned here: a literal cannot be
 *    re-measured, and it silently survives the next measurement run.
 *
 * 3. EITHER RESULT BEING DEMOTED. A clean run is not an absence, an error or a
 *    missing report, and a compromise is not the point of the product.
 *
 * The scan is over SOURCE rather than rendered output on purpose: a banned
 * sentence added to a screen that a unit test does not render would otherwise
 * ship. Comments are stripped first, so a doc comment may discuss the rule.
 */

const ROOT = process.cwd();

/** The five screens this guard covers, plus every component they are built from. */
const COVERED = [
  'src/app/(hud)/page.tsx',
  'src/app/(hud)/connect/page.tsx',
  'src/app/(hud)/runs/[id]/page.tsx',
  'src/app/(hud)/findings/[id]/page.tsx',
  'src/app/(hud)/threats/page.tsx',
  'src/components/home',
  'src/components/connect',
  'src/components/replay',
  'src/components/findings',
  'src/components/threats',
];

function filesUnder(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!statSync(abs).isDirectory()) return [rel];
  return readdirSync(abs).flatMap((entry) => filesUnder(`${rel}/${entry}`));
}

/** Strip comments so a doc comment can name the thing it forbids. A line
 *  comment must be preceded by start-of-line or whitespace, which leaves the
 *  `//` inside a `https://` URL alone. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

const sources: { file: string; text: string }[] = COVERED.flatMap(filesUnder)
  .filter((f) => /\.(tsx?|css)$/.test(f))
  .map((file) => ({ file, text: stripComments(readFileSync(join(ROOT, file), 'utf8')) }));

/** Report every offending file for a pattern, so a failure names the file. */
function hits(pattern: RegExp): string[] {
  return sources
    .filter(({ text }) => pattern.test(text))
    .map(({ file, text }) => `${file}: ${(pattern.exec(text) ?? [''])[0]}`);
}

describe('the guard is looking at the real screens', () => {
  it('reads every covered screen and component', () => {
    expect(sources.length).toBeGreaterThan(15);
    expect(sources.map((s) => s.file)).toContain('src/app/(hud)/page.tsx');
  });
});

describe('no screen predicts what an agent will do', () => {
  /**
   * Each pattern is a shape of claim, not one banned sentence: a rewrite that
   * says the same thing differently should still trip. They are deliberately
   * about RATE and PREDICTION, never about the mechanics of an attack, which the
   * threat model is supposed to describe in detail.
   */
  const PREDICTIONS: [string, RegExp][] = [
    ['a rate claim about agents in general', /\b(most|many|few|some|all) (agents|models)\b/i],
    ['a percentage of agents', /\b\d+\s?(%|percent) of (agents|models|runs)\b/i],
    [
      'a frequency claim',
      /\b(usually|typically|often|rarely|always|never|likely to)\s+(fall|fails?|resists?|takes? the bait|gets? compromised)/i,
    ],
    ['a promise about the reader’s own agent', /\byour agent will\b/i],
    [
      'a promise to find something',
      /\b(we|you)(\s|'|’)?(ll| will) (find|discover|uncover|expose)\b/i,
    ],
    ['a guarantee', /\bguarantee(d|s)?\b/i],
    [
      'an assertion that agents take the bait',
      /\bagents (do|don’t|do not|will|won’t|will not) (take|fall|resist|hold)\b/i,
    ],
    [
      'an appeal to inevitable compromise',
      /\b(before an attacker does|every agent (is|has been))\b/i,
    ],
  ];

  for (const [what, pattern] of PREDICTIONS) {
    it(`does not make ${what}`, () => {
      expect(hits(pattern)).toEqual([]);
    });
  }
});

describe('both results are named, and neither is the expected one', () => {
  it('the front door states the compromise result and the clean result together', async () => {
    render(await Home());
    // Both branches, in one place, so a reader learns the shape of a run before
    // they run one. Matched loosely: the sentence may be rewritten, the pair of
    // results may not be dropped.
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/fix report/i);
    expect(body).toMatch(/clean run|not compromised|resist/i);
  });

  it('the front door does not tell the reader which result to expect', async () => {
    render(await Home());
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\b(most|many) (agents|models)\b/i);
    expect(body).not.toMatch(/\byour agent will\b/i);
  });

  it('a clean run reads as a result with somewhere to go, not as an absence', () => {
    const clean = generateFixReport(cleanRun());
    render(<FindingsReport report={clean} />);
    const panel = screen.getByTestId('clean-result');
    // It is a result of the run, and it has the clean result's own off-ramp
    // (the robustness leaderboard) the way a compromise has the fix report.
    expect(panel).toHaveTextContent(/result/i);
    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute(
      'href',
      '/leaderboard',
    );
    // And it is never described as a failure of the product or a missing report.
    expect(panel.textContent ?? '').not.toMatch(/failed|error|unavailable|no report/i);
  });
});

describe('the two measured figures never merge into one', () => {
  it('no screen carries the merged label', () => {
    // The exact phrase CLAUDE.md forbids. One heading over both figures is how
    // they become "accuracy", and the 0.6818 disappears behind the 0.9565.
    expect(hits(/detector accuracy/i)).toEqual([]);
  });

  it('no screen re-types a measured numeral', () => {
    // A numeral typed into a screen cannot be re-measured: it survives the next
    // measurement run unchanged and starts quietly lying. The published figures
    // and their denominators must be imported, formatted at render time.
    const literals = [
      MEASURED_COMPROMISE.precision.toFixed(4),
      MEASURED_COMPROMISE.recall.toFixed(4),
      MEASURED_CLASSIFICATION.accuracy.toFixed(4),
    ];
    for (const literal of literals) {
      expect(hits(new RegExp(literal.replace('.', '\\.')))).toEqual([]);
    }
    // The denominators, in the shape the provenance lines write them. A bare
    // "22" is not searched for, because it is also a pixel value and a string
    // length; "n=22" is only ever this measurement's denominator.
    expect(hits(/\bN\s?=\s?44\b/i)).toEqual([]);
    expect(hits(/\bn\s?=\s?22\b/i)).toEqual([]);
  });

  it('Home renders each figure under its own label with its own provenance', async () => {
    render(await Home());
    // Two provenance lines, verbatim, each present exactly once.
    expect(screen.getByText(MEASURED_COMPROMISE_PROVENANCE)).toBeInTheDocument();
    expect(screen.getByText(MEASURED_CLASSIFICATION_PROVENANCE)).toBeInTheDocument();
    expect(MEASURED_COMPROMISE_PROVENANCE).not.toBe(MEASURED_CLASSIFICATION_PROVENANCE);
    // Each figure sits inside a group named for the question it answers, and
    // neither group is named for the other's.
    const compromise = screen.getByRole('group', { name: /compromise detection/i });
    const classification = screen.getByRole('group', { name: /category classification/i });
    expect(compromise).not.toBe(classification);
    expect(compromise.textContent ?? '').toContain(MEASURED_COMPROMISE_PROVENANCE);
    expect(classification.textContent ?? '').toContain(MEASURED_CLASSIFICATION_PROVENANCE);
  });

  it('Home states that both figures depend on the frozen judge configuration', async () => {
    render(await Home());
    // A measured figure with no stated condition reads as a property of the
    // product rather than of one pinned judge. Both numbers are void the moment
    // the rubric, the model or the temperature changes.
    expect(document.body.textContent ?? '').toMatch(/frozen|re-?measured|only for/i);
  });
});

describe('UI copy hygiene on the covered screens', () => {
  it('uses no em dashes', () => {
    expect(hits(/—/)).toEqual([]);
  });
});

/** A run with a clean verdict, for the clean-result assertions above. */
function cleanRun(): RunResult {
  return {
    runId: 'guard-clean-0001',
    target: 'https://agent.example/mcp',
    model: 'test-model',
    category: 'ASI01',
    trace: {
      runId: 'guard-clean-0001',
      target: 'https://agent.example/mcp',
      model: 'test-model',
      category: 'ASI01',
      steps: [
        { id: 's1', type: 'principal_instruction', content: 'Summarize the ticket.' },
        { id: 's2', type: 'tool_call', tool: 'read_email', args: { id: '1' } },
        { id: 's3', type: 'task_complete', summary: 'Summarized.' },
      ],
    },
    verdict: {
      runId: 'guard-clean-0001',
      compromised: false,
      score: 0.02,
      severity: 'None',
      category: 'ASI01',
      rationale: 'The agent read the injected instruction and did not act on it.',
    },
  };
}
