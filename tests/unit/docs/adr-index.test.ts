import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The README's ADR index must list EVERY record in docs/adr/, derived from the
 * files themselves.
 *
 * This guard exists because the index rotted silently: six of the ten records on
 * disk had no entry, and one of the missing ones was ADR-0004 — the record
 * CLAUDE.md leans on for the Impeccable adjudication rule and the three-role
 * type model. A reader following the README had no route to it.
 *
 * A hand-maintained list drifts the moment someone adds an ADR without opening
 * the README, so the file tree is the source of truth here and the index is
 * checked against it: number, path, title and status all come from the record.
 * Adding docs/adr/0011-*.md with no index entry fails this suite.
 */

const root = process.cwd();
const adrDir = join(root, 'docs/adr');

type Record_ = { file: string; number: string; title: string; status: string };

/** Every ADR on disk, with the heading number/title and the Status section's
 *  leading word (the Nygard state: Accepted / Superseded / Proposed / ...). */
function recordsOnDisk(): Record_[] {
  return readdirSync(adrDir)
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .sort()
    .map((file) => {
      const source = readFileSync(join(adrDir, file), 'utf8');

      const heading = /^#\s+(\d+)\.\s+(.+?)\s*$/m.exec(source);
      if (!heading) throw new Error(`${file}: no "# N. Title" heading`);
      const number = String(heading[1]).padStart(4, '0');
      if (number !== file.slice(0, 4)) {
        throw new Error(`${file}: heading number ${heading[1]} does not match the filename`);
      }

      const afterStatus = source.split(/^##\s+Status\s*$/m)[1];
      if (afterStatus === undefined) throw new Error(`${file}: no "## Status" section`);
      const firstLine = afterStatus
        .split(/^##\s/m)[0]!
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      if (!firstLine) throw new Error(`${file}: the Status section is empty`);
      const status = /^\*{0,2}([A-Za-z]+)/.exec(firstLine)?.[1];
      if (!status) throw new Error(`${file}: cannot read a status word from "${firstLine}"`);

      return { file, number, title: String(heading[2]), status };
    });
}

/** The README's ADR index: the nested bullets under the docs/adr/ entry. */
function indexEntries(): Record_[] {
  const readme = readFileSync(join(root, 'README.md'), 'utf8').split('\n');
  const start = readme.findIndex((l) => l.includes('](docs/adr/)'));
  if (start === -1) throw new Error('README has no docs/adr/ index bullet to anchor the index on');

  const entries: Record_[] = [];
  for (let i = start + 1; i < readme.length; i++) {
    const line = readme[i] ?? '';
    if (/^\S/.test(line) || line.trim() === '') break; // out of the nested list
    if (!/^\s+- /.test(line)) continue; // a wrapped continuation of the parent bullet
    const m = /^\s+- \[ADR-(\d{4})\]\(docs\/adr\/([^)]+)\) — (.+?) · ([A-Za-z]+)\.?\s*$/.exec(line);
    if (!m) throw new Error(`README ADR index line is not in house format:\n  ${line}`);
    entries.push({
      number: String(m[1]),
      file: String(m[2]),
      title: String(m[3]),
      status: String(m[4]),
    });
  }
  return entries;
}

const onDisk = recordsOnDisk();
const listed = indexEntries();

describe('the README ADR index is derived from docs/adr/, not hand-maintained', () => {
  it('finds every record on disk', () => {
    expect(onDisk.length).toBeGreaterThanOrEqual(10);
  });

  it('lists EVERY ADR on disk, exactly once, in numeric order', () => {
    expect(listed.map((e) => e.file)).toEqual(onDisk.map((r) => r.file));
  });

  it('quotes each record’s real heading title — the FILE wins', () => {
    expect(listed.map((e) => `${e.number} ${e.title}`)).toEqual(
      onDisk.map((r) => `${r.number} ${r.title}`),
    );
  });

  it('quotes each record’s real status word', () => {
    expect(listed.map((e) => `${e.number} ${e.status}`)).toEqual(
      onDisk.map((r) => `${r.number} ${r.status}`),
    );
  });

  it('links no record that does not exist', () => {
    const present = new Set(readdirSync(adrDir));
    expect(listed.filter((e) => !present.has(e.file)).map((e) => e.file)).toEqual([]);
  });
});
