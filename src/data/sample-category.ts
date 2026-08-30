import type { Category } from '@/contract';

/**
 * THE FEATURED CORE-7 CATEGORY — the single source of truth for which attack the
 * product leads with everywhere: the homepage hero + primary CTA, the `sample`
 * run/findings alias (`SAMPLE_RUN_ID`), and the `/connect` default selection.
 *
 * It lives in its own leaf module ON PURPOSE. `@/data/source` pulls the whole
 * attack registry and the fix-report generator, so a client component reading the
 * featured category from there would drag all of that into its bundle. This module
 * imports only a type (erased at build), so a client can read the constant for the
 * cost of the string alone. `@/data/source` re-exports it, so existing importers
 * are unchanged.
 *
 * Change this ONE value and the hero, the sample alias and the connect default all
 * move together; nothing hardcodes the literal beside it.
 */
export const SAMPLE_CATEGORY: Category = 'ASI02';
