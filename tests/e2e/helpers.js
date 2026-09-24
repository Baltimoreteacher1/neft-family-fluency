// Shared e2e helpers.
//
// Nothing here sleeps for a fixed time. The runner pauses between items so the
// feedback can be read, and a helper that slept "long enough" would submit an
// answer to the question it had already answered whenever a parallel worker
// slowed the repaint down -- which reads exactly like a stuck app.

import { expect } from '@playwright/test';

async function questionLabel(page) {
  const bar = page.locator('.qbar');
  if (!(await bar.count())) return null;
  return (await bar.innerText()).split('\n')[0].trim();
}

/** Solve whatever fact question is on screen and submit it. */
export async function answerCurrentFact(page) {
  const prompt = page.locator('.prompt');
  await expect(prompt).toBeVisible();

  const text = (await prompt.innerText()).trim();
  const m = text.match(/^(\d+)\s*([×÷])\s*(\d+)$/);
  if (!m) throw new Error(`Could not read the prompt: ${JSON.stringify(text)}`);

  const [, a, op, b] = m;
  const answer = op === '×' ? Number(a) * Number(b) : Number(a) / Number(b);

  await page.fill('.answer', String(answer));
  await page.locator('[data-key=check]').click();
  return { answer, prompt: text };
}

/**
 * Answer every question in a running set.
 *
 * A submission is retried if the question does not change, because the runner
 * rebuilds the whole question between items and an automated click can land on
 * a button in the moment it is being replaced. A person cannot hit that race:
 * the rebuild happens after their tap, as a result of it. Re-submitting is safe
 * because the runner refuses a second answer for an item it has already judged.
 */
export async function completeSet(page, { max = 30 } = {}) {
  await expect(page.locator('.qbar')).toBeVisible();

  for (let i = 0; i < max; i++) {
    const before = await questionLabel(page);
    if (before === null) return;

    let advanced = false;
    for (let attempt = 0; attempt < 3 && !advanced; attempt++) {
      await answerCurrentFact(page);
      advanced = await page
        .waitForFunction(
          (previous) => {
            const bar = document.querySelector('.qbar');
            const now = bar ? bar.innerText.split('\n')[0].trim() : null;
            return now !== previous;
          },
          before,
          { timeout: 2_500 },
        )
        .then(() => true, () => false);
    }
    expect(advanced, `the set did not advance past "${before}"`).toBe(true);
  }
}

/** Create a profile and land on that grade's dashboard. */
export async function createProfile(page, { nickname = 'Sam', grade = 3 } = {}) {
  // Explicitly to home: once a profile exists the app opens on that child's
  // dashboard, which is the whole point of the Today flow, so "/index.html"
  // alone would not show the picker.
  await page.goto(`/index.html?t=${Date.now()}#/`);

  // Home shows the creation form on a fresh device and the picker once a
  // profile exists. Adding a second child goes through "Add someone".
  if (!(await page.locator('#f-nick').count())) {
    await page.getByRole('button', { name: 'Add someone' }).click();
  }
  await expect(page.locator('#f-nick')).toBeVisible();
  await page.fill('#f-nick', nickname);
  await page.locator('.grade-grid .grade-pick').nth(grade - 1).click();
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.locator('.today')).toBeVisible();
}

/**
 * Open a route directly, forcing a real navigation. A hash-only goto does not
 * reload, so the app would still be booting with no profile in memory and
 * would redirect home -- which looks like the route being broken when it is
 * the navigation that never happened.
 */
export async function openRoute(page, hash) {
  await page.goto(`/index.html?t=${Date.now()}#/${hash.replace(/^#?\/?/, '')}`);
}
