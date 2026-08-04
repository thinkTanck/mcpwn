/**
 * Node ESM resolve hooks for running repo TypeScript directly, with NO new
 * dependency and NO change to tsconfig.
 *
 * Node 22 strips (and, with `--experimental-transform-types`, transforms) TS on
 * its own, but it does not read `tsconfig.json`. Two things therefore need
 * teaching, both purely about MODULE RESOLUTION:
 *
 *   1. `@/x` — the repo's path alias — maps to `<repo>/src/x`.
 *   2. Extensionless specifiers (`./tools`, `@/contract`) resolve to `<spec>.ts`
 *      or `<spec>/index.ts`, the way a bundler would.
 *
 * This exists ONLY for the hypothesis spike's local stdio entry point. Nothing
 * in the deployed app loads it.
 */
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../../src/', import.meta.url);

/** Candidate file URLs for a specifier that may be missing its extension. */
function candidates(href) {
  return [href, `${href}.ts`, `${href}/index.ts`, `${href}.tsx`];
}

/** True only for a real FILE — a bare `@/contract` names a directory, and Node
 *  cannot import one. */
function isFile(href) {
  try {
    return statSync(fileURLToPath(href)).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  const aliased = specifier.startsWith('@/')
    ? new URL(specifier.slice(2), SRC).href
    : specifier.startsWith('./') || specifier.startsWith('../')
      ? new URL(specifier, context.parentURL).href
      : null;

  if (aliased !== null) {
    for (const candidate of candidates(aliased)) {
      if (isFile(candidate)) {
        return nextResolve(candidate, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
