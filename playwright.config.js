// Playwright config. Chromium is preinstalled in this environment -- never run
// `playwright install`. If the bundled browser for this Playwright version is
// missing, fall back to the preinstalled binary at /opt/pw-browsers/chromium.
import { existsSync } from 'node:fs';
import { defineConfig, devices, chromium } from '@playwright/test';

const FALLBACK = '/opt/pw-browsers/chromium';

function browserPath() {
  try {
    if (existsSync(chromium.executablePath())) return undefined; // bundled build is fine
  } catch {
    /* executablePath() throws when nothing is registered */
  }
  return existsSync(FALLBACK) ? FALLBACK : undefined;
}

const executablePath = browserPath();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      // An older Android phone, held in portrait. Every e2e test runs at this size.
      name: 'android-360',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'node tests/tools/serve.js',
    url: 'http://localhost:8080/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
