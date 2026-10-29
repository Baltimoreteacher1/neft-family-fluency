// Offline and page weight.
//
// These are the two promises that decide whether this app is usable by the
// families it is for: it must work on a phone with no data left, and it must
// not cost much to load in the first place.

import { test, expect } from '@playwright/test';

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

    // A profile: avatar, grade 3, Start. That lands on the skill list.
    await page.locator('.avatar-grid button').first().click();
    await page.locator('.grade-grid .grade-pick').nth(2).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.pick').first()).toBeVisible();

    // --- the network goes away ---
    await context.setOffline(true);

    await page.reload();
    // The profile is on the device, so the app comes straight back to that
    // child's skill list rather than the browser's offline page.
    const expected = await page.evaluate(async () => {
      const r = await fetch('curriculum/grade-3.json');
      return (await r.json()).skills.length;
    });
    await expect(page.locator('.pick')).toHaveCount(expected);

    // The standards sentences are cached with the shell.
    await page.locator('.std summary').first().click();
    await expect(page.locator('.std__body').first()).toContainText('3.');

    // Questions are generated on the phone, so the drill must work offline too.
    await page.locator('.pick').first().click();
    await expect(page.locator('.drill__count')).toHaveText('1 / 10');
    for (let i = 0; i < 3; i++) {
      const text = (await page.locator('.prompt').innerText()).trim();
      const [, a, op, b] = text.match(/^(\d+)\s*([×÷])\s*(\d+)$/);
      await page.fill('.answer', String(op === '×' ? a * b : a / b));
      await page.locator('[data-key=check]').click();
      await page.waitForTimeout(700);
    }
    await expect(page.locator('.drill__count')).toHaveText('4 / 10');

    // The Skill Passport is part of the shell too.
    await page.goto('/index.html#/g/3/passport');
    await expect(page.locator('.passport .passport__skill')).toHaveCount(expected);

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
