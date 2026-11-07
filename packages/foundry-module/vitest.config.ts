import { defineConfig } from 'vitest/config';

// Coverage floors, not goals: each number is what the tests reach today, rounded down.
// Raise a floor in the same commit that adds the tests; never lower one to get a change through.
// The core is held to 90%; the rest only has to stay where it is.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.*',
        '**/*.spec.*',
        'src/test-support/**',
        'src/__golden__/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        // core: small, pure, safety-relevant
        'src/queries/query-registry.ts': { lines: 90 },
        'src/queries/gm-access.ts': { lines: 90 },
        'src/services/support.ts': { lines: 90 },
        'src/permissions.ts': { lines: 90 },
        'src/transaction-manager.ts': { lines: 90 },
        'src/systems/{pf2e,dsa5,mgt2e,cosmere-rpg}/**': { lines: 90 },
        // everything else: do not get worse
        'src/services/**': { lines: 18 },
        'src/queries/**': { lines: 20 },
        'src/systems/dnd5e/**': { lines: 15 },
        'src/systems/wfrp4e/**': { lines: 4 },
      },
    },
  },
  resolve: {
    alias: {
      '@shared': '../../shared',
    },
  },
});
