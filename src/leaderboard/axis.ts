import { CategorySchema, type Category } from '@/contract';
import type { CategoryTitles } from './view';

/**
 * THE BOARD'S CATEGORY AXIS — the Core-7, in the contract's own order.
 *
 * Taken from `CategorySchema.options` rather than re-typed, so a category can
 * never appear on the leaderboard that the rest of the product does not know
 * about, and none can quietly go missing from it either.
 *
 * The axis is stated by the CALLER and does not come out of the data. That is
 * deliberate: a board whose columns are whatever happened to be run cannot show
 * what has NOT been run, and "which of the Core-7 has this model never faced"
 * is the more useful half of an early leaderboard.
 */
export const CORE7_AXIS: readonly Category[] = CategorySchema.options;

/**
 * Column titles, verbatim from the official OWASP Top 10 for Agentic
 * Applications (2026). A code with no title here renders as the bare code
 * rather than as an invented name.
 */
export const CORE7_TITLES: CategoryTitles = {
  ASI01: 'Agent Goal Hijack',
  ASI02: 'Tool Misuse and Exploitation',
  ASI03: 'Identity and Privilege Abuse',
  ASI04: 'Agentic Supply Chain Vulnerabilities',
  ASI05: 'Unexpected Code Execution (RCE)',
  ASI06: 'Memory & Context Poisoning',
  ASI10: 'Rogue Agents',
};
