import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets two checkouts run their suites side by side.
const PORT = Number(process.env.E2E_PORT ?? 47613);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['development-dialogs.spec.ts'],
  timeout: 90_000,
  fullyParallel: true,
  // Bound concurrent software-rendered rooms so wall-clock playback checks can observe their frames.
  workers: 4,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Build first so the suite never runs against a stale dist/.
    command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
  ],
});
