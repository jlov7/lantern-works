import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = Number(process.env.E2E_PORT ?? 47623);

// React's development lifecycle also needs to keep native dialogs usable.
export default defineConfig({
  ...base,
  testMatch: ['development-dialogs.spec.ts'],
  testIgnore: [],
  workers: 2,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
