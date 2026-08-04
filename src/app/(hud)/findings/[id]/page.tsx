import { getDataSource } from '@/data/source';
import { FindingsReport, FindingsEmpty } from '@/components/findings';

/**
 * Findings / fix report screen (`/findings/[id]`). Reads the report through the
 * DataSource port (the sample resolves via `id === 'sample'`), so everything on
 * the page — category, severity, run id, offending step, prose, remediation —
 * binds from the record. An unknown id renders a labelled empty state, not a 404.
 *
 * The report itself is module 6's `generateFixReport` output; the port also
 * supplies the verdict's PROVENANCE, so the page never has to decide on its own
 * whether what it is showing is a demonstration or a live capture.
 */
export default async function FindingsScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getDataSource();
  const [report, provenance] = await Promise.all([
    source.getFixReport(id),
    source.getVerdictProvenance(id),
  ]);
  if (!report) return <FindingsEmpty id={id} />;
  return <FindingsReport report={report} provenance={provenance} />;
}
