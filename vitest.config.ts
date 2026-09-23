import { coverageConfigDefaults, defineConfig } from 'vitest/config';

/**
 * Vitest, not `node:test` + tsx — one runner across the estate.
 *
 * Vitest transpiles TypeScript itself, so the `tsx` dependency that existed
 * purely to let `node --test` read a `.ts` file is gone.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: [
        ...coverageConfigDefaults.exclude,
        'packages/observability/rum-client.ts',
        'packages/observability/RumProvider.tsx',
      ],
      thresholds: {
        branches: 72,
        functions: 91,
        lines: 85,
        statements: 84,
      },
    },
  },
});
