import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'client/src/**/*.test.ts'],
    exclude: ['tests/**', 'node_modules/**'],
  },
});
