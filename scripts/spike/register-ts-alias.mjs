/**
 * Registers the TS alias resolve hooks. Passed to node as
 * `--import ./scripts/spike/register-ts-alias.mjs`, before the spike entry point.
 */
import { register } from 'node:module';

register('./ts-alias-hooks.mjs', import.meta.url);
