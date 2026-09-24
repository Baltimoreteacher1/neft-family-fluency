// The journey this app exists for, at the size it will actually be used:
// a 360x740 Android phone.

import { test, expect } from '@playwright/test';
import { createProfile, completeSet, openRoute } from './helpers.js';

test.describe('navigation', () => {
  test('a returning kid reaches the first problem in two taps', async ({ page }) => {
    await createProfile(page);

    // Tap 0: open the app. It lands on the dashboard, not a menu.
    await page.goto('/index.html');
    await expect(page.locator('.today')).toBeVisible();
    expect(page.url()).toContain('#/g/3');

    // Tap 1: Today. Tap 2: start the activity it opened.
    await page.locator('.today').click();
    await expect(page.locator('#main')).toBeVisible();
    expect(page.url()).toMatch(/#\/g\/3\/[\w-]+\/(learn|practice|play|check)/);
  });

  test('Back always goes up the hierarchy, never off the site', async ({ page }) => {
    await createProfile(page);
    await page.locator('.skillcard').first().click();
    expect(page.url()).toMatch(/#\/g\/3\/[\w-]+$/);

    await page.getByRole('button', { name: /Practice/ }).first().click();
    expect(page.url()).toContain('/practice');

    // activity -> skill -> dashboard, one level at a time.
    await page.locator('#btn-back').click();
    expect(page.url()).toMatch(/#\/g\/3\/[\w-]+$/);
    await page.locator('#btn-back').click();
    expect(page.url()).toMatch(/#\/g\/3$/);
  });

  test('switching child takes one tap from any screen', async ({ page }) => {
    await createProfile(page, { nickname: 'Sam', grade: 3 });
    await page.locator('.skillcard').first().click();

    await expect(page.locator('#btn-switch')).toBeVisible();
    await page.locator('#btn-switch').click();
    await expect(page.locator('#main').getByText('Who is practising?')).toBeVisible();
  });

  test('skills are recommended, never locked', async ({ page }) => {
    await createProfile(page);
    const cards = page.locator('.skillcard');
    // Read the expected count from the curriculum rather than pinning a number
    // that changes whenever a skill is added.
    const expected = await page.evaluate(async () => {
      const r = await fetch('curriculum/grade-3.json');
      return (await r.json()).skills.length;
    });
    await expect(cards).toHaveCount(expected);

    // No padlocks and nothing disabled: a child may pick any skill.
    await expect(page.locator('.skillcard[disabled]')).toHaveCount(0);
    await expect(page.locator('.skillcard__next')).toHaveCount(1);

    // The last skill opens just as readily as the first -- whichever it is.
    const lastId = await page.evaluate(async () => {
      const r = await fetch('curriculum/grade-3.json');
      const skills = (await r.json()).skills;
      return skills[skills.length - 1].id;
    });
    await cards.last().click();
    expect(page.url()).toContain(lastId);
  });

  test('old URLs still land somewhere sensible', async ({ page }) => {
    await createProfile(page);

    await page.evaluate(() => { location.hash = '#/levels'; });
    await expect.poll(() => page.url()).toMatch(/#\/g\/3$/);

    // Week 6 was Extended facts, which is a Grade 4 skill now.
    await page.evaluate(() => { location.hash = '#/week/6'; });
    await expect.poll(() => page.url()).toContain('#/g/4/g4-extended-facts');

    await page.evaluate(() => { location.hash = '#/week/8/practice'; });
    await expect.poll(() => page.url()).toContain('#/g/5/g5-divide-2digits/practice');
  });

  test('the old /family/?week=N URL forwards into the app', async ({ page }) => {
    await createProfile(page);
    await page.goto('/family/?week=1');
    await expect.poll(() => page.url(), { timeout: 10_000 })
      .toContain('#/g/3/g3-mult-2-5-10/family');
    await expect(page.locator('#main')).toContainText('Why this strategy works');
  });
});

test.describe('the weekly loop', () => {
  test('practice, then a Check that moves the child up a stage', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await createProfile(page);
    await page.locator('.skillcard').first().click();

    await page.getByRole('button', { name: /Practice/ }).first().click();
    await completeSet(page, { max: 16 });
    await expect(page.locator('#main').getByText('12/12').first()).toBeVisible();
    await page.getByRole('button', { name: 'Back to this skill' }).click();

    // One practice day is now filled in.
    await expect(page.locator('.dot[data-filled="true"]')).toHaveCount(1);

    await page.getByRole('button', { name: /^Check/ }).first().click();
    await page.getByRole('button', { name: 'Start' }).click();
    await completeSet(page, { max: 16 });

    await expect(page.locator('#main').getByText('You passed!')).toBeVisible();
    await page.getByRole('button', { name: 'Back to this skill' }).click();
    await expect(page.locator('#main').getByText('Stage 2 of 3')).toBeVisible();

    expect(errors, `page errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('the class tag is asked for only when sending, never at sign-up', async ({ page }) => {
    // Nothing on the creation screen asks for a class or a list number: a
    // child who never sends anything never types anything but a nickname.
    await page.goto('/index.html');
    await expect(page.locator('#f-nick')).toBeVisible();
    await expect(page.locator('#f-class')).toHaveCount(0);
    await expect(page.locator('#f-num')).toHaveCount(0);

    await createProfile(page, { nickname: 'Ana', grade: 3 });
    await page.locator('.skillcard').first().click();
    await page.getByRole('button', { name: /^Check/ }).first().click();
    await page.getByRole('button', { name: 'Start' }).click();
    await completeSet(page, { max: 16 });

    // It is asked for here, the first time it is actually needed.
    await page.getByRole('button', { name: 'Send to my teacher' }).click();
    await expect(page.locator('#send-class')).toBeVisible();

    await page.fill('#send-class', '6B');
    await page.fill('#send-num', '5');
    await page.getByRole('button', { name: 'Save' }).click();

    const code = (await page.locator('#progress-code').innerText()).replace(/-/g, '');
    expect(code).toHaveLength(28); // a v2 code
  });

  test('the Show your teacher card sends nothing', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(new URL(r.url()).origin));

    await createProfile(page);
    await page.locator('.skillcard').first().click();
    await page.getByRole('button', { name: /^Check/ }).first().click();
    await page.getByRole('button', { name: 'Start' }).click();
    await completeSet(page, { max: 16 });

    await expect(page.locator('.teachercard')).toBeVisible();
    await expect(page.locator('.teachercard')).toContainText('Nothing is sent');

    const origin = new URL(page.url()).origin;
    expect(requests.filter((o) => o !== origin && o !== 'null')).toHaveLength(0);
  });
});

test.describe('nothing compares one child to another', () => {
  test('no leaderboard, ranking or peer comparison appears anywhere', async ({ page }) => {
    await createProfile(page);

    const screens = ['', 'settings'];
    for (const s of screens) {
      await openRoute(page, s);
      const text = (await page.locator('body').innerText()).toLowerCase();
      for (const banned of ['leaderboard', 'rank', 'top 10', 'beat ', '% of kids', 'compared']) {
        expect(text, `"${banned}" appeared on /${s}`).not.toContain(banned);
      }
    }
  });
});

test.describe('the procedure workspace', () => {
  test('a wrong long-division step is refused, not skipped', async ({ page }) => {
    await createProfile(page, { grade: 4 });
    await openRoute(page, 'g/4/g4-divide-1digit/check');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.bracket')).toBeVisible();

    // Only the step being worked on is visible: the labels contain their own
    // answers, so showing the rest would hand over the solution.
    await expect(page.locator('.work__line')).toHaveCount(1);

    await page.locator('.work__in:not([disabled])').first().fill('99999');
    await page.locator('.work__line[data-state="active"] button').click();
    await expect(page.locator('.work__in[data-state="no"]')).toBeVisible();
  });
});
