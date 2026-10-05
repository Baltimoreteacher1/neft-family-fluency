// Three screens: who, what, drill. The tests walk exactly that.

import { test, expect } from '@playwright/test';

async function newProfile(page, { grade = 3 } = {}) {
  await page.goto(`/index.html?t=${Date.now()}#/`);
  await expect(page.locator('.avatar-grid button').first()).toBeVisible();
  await page.locator('.avatar-grid button').first().click();
  await page.locator('.grade-grid .grade-pick').nth(grade - 1).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.pick').first()).toBeVisible();
}

/** Solve whatever is on screen and submit. Returns false once the drill ends. */
async function answerOne(page) {
  if (!(await page.locator('.prompt').count())) return false;
  const text = (await page.locator('.prompt').innerText()).trim();
  const m = text.match(/^(\d+)\s*([×÷])\s*(\d+)$/);
  if (!m) throw new Error(`Could not read the prompt: ${JSON.stringify(text)}`);
  const answer = m[2] === '×' ? Number(m[1]) * Number(m[3]) : Number(m[1]) / Number(m[3]);
  await page.fill('.answer', String(answer));
  await page.locator('[data-key=check]').click();
  return true;
}

test.describe('the whole app', () => {
  test('a new child is drilling in three taps', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/index.html');
    // Tap 1: a face. Tap 2: a grade. Tap 3: Start.
    await page.locator('.avatar-grid button').first().click();
    await page.locator('.grade-grid .grade-pick').nth(2).click();
    await page.getByRole('button', { name: 'Start' }).click();

    // Tap 4 picks what to practise, and the drill begins immediately -- there
    // is no skill page in between.
    await page.locator('.pick').first().click();
    await expect(page.locator('.prompt')).toBeVisible();
    await expect(page.locator('.keypad')).toBeVisible();

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('a returning child is drilling in two taps', async ({ page }) => {
    await newProfile(page);

    // Tap 0: open the app. It lands on their own list, not a menu.
    await page.goto('/index.html');
    await expect(page.locator('.pick').first()).toBeVisible();
    expect(page.url()).toContain('#/g/3');

    // Tap 1: pick. Now drilling.
    await page.locator('.pick').first().click();
    await expect(page.locator('.prompt')).toBeVisible();
  });

  test('a drill is ten questions and ends on a score', async ({ page }) => {
    await newProfile(page);
    await page.locator('.pick').first().click();
    await expect(page.locator('.drill__count')).toHaveText('1 / 10');

    for (let i = 0; i < 12; i++) {
      if (!(await answerOne(page))) break;
      await page.waitForTimeout(700);
    }

    await expect(page.locator('.done__score')).toBeVisible();
    await expect(page.locator('.done__score')).toHaveText('10/10');
  });

  test('a wrong answer shows the answer and moves on, with no penalty', async ({ page }) => {
    await newProfile(page);
    await page.locator('.pick').first().click();

    await page.fill('.answer', '99999');
    await page.locator('[data-key=check]').click();

    // Told what it was, in amber, not marked with a cross.
    await expect(page.locator('.feedback[data-state="no"]')).toBeVisible();
    // And it moves on rather than trapping the child on the question.
    await expect(page.locator('.drill__count')).toHaveText('2 / 10', { timeout: 4000 });
  });

  test('there is no timer, no lives and no streak anywhere', async ({ page }) => {
    await newProfile(page);
    await page.locator('.pick').first().click();
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const word of ['streak', 'lives', 'timer', 'seconds left', 'leaderboard', 'rank']) {
      expect(body, `"${word}" appeared in the drill`).not.toContain(word);
    }
  });

  test('Back goes up one screen at a time', async ({ page }) => {
    await newProfile(page);
    await page.locator('.pick').first().click();
    expect(page.url()).toMatch(/#\/g\/3\/[\w-]+$/);

    await page.locator('#btn-back').click();
    expect(page.url()).toMatch(/#\/g\/3$/);

    await page.locator('#btn-back').click();
    expect(page.url()).toMatch(/#\/$/);
  });

  test('switching child takes one tap', async ({ page }) => {
    await newProfile(page);
    await expect(page.locator('#btn-switch')).toBeVisible();
    await page.locator('#btn-switch').click();
    await expect(page.locator('.face').first()).toBeVisible();
  });
});

test.describe('language', () => {
  test('the toggle is on the first screen, not buried in settings', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.langbar .lang-toggle')).toBeVisible();

    await page.getByRole('button', { name: 'Español' }).click();
    await expect(page.locator('#main')).toContainText('Escoge un dibujo');
    // And it is still there afterwards, so it can be undone.
    await expect(page.locator('.langbar')).toBeVisible();
  });

  test('a flyer link opens straight into Spanish', async ({ page }) => {
    await page.goto('/index.html?lang=es&class=6A');
    await expect(page.locator('#main')).toContainText('Escoge un dibujo');
  });
});

test.describe('old URLs', () => {
  test('week and activity URLs land on the drill', async ({ page }) => {
    await newProfile(page);

    await page.evaluate(() => { location.hash = '#/week/6'; });
    await expect.poll(() => page.url()).toContain('#/g/4/g4-extended-facts');

    // The four activities are gone; their URLs open the skill itself.
    await page.evaluate(() => { location.hash = '#/g/3/g3-mult-4-8/practice'; });
    await expect.poll(() => page.url()).toMatch(/#\/g\/3\/g3-mult-4-8$/);
  });
});
