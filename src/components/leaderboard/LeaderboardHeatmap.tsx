import Link from 'next/link';
import { cn } from '@/lib/utils';
import { bandFor, bandToken, type Band } from '@/lib/hud/bands';
import type { Leaderboard } from '@/data/source';
import { BandShape } from './BandShape';
import { CountUp } from './CountUp';

/**
 * ROBUSTNESS LEADERBOARD heatmap (register: PRODUCT). A model × category matrix
 * plus an OVERALL column; the robustness value is the HERO of every cell.
 *
 * GENERIC over `leaderboard.categories.length` — it renders N category columns
 * from the data (the repo fixture is 5 today; the Core-7 makes it 7). Tri-state
 * by threshold with THREE channels so a cell never reads by colour alone:
 * (1) a shape code (○ △ ◇), (2) the band label named in the cell's accessible
 * text, (3) the tinted value, plus the reserved breach glow on the single weakest
 * cell (the screen's focal point). Each cell drills into its run's Replay.
 *
 * 2-D data can't reflow to a stacked list, so on narrow viewports it becomes a
 * horizontal-scroll heatmap with a sticky model column + a visible swipe cue
 * (legitimate under WCAG 1.4.10's two-dimensional-data exception). The scroll
 * region is focusable + labelled so it is keyboard-operable.
 */

/** Per-band presentation: value/shape colour + resting tint. Colour is one of
 *  three redundant channels, never the only one. Breach value uses the higher
 *  contrast red-200 text token (large-text AA with headroom). */
const TONE: Record<Band, { value: string; tint: string }> = {
  nominal: { value: 'text-nominal', tint: 'bg-nominal/[0.06]' },
  caution: { value: 'text-caution', tint: 'bg-caution/[0.07]' },
  breach: { value: 'text-breach-text', tint: 'bg-breach/[0.12]' },
};

const fmt = (n: number) => n.toFixed(2);

function CellShapeAndValue({ robustness }: { robustness: number }) {
  const band = bandFor(robustness);
  const tone = TONE[band];
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span className={cn('display-md font-mono', tone.value)}>{fmt(robustness)}</span>
      <BandShape band={band} className={tone.value} />
    </span>
  );
}

export function LeaderboardHeatmap({
  leaderboard,
  runIdByCategory,
  fallbackRunId,
}: {
  leaderboard: Leaderboard;
  /** category id → a sample run id from the DataSource (never a hard-coded literal). */
  runIdByCategory: Record<string, string>;
  /** DataSource sample run id used when a category has no mapped run. */
  fallbackRunId: string;
}) {
  const { categories, rows, source } = leaderboard;
  const runHref = (category: string) => `/runs/${runIdByCategory[category] ?? fallbackRunId}`;

  // The design names "the worst cell" as this screen's single focal point. Find it
  // so it can be named, linked, and lit with the reserved breach glow.
  const weakest = rows
    .flatMap((row) => row.cells)
    .reduce((min, c) => (c.robustness < min.robustness ? c : min));
  const weakestBand = bandFor(weakest.robustness);
  const weakestFull =
    categories.find((cat) => cat.id === weakest.category)?.full ?? weakest.category;

  return (
    <figure className="m-0">
      {/* Focal anchor — the single weakest cell, named + linked to its run, wearing
          the breach glow the HUD reserves. Turns "find the weakest fast" into one
          obvious target instead of a scan across equal-weight breach cells. */}
      <Link
        href={runHref(weakest.category)}
        aria-label={`Weakest: ${weakest.model} ${weakest.category} ${weakestFull}, robustness ${fmt(
          weakest.robustness,
        )}, ${bandToken(weakestBand).label}. Open run in Live Attack Replay.`}
        className="mb-4 inline-flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-breach/40 bg-breach/5 px-3.5 py-2.5 shadow-glow-breach transition-colors hover:border-breach/60"
      >
        <span className="micro-label text-breach-text">Weakest</span>
        <span className={cn('display-md font-mono', TONE[weakestBand].value)}>
          {fmt(weakest.robustness)}
        </span>
        <BandShape band={weakestBand} className={TONE[weakestBand].value} />
        <span className="font-mono text-[14px] text-ink-hi">{weakest.model}</span>
        <span className="font-mono text-[13px] text-ink-muted">
          {weakest.category} · {weakestFull}
        </span>
      </Link>

      {/* Legend + provenance — INSTRUMENT telemetry (mono, terse). */}
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 font-mono text-[13px] tracking-[0.04em] text-ink-muted">
          <span className="text-nominal">
            <BandShape band="nominal" />
          </span>
          <span aria-hidden="true">&#8805;.80</span>
          <span className="sr-only">nominal, greater than or equal to .80</span>
        </span>
        <span className="flex items-center gap-2 font-mono text-[13px] tracking-[0.04em] text-ink-muted">
          <span className="text-caution">
            <BandShape band="caution" />
          </span>
          .50 to .79
          <span className="sr-only">caution</span>
        </span>
        <span className="flex items-center gap-2 font-mono text-[13px] tracking-[0.04em] text-ink-muted">
          <span className="text-breach-text">
            <BandShape band="breach" />
          </span>
          <span aria-hidden="true">&lt;.50</span>
          <span className="sr-only">breach, less than .50</span>
        </span>
        {/* A visible, touch/keyboard-reachable path to the category names (the column
            codes' full names + explanations live on the coverage board). */}
        <Link
          href="/threats"
          className="font-mono text-[13px] tracking-[0.04em] text-nominal hover:underline"
        >
          Category names → Threats
        </Link>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-line bg-solid px-2.5 py-1 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-faint">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
          SOURCE · {source}
        </span>
      </figcaption>

      {/* Swipe / scroll affordance — a terse INSTRUMENT cue (micro-label, not a
          sentence) that the board scrolls and the model column is pinned; most
          relevant at ~390, honest everywhere. */}
      <p className="micro-label mb-2.5 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M6 3 2 8l4 5M10 3l4 5-4 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Swipe · {categories.length} categories · model column stays pinned
      </p>

      {/* Focusable, labelled 2-D scroll region. No right-edge fade — it obscured
          the OVERALL column when the table fits; the swipe cue above signals scroll. */}
      <div className="relative">
        <div
          role="region"
          aria-label="Model by category robustness heatmap"
          tabIndex={0}
          className="overflow-x-auto border-y border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
        >
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Robustness per model and OWASP Agentic category. Fixture data, not a claimed
              benchmark. Each value cell links to that run in Live Attack Replay.
            </caption>
            <thead>
              <tr className="bg-[color:var(--navy-900)]">
                <th
                  scope="col"
                  data-sticky="model"
                  className="sticky left-0 z-20 min-w-[132px] border-b border-line bg-solid px-3.5 py-2.5 font-mono text-[13px] font-medium uppercase tracking-[0.12em] text-ink-faint"
                >
                  Model
                </th>
                {categories.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    title={c.full}
                    className="min-w-[86px] border-b border-l border-line px-2 py-2.5 text-center align-bottom font-mono text-[13px] font-medium tracking-[0.04em] text-ink"
                  >
                    <span aria-hidden="true">{c.id}</span>
                    <span className="sr-only">
                      {c.id} {c.full}
                    </span>
                  </th>
                ))}
                <th
                  scope="col"
                  className="min-w-[104px] border-b border-l border-line px-3.5 py-2.5 text-right font-mono text-[13px] font-medium uppercase tracking-[0.12em] text-ink-faint"
                >
                  Overall
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const overallBand = bandFor(row.overall);
                return (
                  <tr key={row.model}>
                    <th
                      scope="row"
                      data-sticky="model"
                      className="sticky left-0 z-10 border-b border-line bg-solid px-3.5 py-3 text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className={cn('h-2 w-2 shrink-0 rounded-full', {
                            'bg-nominal': overallBand === 'nominal',
                            'bg-caution': overallBand === 'caution',
                            'bg-breach': overallBand === 'breach',
                          })}
                        />
                        <span className="font-mono text-[14px] text-ink-hi">{row.model}</span>
                      </span>
                    </th>
                    {row.cells.map((c) => {
                      const band = bandFor(c.robustness);
                      const label = bandToken(band).label;
                      const category = categories.find((cat) => cat.id === c.category);
                      const full = category ? category.full : c.category;
                      const isWorst = c === weakest;
                      return (
                        <td
                          key={c.category}
                          className={cn('border-b border-l border-line p-0', TONE[band].tint)}
                        >
                          <Link
                            href={runHref(c.category)}
                            aria-label={`${row.model} · ${c.category} ${full}: robustness ${fmt(
                              c.robustness,
                            )}, ${label}${isWorst ? ', the weakest cell' : ''}. Open run in Live Attack Replay.`}
                            className={cn(
                              'flex min-h-[52px] items-center justify-center px-2 py-3 transition-[filter] duration-150 hover:brightness-125 focus-visible:brightness-125',
                              isWorst && 'ring-2 ring-inset ring-breach/70 shadow-glow-breach',
                            )}
                          >
                            <CellShapeAndValue robustness={c.robustness} />
                          </Link>
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-line px-3.5 py-3 text-right">
                      <CountUp
                        value={row.overall}
                        className={cn('display-lg font-mono', TONE[overallBand].value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="micro-label mt-3.5">Cell → its run in Live Attack Replay</p>
    </figure>
  );
}
