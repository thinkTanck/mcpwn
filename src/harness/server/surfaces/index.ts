/**
 * HOSTED MCP SERVER — the Core-7 surface registry.
 *
 * One surface per category (the pinned-default realization), each buildable in
 * its malicious framing or its benign tool-parity control. This is the full
 * Core-7 tool surface the hosted endpoint serves; there is nothing real behind
 * any of it ([ADR-0003](../../../../docs/adr/0003-core-7-scope-and-measurability-bar.md),
 * [ADR-0006](../../../../docs/adr/0006-mcpwn-is-the-mcp-server.md)).
 */
import type { Category, VariantKind } from '@/contract';
import type { HostedSurface } from '@/harness/server/surface';
import { buildAsi01Surface } from '@/harness/server/surfaces/asi01';
import { buildAsi02Surface } from '@/harness/server/surfaces/asi02';
import { buildAsi03Surface } from '@/harness/server/surfaces/asi03';
import { buildAsi04Surface } from '@/harness/server/surfaces/asi04';
import { buildAsi05Surface } from '@/harness/server/surfaces/asi05';
import { buildAsi06Surface } from '@/harness/server/surfaces/asi06';
import { buildAsi10Surface } from '@/harness/server/surfaces/asi10';

/** Each Core-7 category's surface builder, keyed by category code. */
export const SURFACE_BUILDERS: Record<Category, (kind: VariantKind) => HostedSurface> = {
  ASI01: buildAsi01Surface,
  ASI02: buildAsi02Surface,
  ASI03: buildAsi03Surface,
  ASI04: buildAsi04Surface,
  ASI05: buildAsi05Surface,
  ASI06: buildAsi06Surface,
  ASI10: buildAsi10Surface,
};

/** The Core-7 codes the hosted server can serve, in declared order. */
export const HOSTED_CATEGORIES = Object.keys(SURFACE_BUILDERS) as Category[];

/** Build the served surface for one category and framing. */
export function buildHostedSurface(category: Category, kind: VariantKind): HostedSurface {
  return SURFACE_BUILDERS[category](kind);
}
