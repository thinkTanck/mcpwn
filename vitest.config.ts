import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Vitest drives the two lower tiers of the Test Pyramid: many fast unit tests
 * and fewer integration tests. End-to-end tests run on Playwright (see
 * playwright.config.ts). No test files exist yet — they are authored first (RED)
 * in the green phase, after the test strategy is confirmed.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Excluded: files that cannot be unit-tested in jsdom — the root layout
      // shell and root error boundary (render their own <html>/<body>), and the
      // Edge-runtime middleware (request/response cookies, NextResponse.next()).
      // All are exercised by the Playwright e2e / production build, not units.
      exclude: [
        'src/**/*.d.ts',
        'src/app/**/layout.tsx',
        'src/app/**/global-error.tsx',
        'src/middleware.ts',
        'src/lib/supabase/middleware.ts',
      ],
      // Enforced floor (Phase 0 Step 2). Met by real tests, not vacuous:
      // every included source file is exercised by its own unit test.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
