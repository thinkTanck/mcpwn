/**
 * Print the medians the CWV gate just measured, for every collected URL.
 *
 * `lhci assert` prints values only for the assertions that FAILED, so a passing
 * screen leaves no number behind and a failing one leaves only the metric that
 * broke. That is fine for a gate and useless for a record: "the gate is green"
 * is not a measurement, and CLAUDE.md asks every screen to report its numbers.
 * This reads the collected Lighthouse reports and prints the median of each
 * metric across the runs, to the log and to the job summary, whether the gate
 * went green or red.
 *
 * The median is taken the same way the gate asserts it (ADR-0008): sort the
 * runs, take the middle one. No run is dropped and none is preferred.
 */
import { readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const screen = process.argv[2] ?? 'unknown';
const dir = '.lighthouseci';

/** Every Lighthouse report lhci collected, grouped by the URL it loaded. */
function reportsByUrl() {
  let files;
  try {
    files = readdirSync(dir).filter((name) => /^lhr-.*\.json$/.test(name));
  } catch {
    return new Map();
  }
  const grouped = new Map();
  for (const name of files) {
    const lhr = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const url = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl ?? 'unknown';
    grouped.set(url, [...(grouped.get(url) ?? []), lhr]);
  }
  return grouped;
}

/** Median of the values that exist. A metric that errored contributes nothing. */
function median(values) {
  const present = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  if (present.length === 0) return null;
  return present[Math.floor(present.length / 2)];
}

function row(url, lhrs) {
  const audit = (id) => median(lhrs.map((lhr) => lhr.audits?.[id]?.numericValue));
  const category = (id) => median(lhrs.map((lhr) => lhr.categories?.[id]?.score));
  const scored = (value, digits = 0) => (value === null ? 'n/a' : value.toFixed(digits));
  return {
    url: new URL(url).pathname,
    runs: lhrs.length,
    perf: scored(category('performance'), 2),
    a11y: scored(category('accessibility'), 2),
    lcp: scored(audit('largest-contentful-paint')),
    cls: scored(audit('cumulative-layout-shift'), 4),
    tbt: scored(audit('total-blocking-time')),
  };
}

const grouped = reportsByUrl();
if (grouped.size === 0) {
  console.log(`No Lighthouse reports found for ${screen} — nothing was measured.`);
  process.exit(0);
}

const rows = [...grouped].map(([url, lhrs]) => row(url, lhrs));
const lines = [
  `### CWV measured medians · ${screen}`,
  '',
  '| screen | runs | perf | a11y | LCP ms | CLS | TBT ms |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) => `| ${r.url} | ${r.runs} | ${r.perf} | ${r.a11y} | ${r.lcp} | ${r.cls} | ${r.tbt} |`,
  ),
  '',
  'Budgets: perf >= 0.90, a11y = 1.00, LCP <= 2500 ms, CLS <= 0.1 (gating); TBT <= 200 ms (warn).',
];

console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}
