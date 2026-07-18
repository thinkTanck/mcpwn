import { getDataSource } from '@/data/source';
import { FindingsReport, FindingsEmpty } from '@/components/findings';

/**
 * Findings / fix report screen (`/findings/[id]`). Reads the report through the
 * DataSource port (the sample resolves via `id === 'sample'`), so everything on
 * the page — title, category, severity, run id, offending step, prose — binds
 * from the record. An unknown id renders a labelled empty state, not a 404.
 */
export default async function FindingsScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getDataSource().getFixReport(id);
  if (!report) return <FindingsEmpty id={id} />;
  return <FindingsReport report={report} />;
}
