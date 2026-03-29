/**
 * Reliability E2E — static SPA (vite preview) + mocked /api routes.
 * Does not start the Fastify server (no Postgres/Redis required).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['podsignal-reliability.spec.ts', 'auth-shipped.spec.ts', 'pilot-launch-loop.spec.ts'],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  outputDir: 'playwright-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'cd client && npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
