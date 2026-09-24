# CLAUDE.md — neft-family-fluency

A free, week-by-week math fluency portal that **families** use at home. Static site on
Cloudflare Pages (push to `main` = deploy). Long-term goal is a Grade 1-8 skill ladder;
this repo currently ships **one strand**: multiplication & division facts -> multi-digit
division, 8 weeks.

## Hard constraints (non-negotiable — a change that breaks one of these is wrong)

1. **No build step, no framework, no CDN.** Plain HTML/CSS/vanilla JS as **ES modules**.
   The repo root *is* the deployed site. No bundler, no transpile, no `dist/`.
2. **No third-party network calls.** No external fonts, no CDN scripts, no `fetch()` to
   any origin but our own. Everything is self-hosted. The QR encoder is local code, not
   an image API.
3. **Offline-first.** PWA manifest + service worker. After the first visit the whole app
   must work with the network disabled.
4. **Mobile-first, 320px, older Android.** Touch targets >= 48px. Numeric answers use
   `inputmode="numeric"` or the custom on-screen keypad.
5. **No personal data. Ever.** No student names, emails, accounts, logins or analytics.
   A profile is an avatar + a nickname, stored **on the device only**. Several profiles
   per device (siblings share phones). Nothing identifying leaves the device — a progress
   code carries `class code + student number` and nothing else.
6. **Storage goes through `storage` in `/engine/storage.js`, always**, and every key is
   prefixed `ewl_`. Never call `localStorage` directly — Android WebViews in private mode
   throw, and the wrapper falls back to memory.
7. **Accessibility is a gate, not a polish pass.** WCAG AA contrast, full keyboard
   support, `aria-live` for answer feedback, honours `prefers-reduced-motion` **and** a
   manual reduced-motion toggle. Timers are **off by default**.
8. **Never show a grade level to a student.** The student-facing word is **"Level"**
   (Level 1-8 in this strand). Grade bands may appear in teacher-only or family-only
   text.
9. **Bilingual.** Every family-facing string exists in `i18n/en.json` *and*
   `i18n/es.json`. New Spanish strings are tagged `"reviewed": false` and listed in
   SETUP.md until a human confirms them.
10. **One config file.** Everything Joel might change lives in `/config.js`
    (`FORM_URL`, `FORM_ENTRY_ID`, `CLASS_CODES`, `HUB_URL`, `SCHOOL_NAME`). The teacher
    view can override `FORM_URL` in the browser so a form change needs no redeploy.

## The content is data, not pages

There is **no per-week HTML**. `curriculum/skills.json` is the scope & sequence: levels,
weeks, skill ids, generator params and mastery criteria. Each skill names a generator in
`engine/generators/`, which is a **pure function** `(rng, params) -> { prompt, answer,
strategyTag, ... }`.

**Adding Week 9 must require editing JSON only** — a new entry in `skills.json` plus a
`family/week-09.json` card. If a task tempts you to add a `week-09.html`, the
architecture is being violated; extend the generator params instead.

## Layout

```
index.html              app shell: profile picker -> level map -> week view
config.js               all editable settings
curriculum/skills.json  scope & sequence + mastery criteria
engine/rng.js           seeded PRNG (mulberry32)
engine/storage.js       the storage wrapper (the ONLY localStorage caller)
engine/generators/      one pure function per skill type
engine/mastery.js       accuracy/speed rules + spiral mixer (70% current / 30% past)
engine/progressCode.js  encode/decode weekly progress -> short code + QR, with checksum
i18n/en.json es.json    every family-facing string
family/week-XX.json     "How to help this week" + the no-screen dice/card game
teacher/index.html      paste/scan progress codes -> class table (local only)
setup/progress-form.gs  Apps Script: Google Form + linked Sheet + DECODE_PROGRESS()
tests/                  node:test unit tests + Playwright e2e
```

## Weekly loop (weeks 1-6 = fact mode, 7-8 = procedure mode)

Mon **Learn** (CSS/SVG animated strategy explainer, no video files) · Tue/Thu
**Practice** (5-8 min, spiral-mixed, 3-level hints) · Wed **Play** (game vs your own
best) · Fri **Check** (seeded 20-item fluency check -> badge). Weekly goal is practice
**3 of 5 days**. Streaks never punish.

**Hints never reveal the answer.** Level 1 = the concept, level 2 = the procedure,
level 3 = a *worked example of a different problem*.

## Mastery (tunable in skills.json, never hardcoded)

- Fact mode: `>= 90%` accuracy **and** median response `<= 3s` on the Friday Check.
- Procedure mode: `>= 85%` accuracy, no time requirement.
- Per-fact misses are tracked and weight next week's spiral mixer.

## Commands

```bash
npm test          # node:test unit tests (math verification, progress code, mastery)
npm run test:e2e  # Playwright e2e at 360x740
npm run serve     # static server on :8080
```

Chromium is preinstalled; **do not run `playwright install`**. If the Playwright version
does not match the cached browser, launch with
`executablePath: '/opt/pw-browsers/chromium'` (see `playwright.config.js`, which already
falls back).

**Run the tests before every commit.** Math generators are verified with 1,000 seeded
samples each; a generator that can emit a non-integer quotient where the skill requires a
whole one is a bug, not a rounding preference.

## Deploy

Cloudflare Pages project `neft-family-fluency`, output dir `.` (the repo root). Push to
`main` deploys. Never add a build command.

## Things that have bitten this repo

- **The service worker caches the app shell.** Bump `CACHE_VERSION` in `sw.js` whenever a
  cached asset changes, or returning families keep the old app forever.
- **`progressCode.js` and `DECODE_PROGRESS()` in `setup/progress-form.gs` are the same
  algorithm written twice.** `tests/vectors.json` is the contract between them. Change
  one side and the vector test fails — that is the test working. Fix both sides.
- Page weight budget is **< 300KB excluding icons**, enforced in the tests.
