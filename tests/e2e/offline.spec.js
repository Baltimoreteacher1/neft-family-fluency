// Offline and page weight.
//
// These are the two promises that decide whether this app is usable by the
// families it is for: it must work on a phone with no data left, and it must
// not cost much to load in the first place.

import { test, expect } from '@playwright/test';
import { createProfile, completeSet } from './helpers.js';

test.describe('offline', () => {
  test('the app works with the network disabled after the first visit', async ({ page, context }) => {
    await page.goto('/index.html');
    await expect(page.locator('#f-nick')).toBeVisible();

    // Let the service worker install and fill the cache.
    await page.waitForFunction(
      () => navigator.serviceWorker && navigator.serviceWorker.controller !== undefined,
      null,
      { timeout: 15_000 },
    ).catch(() => {});
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The shell is cached file by file, so give the install a moment to finish
    // rather than assuming activation means every entry landed.
    await page.waitForTimeout(2_000);

    await createProfile(page);

    // --- the network goes away ---
    await context.setOffline(true);

    await page.reload();
    // The profile is on the device, so the app should come straight back to
    // the level map rather than the browser's offline page.
    await expect(page.locator('#page-title')).toHaveText('Your levels', { timeout: 15_000 });
    await expect(page.locator('.level')).toHaveCount(8);

    // Questions are generated on the phone, so practice must work offline too.
    await page.locator('.level').first().click();
    await page.getByRole('button', { name: /Practice/ }).click();
    await expect(page.locator('.prompt')).toBeVisible();
    await completeSet(page, { max: 3 });
    await expect(page.locator('.qbar')).toContainText('Question 4 of 16');

    // The family guidance and both languages are cached too.
    await page.goto('/family/?week=1');
    await expect(page.locator('#main')).toContainText('Skip counting', { timeout: 15_000 });

    await context.setOffline(false);
  });
});

test.describe('page weight', () => {
  test('a first visit stays under 300KB, excluding icons', async ({ page }) => {
    const bytes = new Map();

    page.on('response', async (response) => {
      const url = new URL(response.url());
      if (url.origin !== new URL(page.url() || 'http://localhost').origin && !url.pathname) return;
      try {
        const body = await response.body();
        bytes.set(url.pathname, body.length);
      } catch {
        // Redirects and aborted requests have no body; they weigh nothing.
      }
    });

    await page.goto('/index.html');
    await expect(page.locator('#f-nick')).toBeVisible();
    await page.waitForTimeout(1_500);

    let total = 0;
    const breakdown = [];
    for (const [path, size] of bytes) {
      if (path.startsWith('/icons/')) continue; // excluded by the budget
      total += size;
      breakdown.push(`${path} ${(size / 1024).toFixed(1)}KB`);
    }

    expect(
      total,
      `first visit was ${(total / 1024).toFixed(1)}KB:\n  ${breakdown.sort().join('\n  ')}`,
    ).toBeLessThan(300 * 1024);
  });

  test('nothing is fetched from a third party', async ({ page }) => {
    const foreign = [];
    const origin = new URL('/', page.context()._options?.baseURL || 'http://localhost:8127').origin;

    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:') {
        foreign.push(request.url());
      }
    });

    await page.goto('/index.html');
    await expect(page.locator('#f-nick')).toBeVisible();
    await page.goto('/family/?week=1');
    await expect(page.locator('#main')).toContainText('Skip counting');
    await page.goto('/qr.html');
    await expect(page.locator('.flyer')).toHaveCount(2);
    await page.goto('/teacher/');
    await expect(page.locator('#codes')).toBeVisible();

    expect(foreign, `third-party requests: ${foreign.join(', ')}`).toHaveLength(0);
  });
});
