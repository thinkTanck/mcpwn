import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * ESLint flat config. eslint-config-next@16 ships native flat-config arrays, so
 * they are spread directly (no @eslint/eslintrc FlatCompat).
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      // Vendored / non-source (also absent from the CI checkout): design-tool
      // exports, local skill bundles, and generated docs assets.
      'design-review/**',
      '.agents/**',
      '.claude/**',
      'docs/**',
    ],
  },
];

export default eslintConfig;
