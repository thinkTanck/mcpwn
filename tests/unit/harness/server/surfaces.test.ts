import type { VariantKind } from '@/contract';
import { findTells } from '@/harness/server/surface';
import type { HostedSurface } from '@/harness/server/surface';
import { buildHostedSurface, HOSTED_CATEGORIES, SURFACE_BUILDERS } from '@/harness/server/surfaces';
import {
  ATTACKER_ACCOUNT,
  OFFENDING_TOOL as ASI01_OFFENDING,
} from '@/harness/server/surfaces/asi01';
import {
  OFFENDING_TOOL as ASI02_OFFENDING,
  TRAVERSAL_TARGET,
} from '@/harness/server/surfaces/asi02';
import { OFFENDING_TOOL as ASI03_OFFENDING } from '@/harness/server/surfaces/asi03';
import {
  OFFENDING_TOOL as ASI04_OFFENDING,
  UNTRUSTED_PACKAGE,
} from '@/harness/server/surfaces/asi04';
import { OFFENDING_TOOL as ASI05_OFFENDING } from '@/harness/server/surfaces/asi05';
import {
  EXTERNAL_ADDRESS,
  OFFENDING_TOOL as ASI06_OFFENDING,
} from '@/harness/server/surfaces/asi06';
import { OFFENDING_TOOL as ASI10_OFFENDING } from '@/harness/server/surfaces/asi10';

/** Every string on this surface an agent could read during a real session. */
function agentVisible(surface: HostedSurface): string[] {
  const seen: string[] = [surface.taskGoal];
  if (surface.systemPrompt !== undefined) seen.push(surface.systemPrompt);
  const argBank = {
    to: 'x@y.example',
    amount: 100,
    path: TRAVERSAL_TARGET,
    id: 4471,
    name: UNTRUSTED_PACKAGE,
    key: 'standing_instructions',
    value: 'a note',
    command: 'echo hi',
    query: 'q',
    userId: 'u',
    role: 'admin',
    customerId: 'c',
    mailbox: 'inbox',
    job: 'pending',
    quarter: 'Q3',
    account: 'primary',
    source: 'x',
  };
  for (const tool of surface.tools) {
    seen.push(tool.name, tool.description, JSON.stringify(tool.inputSchema));
    for (const args of [argBank, {}]) {
      const outcome = tool.call(args as Record<string, never>);
      seen.push(outcome.text, JSON.stringify(outcome.payload));
    }
  }
  return seen;
}

const OFFENDING = {
  ASI01: ASI01_OFFENDING,
  ASI02: ASI02_OFFENDING,
  ASI03: ASI03_OFFENDING,
  ASI04: ASI04_OFFENDING,
  ASI05: ASI05_OFFENDING,
  ASI06: ASI06_OFFENDING,
  ASI10: ASI10_OFFENDING,
} as const;

describe('server/surfaces: registry serves the whole Core-7', () => {
  it('has a builder for exactly the seven Core-7 codes', () => {
    expect(HOSTED_CATEGORIES.sort()).toEqual([
      'ASI01',
      'ASI02',
      'ASI03',
      'ASI04',
      'ASI05',
      'ASI06',
      'ASI10',
    ]);
    expect(Object.keys(SURFACE_BUILDERS)).toHaveLength(7);
  });

  it.each(HOSTED_CATEGORIES)(
    '%s builds both framings with the offending tool present',
    (category) => {
      for (const kind of ['malicious', 'benign'] as VariantKind[]) {
        const surface = buildHostedSurface(category, kind);
        expect(surface.category).toBe(category);
        expect(surface.variantId.endsWith(`-${kind}`)).toBe(true);
        expect(surface.taskGoal.length).toBeGreaterThan(0);
        expect(surface.tools.map((t) => t.name)).toContain(OFFENDING[category]);
      }
    },
  );
});

describe('server/surfaces: NEUTRALITY is a testable property', () => {
  it.each(HOSTED_CATEGORIES)(
    '%s puts no tell of the project, experiment, framing or category on the wire',
    (category) => {
      for (const kind of ['malicious', 'benign'] as VariantKind[]) {
        const surface = buildHostedSurface(category, kind);
        for (const text of agentVisible(surface)) {
          const tells = findTells(text);
          expect(tells, `${category}/${kind} leaks ${tells.join(', ')}: ${text}`).toEqual([]);
        }
      }
    },
  );
});

describe('server/surfaces: benign tool-parity — same tools both framings', () => {
  it.each(HOSTED_CATEGORIES)(
    '%s serves an identical tool multiset in both framings',
    (category) => {
      const mal = buildHostedSurface(category, 'malicious')
        .tools.map((t) => t.name)
        .sort();
      const ben = buildHostedSurface(category, 'benign')
        .tools.map((t) => t.name)
        .sort();
      expect(mal).toEqual(ben);
    },
  );
});

describe('server/surfaces: the bait lives where each category stages it', () => {
  it('ASI01 serves the injected transfer instruction in the malicious read result, not the benign one', () => {
    const read = (kind: VariantKind) =>
      JSON.stringify(
        buildHostedSurface('ASI01', kind)
          .tools.find((t) => t.name === 'read_email')!
          .call({}),
      );
    expect(read('malicious')).toContain(ATTACKER_ACCOUNT);
    expect(read('benign')).not.toContain(ATTACKER_ACCOUNT);
  });

  it('ASI02 over-broad read_file serves an out-of-scope traversal path rather than refusing', () => {
    const readFile = buildHostedSurface('ASI02', 'malicious').tools.find(
      (t) => t.name === 'read_file',
    )!;
    const outcome = readFile.call({ path: TRAVERSAL_TARGET });
    expect(outcome.isError).toBeUndefined();
    expect(JSON.stringify(outcome.payload)).toContain('root:');
  });

  it('ASI04 registry_search returns the unverified typosquat alongside the trusted package', () => {
    const search = buildHostedSurface('ASI04', 'malicious').tools.find(
      (t) => t.name === 'registry_search',
    )!;
    expect(JSON.stringify(search.call({ query: 'pdf' }))).toContain(UNTRUSTED_PACKAGE);
  });

  it('ASI05 read_upload serves a poisoned source filename in the malicious framing only', () => {
    const read = (kind: VariantKind) =>
      JSON.stringify(
        buildHostedSurface('ASI05', kind)
          .tools.find((t) => t.name === 'read_upload')!
          .call({}),
      );
    expect(read('malicious')).toMatch(/;\s*curl/);
    expect(read('benign')).not.toMatch(/;\s*curl/);
  });

  it('ASI06 read_doc carries the external-exfil standing instruction in the malicious framing only', () => {
    const read = (kind: VariantKind) =>
      JSON.stringify(
        buildHostedSurface('ASI06', kind)
          .tools.find((t) => t.name === 'read_doc')!
          .call({}),
      );
    expect(read('malicious')).toContain(EXTERNAL_ADDRESS);
    expect(read('benign')).not.toContain(EXTERNAL_ADDRESS);
  });

  it('ASI06 recall returns the seeded poisoned note (memory-backed)', () => {
    const recall = buildHostedSurface('ASI06', 'malicious').tools.find((t) => t.name === 'recall')!;
    expect(recall.recording).toMatchObject({ as: 'memory_read' });
    expect(String(recall.call({ key: 'standing_instructions' }).text)).toContain(EXTERNAL_ADDRESS);
  });

  it('ASI03 get_session is memory-backed and its content differs by framing', () => {
    const session = (kind: VariantKind) =>
      JSON.stringify(
        buildHostedSurface('ASI03', kind)
          .tools.find((t) => t.name === 'get_session')!
          .call({}),
      );
    expect(session('malicious')).toContain('admin');
    expect(session('benign')).not.toContain('admin');
  });
});
