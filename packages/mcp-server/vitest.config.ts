import { defineConfig } from 'vitest/config';

// Coverage floors, not goals: each number is what the tests reach today, rounded down.
// Raise a floor in the same commit that adds the tests; never lower one to get a change through.
// The core is held to 90%; the rest only has to stay where it is. Installers, the ComfyUI client
// and the transport are checked by the smoke tests instead.
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
        'src/__golden__/**',
        'src/test-support/**',
        'src/**/*.d.ts',
        'src/**/types.ts',
      ],
      thresholds: {
        // core: small, pure, safety-relevant
        'src/registry/**': { lines: 90 },
        'src/utils/error-handler.ts': { lines: 90 },
        'src/utils/system-detection.ts': { lines: 90 },
        'src/tools/chat.ts': { lines: 90 },
        // everything else: do not get worse
        'src/tools/**': { lines: 40 },
        'src/systems/**': { lines: 30 },
        'src/utils/**': { lines: 60 },
      },
    },
  },
  resolve: {
    alias: {
      '@shared': '../../shared',
    },
  },
});
