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

// Deliberately not 8080: that port is commonly taken by another dev server,
// and testing against one would be worse than failing to start.
const PORT = Number(process.env.E2E_PORT || 8127);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // A full journey is 36 generated questions answered one at a time, each with
  // a deliberate pause so the feedback can be read. The default 30s is a fifth
  // of what that needs.
  timeout: 150_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
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
    command: `PORT=${PORT} node tests/tools/serve.js`,
    url: `http://localhost:${PORT}/index.html`,
    // Never reuse: a stray process on this port would serve someone else's
    // files and the suite would test them instead, passing or failing for
    // reasons that have nothing to do with this repo.
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
