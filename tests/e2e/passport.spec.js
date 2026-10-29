// The Skill Passport: one flat page or a folded booklet, from the same rows.

import { test, expect } from '@playwright/test';

async function openPassport(page, grade = 3) {
  await page.goto(`/index.html?t=${Date.now()}#/`);
  await page.locator('.avatar-grid button').first().click();
  await page.locator('.grade-grid .grade-pick').nth(grade - 1).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.pick').first()).toBeVisible();
  await page.getByRole('button', { name: 'Print my Skill Passport' }).click();
  await expect(page.locator('.passport')).toBeVisible();
}

test.describe('skill passport', () => {
  test('the flat page lists every skill with its standard code', async ({ page }) => {
    await openPassport(page);
    const skills = await page.evaluate(async () =>
      (await (await fetch('curriculum/grade-3.json')).json()).skills.length);
    await expect(page.locator('.passport .passport__skill')).toHaveCount(skills);
    await expect(page.locator('.passport .passport__code').first()).toContainText('3.');
    await expect(page.locator('.booklet')).toBeHidden();
  });

  test('the booklet has cover, two inside pages and a back, holding every skill once', async ({ page }) => {
    await openPassport(page);
    const skills = await page.locator('.passport .passport__skill').count();

    await page.getByRole('button', { name: 'Folded booklet' }).click();
    await expect(page.locator('.passport')).toBeHidden();
    await expect(page.locator('.booklet__page')).toHaveCount(4);
    await expect(page.locator('.booklet__cover')).toContainText('Skill Passport');
    await expect(page.locator('.booklet__inside .passport__skill')).toHaveCount(skills);
    await expect(page.locator('.booklet__back')).toContainText('Passport complete!');
    await expect(page.getByRole('button', { name: 'Folded booklet' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('"fill in what I have done" applies to the booklet too', async ({ page }) => {
    await openPassport(page);
    await page.getByRole('button', { name: 'Folded booklet' }).click();
    await page.locator('.passport-controls input[type=checkbox]').check();
    await expect(page.locator('.passport-wrap')).toHaveAttribute('data-filled', 'true');
  });
});
