// The journey this app exists for, at the size it will actually be used:
// a 360x740 Android phone.
//
// profile -> Week 1 practice -> Friday Check -> badge -> progress code ->
// the teacher view decodes it -> the "Send to teacher" link carries it.

import { test, expect } from '@playwright/test';
import { createProfile, completeSet, answerCurrentFact } from './helpers.js';

test.describe('the weekly loop', () => {
  test('a family can go from nothing to a decoded progress code', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await createProfile(page);

    // --- the level map ---
    await expect(page.locator('.level')).toHaveCount(8);
    // Only Level 1 is open at the start; nothing later has been earned.
    await expect(page.locator('.level[data-state="locked"]')).toHaveCount(7);

    await page.locator('.level').first().click();
    await expect(page.getByText('Skip counting and doubles')).toBeVisible();

    // The Friday Check is shut until there has been some practice.
    await expect(page.getByRole('button', { name: /Friday Check/ })).toBeDisabled();

    // --- practice ---
    await page.getByRole('button', { name: /Practice/ }).click();
    await expect(page.locator('.prompt')).toBeVisible();
    await completeSet(page, { max: 20 });
    await expect(page.getByText('16/16')).toBeVisible();

    await page.getByRole('button', { name: 'Back to this week' }).click();
    await expect(page.getByRole('button', { name: /Friday Check/ })).toBeEnabled();

    // --- the Friday Check ---
    await page.getByRole('button', { name: /Friday Check/ }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await completeSet(page, { max: 24 });

    // --- the badge ---
    await expect(page.locator('#main').getByText('Level 1 badge earned!')).toBeVisible();
    await expect(page.locator('.badge')).toBeVisible();

    // --- the progress code ---
    const shown = await page.locator('#progress-code').innerText();
    const code = shown.replace(/-/g, '');
    expect(code).toHaveLength(29);

    await page.getByRole('button', { name: 'Show QR code' }).click();
    await expect(page.locator('#main svg[role="img"]')).toBeVisible();

    expect(errors, `page errors: ${errors.join('\n')}`).toHaveLength(0);

    // --- the teacher view decodes it ---
    await page.goto('/teacher/');
    await page.fill('#codes', shown);
    await page.getByRole('button', { name: 'Add codes' }).click();

    const row = page.locator('tbody tr').first();
    await expect(row.locator('td').nth(0)).toHaveText('6A');
    await expect(row.locator('td').nth(1)).toHaveText('#14');
    await expect(row.locator('td').nth(2)).toHaveText('1');
    await expect(row.locator('td').nth(3)).toHaveText('100%');
    await expect(row.locator('td').nth(6)).toHaveText('⭐');

    // A name must be nowhere in the teacher view, because it is not in the data.
    await expect(page.locator('body')).not.toContainText('Sam');
  });

  test('the Send to teacher link carries the prefilled code', async ({ page }) => {
    // FORM_URL ships blank, so the override in the teacher view is what a
    // teacher actually uses first. Setting it here also proves the override
    // path works without a redeploy.
    await page.goto('/teacher/');
    // The link Google's own "Get pre-filled link" produces: it carries the
    // form address AND the field id, which is what a recreated form changes.
    await page.fill(
      '#form-url',
      'https://docs.google.com/forms/d/e/TEST/viewform?usp=pp_url&entry.987654=SAMPLECODE',
    );
    await page.locator('#save-form-url').click();

    await createProfile(page);
    await page.locator('.level').first().click();
    await page.getByRole('button', { name: /Practice/ }).click();
    await completeSet(page, { max: 20 });
    await page.getByRole('button', { name: 'Back to this week' }).click();
    await page.getByRole('button', { name: /Friday Check/ }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await completeSet(page, { max: 24 });

    const code = (await page.locator('#progress-code').innerText()).replace(/-/g, '');
    const link = page.getByRole('link', { name: 'Send to teacher' });
    await expect(link).toBeVisible();

    const href = await link.getAttribute('href');
    expect(href).toContain('usp=pp_url');
    expect(href).toContain(`entry.987654=${code}`);
    expect(href).toContain('docs.google.com/forms/d/e/TEST/viewform');
    // The sample code from the pasted link must not ride along into a real
    // child's submission.
    expect(href).not.toContain('SAMPLECODE');
  });
});

test.describe('hints', () => {
  test('a hint never states the answer to the question on screen', async ({ page }) => {
    await createProfile(page);
    await page.locator('.level').first().click();
    await page.getByRole('button', { name: /Practice/ }).click();

    const prompt = await page.locator('.prompt').innerText();
    const [a, op, b] = prompt.split(/\s*[×÷]\s*|\s+/).filter(Boolean);
    const answer = prompt.includes('×') ? Number(a) * Number(b) : Number(a) / Number(b);

    for (const level of ['Hint 1', 'Hint 2', 'Hint 3']) {
      await page.getByRole('button', { name: level }).click();
    }
    const hints = await page.locator('.hints').innerText();
    expect(hints.length).toBeGreaterThan(20);

    // The worked example is deliberately a different problem, so the answer to
    // THIS one must not appear as a standalone number anywhere in the hints.
    const standalone = new RegExp(`(^|[^0-9])${answer}([^0-9]|$)`);
    expect(
      standalone.test(hints),
      `hints revealed the answer ${answer} for "${prompt}":\n${hints}`,
    ).toBe(false);
  });
});

test.describe('the procedure workspace', () => {
  test('week 7 checks long division one step at a time', async ({ page }) => {
    await createProfile(page);
    // The Friday Check, not practice: practice spirals earlier fact weeks in,
    // so its first item is often a multiplication fact rather than a long
    // division. The check stays on week 7, which is what we want to exercise.
    await page.goto('/index.html#/week/7/check');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.bracket')).toBeVisible();

    // A wrong step must be refused rather than skipped past.
    await page.locator('.work__in:not([disabled])').first().fill('99999');
    await page.locator('.work__line[data-state="active"] button').click();
    await expect(page.locator('.feedback')).toHaveText('Check that step again');
    await expect(page.locator('.work__in[data-state="no"]')).toBeVisible();
  });
});

test.describe('the teacher view', () => {
  test('tells you when a code could not be read, instead of silently dropping it', async ({ page }) => {
    // Adding codes rebuilds the page, which is exactly how the message got
    // lost the first time: the code was correctly refused, and the teacher was
    // told nothing at all.
    await page.goto('/teacher/');

    const good = '53500-0W174-00G00-00000-00000-00SM';
    await page.fill('#codes', good);
    await page.getByRole('button', { name: 'Add codes' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('#main')).toContainText('1 code(s) added');

    // One character changed: the checksum must catch it and say so.
    const damaged = good.slice(0, -2) + 'ZZ';
    await page.fill('#codes', damaged);
    await page.getByRole('button', { name: 'Add codes' }).click();
    await expect(page.locator('#main')).toContainText('could not be read');
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('re-sending the same week replaces the row rather than duplicating it', async ({ page }) => {
    await page.goto('/teacher/');
    const code = '53500-0W174-00G00-00000-00000-00SM';
    for (let i = 0; i < 3; i++) {
      await page.fill('#codes', code);
      await page.getByRole('button', { name: 'Add codes' }).click();
    }
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });
});
