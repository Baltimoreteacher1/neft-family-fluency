// Shared e2e helpers. The maths is solved by reading the prompt, so the tests
// exercise the real generated questions rather than a fixture.
//
// Nothing here sleeps for a fixed time. The runner pauses ~450ms between items
// so the feedback can be read, and a helper that slept "long enough" would
// submit an answer to the question it had already answered whenever a parallel
// worker slowed the repaint down -- which reads exactly like a stuck app.
// Every wait below is on the state change it actually cares about.

import { expect } from '@playwright/test';

/** The "Question n of total" label, or null once the set is over. */
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
 * Answer every question in a running set, waiting for each item to be replaced
 * rather than guessing how long that takes.
 *
 * A submission is retried if the question does not change, because the runner
 * rebuilds the whole question -- prompt, input and keypad -- between items, and
 * an automated click can land on a button in the moment it is being replaced.
 * A person cannot hit that race: the rebuild happens 450ms AFTER their tap, as
 * a result of it. Re-submitting is safe because the runner refuses a second
 * answer for an item it has already judged.
 */
export async function completeSet(page, { max = 30 } = {}) {
  // Wait for the set to actually be on screen first. Without this, a call made
  // straight after clicking Practice sees no progress bar yet, concludes the
  // set is already over, and returns having answered nothing -- which then
  // fails somewhere else entirely, looking like a broken app.
  await expect(page.locator('.qbar')).toBeVisible();

  for (let i = 0; i < max; i++) {
    const before = await questionLabel(page);
    if (before === null) return; // the set has already finished

    let advanced = false;
    for (let attempt = 0; attempt < 3 && !advanced; attempt++) {
      await answerCurrentFact(page);
      // Either the label advances, or the set ends and the bar disappears.
      // "Different from before" covers both, whatever the pause was.
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

    expect(advanced, `the set did not advance past "${before}" after 3 tries`).toBe(true);
  }
}

/** Create a profile from a cold start and land on the level map. */
export async function createProfile(page, { nickname = 'Sam', number = '14' } = {}) {
  await page.goto('/index.html');
  await expect(page.locator('#f-nick')).toBeVisible();
  await page.fill('#f-nick', nickname);
  await page.fill('#f-num', number);
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.locator('#page-title')).toHaveText('Your levels');
}

/**
 * Open a route directly, forcing a real navigation.
 *
 * A hash-only goto does not reload, so the app would still be booting with no
 * profile in memory and would redirect home -- which looks like the route being
 * broken when it is the navigation that never happened.
 */
export async function openRoute(page, hash) {
  await page.goto(`/index.html?t=${Date.now()}#/${hash.replace(/^#?\/?/, '')}`);
}
