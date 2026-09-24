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
    // The profile is on the device, so the app comes straight back to that
    // child's dashboard rather than the browser's offline page.
    await expect(page.locator('.today')).toBeVisible({ timeout: 15_000 });
    const expected = await page.evaluate(async () => {
      const r = await fetch('curriculum/grade-3.json');
      return (await r.json()).skills.length;
    });
    await expect(page.locator('.skillcard')).toHaveCount(expected);

    // Questions are generated on the phone, so practice must work offline too.
    await page.locator('.skillcard').first().click();
    await page.getByRole('button', { name: /Practice/ }).first().click();
    await expect(page.locator('.prompt')).toBeVisible();
    await completeSet(page, { max: 3 });
    await expect(page.locator('.qbar')).toContainText('Question 4 of 12');

    // The grown-up page is part of the app shell now, so it is cached with it.
    await page.locator('#btn-back').click();
    await page.getByRole('button', { name: 'For grown-ups' }).click();
    await expect(page.locator('#main')).toContainText('Why this strategy works', { timeout: 15_000 });

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
    await page.goto('/qr.html');
    await expect(page.locator('.flyer')).toHaveCount(2);
    await page.goto('/teacher/');
    await expect(page.locator('#codes')).toBeVisible();

    expect(foreign, `third-party requests: ${foreign.join(', ')}`).toHaveLength(0);
  });
});

test.describe('service worker redirect handling', () => {
  test('a bookmarked /index.html still loads once the worker is installed', async ({ page }) => {
    // Cloudflare Pages 308-redirects "/index.html" to "/". A service worker
    // that stores and replays that redirected response fails the navigation
    // outright, so anyone who bookmarked the .html form gets a dead link --
    // and only AFTER their first successful visit, which makes it look random.
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(2_000);

    for (const path of ['/index.html', '/', '/teacher/']) {
      const response = await page.goto(path);
      expect(response, `${path} did not load at all`).not.toBeNull();
      await expect(page.locator('#main'), `${path} rendered nothing`).toBeVisible();
    }
  });
});
