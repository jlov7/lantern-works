import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Keep the browser-engine checks focused on first play, dialogs, recovery and portable saves.
export default defineConfig({
  ...base,
  testMatch: ['handbook.spec.ts', 'saved-replay.spec.ts', 'replay-recovery.spec.ts', 'creative-promise.spec.ts', 'resilience.spec.ts'],
  workers: 2,
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit-phone', use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
});
